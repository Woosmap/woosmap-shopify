// Per-shop Woosmap settings — the PRIVATE key is encrypted at rest with
// AES-256-GCM, never stored in plaintext, never returned to the browser, never
// logged. Other fields (enabled, language) are plain config.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import prisma from "./db.server";

// 32-byte key, base64, from the environment (e.g. `openssl rand -base64 32`).
const ENC_KEY = Buffer.from(process.env.SETTINGS_ENC_KEY ?? "", "base64");

function assertKey(): void {
  if (ENC_KEY.length !== 32) {
    throw new Error("SETTINGS_ENC_KEY must be a base64-encoded 32-byte key.");
  }
}

/** Encrypt a secret → base64(iv | authTag | ciphertext). */
export function encryptSecret(plain: string): string {
  assertKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt a payload produced by {@link encryptSecret}. */
export function decryptSecret(payload: string): string {
  assertKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Server-side config used by the app-proxy routes (includes the decrypted key). */
export interface WoosmapConfig {
  key: string | null;
  enabled: boolean;
  language: string | null;
}

/** Admin-facing settings — never includes the key, only whether one is set. */
export interface PublicWoosmapSettings {
  hasKey: boolean;
  enabled: boolean;
  language: string | null;
}

/** Values accepted when saving from the admin form. */
export interface SaveWoosmapSettingsInput {
  /** New private key. When omitted/empty the stored key is kept unchanged. */
  key?: string;
  enabled: boolean;
  language: string | null;
}

/** Full server-side config (with decrypted key) for a shop. */
export async function getWoosmapConfig(shop: string | undefined): Promise<WoosmapConfig> {
  if (!shop) {
    return { key: null, enabled: false, language: null };
  }
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  return {
    key: row?.woosmapKeyEnc ? decryptSecret(row.woosmapKeyEnc) : null,
    enabled: row?.enabled ?? true,
    language: row?.language ?? null,
  };
}

/** Admin-facing settings for a shop (no key material). */
export async function getPublicSettings(shop: string | undefined): Promise<PublicWoosmapSettings> {
  if (!shop) {
    return { hasKey: false, enabled: true, language: null };
  }
  const row = await prisma.shopSettings.findUnique({ where: { shop } });
  return {
    hasKey: Boolean(row?.woosmapKeyEnc),
    enabled: row?.enabled ?? true,
    language: row?.language ?? null,
  };
}

/** Persist settings from the admin form. Only replaces the key when a new one is given. */
export async function saveSettings(shop: string, input: SaveWoosmapSettingsInput): Promise<void> {
  const language = input.language && input.language.length > 0 ? input.language : null;
  const keyPatch =
    input.key && input.key.trim().length > 0 ? { woosmapKeyEnc: encryptSecret(input.key.trim()) } : {};

  await prisma.shopSettings.upsert({
    where: { shop },
    update: { enabled: input.enabled, language, ...keyPatch },
    create: { shop, enabled: input.enabled, language, ...keyPatch },
  });
}

/** Read + decrypt the shop's Woosmap private key (or null). Server-only. */
export async function getWoosmapPrivateKey(shop: string | undefined): Promise<string | null> {
  return (await getWoosmapConfig(shop)).key;
}

/** Store the shop's Woosmap private key, encrypted (e.g. for local seeding). */
export async function setWoosmapPrivateKey(shop: string, key: string): Promise<void> {
  const woosmapKeyEnc = encryptSecret(key);
  await prisma.shopSettings.upsert({
    where: { shop },
    update: { woosmapKeyEnc },
    create: { shop, woosmapKeyEnc },
  });
}
