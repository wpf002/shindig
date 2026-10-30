import { CATEGORIES, briefSchema, type Brief, type Category } from "@shindig/core";
import { readBoardWithClaude, type VisionRead } from "./claude.js";
import { extractPalette, stylesFromPalette } from "./palette.js";

export const MAX_IMAGES_PER_READ = 24;

export interface VisionConfig {
  apiKey?: string;
  model: string;
}

/** Evenly sample so a 200-pin board is represented end to end, not just the top. */
export function sampleEvenly<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  const step = xs.length / n;
  return Array.from({ length: n }, (_, i) => xs[Math.floor(i * step)]!);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Turn a set of normalized JPEGs into a vibe brief. Palette always comes from
 * pixels. Style comes from Claude when configured, otherwise a color heuristic.
 */
export async function analyzeImages(images: Buffer[], cfg: VisionConfig, hint?: string): Promise<Brief> {
  const sample = sampleEvenly(images, MAX_IMAGES_PER_READ);
  const paletteRead = await extractPalette(sample);

  let read: VisionRead | null = null;
  if (cfg.apiKey) {
    try {
      read = await readBoardWithClaude(sample, { apiKey: cfg.apiKey, model: cfg.model, hint });
    } catch (e) {
      console.error("Claude vision failed, using palette fallback:", e);
    }
  }

  if (!read) {
    return briefSchema.parse({
      summary: "Read from colors only, so the style tags are a rough guess. Fix anything that's off.",
      styles: stylesFromPalette(paletteRead),
      palette: paletteRead.palette,
      formality: 3,
      tier: "moderate",
      setting: "either",
      venueTypes: [],
      lighting: [],
      keywords: [],
      emphasis: {},
      analyzer: "palette",
      imageCount: images.length,
    });
  }

  const emphasis: Partial<Record<Category, number>> = {};
  for (const [k, v] of Object.entries(read.emphasis)) {
    if ((CATEGORIES as readonly string[]).includes(k)) emphasis[k as Category] = clamp01(v);
  }
  // De-dupe styles, keep strongest.
  const seen = new Set<string>();
  const styles = read.styles
    .filter((s) => !seen.has(s.style) && seen.add(s.style))
    .map((s) => ({ style: s.style, weight: clamp01(s.weight) }))
    .slice(0, 6);

  return briefSchema.parse({
    summary: read.summary.slice(0, 600),
    styles,
    palette: paletteRead.palette,
    formality: Math.round(Math.max(1, Math.min(5, read.formality))),
    tier: read.tier,
    setting: read.setting,
    venueTypes: [...new Set(read.venueTypes)].slice(0, 5),
    lighting: [...new Set(read.lighting)].slice(0, 4),
    keywords: [...new Set(read.keywords.map((k) => k.toLowerCase().trim().slice(0, 40)).filter(Boolean))].slice(0, 12),
    emphasis,
    analyzer: "claude",
    imageCount: images.length,
  });
}
