import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./shopify.server", () => ({
  authenticate: { public: { checkout: vi.fn() } },
}));
vi.mock("./woosmap-settings.server", () => ({
  getWoosmapConfig: vi.fn(),
}));

import { authenticate } from "./shopify.server";
import { getWoosmapConfig } from "./woosmap-settings.server";
import { authenticateWoosmapCheckout, createLocalitiesProxy } from "./woosmap-checkout.server";

const checkoutMock = authenticate.public.checkout as unknown as ReturnType<typeof vi.fn>;
const getConfigMock = getWoosmapConfig as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("authenticateWoosmapCheckout", () => {
  it("normalises a URL-shaped dest to a bare host, parses params, forwards cors", async () => {
    const cors = vi.fn();
    checkoutMock.mockResolvedValue({ sessionToken: { dest: "https://shop.myshopify.com" }, cors });
    getConfigMock.mockResolvedValue({ key: "k", enabled: true, language: null });

    const request = new Request(
      "https://app.example/apps/woosmap/localities/autocomplete?query=mar&country=FR",
    );
    const ctx = await authenticateWoosmapCheckout(request);

    expect(getConfigMock).toHaveBeenCalledWith("shop.myshopify.com");
    expect(ctx.params).toEqual({ query: "mar", country: "FR" });
    expect(ctx.config).toEqual({ key: "k", enabled: true, language: null });
    expect(ctx.cors).toBe(cors);
  });

  it("accepts a bare-host dest (no protocol)", async () => {
    checkoutMock.mockResolvedValue({ sessionToken: { dest: "shop.myshopify.com" }, cors: vi.fn() });
    getConfigMock.mockResolvedValue({ key: null, enabled: false, language: null });

    await authenticateWoosmapCheckout(new Request("https://app.example/x"));
    expect(getConfigMock).toHaveBeenCalledWith("shop.myshopify.com");
  });
});

describe("createLocalitiesProxy", () => {
  it("returns a proxy exposing suggest and format", () => {
    const proxy = createLocalitiesProxy("secret-key");
    expect(typeof proxy.suggest).toBe("function");
    expect(typeof proxy.format).toBe("function");
  });
});
