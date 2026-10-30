import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext) */
export class TokenBox {
  private key: Buffer;
  constructor(keyB64: string) {
    this.key = createHash("sha256").update(Buffer.from(keyB64, "base64")).digest();
  }
  seal(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64url")).join(".");
  }
  open(sealed: string): string {
    const [iv, tag, ct] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !ct) throw new Error("Malformed sealed token");
    const d = createDecipheriv("aes-256-gcm", this.key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  }
}
