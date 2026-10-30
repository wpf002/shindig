// Imports real vendors for one city from Google Places (New) and tags their style from their Google photos.
//
//   pnpm --filter @shindig/api places --city dallas            # all categories, 20 per category
//   pnpm --filter @shindig/api places --city dallas --only venue,florist --limit 10
//   pnpm --filter @shindig/api places --city dallas --no-vision  # colors only, no Claude calls
//
// Listings are unclaimed: no owner, no email, prices are category estimates.
// Re-running updates listings by placeId and keeps style tags unless --retag is passed.
import { parseArgs } from "node:util";
import { prisma } from "@shindig/db";
import { CATEGORIES, CITIES, VENUE_TYPES, getCity, milesBetween, type Category, type VenueType } from "@shindig/core";
import { normalizeImage } from "../lib/images.js";
import { analyzeImages } from "../vision/index.js";

const PHOTOS_TO_READ = 5;
const PHOTOS_TO_KEEP = 8;
const MIN_REVIEWS = 5;
const SEARCH_RADIUS_M = 40_000;

const QUERY: Record<Category, string> = {
  venue: "wedding venue",
  planner: "wedding planner",
  photographer: "wedding photographer",
  videographer: "wedding videographer",
  dj: "wedding DJ",
  live_music: "live wedding band music",
  caterer: "wedding caterer",
  baker: "wedding cake bakery",
  florist: "wedding florist",
  decor_rentals: "event rentals",
  bar_service: "mobile bar service",
  hair_makeup: "bridal hair and makeup",
};

// Category default price ranges, used until the vendor claims the listing and sets their own.
const PRICE: Record<Category, { min: number; max: number; unit: "flat" | "per_guest" }> = {
  venue: { min: 4000, max: 10000, unit: "flat" },
  planner: { min: 2500, max: 7000, unit: "flat" },
  photographer: { min: 2800, max: 6000, unit: "flat" },
  videographer: { min: 2500, max: 5500, unit: "flat" },
  dj: { min: 1200, max: 2500, unit: "flat" },
  live_music: { min: 3000, max: 7000, unit: "flat" },
  caterer: { min: 45, max: 95, unit: "per_guest" },
  baker: { min: 400, max: 1200, unit: "flat" },
  florist: { min: 2000, max: 6000, unit: "flat" },
  decor_rentals: { min: 1000, max: 4000, unit: "flat" },
  bar_service: { min: 15, max: 35, unit: "per_guest" },
  hair_makeup: { min: 600, max: 1600, unit: "flat" },
};

// Google's price level scales the default range.
const PRICE_SCALE: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 0.6,
  PRICE_LEVEL_MODERATE: 1,
  PRICE_LEVEL_EXPENSIVE: 1.5,
  PRICE_LEVEL_VERY_EXPENSIVE: 2.2,
};

interface Place {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  businessStatus?: string;
  editorialSummary?: { text: string };
  photos?: Array<{ name: string; widthPx: number; heightPx: number; authorAttributions?: Array<{ displayName: string }> }>;
}

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.businessStatus",
  "places.editorialSummary",
  "places.photos",
].join(",");

const { values: args } = parseArgs({
  options: {
    city: { type: "string" },
    only: { type: "string" },
    limit: { type: "string", default: "20" },
    "no-vision": { type: "boolean", default: false },
    retag: { type: "boolean", default: false },
  },
});

const key = process.env.GOOGLE_PLACES_API_KEY;
if (!key) throw new Error("Set GOOGLE_PLACES_API_KEY in .env (Places API (New) enabled).");
const city = args.city ? getCity(args.city) : undefined;
if (!city) throw new Error(`--city must be one of: ${CITIES.map((c) => c.id).join(", ")}`);
const limit = Math.min(20, Math.max(1, Number(args.limit) || 20));
const only = args.only?.split(",").map((s) => s.trim()) ?? [...CATEGORIES];
for (const c of only) if (!(CATEGORIES as readonly string[]).includes(c)) throw new Error(`Unknown category: ${c}`);

const visionCfg = {
  apiKey: args["no-vision"] ? undefined : process.env.ANTHROPIC_API_KEY,
  model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
};

const usage = { searches: 0, photos: 0, claudeReads: 0 };

