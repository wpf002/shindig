// Seeds sample DFW vendors so matching has something to rank in development.
// Every seeded vendor is fictional, flagged isDemo, and labeled "Sample" in the UI.
import { prisma } from "./index.js";
import type { Category, Style, VenueType } from "@shindig/core";

interface Look {
  styles: Style[];
  palette: string[];
  formality: [number, number];
}

const LOOKS = {
  garden: { styles: ["garden", "romantic", "whimsical"], palette: ["#e8c3bd", "#a7b59a", "#f6f1e7", "#c99a9a"], formality: [2, 4] },
  western: { styles: ["western", "rustic", "boho"], palette: ["#a5512c", "#d9c6a5", "#6b4a33", "#f6f1e7"], formality: [1, 3] },
  modern: { styles: ["modern", "minimalist"], palette: ["#ffffff", "#141414", "#bfc3c7", "#d9c6a5"], formality: [3, 5] },
  moody: { styles: ["moody", "glam", "maximalist"], palette: ["#5a1e33", "#141414", "#c9a24a", "#4e2a4f"], formality: [4, 5] },
  classic: { styles: ["classic", "glam", "romantic"], palette: ["#f6f1e7", "#c9a24a", "#1f2b4a", "#ffffff"], formality: [4, 5] },
  boho: { styles: ["boho", "rustic", "tropical"], palette: ["#c66b4b", "#ead9be", "#a39383", "#6b6b3a"], formality: [1, 3] },
  coastal: { styles: ["coastal", "minimalist", "boho"], palette: ["#a9cde6", "#f6f1e7", "#8ea4bd", "#d9c6a5"], formality: [2, 4] },
  industrial: { styles: ["industrial", "modern", "moody"], palette: ["#3a3a3a", "#a5512c", "#bfc3c7", "#141414"], formality: [2, 4] },
  vintage: { styles: ["vintage", "romantic", "classic"], palette: ["#ead9be", "#b9a8d0", "#c99a9a", "#f6f1e7"], formality: [2, 4] },
  fiesta: { styles: ["maximalist", "whimsical", "tropical"], palette: ["#e04f8c", "#ea7a5f", "#d1a23a", "#2f7a7a"], formality: [1, 3] },
} satisfies Record<string, Look>;
type LookName = keyof typeof LOOKS;

type Row = [
  name: string,
  city: string,
  look: LookName,
  min: number,
  max: number,
  description: string,
  extra?: { unit?: "flat" | "per_guest"; cap?: number; venue?: VenueType; settings?: Array<"indoor" | "outdoor">; radius?: number },
];

