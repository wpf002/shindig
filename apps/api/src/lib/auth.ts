import argon2 from "argon2";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma, type User } from "@shindig/db";
import { randomToken, sha256 } from "./crypto.js";

export const SESSION_COOKIE = "shindig_sid";
const SESSION_DAYS = 30;

export type SessionUser = Pick<User, "id" | "email" | "name" | "role">;

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

export const hashPassword = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });
export const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw).catch(() => false);

// Spent on unknown emails so login timing doesn't reveal which accounts exist.
let dummyHash: Promise<string> | undefined;
export const burnPasswordCheck = async (pw: string) => {
  dummyHash ??= hashPassword(randomToken());
  await verifyPassword(await dummyHash, pw);
};

export async function startSession(reply: FastifyReply, userId: string, secure: boolean): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await prisma.session.create({ data: { id: sha256(token), userId, expiresAt } });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function loadUser(req: FastifyRequest): Promise<SessionUser | undefined> {
  const token = req.cookies[SESSION_COOKIE];
  if (!token || token.length > 100) return undefined;
  const s = await prisma.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!s) return undefined;
  if (s.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: s.id } }).catch(() => {});
    return undefined;
  }
  return s.user;
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const user = await loadUser(req);
  if (!user) return reply.code(401).send({ error: "Sign in first" });
  req.user = user;
}

export async function requireVendor(req: FastifyRequest, reply: FastifyReply) {
  const user = await loadUser(req);
  if (!user) return reply.code(401).send({ error: "Sign in first" });
  if (user.role !== "vendor") return reply.code(403).send({ error: "Vendor accounts only" });
  req.user = user;
}
