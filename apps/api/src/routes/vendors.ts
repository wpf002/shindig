import { randomBytes } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@shindig/db";
import {
  allocateBudget,
  briefSchema,
  scoreVendor,
  vendorInputSchema,
  type Category,
} from "@shindig/core";
import { loadUser, requireVendor } from "../lib/auth.js";
import { ID_RE, readUploadedImages } from "../lib/util.js";
import { analyzeImages, MAX_IMAGES_PER_READ } from "../vision/index.js";
import { planFacts, publicVendor, vendorFacts } from "./plans.js";

const MAX_PORTFOLIO = 24;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

export async function vendorRoutes(app: FastifyInstance) {
  const vision = () => ({ apiKey: app.env.ANTHROPIC_API_KEY, model: app.env.ANTHROPIC_MODEL });

  // Public profile. With ?planId= and a signed-in owner, includes the match read.
  app.get("/vendors/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().regex(ID_RE) }).parse(req.params);
    const { planId } = z.object({ planId: z.string().regex(ID_RE).optional() }).parse(req.query);
    const vendor = await prisma.vendor.findFirst({
      where: { id, active: true },
      include: { images: { orderBy: { createdAt: "asc" } } },
    });
    if (!vendor) return reply.code(404).send({ error: "Vendor not found" });

    let match = null;
    if (planId) {
      const user = await loadUser(req);
      const plan = user ? await prisma.plan.findFirst({ where: { id: planId, userId: user.id } }) : null;
      const brief = plan ? briefSchema.safeParse(plan.brief) : null;
      if (plan && brief?.success) {
        const facts = planFacts(plan);
        const allotted = allocateBudget(facts, brief.data.emphasis)[vendor.category as Category] ?? 0;
        // Score against the plan even if it's outside the plan's categories.
        match = scoreVendor({ ...facts, categories: [vendor.category as Category] }, brief.data, vendorFacts(vendor), allotted);
      }
    }
    return { vendor: publicVendor(vendor), match };
  });

  // ---- vendor portal ----
  app.register(async (portal) => {
    portal.addHook("preHandler", requireVendor);

    const mine = (userId: string) =>
      prisma.vendor.findFirst({ where: { ownerId: userId }, include: { images: { orderBy: { createdAt: "asc" } } } });

    portal.get("/me/vendor", async (req) => {
      const v = await mine(req.user!.id);
      return { vendor: v ? { ...publicVendor(v), email: v.email, active: v.active } : null };
    });

    portal.put("/me/vendor", async (req) => {
      const body = vendorInputSchema.parse(req.body);
      const data = {
        ...body,
        capacityMax: body.category === "venue" ? (body.capacityMax ?? null) : null,
        venueType: body.category === "venue" ? (body.venueType ?? null) : null,
        website: body.website ?? null,
      };
      const existing = await prisma.vendor.findFirst({ where: { ownerId: req.user!.id } });
      const v = existing
        ? await prisma.vendor.update({ where: { id: existing.id }, data, include: { images: true } })
        : await prisma.vendor.create({
            data: { ...data, ownerId: req.user!.id, slug: `${slugify(body.name)}-${randomBytes(3).toString("hex")}` },
            include: { images: true },
          });
      return { vendor: { ...publicVendor(v), email: v.email, active: v.active } };
    });

    // Upload portfolio photos, then read the whole portfolio to suggest tags.
    portal.post("/me/vendor/images", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req, reply) => {
      const v = await mine(req.user!.id);
      if (!v) return reply.code(409).send({ error: "Save your profile first" });
      const files = await readUploadedImages(req, 1600);
      if (v.images.length + files.length > MAX_PORTFOLIO) {
        return reply.code(400).send({ error: `Portfolio holds ${MAX_PORTFOLIO} photos` });
      }
      for (const f of files) {
        const fileName = `${randomBytes(16).toString("hex")}.jpg`;
        await writeFile(join(app.uploadDir, fileName), f.data, { flag: "wx" });
        await prisma.vendorImage.create({ data: { vendorId: v.id, fileName, width: f.width, height: f.height } });
      }
      return suggest(v.id);
    });

    portal.post("/me/vendor/suggest", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req, reply) => {
      const v = await mine(req.user!.id);
      if (!v) return reply.code(409).send({ error: "Save your profile first" });
      return suggest(v.id);
    });

    portal.delete("/me/vendor/images/:imageId", async (req, reply) => {
      const { imageId } = z.object({ imageId: z.string().regex(ID_RE) }).parse(req.params);
      const img = await prisma.vendorImage.findFirst({ where: { id: imageId, vendor: { ownerId: req.user!.id } } });
      if (!img) return reply.code(404).send({ error: "Photo not found" });
      await prisma.vendorImage.delete({ where: { id: img.id } });
      await unlink(join(app.uploadDir, img.fileName)).catch(() => {});
      return { ok: true };
    });

    portal.get("/me/vendor/inquiries", async (req) => {
      const v = await prisma.vendor.findFirst({ where: { ownerId: req.user!.id }, select: { id: true, category: true } });
      if (!v) return { inquiries: [] };
      const rows = await prisma.inquiry.findMany({
        where: { vendorId: v.id },
        orderBy: { createdAt: "desc" },
        include: { plan: true, user: { select: { name: true } } },
      });
      return {
        inquiries: rows.map((i) => {
          const brief = briefSchema.safeParse(i.plan.brief);
          const facts = planFacts(i.plan);
          const allotted = brief.success ? (allocateBudget(facts, brief.data.emphasis)[v.category as Category] ?? null) : null;
          // Vendors see the event facts and the vibe, not the planner's email or full budget.
          return {
            id: i.id,
            from: i.user.name.split(" ")[0],
            message: i.message,
            status: i.status,
            vendorReply: i.vendorReply,
            createdAt: i.createdAt,
            event: {
              type: facts.eventType,
              date: facts.date,
              cityId: facts.cityId,
              guestCount: facts.guestCount,
              categoryBudget: allotted,
            },
            brief: brief.success
              ? {
                  summary: brief.data.summary,
                  styles: brief.data.styles,
                  palette: brief.data.palette,
                  formality: brief.data.formality,
                  setting: brief.data.setting,
                  keywords: brief.data.keywords,
                }
              : null,
          };
        }),
      };
    });

    portal.post("/me/vendor/inquiries/:inquiryId/reply", async (req, reply) => {
      const { inquiryId } = z.object({ inquiryId: z.string().regex(ID_RE) }).parse(req.params);
      const body = z.object({ reply: z.string().trim().min(1).max(2000), status: z.enum(["replied", "declined"]) }).parse(req.body);
      const inq = await prisma.inquiry.findFirst({ where: { id: inquiryId, vendor: { ownerId: req.user!.id } } });
      if (!inq) return reply.code(404).send({ error: "Inquiry not found" });
      const updated = await prisma.inquiry.update({
        where: { id: inq.id },
        data: { vendorReply: body.reply, status: body.status, repliedAt: new Date() },
      });
      return { inquiry: updated };
    });
  });

  /** Read the vendor's own portfolio into the same vocabulary as a board. */
  async function suggest(vendorId: string) {
    const imgs = await prisma.vendorImage.findMany({ where: { vendorId }, orderBy: { createdAt: "asc" }, take: MAX_IMAGES_PER_READ });
    if (imgs.length < 3) return { suggestion: null, note: "Add at least 3 photos to get suggested tags" };
    const bufs = await Promise.all(imgs.map((i) => readFile(join(app.uploadDir, i.fileName))));
    const brief = await analyzeImages(bufs, vision());
    return {
      suggestion: {
        styles: brief.styles.filter((s) => s.weight >= 0.3).map((s) => s.style).slice(0, 4),
        palette: brief.palette,
        formalityMin: Math.max(1, brief.formality - 1),
        formalityMax: Math.min(5, brief.formality + 1),
        analyzer: brief.analyzer,
      },
    };
  }
}
