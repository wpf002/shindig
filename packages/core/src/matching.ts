import type { Brief } from "./schemas.js";
import {
  BASE_ALLOCATION,
  CATEGORY_LABELS,
  EVENT_COST_SCALE,
  RELATED_STYLES,
  STYLE_LABELS,
  TIER_LABELS,
  TIER_PER_GUEST,
  TIERS,
  type Category,
  type EventType,
  type PriceUnit,
  type Style,
  type Tier,
  type VenueType,
} from "./taxonomy.js";
import { colorName, hexToLab, deltaE, paletteSimilarity } from "./color.js";
import { getCity, milesBetween } from "./geo.js";

export interface PlanFacts {
  eventType: EventType;
  date: string | null;
  cityId: string;
  guestCount: number;
  budget: number;
  categories: Category[];
}

export interface VendorFacts {
  id: string;
  category: Category;
  cityId: string;
  serviceRadiusMi: number;
  priceMin: number;
  priceMax: number;
  priceUnit: PriceUnit;
  capacityMax: number | null;
  styles: Style[];
  palette: string[];
  formalityMin: number;
  formalityMax: number;
  settings: Array<"indoor" | "outdoor">;
  venueType: VenueType | null;
}

export type PriceFit = "under" | "within" | "stretch" | "over";

export interface Match {
  vendorId: string;
  category: Category;
  score: number; // 0..100
  parts: { style: number; palette: number; formality: number; setting: number; price: number };
  priceFit: PriceFit;
  estimatedCost: { low: number; high: number };
  distanceMi: number;
  reasons: string[];
  caveats: string[];
}

const WEIGHTS = { style: 0.42, palette: 0.16, formality: 0.1, setting: 0.1, price: 0.22 };

// ---------- budget ----------

/**
 * Split the budget across the categories the plan needs. Categories the board
 * leans on (lots of floral pins → florals) get up to +40% of their base share
 * before renormalizing.
 */
export function allocateBudget(
  plan: Pick<PlanFacts, "eventType" | "budget" | "categories">,
  emphasis: Brief["emphasis"] = {},
): Record<Category, number> {
  const base = BASE_ALLOCATION[plan.eventType];
  const raw = new Map<Category, number>();
  for (const c of plan.categories) {
    const share = base[c] ?? 0.04;
    const boost = 1 + 0.4 * Math.min(1, emphasis[c] ?? 0);
    raw.set(c, share * boost);
  }
  const total = [...raw.values()].reduce((a, b) => a + b, 0) || 1;
  const out = {} as Record<Category, number>;
  for (const [c, v] of raw) out[c] = Math.round((plan.budget * v) / total);
  return out;
}

export function estimateCost(v: Pick<VendorFacts, "priceMin" | "priceMax" | "priceUnit">, guests: number) {
  const mult = v.priceUnit === "per_guest" ? guests : 1;
  return { low: v.priceMin * mult, high: v.priceMax * mult };
}

function priceFit(cost: { low: number; high: number }, allotted: number): { fit: PriceFit; score: number } {
  if (allotted <= 0) return { fit: "over", score: 0 };
  if (cost.high <= allotted) return { fit: cost.high < allotted * 0.6 ? "under" : "within", score: 1 };
  if (cost.low <= allotted) return { fit: "within", score: 0.85 };
  if (cost.low <= allotted * 1.25) return { fit: "stretch", score: 0.5 };
  return { fit: "over", score: Math.max(0, 0.3 - (cost.low / allotted - 1.25) * 0.3) };
}

// ---------- vibe ----------

function styleScore(brief: Brief, vendor: VendorFacts): { score: number; shared: Style[]; near: Style[] } {
  const total = brief.styles.reduce((a, s) => a + s.weight, 0);
  if (total === 0 || vendor.styles.length === 0) return { score: 0, shared: [], near: [] };
  const have = new Set(vendor.styles);
  const shared: Style[] = [];
  const near: Style[] = [];
  let got = 0;
  for (const { style, weight } of brief.styles) {
    if (have.has(style)) {
      got += weight;
      shared.push(style);
    } else if (RELATED_STYLES[style].some((r) => have.has(r))) {
      got += weight * 0.4;
      near.push(style);
    }
  }
  return { score: got / total, shared, near };
}

