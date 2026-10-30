import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@shindig/db";
import {
  burnPasswordCheck,
  endSession,
  hashPassword,
  loadUser,
  startSession,
  verifyPassword,
} from "../lib/auth.js";

const email = z.string().trim().toLowerCase().email().max(200);

const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email,
  password: z.string().min(10, "Use at least 10 characters").max(200),
  role: z.enum(["planner", "vendor"]).default("planner"),
});

const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

export async function authRoutes(app: FastifyInstance) {
  const secure = app.env.NODE_ENV === "production";
  const tight = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/auth/signup", tight, async (req, reply) => {
    const body = signupSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) return reply.code(409).send({ error: "That email already has an account" });
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, role: body.role, passwordHash: await hashPassword(body.password) },
      select: { id: true, email: true, name: true, role: true },
    });
    await startSession(reply, user.id, secure);
    return { user };
  });

  app.post("/auth/login", tight, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      await burnPasswordCheck(body.password);
      return reply.code(401).send({ error: "Wrong email or password" });
    }
    if (!(await verifyPassword(user.passwordHash, body.password))) {
      return reply.code(401).send({ error: "Wrong email or password" });
    }
    await startSession(reply, user.id, secure);
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  });

  app.post("/auth/logout", async (req, reply) => {
    await endSession(req, reply);
    return { ok: true };
  });

  app.get("/auth/me", async (req) => ({ user: (await loadUser(req)) ?? null }));
}
