import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma, type Plan, type Vendor } from "@shindig/db";
import {
  allocateBudget,
  BASE_ALLOCATION,
  CATEGORIES,
  briefEditSchema,
  briefSchema,
  findConflicts,
  inquiryInputSchema,
  planInputSchema,
  rankMatches,
  type Brief,
  type Category,
  type PlanFacts,
  type VendorFacts,
} from "@shindig/core";
import { requireUser } from "../lib/auth.js";
import { boardImageUrls, fetchPinImage, publicBoardImages, resolveBoardLink } from "../lib/pinterest.js";
import { ID_RE, mapLimit, readUploadedImages } from "../lib/util.js";
import { normalizeImage } from "../lib/images.js";
import { analyzeImages, MAX_IMAGES_PER_READ, sampleEvenly } from "../vision/index.js";
import { pinterestToken } from "./pinterest.js";

const idParams = z.object({ id: z.string().regex(ID_RE) });

export function planFacts(p: Plan): PlanFacts {
  return {
    eventType: p.eventType as PlanFacts["eventType"],
    date: p.date,
    cityId: p.cityId,
    guestCount: p.guestCount,
    budget: p.budget,
    categories: p.categories as Category[],
  };
}

export function vendorFacts(v: Vendor): VendorFacts {
  return {
    id: v.id,
    category: v.category as Category,
    cityId: v.cityId,
    serviceRadiusMi: v.serviceRadiusMi,
    priceMin: v.priceMin,
    priceMax: v.priceMax,
    priceUnit: v.priceUnit as VendorFacts["priceUnit"],
    capacityMax: v.capacityMax,
    styles: v.styles as VendorFacts["styles"],
    palette: v.palette,
    formalityMin: v.formalityMin,
    formalityMax: v.formalityMax,
    settings: v.settings as VendorFacts["settings"],
    venueType: v.venueType as VendorFacts["venueType"],
  };
}

export interface PlacePhoto {
  name: string;
  width: number;
  height: number;
  author: string | null;
}

export function placePhotos(v: Pick<Vendor, "placePhotos">): PlacePhoto[] {
  return Array.isArray(v.placePhotos) ? (v.placePhotos as unknown as PlacePhoto[]) : [];
}

export function publicVendor(
  v: Vendor & { images?: Array<{ id: string; fileName: string; width: number; height: number; credit?: string | null }> },
) {
  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    category: v.category,
    cityId: v.cityId,
    serviceRadiusMi: v.serviceRadiusMi,
    priceMin: v.priceMin,
    priceMax: v.priceMax,
    priceUnit: v.priceUnit,
    capacityMax: v.capacityMax,
    styles: v.styles,
    palette: v.palette,
    formalityMin: v.formalityMin,
    formalityMax: v.formalityMax,
    settings: v.settings,
    venueType: v.venueType,
    description: v.description,
    website: v.website,
    isDemo: v.isDemo,
    verified: v.verified,
    images: [
      ...(v.images ?? []).map((i) => ({ id: i.id, url: `/api/images/${i.fileName}`, width: i.width, height: i.height, credit: i.credit ?? null })),
      ...placePhotos(v).map((p, idx) => ({
        id: `${v.id}-g${idx}`,
        url: `/api/place-photos/${v.id}/${idx}`,
        width: p.width,
        height: p.height,
        credit: p.author ? `${p.author} via Google` : "Google",
      })),
    ],
    // Imported from Google and not yet claimed: no inbox, so the UI links out instead.
    listed: Boolean(v.placeId && !v.ownerId),
    priceEstimated: v.priceEstimated,
    address: v.address,
    phone: v.phone,
    rating: v.rating,
    ratingCount: v.ratingCount,
  };
}

const SHARED_PER_CATEGORY = 6;

