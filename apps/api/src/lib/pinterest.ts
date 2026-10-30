// Pinterest API v5. We follow their developer terms: OAuth only (never
// credentials), boards are read live when the user asks, and no pin content is
// persisted. The only thing we keep is our own analysis of the board.
import { MAX_UPLOAD_BYTES } from "./images.js";

const AUTH_URL = "https://www.pinterest.com/oauth/";
const API = "https://api.pinterest.com/v5";
export const PINTEREST_SCOPES = ["boards:read", "pins:read", "user_accounts:read"];

// Pin images only ever come from Pinterest's CDN. Anything else is refused,
// so a crafted pin can't make our server fetch internal URLs.
const IMAGE_HOSTS = new Set(["i.pinimg.com"]);

export interface PinterestConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scope: string;
}

export class PinterestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function authorizeUrl(cfg: PinterestConfig, state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", cfg.clientId);
  u.searchParams.set("redirect_uri", cfg.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", PINTEREST_SCOPES.join(","));
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenRequest(cfg: PinterestConfig, body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new PinterestError(`Token exchange failed (${res.status})`, res.status);
  const j = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? null,
    expiresAt: new Date(Date.now() + j.expires_in * 1000),
    scope: j.scope ?? PINTEREST_SCOPES.join(","),
  };
}

export function exchangeCode(cfg: PinterestConfig, code: string) {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: cfg.redirectUri });
}

export function refresh(cfg: PinterestConfig, refreshToken: string) {
  return tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refreshToken });
}

async function api<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const u = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new PinterestError(`Pinterest ${path} failed (${res.status})`, res.status);
  return (await res.json()) as T;
}

export interface Board {
  id: string;
  name: string;
  pinCount: number;
  coverUrl: string | null;
}

export async function listBoards(token: string): Promise<Board[]> {
  const out: Board[] = [];
  let bookmark: string | undefined;
  for (let page = 0; page < 5; page++) {
    const j = await api<{
      items: Array<{ id: string; name: string; pin_count?: number; media?: { image_cover_url?: string } }>;
      bookmark?: string | null;
    }>(token, "/boards", { page_size: "100", ...(bookmark ? { bookmark } : {}) });
    for (const b of j.items) {
      out.push({ id: b.id, name: b.name, pinCount: b.pin_count ?? 0, coverUrl: b.media?.image_cover_url ?? null });
    }
    if (!j.bookmark) break;
    bookmark = j.bookmark;
  }
  return out;
}

interface PinItem {
  id: string;
  media?: { media_type?: string; images?: Record<string, { url: string; width: number; height: number }> };
}

/** Image URLs for up to `limit` pins on a board. Videos are skipped. */
export async function boardImageUrls(token: string, boardId: string, limit = 150): Promise<string[]> {
  if (!/^[0-9]+$/.test(boardId)) throw new PinterestError("Bad board id", 400);
  const urls: string[] = [];
  let bookmark: string | undefined;
  while (urls.length < limit) {
    const j = await api<{ items: PinItem[]; bookmark?: string | null }>(token, `/boards/${boardId}/pins`, {
      page_size: "100",
      ...(bookmark ? { bookmark } : {}),
    });
    for (const p of j.items) {
      if (p.media?.media_type && p.media.media_type !== "image") continue;
      const imgs = p.media?.images;
      const pick = imgs?.["600x"] ?? imgs?.["400x300"] ?? imgs?.["1200x"];
      if (pick?.url) urls.push(pick.url);
    }
    if (!j.bookmark) break;
    bookmark = j.bookmark;
  }
  return urls.slice(0, limit);
}

/** Fetch a pin image into memory only. Never written to disk. */
export async function fetchPinImage(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !IMAGE_HOSTS.has(u.hostname)) throw new PinterestError("Image host not allowed", 400);
  const res = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new PinterestError(`Image fetch failed (${res.status})`, res.status);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES) throw new PinterestError("Image too large", 413);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_UPLOAD_BYTES) throw new PinterestError("Image too large", 413);
  return buf;
}