async function search(category: Category): Promise<Place[]> {
  usage.searches++;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key!, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify({
      textQuery: `${QUERY[category]} in ${city!.name}`,
      pageSize: limit,
      locationBias: { circle: { center: { latitude: city!.lat, longitude: city!.lng }, radius: SEARCH_RADIUS_M } },
    }),
  });
  if (!res.ok) throw new Error(`Places search ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { places?: Place[] };
  return (body.places ?? []).filter((p) => p.businessStatus === "OPERATIONAL" && (p.userRatingCount ?? 0) >= MIN_REVIEWS);
}

async function photo(name: string): Promise<Buffer | null> {
  usage.photos++;
  const res = await fetch(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=1024&key=${key}`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

function nearestCity(lat: number, lng: number) {
  let best = CITIES[0]!;
  let bestMi = Infinity;
  for (const c of CITIES) {
    const mi = milesBetween({ lat, lng }, c);
    if (mi < bestMi) [best, bestMi] = [c, mi];
  }
  return { city: best, miles: bestMi };
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);

async function tags(p: Place, category: Category) {
  const images: Buffer[] = [];
  for (const ph of (p.photos ?? []).slice(0, PHOTOS_TO_READ)) {
    const buf = await photo(ph.name);
    if (!buf) continue;
    try {
      images.push((await normalizeImage(buf, 1024)).data);
    } catch {
      // Skip photos sharp can't read.
    }
  }
  if (!images.length) return null;
  if (visionCfg.apiKey) usage.claudeReads++;
  const brief = await analyzeImages(images, visionCfg, `${p.displayName?.text ?? ""}, ${QUERY[category]}`);
  const f = brief.formality;
  const venueType = category === "venue" ? (brief.venueTypes.find((v) => (VENUE_TYPES as readonly string[]).includes(v)) as VenueType | undefined) : undefined;
  return {
    styles: brief.styles.filter((s) => s.weight >= 0.3).map((s) => s.style).slice(0, 4),
    palette: brief.palette,
    formalityMin: Math.max(1, f - 1),
    formalityMax: Math.min(5, f + 1),
    settings: brief.setting === "either" ? ["indoor", "outdoor"] : [brief.setting],
    venueType: venueType ?? null,
  };
}

async function main() {
  console.log(`Importing ${only.join(", ")} for ${city!.name}, up to ${limit} each${visionCfg.apiKey ? "" : " (colors only)"}`);
  const seen = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const category of only as Category[]) {
    const places = await search(category);
    console.log(`${category}: ${places.length} listings`);
    for (const p of places) {
      if (seen.has(p.id) || !p.location || !p.displayName) continue;
      seen.add(p.id);

      const { city: near, miles } = nearestCity(p.location.latitude, p.location.longitude);
      if (miles > 50) continue;

      const existing = await prisma.vendor.findUnique({ where: { placeId: p.id } });
      // A place found under two categories stays in the first one it was imported as.
      if (existing && existing.category !== category) continue;
      // Claimed listings belong to their owner now.
      if (existing?.ownerId) continue;

      const listing = {
        name: p.displayName.text,
        cityId: near.id,
        address: p.formattedAddress ?? null,
        phone: p.nationalPhoneNumber ?? null,
        website: p.websiteUri ?? null,
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
        placePhotos: (p.photos ?? []).slice(0, PHOTOS_TO_KEEP).map((ph) => ({
          name: ph.name,
          width: ph.widthPx,
          height: ph.heightPx,
          author: ph.authorAttributions?.[0]?.displayName ?? null,
        })),
      };

      const needTags = !existing || args.retag;
      const t = needTags ? await tags(p, category) : null;
      if (needTags && !t) {
        console.log(`  skip ${listing.name}: no readable photos`);
        continue;
      }

      if (existing) {
        await prisma.vendor.update({ where: { id: existing.id }, data: { ...listing, ...(t ?? {}) } });
        updated++;
      } else {
        const base = PRICE[category];
        const scale = PRICE_SCALE[p.priceLevel ?? ""] ?? 1;
        const round = (n: number) => (base.unit === "per_guest" ? Math.round(n) : Math.round(n / 100) * 100);
        await prisma.vendor.create({
          data: {
            ...listing,
            ...t!,
            placeId: p.id,
            slug: `${slugify(listing.name)}-${p.id.slice(-6).toLowerCase()}`,
            category,
            serviceRadiusMi: 60,
            priceMin: round(base.min * scale),
            priceMax: round(base.max * scale),
            priceUnit: base.unit,
            priceEstimated: true,
            capacityMax: null,
            description: p.editorialSummary?.text ?? "",
            email: "",
            isDemo: false,
            verified: false,
          },
        });
        created++;
      }
      console.log(`  ${existing ? "updated" : "added"} ${listing.name} (${near.name})`);
    }
  }

  console.log(`\nDone: ${created} added, ${updated} updated.`);
  console.log(`Google calls: ${usage.searches} searches, ${usage.photos} photos. Claude reads: ${usage.claudeReads}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
