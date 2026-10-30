import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import type { Env } from "./env.js";
import { TokenBox } from "./lib/crypto.js";
import { BadImageError, MAX_UPLOAD_BYTES } from "./lib/images.js";
import { PinterestError } from "./lib/pinterest.js";
import { authRoutes } from "./routes/auth.js";
import { pinterestRoutes } from "./routes/pinterest.js";
import { planRoutes } from "./routes/plans.js";
import { vendorRoutes } from "./routes/vendors.js";

declare module "fastify" {
  interface FastifyInstance {
    env: Env;
    tokens: TokenBox;
    uploadDir: string;
  }
}

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.NODE_ENV === "test" ? false : { level: env.NODE_ENV === "production" ? "info" : "debug" },
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  const uploadDir = resolve(env.UPLOAD_DIR);
  mkdirSync(uploadDir, { recursive: true });
  app.decorate("env", env);
  app.decorate("tokens", new TokenBox(env.TOKEN_ENCRYPTION_KEY));
  app.decorate("uploadDir", uploadDir);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie, { secret: Buffer.from(env.SESSION_SECRET, "base64").toString("hex") });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 30, fields: 10 } });
  await app.register(fastifyStatic, {
    root: uploadDir,
    prefix: "/images/",
    index: false,
    list: false,
    dotfiles: "deny",
    maxAge: "7d",
    immutable: true,
  });

  // Cookies are SameSite=Lax; this blocks the rest of cross-site writes.
  app.addHook("onRequest", async (req, reply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    const origin = req.headers.origin;
    if (origin && origin !== env.WEB_ORIGIN) return reply.code(403).send({ error: "Bad origin" });
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      return reply.code(400).send({ error: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input" });
    }
    if (err instanceof BadImageError) return reply.code(400).send({ error: err.message });
    if (err instanceof PinterestError) {
      req.log.warn({ err }, "pinterest error");
      if (err.status === 401) return reply.code(409).send({ error: "Pinterest access expired. Reconnect Pinterest." });
      if (err.status === 503) return reply.code(503).send({ error: "Pinterest isn't set up on this server yet." });
      if (err.status === 400) return reply.code(400).send({ error: err.message });
      return reply.code(502).send({ error: "Pinterest didn't respond. Try again in a minute." });
    }
    const e = err as Error & { statusCode?: number };
    const status = e.statusCode ?? 500;
    if (status < 500) return reply.code(status).send({ error: e.message });
    req.log.error({ err }, "unhandled");
    return reply.code(500).send({ error: "Something broke on our end" });
  });

  app.get("/health", async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.register(pinterestRoutes);
  await app.register(planRoutes);
  await app.register(vendorRoutes);
  return app;
}
