// The shared vocabulary. Briefs (from inspiration boards) and vendors (from
// their own portfolios) are both described in these terms, which is what lets
// us compare a Pinterest board to a photographer directly.

export const STYLES = [
  "romantic",
  "garden",
  "rustic",
  "boho",
  "western",
  "modern",
  "minimalist",
  "classic",
  "glam",
  "industrial",
  "coastal",
  "moody",
  "whimsical",
  "vintage",
  "tropical",
  "maximalist",
] as const;
export type Style = (typeof STYLES)[number];

export const STYLE_LABELS: Record<Style, string> = {
  romantic: "Romantic",
  garden: "Garden",
  rustic: "Rustic",
  boho: "Boho",
  western: "Western",
  modern: "Modern",
  minimalist: "Minimalist",
  classic: "Classic",
  glam: "Glam",
  industrial: "Industrial",
  coastal: "Coastal",
  moody: "Moody",
  whimsical: "Whimsical",
  vintage: "Vintage",
  tropical: "Tropical",
  maximalist: "Maximalist",
};

// Styles that read as close cousins. A partial match earns partial credit.
export const RELATED_STYLES: Record<Style, Style[]> = {
  romantic: ["garden", "classic", "vintage", "whimsical"],
  garden: ["romantic", "boho", "whimsical"],
  rustic: ["boho", "western", "vintage"],
  boho: ["rustic", "garden", "tropical"],
  western: ["rustic", "boho"],
  modern: ["minimalist", "industrial", "glam"],
  minimalist: ["modern", "coastal"],
  classic: ["romantic", "glam", "vintage"],
  glam: ["classic", "moody", "maximalist"],
  industrial: ["modern", "moody"],
  coastal: ["tropical", "minimalist", "boho"],
  moody: ["glam", "industrial", "maximalist"],
  whimsical: ["garden", "romantic", "maximalist"],
  vintage: ["romantic", "classic", "rustic"],
  tropical: ["coastal", "boho", "maximalist"],
  maximalist: ["glam", "whimsical", "moody"],
};

export const CATEGORIES = [
  "venue",
  "planner",
  "photographer",
  "videographer",
  "dj",
  "live_music",
  "caterer",
  "baker",
  "florist",
  "decor_rentals",
  "bar_service",
  "hair_makeup",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  venue: "Venues",
  planner: "Planners",
  photographer: "Photographers",
  videographer: "Videographers",
  dj: "DJs",
  live_music: "Live Music",
  caterer: "Catering",
  baker: "Cakes & Desserts",
  florist: "Florals",
  decor_rentals: "Decor & Rentals",
  bar_service: "Bar Service",
  hair_makeup: "Hair & Makeup",
};

export const EVENT_TYPES = [
  "wedding",
  "engagement",
  "birthday",
  "shower",
  "quinceanera",
  "corporate",
  "gathering",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  wedding: "Wedding",
  engagement: "Engagement Party",
  birthday: "Birthday",
  shower: "Shower",
  quinceanera: "Quinceañera",
  corporate: "Corporate Event",
  gathering: "Gathering",
};

export const TIERS = ["essential", "moderate", "elevated", "luxury"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_LABELS: Record<Tier, string> = {
  essential: "Essential",
  moderate: "Moderate",
  elevated: "Elevated",
  luxury: "Luxury",
};

export const SETTINGS = ["indoor", "outdoor", "either"] as const;
export type Setting = (typeof SETTINGS)[number];

export const VENUE_TYPES = [
  "ballroom",
  "barn",
  "garden",
  "estate",
  "loft",
  "rooftop",
  "restaurant",
  "chapel",
  "museum",
  "ranch",
  "backyard",
  "waterfront",
] as const;
export type VenueType = (typeof VENUE_TYPES)[number];

export const LIGHTING = [
  "candlelit",
  "string_lights",
  "natural_daylight",
  "uplighting",
  "chandeliers",
  "neon",
] as const;
export type Lighting = (typeof LIGHTING)[number];

export const PRICE_UNITS = ["flat", "per_guest"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

// Typical share of total budget per category, per event type. Only the
// categories a plan actually needs are used; shares get renormalized.
export const BASE_ALLOCATION: Record<EventType, Partial<Record<Category, number>>> = {
  wedding: {
    venue: 0.3, caterer: 0.22, photographer: 0.11, videographer: 0.06, planner: 0.08,
    florist: 0.08, dj: 0.04, live_music: 0.05, decor_rentals: 0.05, bar_service: 0.05,
    baker: 0.02, hair_makeup: 0.03,
  },
  engagement: {
    venue: 0.3, caterer: 0.3, photographer: 0.1, dj: 0.07, florist: 0.06,
    decor_rentals: 0.06, bar_service: 0.08, baker: 0.03, planner: 0.05, live_music: 0.05,
  },
  birthday: {
    venue: 0.3, caterer: 0.3, dj: 0.1, decor_rentals: 0.1, baker: 0.06,
    photographer: 0.07, bar_service: 0.07, planner: 0.05, florist: 0.04, live_music: 0.06,
  },
  shower: {
    venue: 0.3, caterer: 0.3, decor_rentals: 0.12, florist: 0.1, baker: 0.08,
    photographer: 0.08, planner: 0.05,
  },
  quinceanera: {
    venue: 0.28, caterer: 0.22, dj: 0.08, photographer: 0.09, videographer: 0.06,
    decor_rentals: 0.08, florist: 0.05, baker: 0.04, hair_makeup: 0.03, planner: 0.05, live_music: 0.05,
  },
  corporate: {
    venue: 0.35, caterer: 0.3, bar_service: 0.08, decor_rentals: 0.08, photographer: 0.06,
    dj: 0.04, planner: 0.08, live_music: 0.05, videographer: 0.04,
  },
  gathering: {
    venue: 0.3, caterer: 0.35, bar_service: 0.1, decor_rentals: 0.08, florist: 0.05,
    dj: 0.06, photographer: 0.05, live_music: 0.05, baker: 0.04,
  },
};

// Rough all-in cost per guest at each tier, for weddings in DFW. Other event
// types scale off this. These are planning heuristics, shown to users as such.
export const TIER_PER_GUEST: Record<Tier, number> = {
  essential: 0,
  moderate: 110,
  elevated: 200,
  luxury: 340,
};

export const EVENT_COST_SCALE: Record<EventType, number> = {
  wedding: 1,
  quinceanera: 0.75,
  engagement: 0.5,
  corporate: 0.6,
  birthday: 0.4,
  shower: 0.3,
  gathering: 0.35,
};
