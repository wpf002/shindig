import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, type Plan, type Vendor } from "@shindig/db";
import {
  allocateBudget,
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
import { boardImageUrls, fetchPinImage } from "../lib/pinterest.js";
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

export function publicVendor(v: Vendor & { images?: Array<{ id: string; fileName: string; width: number; height: number }> }) {
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
    images: (v.images ?? []).map((i) => ({ id: i.id, url: `/api/images/${i.fileName}`, width: i.width, height: i.height })),
  };
}

/** Load a plan the signed-in user owns, or send 404. Never leak other users' plans. */
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
    const brief = readBrief(plan);
    if (!brief) return reply.code(409).send({ error: "Add inspiration first" });

    const facts = planFacts(plan);
    const vendors = await prisma.vendor.findMany({
      where: { active: true, category: { in: facts.categories } },
      include: { images: { take: 3, orderBy: { createdAt: "asc" } } },
    });
    const { allocation, byCategory } = rankMatches(facts, brief, vendors.map(vendorFacts));
    const counts = Object.fromEntries(facts.categories.map((c) => [c, byCategory[c]?.length ?? 0]));
    const conflicts = findConflicts(facts, brief, counts);

    const [saved, inquiries] = await Promise.all([
      prisma.savedVendor.findMany({ where: { planId: plan.id }, select: { vendorId: true } }),
      prisma.inquiry.findMany({ where: { planId: plan.id }, select: { vendorId: true, status: true } }),
    ]);
    const savedSet = new Set(saved.map((s) => s.vendorId));
    const inquiryBy = new Map(inquiries.map((i) => [i.vendorId, i.status]));
    const byId = new Map(vendors.map((v) => [v.id, v]));

    const categories = facts.categories.map((c) => ({
      category: c,
      allotted: allocation[c] ?? 0,
      matches: (byCategory[c] ?? []).map((m) => ({
        ...m,
        vendor: publicVendor(byId.get(m.vendorId)!),
        saved: savedSet.has(m.vendorId),
        inquiry: inquiryBy.get(m.vendorId) ?? null,
      })),
    }));
    return { brief, conflicts, categories };
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
