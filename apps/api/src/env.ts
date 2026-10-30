import { z } from "zod";

const b64key = z
  .string()
  .min(1)
  .refine((s) => Buffer.from(s, "base64").length >= 32, "Needs 32+ bytes, base64 encoded");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.string().url(),
  SESSION_SECRET: b64key,
  TOKEN_ENCRYPTION_KEY: b64key,
  UPLOAD_DIR: z.string().default("./uploads"),
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => v || undefined),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  GOOGLE_PLACES_API_KEY: z.string().optional().transform((v) => v || undefined),
  PINTEREST_CLIENT_ID: z.string().optional().transform((v) => v || undefined),
  PINTEREST_CLIENT_SECRET: z.string().optional().transform((v) => v || undefined),
  PINTEREST_REDIRECT_URI: z.string().url().optional().or(z.literal("").transform(() => undefined)),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}

export const pinterestEnabled = (env: Env) =>
  Boolean(env.PINTEREST_CLIENT_ID && env.PINTEREST_CLIENT_SECRET && env.PINTEREST_REDIRECT_URI);