/** Rank vendors for a plan. Null when the plan has no brief yet. */
export async function rankPlan(plan: Plan) {
  const brief = readBrief(plan);
  if (!brief) return null;
  const chosen = planFacts(plan);
  // Rank every category this event type uses, so the city's full supply shows up. The plan's own picks come first.
  const offered = CATEGORIES.filter((c) => c in BASE_ALLOCATION[chosen.eventType] && !chosen.categories.includes(c));
  const facts = { ...chosen, categories: [...chosen.categories, ...offered] };
  const vendors = await prisma.vendor.findMany({
    where: { active: true, category: { in: facts.categories } },
    include: { images: { take: 3, orderBy: { createdAt: "asc" } } },
  });
  const { allocation, byCategory } = rankMatches(facts, brief, vendors.map(vendorFacts));
  // Extra categories only show when the city has a match for them.
  facts.categories = facts.categories.filter((c) => chosen.categories.includes(c) || (byCategory[c]?.length ?? 0) > 0);
  const counts = Object.fromEntries(chosen.categories.map((c) => [c, byCategory[c]?.length ?? 0]));
  const conflicts = findConflicts(chosen, brief, counts);
  const saved = await prisma.savedVendor.findMany({ where: { planId: plan.id }, select: { vendorId: true } });
  const savedSet = new Set(saved.map((s) => s.vendorId));
  const byId = new Map(vendors.map((v) => [v.id, v]));
  const categories = facts.categories.map((c) => ({
    category: c,
    allotted: allocation[c] ?? 0,
    matches: (byCategory[c] ?? []).map((m) => ({
      ...m,
      vendor: publicVendor(byId.get(m.vendorId)!),
      saved: savedSet.has(m.vendorId),
    })),
  }));
  return { brief, conflicts, categories };
}

/** Load a plan the signed-in user owns, or send 404. Never leak other users' plans. */
/** What anyone outside the plan may see: top matches per category, no budget, inquiries, or owner details. */
export function sharedPlan(plan: Plan, ranked: NonNullable<Awaited<ReturnType<typeof rankPlan>>>) {
  return {
    plan: { name: plan.name, eventType: plan.eventType, date: plan.date, cityId: plan.cityId, guestCount: plan.guestCount },
    brief: ranked.brief,
    categories: ranked.categories.map((c) => ({
      category: c.category,
      matches: c.matches.slice(0, SHARED_PER_CATEGORY).map(({ vendor, saved, score, reasons }) => ({
        vendor,
        saved,
        score,
        // Budget lines quote the planner's allotment, which stays private.
        reasons: reasons.filter((r) => !r.includes(" budget")),
      })),
    })),
  };
}

export async function ownedPlan(req: FastifyRequest, reply: FastifyReply): Promise<Plan | null> {
  const { id } = idParams.parse(req.params);
  const plan = await prisma.plan.findFirst({ where: { id, userId: req.user!.id } });
  if (!plan) {
    reply.code(404).send({ error: "Plan not found" });
    return null;
  }
  return plan;
}

const readBrief = (p: Plan): Brief | null => {
  const r = briefSchema.safeParse(p.brief);
  return r.success ? r.data : null;
};

