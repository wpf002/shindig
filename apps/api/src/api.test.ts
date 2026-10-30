// Integration tests against a real Postgres (DATABASE_URL). Seed sample vendors first.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { prisma } from "@shindig/db";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { TokenBox } from "./lib/crypto.js";

const ORIGIN = "http://localhost:3000";
let app: FastifyInstance;
const run = Date.now().toString(36);

beforeAll(async () => {
  app = await buildApp(
    loadEnv({
      ...process.env,
      NODE_ENV: "test",
      WEB_ORIGIN: ORIGIN,
      ANTHROPIC_API_KEY: "",
      UPLOAD_DIR: "/tmp/shindig-test-uploads",
    }),
  );
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `+${run}@` } } });
  await app.close();
});

async function signup(role: "planner" | "vendor" = "planner") {
  const email = `t${Math.random().toString(36).slice(2, 8)}+${run}@example.com`;
  const res = await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { origin: ORIGIN },
    payload: { name: "Test Person", email, password: "correct horse battery", role },
  });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === "shindig_sid")!;
  return { cookie: `shindig_sid=${cookie.value}`, email };
}

/** Solid-ish swatches with a bit of noise, like a blush-and-sage board. */
async function swatch(hex: string, accent: string) {
  const base = sharp({ create: { width: 200, height: 200, channels: 3, background: hex } });
  const stripe = await sharp({ create: { width: 200, height: 60, channels: 3, background: accent } }).png().toBuffer();
  return base.composite([{ input: stripe, top: 140, left: 0 }]).jpeg().toBuffer();
}