function formalityScore(brief: Brief, v: VendorFacts): number {
  if (brief.formality >= v.formalityMin && brief.formality <= v.formalityMax) return 1;
  const gap = brief.formality < v.formalityMin ? v.formalityMin - brief.formality : brief.formality - v.formalityMax;
  return Math.max(0, 1 - gap * 0.45);
}

function settingScore(brief: Brief, v: VendorFacts): number {
  let s = 1;
  if (brief.setting !== "either" && v.settings.length > 0 && !v.settings.includes(brief.setting)) s -= 0.6;
  if (v.category === "venue" && brief.venueTypes.length > 0) {
    s *= v.venueType && brief.venueTypes.includes(v.venueType) ? 1 : 0.55;
  }
  return Math.max(0, s);
}

/** Brief colors this vendor's palette echoes closely, for the "why" copy. */
function echoedColors(brief: Brief, v: VendorFacts): string[] {
  const vl = v.palette.map(hexToLab);
  const names = new Set<string>();
  for (const h of brief.palette) {
    const l = hexToLab(h);
    if (vl.some((o) => deltaE(l, o) < 18)) names.add(colorName(h));
  }
  return [...names].slice(0, 2);
}

const BUDGET_LABEL: Record<Category, string> = {
  venue: "venue", planner: "planning", photographer: "photography", videographer: "video", dj: "DJ",
  live_music: "music", caterer: "catering", baker: "cake", florist: "floral", decor_rentals: "rentals",
  bar_service: "bar", hair_makeup: "beauty",
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const listJoin = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

// ---------- the match ----------

/**
 * Score one vendor against one plan + brief. Returns null when the vendor is
 * ruled out by a hard constraint (wrong category, out of range, too small).
 */
export function scoreVendor(plan: PlanFacts, brief: Brief, vendor: VendorFacts, allotted: number): Match | null {
  if (!plan.categories.includes(vendor.category)) return null;

  const planCity = getCity(plan.cityId);
  const vendorCity = getCity(vendor.cityId);
  if (!planCity || !vendorCity) return null;
  const distanceMi = Math.round(milesBetween(planCity, vendorCity));
  if (distanceMi > vendor.serviceRadiusMi) return null;

  if (vendor.category === "venue" && vendor.capacityMax != null && vendor.capacityMax < plan.guestCount) return null;

  const st = styleScore(brief, vendor);
  const parts = {
    style: st.score,
    palette: paletteSimilarity(brief.palette, vendor.palette),
    formality: formalityScore(brief, vendor),
    setting: settingScore(brief, vendor),
    price: 0,
  };
  const cost = estimateCost(vendor, plan.guestCount);
  const pf = priceFit(cost, allotted);
  parts.price = pf.score;

  const score = Math.round(
    100 *
      (WEIGHTS.style * parts.style +
        WEIGHTS.palette * parts.palette +
        WEIGHTS.formality * parts.formality +
        WEIGHTS.setting * parts.setting +
        WEIGHTS.price * parts.price),
  );

  const reasons: string[] = [];
  const caveats: string[] = [];

  if (st.shared.length) reasons.push(`Same ${listJoin(st.shared.map((s) => STYLE_LABELS[s].toLowerCase()))} look as your board`);
  else if (st.near.length) reasons.push(`Close to your ${listJoin(st.near.map((s) => STYLE_LABELS[s].toLowerCase()))} style`);
  else caveats.push("Different style from your board");

  const echoed = echoedColors(brief, vendor);
  if (echoed.length) reasons.push(`Work leans on ${listJoin(echoed)}, like your palette`);

  if (vendor.category === "venue" && vendor.venueType && brief.venueTypes.includes(vendor.venueType)) {
    reasons.push(`The ${vendor.venueType} setting your pins point to`);
  }
  if (vendor.category === "venue" && vendor.capacityMax != null) {
    reasons.push(`Holds up to ${vendor.capacityMax.toLocaleString("en-US")} guests`);
  }

  const range = cost.low === cost.high ? usd(cost.low) : `${usd(cost.low)}–${usd(cost.high)}`;
  const label = BUDGET_LABEL[vendor.category];
  if (pf.fit === "under" || pf.fit === "within") reasons.push(`${range} fits your ${usd(allotted)} ${label} budget`);
  else if (pf.fit === "stretch") caveats.push(`${range} is a stretch on your ${usd(allotted)} ${label} budget`);
  else caveats.push(`${range} is over your ${usd(allotted)} ${label} budget`);

  if (parts.formality < 1) {
    caveats.push(brief.formality < vendor.formalityMin ? "Usually more formal than your board" : "Usually more casual than your board");
  }
  if (brief.setting !== "either" && vendor.settings.length && !vendor.settings.includes(brief.setting)) {
    caveats.push(`Doesn't do ${brief.setting} events`);
  }
  if (distanceMi > 25) caveats.push(`${distanceMi} miles away; ask about travel fees`);

  return {
    vendorId: vendor.id,
    category: vendor.category,
    score,
    parts,
    priceFit: pf.fit,
    estimatedCost: cost,
    distanceMi,
    reasons,
    caveats,
  };
}

/** Rank vendors per category. Relevance only: nothing a vendor pays for touches this. */
export function rankMatches(
  plan: PlanFacts,
  brief: Brief,
  vendors: VendorFacts[],
  perCategory = 6,
): { allocation: Record<Category, number>; byCategory: Partial<Record<Category, Match[]>> } {
  const allocation = allocateBudget(plan, brief.emphasis);
  const byCategory: Partial<Record<Category, Match[]>> = {};
  for (const v of vendors) {
    const m = scoreVendor(plan, brief, v, allocation[v.category] ?? 0);
    if (!m) continue;
    (byCategory[m.category] ??= []).push(m);
  }
  for (const c of Object.keys(byCategory) as Category[]) {
    byCategory[c] = byCategory[c]!.sort((a, b) => b.score - a.score || a.distanceMi - b.distanceMi).slice(0, perCategory);
  }
  return { allocation, byCategory };
}

// ---------- reality check ----------

export interface Conflict {
  kind: "budget_tier" | "heat" | "thin_supply";
  message: string;
  options: string[];
}

export function tierForBudget(eventType: EventType, budget: number, guests: number): Tier {
  const perGuest = budget / Math.max(1, guests) / EVENT_COST_SCALE[eventType];
  let tier: Tier = "essential";
  for (const t of TIERS) if (perGuest >= TIER_PER_GUEST[t]) tier = t;
  return tier;
}

/**
 * Where the board and the real-world plan disagree. This is the part most
 * planning tools skip: the board says luxury estate, the budget says backyard.
 */
export function findConflicts(
  plan: PlanFacts,
  brief: Brief,
  matchCounts?: Partial<Record<Category, number>>,
): Conflict[] {
  const out: Conflict[] = [];
  const affordable = tierForBudget(plan.eventType, plan.budget, plan.guestCount);
  const want = TIERS.indexOf(brief.tier);
  const have = TIERS.indexOf(affordable);

  if (want > have) {
    const scale = EVENT_COST_SCALE[plan.eventType];
    const needPerGuest = TIER_PER_GUEST[brief.tier] * scale;
    const budgetNeeded = Math.ceil((needPerGuest * plan.guestCount) / 500) * 500;
    const guestsAffordable = Math.floor(plan.budget / needPerGuest);
    const options = [`Raise the budget to about ${usd(budgetNeeded)}`];
    if (guestsAffordable >= 10) options.push(`Trim the list to about ${guestsAffordable} guests`);
    options.push(`Keep the numbers and match ${TIER_LABELS[affordable].toLowerCase()} vendors with the same look`);
    out.push({
      kind: "budget_tier",
      message: `Your board reads ${TIER_LABELS[brief.tier].toLowerCase()}. ${usd(plan.budget)} for ${plan.guestCount} guests usually buys ${TIER_LABELS[affordable].toLowerCase()} in DFW.`,
      options,
    });
  }

  if (plan.date && brief.setting === "outdoor") {
    const month = Number(plan.date.slice(5, 7));
    if (month >= 6 && month <= 8) {
      out.push({
        kind: "heat",
        message: "Outdoor in a DFW summer means highs in the upper 90s.",
        options: ["Look at venues with a covered or indoor backup", "Push the start time past 7 PM"],
      });
    }
  }

  if (matchCounts) {
    for (const c of plan.categories) {
      if ((matchCounts[c] ?? 0) === 0) {
        out.push({
          kind: "thin_supply",
          message: `No ${CATEGORY_LABELS[c].toLowerCase()} fit this plan yet.`,
          options: c === "venue" ? ["Widen the city", "Check the guest count"] : ["Widen the city", "Loosen the budget"],
        });
      }
    }
  }
  return out;
}
