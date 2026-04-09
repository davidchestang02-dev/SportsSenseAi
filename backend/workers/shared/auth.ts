import type { Env } from "./types";

function toBase64Url(bytes: ArrayBuffer): string {
  const chars = Array.from(new Uint8Array(bytes), (byte) => String.fromCharCode(byte)).join("");
  return btoa(chars).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): ArrayBuffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, env: Env): Promise<string> {
  const secret = env.AUTH_SECRET || "sports-sense-dev";
  return sha256(`${secret}:${password}`);
}

export async function signToken(payload: Record<string, unknown>, env: Env): Promise<string> {
  const secret = env.AUTH_SECRET || "sports-sense-dev";
  const key = await importHmacKey(secret);
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  return `${encodedPayload}.${toBase64Url(signature)}`;
}

export async function verifyToken(token: string, env: Env): Promise<Record<string, unknown> | null> {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const secret = env.AUTH_SECRET || "sports-sense-dev";
  const key = await importHmacKey(secret);
  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64Url(signature),
    new TextEncoder().encode(encodedPayload)
  );

  if (!verified) {
    return null;
  }

  const payload = atob(encodedPayload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(payload) as Record<string, unknown>;
}

export async function requireToken(request: Request, env: Env): Promise<Record<string, unknown> | null> {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return null;
  }
  return verifyToken(token, env);
}