export async function planRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req, reply) => {
    if (req.url.startsWith("/plans")) return requireUser(req, reply);
  });

  const vision = () => ({ apiKey: app.env.ANTHROPIC_API_KEY, model: app.env.ANTHROPIC_MODEL });
  const readLimit = { config: { rateLimit: { max: 12, timeWindow: "1 hour", keyGenerator: (r: FastifyRequest) => r.user?.id ?? r.ip } } };

  app.get("/plans", async (req) => {
    const plans = await prisma.plan.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: "desc" } });
    return { plans: plans.map((p) => ({ ...p, brief: readBrief(p) })) };
  });

  app.post("/plans", async (req) => {
    const body = planInputSchema.parse(req.body);
    const plan = await prisma.plan.create({ data: { ...body, date: body.date ?? null, userId: req.user!.id } });
    return { plan };
  });

  app.get("/plans/:id", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    return { plan: { ...plan, brief: readBrief(plan) } };
  });

  app.patch("/plans/:id", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const body = planInputSchema.partial().parse(req.body);
    const updated = await prisma.plan.update({ where: { id: plan.id }, data: body });
    return { plan: { ...updated, brief: readBrief(updated) } };
  });

  app.delete("/plans/:id", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    await prisma.plan.delete({ where: { id: plan.id } });
    return { ok: true };
  });

  // ---- inspiration → brief ----

  app.post("/plans/:id/inspiration/pinterest", readLimit, async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const body = z.object({ boardId: z.string().regex(/^[0-9]{1,30}$/), boardName: z.string().max(200) }).parse(req.body);
    const token = await pinterestToken(app, req.user!.id);
    const urls = await boardImageUrls(token, body.boardId);
    if (urls.length === 0) return reply.code(400).send({ error: "That board has no image pins" });

    // Fetched into memory, analyzed, dropped. Nothing from Pinterest is stored.
    const picked = sampleEvenly(urls, MAX_IMAGES_PER_READ);
    const images = (await mapLimit(picked, 6, async (u) => (await normalizeImage(await fetchPinImage(u), 768)).data)).filter(
      (b): b is Buffer => b !== null,
    );
    if (images.length < 3) return reply.code(502).send({ error: "Couldn't load enough pins from that board" });

    const brief = await analyzeImages(images, vision(), body.boardName);
    brief.imageCount = urls.length;
    const updated = await prisma.plan.update({
      where: { id: plan.id },
      data: { brief, briefSource: "pinterest", briefLabel: body.boardName },
    });
    return { plan: { ...updated, brief } };
  });

  app.post("/plans/:id/inspiration/board-link", readLimit, async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const body = z.object({ url: z.string().min(3).max(500) }).parse(req.body);
    const board = await resolveBoardLink(body.url);
    const { name, urls } = await publicBoardImages(board);
    if (urls.length < 3) return reply.code(400).send({ error: "That board needs at least 3 image pins" });

    // Same rule as OAuth boards: fetched into memory, analyzed, dropped.
    const picked = sampleEvenly(urls, MAX_IMAGES_PER_READ);
    const images = (
      await mapLimit(picked, 6, async (u) => {
        try {
          return (await normalizeImage(await fetchPinImage(u), 768)).data;
        } catch {
          return null;
        }
      })
    ).filter((b): b is Buffer => b !== null);
    if (images.length < 3) return reply.code(502).send({ error: "Couldn't load enough pins from that board" });

    const brief = await analyzeImages(images, vision(), name);
    brief.imageCount = urls.length;
    const updated = await prisma.plan.update({
      where: { id: plan.id },
      data: { brief, briefSource: "pinterest", briefLabel: name },
    });
    return { plan: { ...updated, brief } };
  });

  app.post("/plans/:id/inspiration/upload", readLimit, async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const files = await readUploadedImages(req, 768);
    if (files.length < 3) return reply.code(400).send({ error: "Add at least 3 images" });
    // Uploaded inspiration is analyzed in memory and never written to disk.
    const brief = await analyzeImages(files.map((f) => f.data), vision());
    const updated = await prisma.plan.update({
      where: { id: plan.id },
      data: { brief, briefSource: "upload", briefLabel: `${files.length} uploaded images` },
    });
    return { plan: { ...updated, brief } };
  });

  app.patch("/plans/:id/brief", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const current = readBrief(plan);
    if (!current) return reply.code(409).send({ error: "Add inspiration first" });
    const edit = briefEditSchema.parse(req.body);
    const brief = briefSchema.parse({ ...current, ...edit });
    const updated = await prisma.plan.update({ where: { id: plan.id }, data: { brief } });
    return { plan: { ...updated, brief } };
  });

  // ---- matches ----

  app.get("/plans/:id/matches", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const ranked = await rankPlan(plan);
    if (!ranked) return reply.code(409).send({ error: "Add inspiration first" });

    const inquiries = await prisma.inquiry.findMany({ where: { planId: plan.id }, select: { vendorId: true, status: true } });
    const inquiryBy = new Map(inquiries.map((i) => [i.vendorId, i.status]));
    const categories = ranked.categories.map((c) => ({
      ...c,
      matches: c.matches.map((m) => ({ ...m, inquiry: inquiryBy.get(m.vendorId) ?? null })),
    }));
    return { brief: ranked.brief, conflicts: ranked.conflicts, categories };
  });

  app.post("/plans/:id/share", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    if (plan.shareToken) return { shareToken: plan.shareToken };
    const shareToken = randomBytes(18).toString("base64url");
    await prisma.plan.update({ where: { id: plan.id }, data: { shareToken } });
    return { shareToken };
  });

  app.delete("/plans/:id/share", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    await prisma.plan.update({ where: { id: plan.id }, data: { shareToken: null } });
    return reply.code(204).send();
  });

  // Read-only results for anyone with the link. No budget, inquiries, or owner details.
  app.get("/share/:token", async (req, reply) => {
    const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{24}$/) }).parse(req.params);
    const plan = await prisma.plan.findUnique({ where: { shareToken: token } });
    const ranked = plan && (await rankPlan(plan));
    if (!plan || !ranked) return reply.code(404).send({ error: "This link is no longer shared" });
    return sharedPlan(plan, ranked);
  });

  app.put("/plans/:id/saved/:vendorId", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const { vendorId } = z.object({ vendorId: z.string().regex(ID_RE) }).parse(req.params);
    const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, active: true }, select: { id: true } });
    if (!vendor) return reply.code(404).send({ error: "Vendor not found" });
    await prisma.savedVendor.upsert({
      where: { planId_vendorId: { planId: plan.id, vendorId } },
      create: { planId: plan.id, vendorId },
      update: {},
    });
    return { ok: true };
  });

  app.delete("/plans/:id/saved/:vendorId", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const { vendorId } = z.object({ vendorId: z.string().regex(ID_RE) }).parse(req.params);
    await prisma.savedVendor.deleteMany({ where: { planId: plan.id, vendorId } });
    return { ok: true };
  });

  // ---- inquiries ----

  app.post("/plans/:id/inquiries", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    if (!readBrief(plan)) return reply.code(409).send({ error: "Add inspiration first" });
    const body = inquiryInputSchema.parse(req.body);
    const vendor = await prisma.vendor.findFirst({ where: { id: body.vendorId, active: true } });
    if (!vendor) return reply.code(404).send({ error: "Vendor not found" });
    if (!plan.categories.includes(vendor.category)) return reply.code(400).send({ error: "That vendor isn't in this plan's categories" });
    if (vendor.placeId && !vendor.ownerId) return reply.code(409).send({ error: "This vendor hasn't joined yet. Contact them directly." });
    const existing = await prisma.inquiry.findUnique({ where: { planId_vendorId: { planId: plan.id, vendorId: vendor.id } } });
    if (existing) return reply.code(409).send({ error: "You already asked this vendor" });
    const inquiry = await prisma.inquiry.create({
      data: { planId: plan.id, vendorId: vendor.id, userId: req.user!.id, message: body.message },
    });
    return { inquiry };
  });

  app.get("/plans/:id/inquiries", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const inquiries = await prisma.inquiry.findMany({
      where: { planId: plan.id },
      orderBy: { createdAt: "desc" },
      include: { vendor: true },
    });
    return {
      inquiries: inquiries.map((i) => ({
        id: i.id,
        message: i.message,
        status: i.status,
        vendorReply: i.vendorReply,
        createdAt: i.createdAt,
        repliedAt: i.repliedAt,
        vendor: publicVendor(i.vendor),
      })),
    };
  });

  app.get("/plans/:id/budget", async (req, reply) => {
    const plan = await ownedPlan(req, reply);
    if (!plan) return;
    const brief = readBrief(plan);
    return { allocation: allocateBudget(planFacts(plan), brief?.emphasis ?? {}) };
  });
}
