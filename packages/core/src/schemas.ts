import { z } from "zod";
import {
  CATEGORIES,
  EVENT_TYPES,
  LIGHTING,
  PRICE_UNITS,
  SETTINGS,
  STYLES,
  TIERS,
  VENUE_TYPES,
} from "./taxonomy.js";
import { isHex, normalizeHex } from "./color.js";
import { isCityId } from "./geo.js";

const hex = z
  .string()
  .refine(isHex, "Must be a hex color like #e8c3bd")
  .transform(normalizeHex);

export const styleWeightSchema = z.object({
  style: z.enum(STYLES),
  weight: z.number().min(0).max(1),
});

/** The "vibe" read of a set of inspiration images. Every field is user-editable. */
export const briefSchema = z.object({
  summary: z.string().max(600),
  styles: z.array(styleWeightSchema).max(6),
  palette: z.array(hex).max(8),
  formality: z.number().int().min(1).max(5),
  tier: z.enum(TIERS),
  setting: z.enum(SETTINGS),
  venueTypes: z.array(z.enum(VENUE_TYPES)).max(5),
  lighting: z.array(z.enum(LIGHTING)).max(4),
  keywords: z.array(z.string().min(1).max(40)).max(12),
  /** Share of images that feature each category, 0..1. Drives budget emphasis. */
  emphasis: z.record(z.enum(CATEGORIES), z.number().min(0).max(1)).default({}),
  analyzer: z.enum(["claude", "palette"]),
  imageCount: z.number().int().min(0),
});
export type Brief = z.infer<typeof briefSchema>;

/** What a user may change on a brief. Analyzer metadata stays server-owned. */
export const briefEditSchema = briefSchema.omit({ analyzer: true, imageCount: true }).partial();
export type BriefEdit = z.infer<typeof briefEditSchema>;

export const cityIdSchema = z.string().refine(isCityId, "Pick a city from the list");

export const planInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  eventType: z.enum(EVENT_TYPES),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  cityId: cityIdSchema,
  guestCount: z.number().int().min(1).max(5000),
  budget: z.number().int().min(0).max(10_000_000),
  categories: z.array(z.enum(CATEGORIES)).min(1),
});
export type PlanInput = z.infer<typeof planInputSchema>;

export const vendorInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    category: z.enum(CATEGORIES),
    cityId: cityIdSchema,
    serviceRadiusMi: z.number().int().min(0).max(300),
    priceMin: z.number().int().min(0).max(10_000_000),
    priceMax: z.number().int().min(0).max(10_000_000),
    priceUnit: z.enum(PRICE_UNITS),
    capacityMax: z.number().int().min(1).max(10_000).nullable().optional(),
    styles: z.array(z.enum(STYLES)).max(6),
    palette: z.array(hex).max(8),
    formalityMin: z.number().int().min(1).max(5),
    formalityMax: z.number().int().min(1).max(5),
    settings: z.array(z.enum(["indoor", "outdoor"])).max(2),
    venueType: z.enum(VENUE_TYPES).nullable().optional(),
    description: z.string().trim().max(1200),
    website: z
      .string()
      .trim()
      .url()
      .refine((u) => /^https:\/\//i.test(u), "Use an https:// link")
      .nullable()
      .optional(),
    email: z.string().trim().email().max(200),
  })
  .refine((v) => v.priceMax >= v.priceMin, { message: "Max price is below min price", path: ["priceMax"] })
  .refine((v) => v.formalityMax >= v.formalityMin, { message: "Formality range is backwards", path: ["formalityMax"] });
export type VendorInput = z.infer<typeof vendorInputSchema>;

export const inquiryInputSchema = z.object({
  vendorId: z.string().min(1),
  message: z.string().trim().min(1).max(2000),
});
