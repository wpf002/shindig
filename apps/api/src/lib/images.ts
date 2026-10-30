import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set(["jpeg", "png", "webp", "heif", "avif", "gif"]);

export class BadImageError extends Error {}

/**
 * Decode, verify it's really an image (by content, not filename), auto-rotate,
 * strip all metadata (EXIF GPS included), and re-encode at a bounded size.
 */
export async function normalizeImage(input: Buffer, maxEdge = 1024): Promise<{ data: Buffer; width: number; height: number }> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000 }).metadata();
  } catch {
    throw new BadImageError("Not a readable image");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw new BadImageError(`Unsupported image type: ${meta.format ?? "unknown"}`);
  const { data, info } = await sharp(input, { limitInputPixels: 50_000_000, animated: false })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
