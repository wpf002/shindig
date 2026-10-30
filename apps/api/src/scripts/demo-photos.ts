// Gives sample vendors real photos from Wikimedia Commons so match cards aren't empty in development.
// Run after `pnpm --filter @shindig/db seed`. Vendors that already have photos are skipped.
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prisma } from "@shindig/db";
import type { Category } from "@shindig/core";
import { normalizeImage } from "../lib/images.js";

const PER_VENDOR = 3;
const UA = "shindig-dev/0.1 (sample vendor photos)";
const OK_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)/i;

const SUBJECT: Record<Category, string> = {
  venue: "wedding venue",
  planner: "wedding reception table setting",
  photographer: "wedding photography couple",
  videographer: "wedding couple portrait",
  dj: "wedding reception dance floor",
  live_music: "wedding band musicians",
  caterer: "wedding buffet food",
  baker: "wedding cake",
  florist: "wedding bouquet flowers",
  decor_rentals: "wedding decoration tables",
  bar_service: "cocktail bar drinks",
  hair_makeup: "bridal hair",
};

// Broader searches for categories where wedding-specific results run out.
const FALLBACK: Partial<Record<Category, string[]>> = {
  dj: ["DJ turntables party", "disc jockey mixer", "dance party lights"],
  planner: ["banquet table setting", "event decoration tables", "reception centerpiece"],
  caterer: ["catering buffet", "banquet food platter", "barbecue brisket"],
};

const STYLE_WORD: Record<string, string> = {
  garden: "garden", western: "rustic barn", modern: "modern", moody: "candlelight", classic: "ballroom",
  boho: "boho", coastal: "lake", industrial: "loft", vintage: "vintage", maximalist: "colorful",
  rustic: "rustic", glam: "elegant", romantic: "romantic",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Commons rate-limits bursts. Space requests out and honor Retry-After.
async function politeFetch(url: URL | string, timeoutMs: number): Promise<Response | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(1500);
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status !== 429) return res.ok ? res : null;
    const wait = Number(res.headers.get("retry-after") ?? 10);
    await sleep((Number.isFinite(wait) ? wait : 10) * 1000 + 1000);
  }
  return null;
}

interface Hit { title: string; url: string; credit: string }

async function search(query: string): Promise<Hit[]> {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({
    action: "query", format: "json", generator: "search", gsrnamespace: "6", gsrlimit: "30",
    gsrsearch: `${query} filetype:bitmap`, prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "1200",
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const res = await politeFetch(u, 20_000);
  if (!res) return [];
  const pages = Object.values(((await res.json()) as any).query?.pages ?? {}) as any[];
  return pages
    .sort((a, b) => a.index - b.index)
    .flatMap((p) => {
      const ii = p.imageinfo?.[0];
      const m = ii?.extmetadata ?? {};
      const license = String(m.LicenseShortName?.value ?? "");
      if (!ii?.thumburl || ii.mime !== "image/jpeg" || ii.width < 800 || !OK_LICENSE.test(license)) return [];
      const artist = String(m.Artist?.value ?? "Unknown").replace(/<[^>]+>/g, "").trim().slice(0, 80);
      return [{ title: p.title, url: ii.thumburl, credit: `${artist}, ${license}, Wikimedia Commons` }];
    });
}

async function main() {
  const dir = resolve(process.env.UPLOAD_DIR ?? "./uploads");
  mkdirSync(dir, { recursive: true });
  const vendors = await prisma.vendor.findMany({ where: { isDemo: true, images: { none: {} } }, orderBy: { name: "asc" } });
  const cache = new Map<string, Hit[]>();
  const taken = new Set<string>();
  let saved = 0;

  for (const v of vendors) {
    const subject = SUBJECT[v.category as Category];
    const queries = [`${STYLE_WORD[v.styles[0] ?? ""] ?? ""} ${subject}`.trim(), subject, ...(FALLBACK[v.category as Category] ?? [])];
    let added = 0;
    for (const q of queries) {
      if (!cache.has(q)) cache.set(q, await search(q));
      for (const hit of cache.get(q)!) {
        if (added >= PER_VENDOR) break;
        if (taken.has(hit.title)) continue;
        taken.add(hit.title);
        try {
          const res = await politeFetch(hit.url, 30_000);
          if (!res) continue;
          const img = await normalizeImage(Buffer.from(await res.arrayBuffer()), 1200);
          const fileName = `${randomBytes(16).toString("hex")}.jpg`;
          await writeFile(join(dir, fileName), img.data, { flag: "wx" });
          await prisma.vendorImage.create({ data: { vendorId: v.id, fileName, width: img.width, height: img.height, credit: hit.credit } });
          added++;
        } catch {
          // Skip images that fail to download or decode.
        }
      }
      if (added >= PER_VENDOR) break;
    }
    saved += added;
    console.log(`${v.name}: ${added}`);
  }
  console.log(`Saved ${saved} photos for ${vendors.length} vendors.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
