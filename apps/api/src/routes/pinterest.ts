import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@shindig/db";
import { pinterestEnabled } from "../env.js";
import { randomToken, safeEqual } from "../lib/crypto.js";
import { requireUser } from "../lib/auth.js";
import {
  authorizeUrl,
  exchangeCode,
  listBoards,
  PinterestError,
  refresh,
  type PinterestConfig,
} from "../lib/pinterest.js";
import { ID_RE } from "../lib/util.js";

const STATE_COOKIE = "shindig_pin_state";

/** A valid access token for this user, refreshing if it's about to lapse. */
export async function pinterestToken(app: FastifyInstance, userId: string): Promise<string> {
  const conn = await prisma.pinterestConnection.findUnique({ where: { userId } });
  if (!conn) throw new PinterestError("Not connected", 401);
  if (conn.expiresAt.getTime() > Date.now() + 60_000) return app.tokens.open(conn.accessTokenEnc);
  if (!conn.refreshTokenEnc) throw new PinterestError("Expired", 401);
  const t = await refresh(pinterestConfig(app), app.tokens.open(conn.refreshTokenEnc));
  await prisma.pinterestConnection.update({
    where: { userId },
    data: {
      accessTokenEnc: app.tokens.seal(t.accessToken),
      refreshTokenEnc: t.refreshToken ? app.tokens.seal(t.refreshToken) : conn.refreshTokenEnc,
      expiresAt: t.expiresAt,
      scope: t.scope,
    },
  });
  return t.accessToken;
}

function pinterestConfig(app: FastifyInstance): PinterestConfig {
  const e = app.env;
  if (!pinterestEnabled(e)) throw new PinterestError("Pinterest isn't configured", 503);
  return { clientId: e.PINTEREST_CLIENT_ID!, clientSecret: e.PINTEREST_CLIENT_SECRET!, redirectUri: e.PINTEREST_REDIRECT_URI! };
}

export async function pinterestRoutes(app: FastifyInstance) {
  const secure = app.env.NODE_ENV === "production";

  app.get("/pinterest/status", { preHandler: requireUser }, async (req) => {
    const conn = await prisma.pinterestConnection.findUnique({ where: { userId: req.user!.id }, select: { userId: true } });
    return { enabled: pinterestEnabled(app.env), connected: Boolean(conn) };
  });

  app.get("/pinterest/connect", { preHandler: requireUser }, async (req, reply) => {
    const { planId } = z.object({ planId: z.string().regex(ID_RE) }).parse(req.query);
    const state = randomToken(24);
    reply.setCookie(STATE_COOKIE, `${state}.${planId}`, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 600,
      signed: true,
    });
    return reply.redirect(authorizeUrl(pinterestConfig(app), state));
  });

  app.get("/pinterest/callback", { preHandler: requireUser }, async (req, reply) => {
    const q = z.object({ code: z.string().max(500).optional(), state: z.string().max(200), error: z.string().optional() }).parse(req.query);
    const raw = req.cookies[STATE_COOKIE];
    reply.clearCookie(STATE_COOKIE, { path: "/" });
    const unsigned = raw ? req.unsignCookie(raw) : null;
    const [state, planId] = unsigned?.valid && unsigned.value ? unsigned.value.split(".") : [];
    const back = (status: string) =>
      reply.redirect(`${app.env.WEB_ORIGIN}/plans/${planId && ID_RE.test(planId) ? planId : ""}?pinterest=${status}`);

    if (!state || !planId || !safeEqual(state, q.state)) return back("error");
    if (q.error || !q.code) return back("denied");

    try {
      const t = await exchangeCode(pinterestConfig(app), q.code);
      const data = {
        accessTokenEnc: app.tokens.seal(t.accessToken),
        refreshTokenEnc: t.refreshToken ? app.tokens.seal(t.refreshToken) : null,
        expiresAt: t.expiresAt,
        scope: t.scope,
      };
      await prisma.pinterestConnection.upsert({ where: { userId: req.user!.id }, create: { userId: req.user!.id, ...data }, update: data });
      return back("connected");
    } catch (err) {
      req.log.warn({ err }, "pinterest token exchange failed");
      return back("error");
    }
  });

  app.delete("/pinterest", { preHandler: requireUser }, async (req) => {
    await prisma.pinterestConnection.deleteMany({ where: { userId: req.user!.id } });
    return { ok: true };
  });

  app.get("/pinterest/boards", { preHandler: requireUser }, async (req) => {
    const token = await pinterestToken(app, req.user!.id);
    return { boards: await listBoards(token) };
  });
}