const DATA: Record<Category, Row[]> = {
  venue: [
    ["Larkspur House", "dallas", "garden", 6000, 11000, "Walled garden and a glass conservatory for the rain plan.", { cap: 220, venue: "estate", settings: ["indoor", "outdoor"] }],
    ["The Cotton Gin at Aledo", "aledo", "western", 4500, 8000, "Restored 1920s gin on 12 acres. Bring your boots.", { cap: 300, venue: "barn", settings: ["indoor", "outdoor"] }],
    ["Ninth Floor", "dallas", "modern", 5000, 9000, "Rooftop with a skyline view and a white-box interior.", { cap: 150, venue: "rooftop", settings: ["indoor", "outdoor"] }],
    ["Velvet Hall", "fort-worth", "moody", 9000, 16000, "Dark wood, brass, and a 40-foot bar.", { cap: 350, venue: "ballroom", settings: ["indoor"] }],
    ["Magnolia Ballroom", "plano", "classic", 7000, 14000, "Crystal chandeliers and a sprung dance floor.", { cap: 400, venue: "ballroom", settings: ["indoor"] }],
    ["Brickline Loft", "dallas", "industrial", 3500, 6500, "Exposed brick, steel windows, Deep Ellum address.", { cap: 180, venue: "loft", settings: ["indoor"] }],
    ["Cedar Creek Ranch", "weatherford", "boho", 4000, 7500, "Open pasture ceremony site with a covered pavilion.", { cap: 250, venue: "ranch", settings: ["indoor", "outdoor"] }],
    ["Lakeview Pavilion", "rockwall", "coastal", 3800, 7000, "Lake Ray Hubbard sunsets from the deck.", { cap: 200, venue: "waterfront", settings: ["indoor", "outdoor"] }],
    ["Rosemont Chapel", "waxahachie", "vintage", 2500, 4500, "1890s stone chapel with a rose garden reception lawn.", { cap: 120, venue: "chapel", settings: ["indoor", "outdoor"] }],
    ["Casa Colibrí", "garland", "fiesta", 2500, 5000, "Big hall, bigger dance floor, in-house décor.", { cap: 300, venue: "ballroom", settings: ["indoor"] }],
  ],
  photographer: [
    ["Juniper & Gold Photo", "dallas", "garden", 3200, 5200, "Soft, airy light. Lots of florals and candids."],
    ["Wild Prairie Film", "fort-worth", "western", 2500, 4200, "Film and digital. Golden hour on open land."],
    ["Studio Halvorsen", "dallas", "modern", 4500, 7500, "Clean, editorial, black-and-white heavy."],
    ["Nocturne Photo Co.", "dallas", "moody", 3800, 6500, "Flash, shadow, and the party after dark."],
    ["Avery Lane Photography", "plano", "classic", 3000, 5500, "Timeless posed portraits and full-day coverage."],
    ["Saltbox Photo", "rockwall", "coastal", 2200, 3800, "Bright and natural. Lake and outdoor specialists."],
  ],
  videographer: [
    ["Reelhouse Films", "dallas", "classic", 3500, 7000, "Cinematic highlight films and full ceremony edits."],
    ["Dust & Daylight Video", "fort-worth", "western", 2200, 4000, "Documentary-style, minimal staging."],
    ["Glasswork Media", "dallas", "modern", 4000, 8000, "Drone, multicam, and same-day edits."],
    ["Sundial Films", "denton", "garden", 2500, 4500, "Super 8 and digital, warm color grade."],
  ],
  dj: [
    ["DJ Marisol", "garland", "fiesta", 1200, 2400, "Cumbia to Beyoncé. Bilingual MC."],
    ["Southpaw Sound", "fort-worth", "western", 1200, 2200, "Country, two-step, and line dance sets."],
    ["Lowlight DJs", "dallas", "moody", 1800, 3500, "House and disco for late nights."],
    ["Clearwater Entertainment", "plano", "classic", 1500, 3000, "Full MC service, uplighting, and ceremony audio."],
    ["Night Shift Audio", "dallas", "industrial", 1400, 2800, "Open-format, hip-hop, and throwbacks."],
  ],
  live_music: [
    ["Bluebonnet Strings", "dallas", "garden", 900, 2200, "String trio or quartet for ceremony and cocktails."],
    ["Deep Ellum Brass", "dallas", "moody", 2500, 5000, "Eight-piece brass band for the second line."],
    ["Mariachi Estrellas de Oro", "arlington", "fiesta", 700, 1600, "Traditional mariachi, sets of 45 minutes."],
    ["Fiddle & Fence", "weatherford", "western", 1500, 3200, "Texas swing and country covers."],
  ],
  planner: [
    ["Hollis & Pine Events", "dallas", "garden", 4000, 10000, "Full planning and design for garden weddings."],
    ["Sterling Day Planning", "plano", "classic", 5000, 12000, "Black-tie planning and day-of coordination."],
    ["Mesa Collective", "fort-worth", "boho", 2500, 7000, "Laid-back design, ranch and outdoor events."],
    ["Plainspoken Events", "dallas", "modern", 3000, 8000, "Corporate and modern weddings. Tight timelines."],
    ["Fête Fiesta Co.", "garland", "fiesta", 1500, 5000, "Quinceañeras, birthdays, and big family parties."],
  ],
  caterer: [
    ["Smoke Ring BBQ", "fort-worth", "western", 28, 45, "Brisket, sides, and a carving station.", { unit: "per_guest" }],
    ["Verdant Table", "dallas", "garden", 65, 110, "Seasonal family-style menus.", { unit: "per_guest" }],
    ["Lumen Kitchen", "dallas", "modern", 80, 140, "Plated tasting menus and passed bites.", { unit: "per_guest" }],
    ["Abuela's Table", "garland", "fiesta", 25, 45, "Tex-Mex buffets and taquizas.", { unit: "per_guest" }],
    ["Gilded Fork", "plano", "classic", 95, 160, "White-glove plated service.", { unit: "per_guest" }],
    ["Harbor & Herb", "rockwall", "coastal", 55, 90, "Gulf seafood and light Mediterranean.", { unit: "per_guest" }],
  ],
  baker: [
    ["Sugar Lark Cakes", "dallas", "garden", 400, 1200, "Pressed flowers and buttercream."],
    ["Black Tie Bakehouse", "plano", "classic", 700, 2500, "Tiered fondant and sugar flowers."],
    ["Pan Dulce Studio", "garland", "fiesta", 300, 900, "Tres leches tiers and dessert tables."],
    ["Crumb & Copper", "fort-worth", "western", 350, 1000, "Naked cakes and pie bars."],
  ],
  florist: [
    ["Fieldnote Florals", "dallas", "garden", 2500, 8000, "Loose, garden-cut arrangements."],
    ["Bloom Theory", "dallas", "modern", 3000, 9000, "Sculptural single-variety installs."],
    ["Wildroot Floral", "fort-worth", "boho", 1800, 5500, "Dried grasses, pampas, and wildflowers."],
    ["Velour Flowers", "dallas", "moody", 4000, 12000, "Deep reds, hanging installs, candle walls."],
    ["Petal & Pearl", "waxahachie", "vintage", 1500, 4500, "Garden roses, lace, and antique vessels."],
    ["Lone Star Stems", "aledo", "western", 1500, 4000, "Sunflowers, cotton, and Texas natives."],
  ],
  decor_rentals: [
    ["Heirloom Rentals", "dallas", "vintage", 800, 4000, "Mismatched china, velvet sofas, brass."],
    ["Bright Line Rentals", "dallas", "modern", 1000, 5000, "Acrylic, white lounge, and LED."],
    ["Ranch Hand Rentals", "weatherford", "western", 600, 3000, "Farm tables, crossbacks, and bistro lights."],
    ["Gilt Event Décor", "fort-worth", "moody", 1500, 7000, "Gold chargers, draping, and candelabras."],
  ],
  bar_service: [
    ["Copper Still Mobile Bar", "fort-worth", "western", 18, 35, "Converted horse trailer bar.", { unit: "per_guest" }],
    ["Clear Pour Bar Co.", "dallas", "modern", 25, 45, "Signature cocktails and NA menus.", { unit: "per_guest" }],
    ["The Velvet Pour", "dallas", "moody", 30, 55, "Speakeasy-style service and mixologists.", { unit: "per_guest" }],
    ["Garden Gate Bar", "plano", "garden", 22, 40, "Botanical cocktails, spritz bars.", { unit: "per_guest" }],
  ],
  hair_makeup: [
    ["Soft Focus Beauty", "dallas", "garden", 600, 1800, "Natural skin, soft waves."],
    ["Glamroom DFW", "dallas", "moody", 900, 2500, "Full glam, lashes, and touch-ups."],
    ["Bare Studio", "dallas", "modern", 700, 2000, "Clean, minimal looks that photograph well."],
    ["Lula Beauty Co.", "garland", "fiesta", 500, 1500, "Quince and bridal parties, on-site."],
  ],
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

async function main() {
  const removed = await prisma.vendor.deleteMany({ where: { isDemo: true } });
  let n = 0;
  for (const [category, rows] of Object.entries(DATA) as Array<[Category, Row[]]>) {
    for (const [name, cityId, lookName, min, max, description, extra = {}] of rows) {
      const look = LOOKS[lookName];
      const slug = slugify(name);
      await prisma.vendor.create({
        data: {
          slug,
          name,
          category,
          cityId,
          // Venues don't travel; 60mi is how far a DFW planner will look for one.
          serviceRadiusMi: extra.radius ?? 60,
          priceMin: min,
          priceMax: max,
          priceUnit: extra.unit ?? "flat",
          capacityMax: extra.cap ?? null,
          styles: look.styles,
          palette: look.palette,
          formalityMin: look.formality[0],
          formalityMax: look.formality[1],
          settings: extra.settings ?? ["indoor", "outdoor"],
          venueType: extra.venue ?? null,
          description,
          email: `hello@${slug}.example`,
          isDemo: true,
        },
      });
      n++;
    }
  }
  console.log(`Removed ${removed.count} old sample vendors, seeded ${n}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
