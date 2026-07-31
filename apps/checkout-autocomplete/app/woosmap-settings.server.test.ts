import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db.server", () => ({
  default: { shopSettings: { findUnique: vi.fn(), upsert: vi.fn() } },
}));

import prisma from "./db.server";
import {
  encryptSecret,
  decryptSecret,
  getWoosmapConfig,
  getPublicSettings,
  saveSettings,
  getWoosmapPrivateKey,
  setWoosmapPrivateKey,
} from "./woosmap-settings.server";

const db = prisma as unknown as {
  shopSettings: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
};

beforeEach(() => vi.clearAllMocks());

describe("encrypt/decrypt", () => {
  it("round-trips a secret without exposing the plaintext", () => {
    const enc = encryptSecret("woos-private-key");
    expect(enc).not.toContain("woos-private-key");
    expect(decryptSecret(enc)).toBe("woos-private-key");
  });

  it("uses a random IV so the same input yields different ciphertext", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });
});

describe("getWoosmapConfig", () => {
  it("returns disabled defaults when the shop is undefined (no DB call)", async () => {
    expect(await getWoosmapConfig(undefined)).toEqual({ key: null, enabled: false, language: null });
    expect(db.shopSettings.findUnique).not.toHaveBeenCalled();
  });

  it("decrypts the stored key and maps the fields", async () => {
    db.shopSettings.findUnique.mockResolvedValue({
      woosmapKeyEnc: encryptSecret("secret-key"),
      enabled: false,
      language: "fr",
    });
    expect(await getWoosmapConfig("shop.myshopify.com")).toEqual({
      key: "secret-key",
      enabled: false,
      language: "fr",
    });
  });

  it("defaults enabled to true and key to null when unset", async () => {
    db.shopSettings.findUnique.mockResolvedValue({ woosmapKeyEnc: null, enabled: undefined, language: null });
    expect(await getWoosmapConfig("shop")).toEqual({ key: null, enabled: true, language: null });
  });
});

describe("getPublicSettings", () => {
  it("exposes hasKey but never the key itself", async () => {
    db.shopSettings.findUnique.mockResolvedValue({
      woosmapKeyEnc: encryptSecret("secret-key"),
      enabled: true,
      language: null,
    });
    expect(await getPublicSettings("shop")).toEqual({ hasKey: true, enabled: true, language: null });
  });

  it("defaults when the shop is undefined", async () => {
    expect(await getPublicSettings(undefined)).toEqual({ hasKey: false, enabled: true, language: null });
  });
});

describe("saveSettings", () => {
  it("encrypts and stores a newly provided key", async () => {
    await saveSettings("shop", { key: "new-key", enabled: true, language: "fr" });
    const arg = db.shopSettings.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ shop: "shop" });
    expect(decryptSecret(arg.update.woosmapKeyEnc)).toBe("new-key");
    expect(arg.update.enabled).toBe(true);
    expect(arg.update.language).toBe("fr");
  });

  it("keeps the existing key when none is provided and nulls empty language", async () => {
    await saveSettings("shop", { enabled: false, language: "" });
    const arg = db.shopSettings.upsert.mock.calls[0][0];
    expect(arg.update).not.toHaveProperty("woosmapKeyEnc");
    expect(arg.update.language).toBeNull();
  });
});

describe("private-key helpers", () => {
  it("getWoosmapPrivateKey returns the decrypted key", async () => {
    db.shopSettings.findUnique.mockResolvedValue({ woosmapKeyEnc: encryptSecret("kk") });
    expect(await getWoosmapPrivateKey("shop")).toBe("kk");
  });

  it("setWoosmapPrivateKey upserts an encrypted key for create and update", async () => {
    await setWoosmapPrivateKey("shop", "zz");
    const arg = db.shopSettings.upsert.mock.calls[0][0];
    expect(decryptSecret(arg.update.woosmapKeyEnc)).toBe("zz");
    expect(decryptSecret(arg.create.woosmapKeyEnc)).toBe("zz");
  });
});
