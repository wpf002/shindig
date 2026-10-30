import { describe, expect, it } from "vitest";
import {
  allocateBudget,
  findConflicts,
  rankMatches,
  scoreVendor,
  tierForBudget,
  type PlanFacts,
  type VendorFacts,
} from "./matching.js";
import { briefSchema, type Brief } from "./schemas.js";
import { colorName, paletteSimilarity } from "./color.js";

const brief: Brief = briefSchema.parse({
  summary: "Candlelit garden wedding in blush and sage.",
  styles: [
    { style: "garden", weight: 1 },
    { style: "romantic", weight: 0.7 },
  ],
  palette: ["#e8c3bd", "#a7b59a", "#f6f1e7"],
  formality: 3,
  tier: "elevated",
  setting: "outdoor",
  venueTypes: ["garden", "estate"],
  lighting: ["candlelit"],
  keywords: ["candles", "peonies"],
  emphasis: { florist: 0.6 },
  analyzer: "claude",
  imageCount: 30,
});

const plan: PlanFacts = {
  eventType: "wedding",
  date: "2027-04-17",
  cityId: "dallas",
  guestCount: 120,
  budget: 30000,
  categories: ["venue", "photographer", "florist"],
};

const vendor = (over: Partial<VendorFacts>): VendorFacts => ({
  id: "v",
  category: "photographer",
  cityId: "dallas",
  serviceRadiusMi: 60,
  priceMin: 3000,
  priceMax: 4500,
  priceUnit: "flat",
  capacityMax: null,
  styles: ["garden", "romantic"],
  palette: ["#e6c2bb", "#a9b79b"],
  formalityMin: 2,
  formalityMax: 4,
  settings: ["indoor", "outdoor"],
  venueType: null,
  ...over,
});

describe("allocateBudget", () => {
  it("spends the whole budget across chosen categories", () => {
    const a = allocateBudget(plan, {});
    const sum = Object.values(a).reduce((x, y) => x + y, 0);
    expect(Math.abs(sum - plan.budget)).toBeLessThanOrEqual(3);
    expect(a.venue).toBeGreaterThan(a.florist);
  });

  it("gives more to categories the board leans on", () => {
    const flat = allocateBudget(plan, {});
    const floral = allocateBudget(plan, { florist: 1 });
    expect(floral.florist).toBeGreaterThan(flat.florist);
  });
});

describe("scoreVendor", () => {
  const allotted = 5000;

  it("rates a same-style, same-palette, in-budget vendor highly and says why", () => {
    const m = scoreVendor(plan, brief, vendor({}), allotted)!;
    expect(m.score).toBeGreaterThan(85);
    expect(m.reasons.join(" ")).toMatch(/garden/);
    expect(m.reasons.join(" ")).toMatch(/blush|sage/);
    expect(m.priceFit).toBe("within");
  });

  it("ranks a mismatched style lower", () => {
    const good = scoreVendor(plan, brief, vendor({}), allotted)!;
    const off = scoreVendor(plan, brief, vendor({ styles: ["industrial"], palette: ["#141414"] }), allotted)!;
    expect(off.score).toBeLessThan(good.score - 30);
    expect(off.caveats).toContain("Different style from your board");
  });

  it("gives partial credit for related styles", () => {
    const related = scoreVendor(plan, brief, vendor({ styles: ["whimsical"] }), allotted)!;
    expect(related.parts.style).toBeGreaterThan(0);
    expect(related.parts.style).toBeLessThan(1);
  });

  it("drops vendors outside their service radius", () => {
    expect(scoreVendor(plan, brief, vendor({ cityId: "weatherford", serviceRadiusMi: 20 }), allotted)).toBeNull();
  });

  it("drops venues too small for the guest list", () => {
    expect(scoreVendor(plan, brief, vendor({ category: "venue", capacityMax: 80 }), 9000)).toBeNull();
  });

  it("prices per-guest vendors against the guest count", () => {
    const m = scoreVendor(plan, brief, vendor({ category: "florist", priceUnit: "per_guest", priceMin: 40, priceMax: 60 }), 5000)!;
    expect(m.estimatedCost).toEqual({ low: 4800, high: 7200 });
    expect(m.priceFit).toBe("within");
  });

  it("flags over-budget vendors instead of hiding them", () => {
    const m = scoreVendor(plan, brief, vendor({ priceMin: 12000, priceMax: 15000 }), allotted)!;
    expect(m.priceFit).toBe("over");
    expect(m.caveats.join(" ")).toMatch(/over your/);
  });
});

describe("rankMatches", () => {
  it("sorts by score within each category", () => {
    const vs = [
      vendor({ id: "a", styles: ["industrial"] }),
      vendor({ id: "b" }),
      vendor({ id: "c", category: "venue", capacityMax: 200, venueType: "garden" }),
    ];
    const { byCategory } = rankMatches(plan, brief, vs);
    expect(byCategory.photographer!.map((m) => m.vendorId)).toEqual(["b", "a"]);
    expect(byCategory.venue![0]!.reasons.join(" ")).toMatch(/garden setting/);
  });
});

describe("findConflicts", () => {
  it("catches a luxury board on a moderate budget and offers real numbers", () => {
    const c = findConflicts({ ...plan, budget: 15000 }, { ...brief, tier: "luxury" });
    const tier = c.find((x) => x.kind === "budget_tier")!;
    expect(tier).toBeDefined();
    expect(tier.options[0]).toMatch(/\$41,000/);
    expect(tier.options[1]).toMatch(/44 guests/);
  });

  it("is quiet when the budget covers the look", () => {
    expect(findConflicts({ ...plan, budget: 60000 }, brief).filter((c) => c.kind === "budget_tier")).toHaveLength(0);
  });

  it("warns about outdoor summer events", () => {
    expect(findConflicts({ ...plan, date: "2027-07-10" }, brief).some((c) => c.kind === "heat")).toBe(true);
  });

  it("reports categories with no matches", () => {
    const c = findConflicts(plan, brief, { venue: 0, photographer: 3, florist: 2 });
    expect(c.find((x) => x.kind === "thin_supply")?.message).toMatch(/venues/);
  });
});

describe("tiers and color", () => {
  it("maps budget per guest to a tier", () => {
    expect(tierForBudget("wedding", 12000, 120)).toBe("essential");
    expect(tierForBudget("wedding", 30000, 120)).toBe("elevated");
    expect(tierForBudget("wedding", 50000, 120)).toBe("luxury");
  });

  it("names colors and compares palettes", () => {
    expect(colorName("#e6c1bb")).toBe("blush");
    expect(paletteSimilarity(["#e8c3bd"], ["#e8c3bd"])).toBeCloseTo(1);
    expect(paletteSimilarity(["#e8c3bd"], ["#1f2b4a"])).toBeLessThan(0.2);
  });
});