function multipart(files: Buffer[]) {
  const boundary = `----shindig${run}`;
  const parts: Buffer[] = [];
  files.forEach((f, i) => {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="p${i}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      f,
      Buffer.from("\r\n"),
    );
  });
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe("planner flow", () => {
  let cookie = "";
  let planId = "";

  it("signs up and creates a plan", async () => {
    ({ cookie } = await signup());
    const res = await app.inject({
      method: "POST",
      url: "/plans",
      headers: { cookie, origin: ORIGIN },
      payload: { name: "Our Wedding", eventType: "wedding", date: "2027-04-17", cityId: "dallas", guestCount: 120, budget: 32000, categories: ["venue", "photographer", "florist", "caterer"] },
    });
    expect(res.statusCode).toBe(200);
    planId = res.json().plan.id;
  });

  it("reads uploaded inspiration into a brief and discards the images", async () => {
    const imgs = await Promise.all([
      swatch("#e8c3bd", "#a7b59a"),
      swatch("#f6f1e7", "#e8c3bd"),
      swatch("#a7b59a", "#f6f1e7"),
      swatch("#e8c3bd", "#f6f1e7"),
    ]);
    const mp = multipart(imgs);
    const res = await app.inject({
      method: "POST",
      url: `/plans/${planId}/inspiration/upload`,
      headers: { cookie, origin: ORIGIN, "content-type": mp.contentType },
      payload: mp.payload,
    });
    expect(res.statusCode).toBe(200);
    const brief = res.json().plan.brief;
    expect(brief.analyzer).toBe("palette");
    expect(brief.palette.length).toBeGreaterThanOrEqual(2);
    expect(brief.imageCount).toBe(4);
  });

  it("lets the user correct the brief", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/plans/${planId}/brief`,
      headers: { cookie, origin: ORIGIN },
      payload: { styles: [{ style: "garden", weight: 1 }, { style: "romantic", weight: 0.6 }], setting: "outdoor", venueTypes: ["estate", "garden"], tier: "elevated" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().plan.brief.styles[0].style).toBe("garden");
  });

  it("returns ranked, explained matches per category", async () => {
    const res = await app.inject({ method: "GET", url: `/plans/${planId}/matches`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const photo = body.categories.find((c: { category: string }) => c.category === "photographer");
    expect(photo.matches.length).toBeGreaterThan(0);
    expect(photo.matches[0].vendor.name).toBe("Juniper & Gold Photo");
    expect(photo.matches[0].reasons.length).toBeGreaterThan(0);
    const venue = body.categories.find((c: { category: string }) => c.category === "venue");
    expect(venue.matches[0].vendor.name).toBe("Larkspur House");
  });

  it("sends an inquiry once, and only once", async () => {
    const m = await app.inject({ method: "GET", url: `/plans/${planId}/matches`, headers: { cookie } });
    const vendorId = m.json().categories[0].matches[0].vendor.id;
    const send = () =>
      app.inject({ method: "POST", url: `/plans/${planId}/inquiries`, headers: { cookie, origin: ORIGIN }, payload: { vendorId, message: "Are you free April 17?" } });
    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(409);
  });

  it("hides one user's plan from another", async () => {
    const other = await signup();
    const res = await app.inject({ method: "GET", url: `/plans/${planId}`, headers: { cookie: other.cookie } });
    expect(res.statusCode).toBe(404);
  });

  it("rejects cross-site writes", async () => {
    const res = await app.inject({ method: "DELETE", url: `/plans/${planId}`, headers: { cookie, origin: "https://evil.example" } });
    expect(res.statusCode).toBe(403);
  });

  it("rejects non-images dressed up as images", async () => {
    const mp = multipart([Buffer.from("not an image"), Buffer.from("x"), Buffer.from("y")]);
    const res = await app.inject({
      method: "POST",
      url: `/plans/${planId}/inspiration/upload`,
      headers: { cookie, origin: ORIGIN, "content-type": mp.contentType },
      payload: mp.payload,
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("vendor flow", () => {
  it("creates a profile, uploads a portfolio, and gets suggested tags", async () => {
    const { cookie } = await signup("vendor");
    const put = await app.inject({
      method: "PUT",
      url: "/me/vendor",
      headers: { cookie, origin: ORIGIN },
      payload: {
        name: "Test Florals", category: "florist", cityId: "plano", serviceRadiusMi: 40, priceMin: 1500, priceMax: 5000,
        priceUnit: "flat", styles: ["garden"], palette: ["#e8c3bd"], formalityMin: 2, formalityMax: 4,
        settings: ["indoor", "outdoor"], description: "Loose garden florals.", email: "hi@test-florals.example",
      },
    });
    expect(put.statusCode).toBe(200);
    const mp = multipart(await Promise.all([swatch("#e8c3bd", "#a7b59a"), swatch("#a7b59a", "#e8c3bd"), swatch("#f6f1e7", "#a7b59a")]));
    const up = await app.inject({
      method: "POST",
      url: "/me/vendor/images",
      headers: { cookie, origin: ORIGIN, "content-type": mp.contentType },
      payload: mp.payload,
    });
    expect(up.statusCode).toBe(200);
    expect(up.json().suggestion.palette.length).toBeGreaterThan(0);
    const me = await app.inject({ method: "GET", url: "/me/vendor", headers: { cookie } });
    expect(me.json().vendor.images).toHaveLength(3);
  });

  it("keeps planners out of the vendor portal", async () => {
    const { cookie } = await signup("planner");
    const res = await app.inject({ method: "GET", url: "/me/vendor", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });
});

describe("pinterest", () => {
  it("refuses a callback whose state doesn't match", async () => {
    const { cookie } = await signup();
    const res = await app.inject({ method: "GET", url: "/pinterest/callback?code=x&state=forged", headers: { cookie } });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/pinterest=error/);
  });

  it("seals tokens so the database never holds them in the clear", () => {
    const box = new TokenBox(Buffer.alloc(32, 7).toString("base64"));
    const sealed = box.seal("pina_secret_token");
    expect(sealed).not.toContain("pina_secret_token");
    expect(box.open(sealed)).toBe("pina_secret_token");
  });
});
