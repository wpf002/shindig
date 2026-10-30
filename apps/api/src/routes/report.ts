import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { prisma } from "@shindig/db";
import { CATEGORY_LABELS, colorName, EVENT_TYPE_LABELS, getCity, STYLE_LABELS, TIER_LABELS, type EventType, type Style } from "@shindig/core";
import { requireUser } from "../lib/auth.js";
import { normalizeImage } from "../lib/images.js";
import { mapLimit } from "../lib/util.js";
import { ownedPlan, placePhotos, rankPlan } from "./plans.js";

const THUMB_PX = 360;

// Google bills each photo fetch, so thumbnails stay in memory across downloads.
const thumbs = new Map<string, string>();
const MAX_THUMBS = 2000;

const PER_CATEGORY = 6;
const FORMALITY = ["", "Backyard Casual", "Relaxed", "Semi-Formal", "Formal", "Black Tie"];
const title = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

type Ranked = NonNullable<Awaited<ReturnType<typeof rankPlan>>>;
type Match = Ranked["categories"][number]["matches"][number];
type SharedVendor = Match["vendor"];
interface Report {
  plan: { name: string; eventType: string; date: string | null; cityId: string; guestCount: number; budget: number };
  brief: Ranked["brief"];
  categories: Array<{ category: Ranked["categories"][number]["category"]; allotted: number; matches: Match[] }>;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const HEX = /^#[0-9a-f]{6}$/i;
const safeColor = (c: string) => (HEX.test(c) ? c : "#ccc");

export async function reportRoutes(app: FastifyInstance) {
  async function thumb(v: SharedVendor): Promise<string | null> {
    const img = v.images[0];
    if (!img) return null;
    const hit = thumbs.get(img.url);
    if (hit) return hit;

    let buf: Buffer | null = null;
    try {
      if (img.url.startsWith("/api/images/")) {
        buf = await readFile(join(app.uploadDir, basename(img.url)));
      } else {
        const key = app.env.GOOGLE_PLACES_API_KEY;
        const idx = Number(img.url.split("/").pop());
        const vendor = key ? await prisma.vendor.findUnique({ where: { id: v.id }, select: { placePhotos: true } }) : null;
        const photo = vendor ? placePhotos(vendor)[idx] : undefined;
        if (photo) {
          const res = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=${THUMB_PX * 2}`, {
            headers: { "X-Goog-Api-Key": key! },
          });
          if (res.ok) buf = Buffer.from(await res.arrayBuffer());
        }
      }
      if (!buf) return null;
      const { data } = await normalizeImage(buf, THUMB_PX);
      const uri = `data:image/jpeg;base64,${data.toString("base64")}`;
      if (thumbs.size >= MAX_THUMBS) thumbs.delete(thumbs.keys().next().value!);
      thumbs.set(img.url, uri);
      return uri;
    } catch (e) {
      app.log.warn({ err: e, vendor: v.id }, "report photo failed");
      return null;
    }
  }

  app.get("/plans/:id/report", { preHandler: requireUser }, async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const ranked = await rankPlan(plan);
    if (!ranked) return reply.code(409).send({ error: "Read a board first" });
    // The owner's own copy: includes the budget, unlike the share link.
    const shared: Report = {
      plan: { name: plan.name, eventType: plan.eventType, date: plan.date, cityId: plan.cityId, guestCount: plan.guestCount, budget: plan.budget },
      brief: ranked.brief,
      categories: ranked.categories.map((c) => ({ ...c, matches: c.matches.slice(0, PER_CATEGORY) })),
    };

    const vendors = shared.categories.flatMap((c) => c.matches.map((m) => m.vendor));
    const photos = await mapLimit(vendors, 6, thumb);
    const photoOf = new Map(vendors.map((v, i) => [v.id, photos[i] ?? null]));

    const slug = plan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "plan";
    return reply
      .header("Content-Type", "text/html; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${slug}-shindig.html"`)
      .header("Cache-Control", "no-store")
      .send(renderReport(shared, photoOf));
  });
}

function ring(value: number, size: number) {
  const stroke = Math.max(3, Math.round(size / 13));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return `<span class="ring" style="width:${size}px;height:${size}px" title="${v} Fit"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/><circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - v / 100)).toFixed(2)}"/></svg><b style="font-size:${Math.round(size * 0.34)}px">${v}</b></span>`;
}

function card(m: Match, photo: string | null) {
  const v = m.vendor;
  const visual = photo
    ? `<img src="${photo}" alt="${esc(v.name)}">`
    : v.palette
        .slice(0, 4)
        .map((c) => `<div style="background:${safeColor(c)}"></div>`)
        .join("");
  const city = getCity(v.cityId)?.name;
  const styles = v.styles.slice(0, 3).map((s) => STYLE_LABELS[s as Style]).join(", ");
  const meta = [
    city ? `<span>${esc(city)}</span>` : "",
    v.rating != null
      ? `<span>★ ${v.rating.toFixed(1)} <span class="muted">(${(v.ratingCount ?? 0).toLocaleString("en-US")})</span></span>`
      : "",
    styles ? `<span>${esc(styles)}</span>` : "",
  ].join("");
  const price = v.priceUnit === "per_guest" ? `${usd(v.priceMin)}–${usd(v.priceMax)} / Guest` : `${usd(v.priceMin)}–${usd(v.priceMax)}`;
  const actions = [
    v.website && /^https?:\/\//i.test(v.website)
      ? `<a class="btn" href="${esc(v.website)}" target="_blank" rel="noopener noreferrer nofollow">Website ↗</a>`
      : "",
    v.phone ? `<a class="btn" href="tel:${esc(v.phone.replace(/[^0-9+]/g, ""))}">Call</a>` : "",
  ].join("");
  return `<article class="match">
<div class="match-visual">${visual}</div>
<div class="match-body">
<div class="row"><h3 title="${esc(v.name)}">${esc(v.name)}</h3>${m.saved ? '<span class="badge accent">Shortlisted</span>' : ""}</div>
<div class="meta">${meta}</div>
<ul class="why">${m.reasons
    .slice(0, 3)
    .map((r) => `<li title="${esc(r)}">${esc(r)}</li>`)
    .join("")}</ul>
<div class="actions">${actions}</div>
</div>
<div class="side">${ring(m.score, 60)}<div class="cost"><span class="est">${v.priceEstimated ? "Est." : ""}</span><b>${price}</b></div></div>
</article>`;
}

function renderReport(d: Report, photoOf: Map<string, string | null>) {
  const { plan, brief } = d;
  const date = plan.date
    ? new Date(plan.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "TBD";
  const facts: Array<[string, string]> = [
    ["Event", EVENT_TYPE_LABELS[plan.eventType as EventType] ?? plan.eventType],
    ["Date", date],
    ["City", getCity(plan.cityId)?.name ?? ""],
    ["Guests", String(plan.guestCount)],
    ["Budget", usd(plan.budget)],
  ];
  const chips = (items: string[]) => `<div class="chips">${items.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>`;
  const group = (label: string, body: string) => `<div class="opt"><p class="label">${label}</p>${body}</div>`;
  const options = [
    brief.palette.length
      ? group(
          "Palette",
          `<div class="chips">${brief.palette.map((c) => `<span class="chip"><i style="background:${safeColor(c)}"></i>${esc(colorName(c))}</span>`).join("")}</div>`,
        )
      : "",
    brief.styles.length ? group("Style", chips(brief.styles.map((s) => STYLE_LABELS[s.style]))) : "",
    group("Formality", `<p class="val">${FORMALITY[brief.formality] ?? ""}</p>`),
    `<div class="pair">${group("Tier", `<p class="val">${TIER_LABELS[brief.tier]}</p>`)}${group("Setting", `<p class="val">${title(brief.setting)}</p>`)}</div>`,
    brief.venueTypes.length ? group("Venue Type", chips(brief.venueTypes.map(title))) : "",
    brief.lighting.length ? group("Lighting", chips(brief.lighting.map(title))) : "",
    brief.keywords.length ? group("Keywords", chips(brief.keywords)) : "",
  ].join("");
  const tabs = d.categories
    .map(
      (c, i) =>
        `<button role="tab" class="tab" aria-selected="${i === 0}" data-tab="${c.category}">${esc(CATEGORY_LABELS[c.category])}<span class="count">${c.matches.length}</span></button>`,
    )
    .join("");
  const panels = d.categories
    .map(
      (c, i) =>
        `<div class="panel" data-panel="${c.category}"${i === 0 ? "" : " hidden"}><div class="cat-bar"><div><p class="eyebrow">${esc(CATEGORY_LABELS[c.category])} Budget</p><p class="share">${plan.budget ? Math.round((c.allotted / plan.budget) * 100) : 0}% of ${usd(plan.budget)}</p></div><span class="big-num">${usd(c.allotted)}</span></div>${
          c.matches.length ? c.matches.map((m) => card(m, photoOf.get(m.vendor.id) ?? null)).join("") : '<p class="empty">No Matches Yet</p>'
        }</div>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(plan.name)} · Shindig</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,400..600,100&family=Instrument+Sans:wght@400;500;600;700&display=swap">
<style>${CSS}</style>
</head>
<body>
<main class="wrap">
<header class="head">
<p class="eyebrow">Shindig Plan</p>
<h1>${esc(plan.name)}</h1>
<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
</header>
<div class="grid">
<aside class="look">
<p class="eyebrow">The Look</p>
${
  brief.palette.length
    ? `<div class="swatch-strip">${brief.palette.map((c) => `<div style="background:${safeColor(c)}" title="${esc(colorName(c))} ${esc(c)}"></div>`).join("")}</div>`
    : ""
}
<p class="summary">${esc(brief.summary)}</p>
<div class="options">${options}</div>
</aside>
<section>
<div class="tabs" role="tablist">${tabs}</div>
${panels}
</section>
</div>
<footer>Made With Shindig · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</footer>
</main>
<script>
document.querySelectorAll(".tab").forEach(function (t) {
  t.addEventListener("click", function () {
    document.querySelectorAll(".tab").forEach(function (o) { o.setAttribute("aria-selected", String(o === t)); });
    document.querySelectorAll(".panel").forEach(function (p) { p.hidden = p.dataset.panel !== t.dataset.tab; });
  });
});
</script>
</body>
</html>`;
}

const CSS = `
:root{--paper:#f4ede2;--paper-2:#ece2d3;--veil:#fffaf2;--line:#e4d8c7;--line-2:#cdbca5;--ink:#1e1416;--ink-2:#4a3a3d;--smoke:#85777a;--accent:#a8243a;--accent-ink:#7d1729;--accent-wash:#f5dde0;--moss:#46593d;--r:14px;--r-lg:22px;--display:"Fraunces",Georgia,serif;--sans:"Instrument Sans",system-ui,-apple-system,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:400 16px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:48px 32px 64px}
h1{font:500 clamp(2rem,4vw,3rem)/1.05 var(--display);letter-spacing:-.02em;margin:10px 0 0;font-variation-settings:"SOFT" 100}
h3{font:600 1.05rem/1.3 var(--sans);margin:0}
.eyebrow{font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--smoke);font-weight:600;margin:0}
.muted{color:var(--smoke)}
.facts{display:flex;flex-wrap:wrap;margin:24px 0 0;border:1px solid var(--line);border-radius:var(--r);background:var(--veil);width:fit-content;max-width:100%}
.facts>div{padding:10px 20px}
.facts>div+div{border-left:1px solid var(--line)}
.facts dt{font-size:.68rem;letter-spacing:.14em;text-transform:uppercase;color:var(--smoke);font-weight:600}
.facts dd{margin:2px 0 0;font-weight:600}
.grid{display:grid;grid-template-columns:340px minmax(0,1fr);gap:32px;margin-top:36px;align-items:stretch}
.grid>*{min-width:0}
.look{background:var(--veil);border:1px solid var(--line);border-radius:var(--r-lg);padding:24px;overflow:hidden}
.swatch-strip{display:flex;height:76px;border-radius:var(--r);overflow:hidden;margin-top:12px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
.swatch-strip>div{flex:1}
.summary{font:400 1.05rem/1.5 var(--display);margin:16px 0 0}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line-2);border-radius:999px;padding:5px 12px;font-size:.84rem;font-weight:500;color:var(--ink-2)}
.chip i{width:10px;height:10px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}
.options{margin:22px -24px 0;padding:20px 24px 0;border-top:1px solid var(--line)}
.opt+.opt,.pair+.opt,.opt+.pair{margin-top:18px}
.label{font-size:.82rem;font-weight:600;color:var(--ink-2);margin:0}
.val{margin:6px 0 0;font-weight:600}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.pair .opt+.opt{margin-top:0}
.cat-bar{display:flex;justify-content:space-between;align-items:end;gap:16px;padding:4px 4px 16px}
.cat-bar .share{margin:4px 0 0;font-size:.86rem;color:var(--smoke)}
.big-num{font:420 1.8rem/1 var(--display);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.tabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px;margin-bottom:16px}
.tabs::-webkit-scrollbar{display:none}
.tab{flex:none;display:inline-flex;align-items:center;gap:8px;background:transparent;border:1px solid var(--line-2);padding:8px 14px;border-radius:999px;font:600 .86rem var(--sans);color:var(--ink-2);cursor:pointer}
.tab:hover{border-color:var(--ink-2);color:var(--ink)}
.tab[aria-selected="true"]{background:var(--ink);color:var(--veil);border-color:var(--ink)}
.tab .count{font-size:.74rem;min-width:20px;height:20px;padding:0 6px;display:inline-grid;place-items:center;border-radius:999px;background:var(--paper-2);color:var(--ink-2)}
.tab[aria-selected="true"] .count{background:rgba(255,250,242,.18);color:var(--veil)}
.match{display:grid;grid-template-columns:132px minmax(0,1fr) auto;gap:20px;padding:16px;border-radius:var(--r-lg);background:var(--veil);border:1px solid var(--line)}
.match+.match{margin-top:12px}
.match-visual{width:132px;height:132px;border-radius:var(--r);overflow:hidden;display:grid;grid-template-columns:1fr 1fr;background:var(--paper-2)}
.match-visual img{width:132px;height:132px;object-fit:cover;grid-column:1/-1;grid-row:1/span 2}
.match-body{display:flex;flex-direction:column;min-width:0}
.row{display:flex;align-items:center;gap:8px;min-width:0}
.match-body h3{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.meta{display:flex;gap:4px 14px;font-size:.86rem;color:var(--smoke);margin-top:4px;white-space:nowrap;overflow:hidden}
.meta>span+span::before{content:"·";margin-right:14px;color:var(--line-2)}
.why{list-style:none;padding:0;margin:10px 0 0;font-size:.88rem;color:var(--ink-2);height:calc(3 * (1.45em + 4px))}
.why li{padding-left:20px;position:relative;margin-top:4px;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.why li::before{content:"";position:absolute;left:2px;top:.5em;width:9px;height:5px;border-left:2px solid var(--moss);border-bottom:2px solid var(--moss);transform:rotate(-45deg)}
.actions{display:flex;gap:8px;margin-top:auto;padding-top:14px;min-height:46px}
.btn{display:inline-flex;align-items:center;border:1px solid var(--line-2);border-radius:999px;padding:6px 14px;font:600 .82rem var(--sans);color:var(--ink);text-decoration:none}
.btn:hover{border-color:var(--ink)}
.badge{font-size:.7rem;font-weight:700;letter-spacing:.06em;padding:3px 9px;border-radius:999px;text-transform:uppercase;white-space:nowrap}
.badge.accent{background:var(--accent-wash);color:var(--accent-ink)}
.side{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;gap:12px}
.ring{position:relative;display:grid;place-items:center;flex:none}
.ring svg{transform:rotate(-90deg)}
.ring .track{stroke:var(--line)}
.ring .val{stroke:var(--accent);stroke-linecap:round}
.ring b{position:absolute;font-family:var(--display);font-weight:500;letter-spacing:-.03em}
.cost{font-size:.82rem;color:var(--smoke);text-align:right}
.cost b{display:block;color:var(--ink);font-size:.95rem}
.cost .est{font-size:.78rem}
.empty{padding:48px 24px;text-align:center;color:var(--smoke)}
footer{margin-top:48px;font-size:.8rem;color:var(--smoke);text-align:center}
@media (max-width:900px){.grid{grid-template-columns:1fr}}
@media (max-width:600px){
.wrap{padding:28px 16px 48px}
.facts{display:grid;grid-template-columns:1fr 1fr;width:100%}.facts>div:last-child:nth-child(odd){grid-column:1/-1;border-left:0}.facts>div{padding:8px 14px}.facts>div+div{border-left:0}.facts>div:nth-child(even){border-left:1px solid var(--line)}.facts>div:nth-child(n+3){border-top:1px solid var(--line)}
.match{grid-template-columns:76px minmax(0,1fr);gap:4px 14px;padding:14px}
.match-visual,.match-visual img{width:76px;height:76px}
.match-body{display:contents}
.match-body>*{grid-column:2;min-width:0}
.match-visual{grid-row:1/span 3}
.actions{grid-column:1/-1}
.side{grid-column:1/-1;flex-direction:row;align-items:center;margin-top:14px}
}
@media print{.tabs{display:none}.panel[hidden]{display:block!important}.look{position:static}.match{break-inside:avoid}}
`;
