import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@shindig/db";
import { ID_RE } from "../lib/util.js";
import { placePhotos } from "./plans.js";

// Google photo URLs expire, so we resolve them on request and redirect. Cached for an hour.
const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { url: string; at: number }>();

export async function placeRoutes(app: FastifyInstance) {
  app.get("/place-photos/:vendorId/:idx", async (req, reply) => {
    const key = app.env.GOOGLE_PLACES_API_KEY;
    if (!key) return reply.code(404).send({ error: "Photo not found" });
    const { vendorId, idx } = z.object({ vendorId: z.string().regex(ID_RE), idx: z.coerce.number().int().min(0).max(20) }).parse(req.params);

    const cacheKey = `${vendorId}/${idx}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) return reply.header("Cache-Control", "public, max-age=3600").redirect(hit.url, 302);

    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, active: true }, select: { placePhotos: true } });
    const photo = vendor ? placePhotos(vendor)[idx] : undefined;
    if (!photo) return reply.code(404).send({ error: "Photo not found" });

    const res = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=800&skipHttpRedirect=true`, {
      headers: { "X-Goog-Api-Key": key },
    });
    if (!res.ok) return reply.code(502).send({ error: "Photo unavailable" });
    const { photoUri } = (await res.json()) as { photoUri?: string };
    if (!photoUri) return reply.code(502).send({ error: "Photo unavailable" });

    cache.set(cacheKey, { url: photoUri, at: Date.now() });
    return reply.header("Cache-Control", "public, max-age=3600").redirect(photoUri, 302);
  });
}
