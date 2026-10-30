// Color math for comparing a board's palette to a vendor's portfolio palette.
// CIE76 delta-E in Lab space: crude, but good enough to tell blush from navy.

export type Lab = [number, number, number];

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function isHex(s: string): boolean {
  return HEX_RE.test(s);
}

export function normalizeHex(s: string): string {
  const m = HEX_RE.exec(s.trim());
  if (!m || !m[1]) throw new Error(`Bad hex color: ${s}`);
  return `#${m[1].toLowerCase()}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex).slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * 0..1 similarity between two palettes. For each color in `wanted`, find the
 * nearest color in `offered`; average the closeness. deltaE of 0 → 1, ≥ 50 → 0.
 */
export function paletteSimilarity(wanted: string[], offered: string[]): number {
  if (wanted.length === 0 || offered.length === 0) return 0;
  const offeredLab = offered.map(hexToLab);
  let total = 0;
  for (const w of wanted) {
    const wl = hexToLab(w);
    let best = Infinity;
    for (const o of offeredLab) best = Math.min(best, deltaE(wl, o));
    total += Math.max(0, 1 - best / 50);
  }
  return total / wanted.length;
}

const NAMED: Array<[string, string]> = [
  ["ivory", "#f6f1e7"], ["white", "#ffffff"], ["champagne", "#ead9be"], ["blush", "#e8c3bd"],
  ["dusty rose", "#c99a9a"], ["terracotta", "#c66b4b"], ["rust", "#a5512c"], ["burgundy", "#6d1f2c"],
  ["wine", "#5a1e33"], ["plum", "#4e2a4f"], ["lavender", "#b9a8d0"], ["navy", "#1f2b4a"],
  ["dusty blue", "#8ea4bd"], ["sky", "#a9cde6"], ["teal", "#2f7a7a"], ["sage", "#a7b59a"],
  ["olive", "#6b6b3a"], ["emerald", "#1f6b4f"], ["forest", "#2b4a33"], ["mustard", "#d1a23a"],
  ["gold", "#c9a24a"], ["peach", "#f2b99a"], ["coral", "#ea7a5f"], ["hot pink", "#e04f8c"],
  ["black", "#141414"], ["charcoal", "#3a3a3a"], ["taupe", "#a39383"], ["sand", "#d9c6a5"],
  ["brown", "#6b4a33"], ["silver", "#bfc3c7"],
];
const NAMED_LAB = NAMED.map(([n, h]) => [n, hexToLab(h)] as const);

/** Human name for a hex color, for "your blush and sage palette" copy. */
export function colorName(hex: string): string {
  const lab = hexToLab(hex);
  let best = NAMED_LAB[0]!;
  let bestD = Infinity;
  for (const entry of NAMED_LAB) {
    const d = deltaE(lab, entry[1]);
    if (d < bestD) {
      bestD = d;
      best = entry;
    }
  }
  return best[0];
}
