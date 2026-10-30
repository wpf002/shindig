import sharp from "sharp";
import { deltaE, rgbToHex, rgbToLab, type Lab, type Style } from "@shindig/core";

type RGB = [number, number, number];

async function samplePixels(img: Buffer, size = 48): Promise<RGB[]> {
  const { data } = await sharp(img).resize(size, size, { fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out: RGB[] = [];
  for (let i = 0; i + 2 < data.length; i += 3) out.push([data[i]!, data[i + 1]!, data[i + 2]!]);
  return out;
}

// Deterministic PRNG so the same board always yields the same palette.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kmeans(points: Lab[], k: number, iters = 12): { centers: Lab[]; sizes: number[] } {
  const rand = mulberry32(points.length * 2654435761);
  const centers: Lab[] = [];
  // k-means++ init
  centers.push(points[Math.floor(rand() * points.length)]!);
  while (centers.length < k) {
    const d = points.map((p) => Math.min(...centers.map((c) => deltaE(p, c))) ** 2);
    const sum = d.reduce((a, b) => a + b, 0);
    let r = rand() * sum;
    let idx = 0;
    for (; idx < d.length - 1 && r > d[idx]!; idx++) r -= d[idx]!;
    centers.push(points[idx]!);
  }
  const assign = new Array<number>(points.length).fill(0);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < points.length; i++) {
      let best = 0;
      let bd = Infinity;
      for (let c = 0; c < k; c++) {
        const dd = deltaE(points[i]!, centers[c]!);
        if (dd < bd) {
          bd = dd;
          best = c;
        }
      }
      assign[i] = best;
    }
    const acc = centers.map(() => [0, 0, 0, 0]);
    points.forEach((p, i) => {
      const a = acc[assign[i]!]!;
      a[0]! += p[0];
      a[1]! += p[1];
      a[2]! += p[2];
      a[3]! += 1;
    });
    acc.forEach((a, c) => {
      if (a[3]! > 0) centers[c] = [a[0]! / a[3]!, a[1]! / a[3]!, a[2]! / a[3]!];
    });
  }
  const sizes = centers.map((_, c) => assign.filter((a) => a === c).length);
  return { centers, sizes };
}

function labToRgb([L, a, b]: Lab): RGB {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const inv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const x = inv(fx) * 0.95047, y = inv(fy), z = inv(fz) * 1.08883;
  const r = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const g = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const bl = x * 0.0557 + y * -0.204 + z * 1.057;
  const gam = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  return [gam(r), gam(g), gam(bl)];
}

export interface PaletteRead {
  palette: string[];
  /** Lab centers with their share of pixels, biggest first. */
  swatches: Array<{ hex: string; lab: Lab; share: number }>;
}

/** Dominant colors across a set of images, merged so near-duplicates collapse. */
export async function extractPalette(images: Buffer[], max = 5): Promise<PaletteRead> {
  const all: Lab[] = [];
  for (const img of images) {
    const px = await samplePixels(img);
    for (const p of px) all.push(rgbToLab(...p));
  }
  if (all.length === 0) return { palette: [], swatches: [] };
  const step = Math.max(1, Math.floor(all.length / 12000));
  const pts = all.filter((_, i) => i % step === 0);
  const { centers, sizes } = kmeans(pts, Math.min(8, pts.length));
  const total = sizes.reduce((a, b) => a + b, 0) || 1;

  const ranked = centers
    .map((lab, i) => ({ lab, share: sizes[i]! / total }))
    .filter((s) => s.share > 0.02)
    .sort((a, b) => b.share - a.share);

  const merged: typeof ranked = [];
  for (const s of ranked) {
    const near = merged.find((m) => deltaE(m.lab, s.lab) < 12);
    if (near) near.share += s.share;
    else merged.push({ ...s });
  }
  const swatches = merged.slice(0, max).map((s) => ({ ...s, hex: rgbToHex(...labToRgb(s.lab)) }));
  return { palette: swatches.map((s) => s.hex), swatches };
}

/**
 * Best guess at styles from color alone. Only used when there's no vision
 * model configured; the UI says so and the tags are editable.
 */
export function stylesFromPalette(read: PaletteRead): Array<{ style: Style; weight: number }> {
  if (read.swatches.length === 0) return [];
  let L = 0, C = 0, warm = 0, blue = 0;
  for (const s of read.swatches) {
    const [l, a, b] = s.lab;
    const chroma = Math.hypot(a, b);
    L += l * s.share;
    C += chroma * s.share;
    if (b > 8 && a > -5) warm += s.share;
    if (b < -8) blue += s.share;
  }
  const lights = read.swatches.filter((s) => s.lab[0] > 85).reduce((a, s) => a + s.share, 0);
  const darks = read.swatches.filter((s) => s.lab[0] < 25).reduce((a, s) => a + s.share, 0);
  const out: Array<{ style: Style; weight: number }> = [];
  const add = (style: Style, w: number) => w > 0.2 && out.push({ style, weight: Math.min(1, Number(w.toFixed(2))) });

  add("moody", (darks - 0.2) * 2.5 + (L < 40 ? 0.4 : 0));
  add("modern", lights > 0.25 && darks > 0.15 && C < 15 ? 0.8 : 0);
  add("minimalist", C < 10 && lights > 0.4 ? 0.7 : 0);
  add("romantic", L > 70 && C > 8 && C < 30 && blue < 0.2 ? 0.7 : 0);
  add("garden", L > 55 && C > 12 && warm < 0.7 ? 0.5 : 0);
  add("rustic", warm > 0.5 && L < 65 ? 0.7 : 0);
  add("boho", warm > 0.45 && C > 18 ? 0.6 : 0);
  add("coastal", blue > 0.3 && L > 60 ? 0.8 : 0);
  add("maximalist", C > 38 ? 0.7 : 0);
  return out.sort((a, b) => b.weight - a.weight).slice(0, 4);
}
