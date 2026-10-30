# Shindig

Connect a Pinterest board. Shindig reads the look (style, palette, formality, setting, spend level) and matches it to local venues, planners, photographers, DJs, caterers, florists and the rest, with a plain reason for every match and what it costs against your budget.

Launch market: Dallas–Fort Worth.

## How It Works

1. **Board in.** Pinterest OAuth (pick a board) or drag in 3–30 images.
2. **Read the look.** Palette comes from pixels (k-means in Lab space). Style, formality, spend tier, setting, venue type, lighting and which categories the board leans on come from Claude vision. With no API key, it falls back to a color-only guess and says so.
3. **User corrects it.** Every field of the brief is editable.
4. **Match.** Vendors are described in the same vocabulary, partly from their own portfolio photos run through the same reader. Scoring: style overlap (with partial credit for related styles), palette distance, formality range, setting/venue type, and price fit against a per-category budget split. Hard filters: service radius, venue capacity.
5. **Reality check.** Flags when the board's look costs more than the budget buys, with the budget or guest count that would close the gap. Also flags outdoor summer dates and empty categories.
6. **Ask.** One-tap inquiry with the date, guest count, look and category budget attached. Vendors reply from their portal.

Ranking is relevance only. Nothing a vendor pays for touches it.

## Stack

pnpm + Turborepo · Next.js 15 (web) · Fastify 5 (api) · Prisma 7 + Postgres · Claude vision · sharp

```
apps/web        Next.js. Proxies /api/* to the API so cookies stay first-party.
apps/api        Fastify. Auth, Pinterest OAuth, vision, plans, matching, vendor portal.
packages/core   Shared taxonomy, zod schemas, matching engine, color math, DFW cities.
packages/db     Prisma schema, client, sample-vendor seed.
```

## Setup

```bash
./scripts/bootstrap.sh   # env with fresh secrets, Postgres via Docker, install, migrate, seed
pnpm dev                 # web :3000, api :4000
```

The container publishes on host port **5433** so it doesn't collide with a native Postgres on 5432.

Without Docker, point `DATABASE_URL` at any Postgres 16 and run the script.

### Keys

| Var | Where |
|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com. Without it, style is guessed from color. |
| `PINTEREST_CLIENT_ID` / `_SECRET` | developers.pinterest.com → create app. Redirect URI: `http://localhost:3000/api/pinterest/callback`. Scopes: `boards:read,pins:read,user_accounts:read`. |

Pinterest starts apps in Trial access, which only works for the app owner's account. Submit for Standard access before real users connect.

## Tests

```bash
pnpm test   # core: matching engine. api: integration against Postgres (seed first).
```

## Security Notes

- Passwords: argon2id. Sessions: random 256-bit token in an httpOnly SameSite=Lax cookie; only its SHA-256 is stored.
- Mutating requests with a foreign `Origin` are rejected.
- Pinterest tokens are AES-256-GCM encrypted at rest. OAuth state is a signed, short-lived cookie compared in constant time.
- Pin images are fetched only from `i.pinimg.com` (no SSRF), held in memory, never stored. Per Pinterest's terms, only our own analysis is kept.
- Uploads are decoded by content (not filename), size- and pixel-capped, rotated, stripped of EXIF/GPS, and re-encoded. Planner inspiration uploads are never written to disk.
- Every plan query is scoped to the owner. Vendors see event facts and the look, never the planner's email or full budget.
- Rate limits on auth, analysis, uploads and inquiries.

## Sample Data

`pnpm db:seed` loads 62 fictional DFW vendors flagged `isDemo`. The UI labels them "Sample". Remove them before launch: `DELETE FROM "Vendor" WHERE "isDemo";`

## Deploy (Railway)

Three services: Postgres, `api`, `web`.

- **api**: build `pnpm install && pnpm --filter @shindig/api... build && pnpm db:deploy`, start `pnpm --filter @shindig/api start`. Set all API env vars; `UPLOAD_DIR` on a mounted volume.
- **web**: build `pnpm install && pnpm --filter @shindig/web... build`, start `pnpm --filter @shindig/web start`. Set `API_INTERNAL_URL` to the api's private URL **at build time** (rewrites are baked in).
- Set `WEB_ORIGIN` and `PINTEREST_REDIRECT_URI` to the public web domain.

## Next Up

- Availability: vendor calendars, block booked dates
- Style quiz as a third intake path that doesn't depend on Pinterest
- Vendor verification (license, insurance) and real reviews from booked events
- Learn ranking weights from saves, inquiries and bookings
- Budget workspace: quotes, deposits, what's left per category
