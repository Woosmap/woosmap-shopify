import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { publishAppUrl, APP_URL_KEY, APP_URL_NAMESPACE } from "./publish-app-url.server";

type Admin = Parameters<typeof publishAppUrl>[0];

/** Builds a fake admin client whose two `graphql` calls resolve shop id then the mutation. */
function makeAdmin(shopId: string | null, userErrors: unknown[] = []): Admin {
  const graphql = vi
    .fn()
    .mockResolvedValueOnce({ json: async () => ({ data: { shop: shopId ? { id: shopId } : null } }) })
    .mockResolvedValueOnce({ json: async () => ({ data: { metafieldsSet: { userErrors } } }) });
  return { graphql } as unknown as Admin;
}

describe("publishAppUrl", () => {
  const original = process.env.SHOPIFY_APP_URL;
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    process.env.SHOPIFY_APP_URL = original;
  });

  it("no-ops when SHOPIFY_APP_URL is unset", async () => {
    delete process.env.SHOPIFY_APP_URL;
    const admin = makeAdmin("gid://shopify/Shop/1");
    await publishAppUrl(admin);
    expect((admin.graphql as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("sets the $app:app-url metafield on the shop", async () => {
    process.env.SHOPIFY_APP_URL = "https://app.example";
    const admin = makeAdmin("gid://shopify/Shop/1");
    await publishAppUrl(admin);

    const graphql = admin.graphql as ReturnType<typeof vi.fn>;
    expect(graphql).toHaveBeenCalledTimes(2);
    const metafield = graphql.mock.calls[1][1].variables.metafields[0];
    expect(metafield).toMatchObject({
      ownerId: "gid://shopify/Shop/1",
      namespace: APP_URL_NAMESPACE,
      key: APP_URL_KEY,
      type: "single_line_text_field",
      value: "https://app.example",
    });
  });

  it("skips the mutation when the shop id is missing", async () => {
    process.env.SHOPIFY_APP_URL = "https://app.example";
    const admin = makeAdmin(null);
    await publishAppUrl(admin);
    expect((admin.graphql as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("logs userErrors without throwing", async () => {
    process.env.SHOPIFY_APP_URL = "https://app.example";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = makeAdmin("gid://shopify/Shop/1", [{ field: "value", message: "bad" }]);
    await expect(publishAppUrl(admin)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it("swallows GraphQL errors", async () => {
    process.env.SHOPIFY_APP_URL = "https://app.example";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = { graphql: vi.fn().mockRejectedValue(new Error("network")) } as unknown as Admin;
    await expect(publishAppUrl(admin)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });
});
