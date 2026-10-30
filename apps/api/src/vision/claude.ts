import Anthropic from "@anthropic-ai/sdk";
import {
  CATEGORIES,
  EVENT_TYPES,
  LIGHTING,
  SETTINGS,
  STYLES,
  TIERS,
  VENUE_TYPES,
} from "@shindig/core";
import { z } from "zod";

// What we ask the model for. Palette is computed from pixels separately, so
// the model only does what pixels can't: read style, formality, and spend.
const readSchema = z.object({
  summary: z.string(),
  eventType: z.enum(EVENT_TYPES).nullable(),
  styles: z.array(z.object({ style: z.enum(STYLES), weight: z.number() })),
  formality: z.number(),
  tier: z.enum(TIERS),
  setting: z.enum(SETTINGS),
  venueTypes: z.array(z.enum(VENUE_TYPES)),
  lighting: z.array(z.enum(LIGHTING)),
  keywords: z.array(z.string()),
  emphasis: z.record(z.string(), z.number()),
  skipped: z.number().int().min(0),
});
export type VisionRead = z.infer<typeof readSchema>;

const TOOL: Anthropic.Tool = {
  name: "record_event_brief",
  description: "Record the event style read for this inspiration board.",
  input_schema: {
    type: "object",
    required: ["summary", "eventType", "styles", "formality", "tier", "setting", "venueTypes", "lighting", "keywords", "emphasis", "skipped"],
    properties: {
      summary: { type: "string", description: "Two plain sentences a friend would say about this board. No hype words." },
      eventType: { type: ["string", "null"], enum: [...EVENT_TYPES, null] },
      styles: {
        type: "array",
        maxItems: 5,
        description: "Styles present, strongest first. weight 0-1 = how much of the board shows it.",
        items: {
          type: "object",
          required: ["style", "weight"],
          properties: { style: { type: "string", enum: [...STYLES] }, weight: { type: "number", minimum: 0, maximum: 1 } },
        },
      },
      formality: { type: "integer", minimum: 1, maximum: 5, description: "1 = backyard casual, 5 = black tie" },
      tier: { type: "string", enum: [...TIERS], description: "Spend level the production in these images implies" },
      setting: { type: "string", enum: [...SETTINGS] },
      venueTypes: { type: "array", maxItems: 3, items: { type: "string", enum: [...VENUE_TYPES] } },
      lighting: { type: "array", maxItems: 3, items: { type: "string", enum: [...LIGHTING] } },
      keywords: { type: "array", maxItems: 10, items: { type: "string" }, description: "Concrete details: flowers, materials, foods, garments. Lowercase." },
      emphasis: {
        type: "object",
        description: `Share (0-1) of images that mainly show each vendor category. Keys from: ${CATEGORIES.join(", ")}. Omit categories not shown.`,
        additionalProperties: { type: "number", minimum: 0, maximum: 1 },
      },
      skipped: { type: "integer", minimum: 0, description: "Images that aren't event inspiration (memes, products, text)." },
    },
  },
};

const PROMPT = `These images are someone's inspiration board for an event they're planning in Dallas–Fort Worth.
Read the board as a whole, the way an experienced planner would on a first consult:
what style is it, how formal, how expensive does it look to produce, indoors or out, what kind of venue, what lighting.
Ignore images that aren't event inspiration and count them in "skipped".
Only use the allowed tag values. Respond only by calling record_event_brief once, with no other text.`;

export async function readBoardWithClaude(
  images: Buffer[],
  opts: { apiKey: string; model: string; hint?: string },
): Promise<VisionRead> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const content: Anthropic.ContentBlockParam[] = images.map((data) => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: data.toString("base64") },
  }));
  content.push({ type: "text", text: opts.hint ? `${PROMPT}\nBoard title: ${opts.hint}` : PROMPT });

  const res = await client.messages.create({
    model: opts.model,
    max_tokens: 1500,
    tools: [TOOL],
    // Sonnet 5.5 and Opus 5.5 reject forced tool_choice; the prompt asks for the call.
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
  });

  const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!block) throw new Error("Vision model returned no brief");
  return readSchema.parse(block.input);
}
