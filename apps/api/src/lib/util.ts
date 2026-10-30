import type { FastifyRequest } from "fastify";
import { normalizeImage } from "./images.js";

/** Run `fn` over items with at most `limit` in flight. Failures become null. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<Array<R | null>> {
  const out: Array<R | null> = new Array(items.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]!);
      } catch {
        out[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export const ID_RE = /^[a-z0-9]{10,40}$/;

/** Read every uploaded file from a multipart request and normalize it. */
export async function readUploadedImages(req: FastifyRequest, maxEdge: number) {
  const out: Array<{ data: Buffer; width: number; height: number }> = [];
  for await (const part of req.files()) {
    const buf = await part.toBuffer();
    out.push(await normalizeImage(buf, maxEdge));
  }
  return out;
}
