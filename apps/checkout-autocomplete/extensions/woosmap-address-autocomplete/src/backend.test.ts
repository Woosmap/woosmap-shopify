import { describe, it, expect, vi, beforeEach } from "vitest";
import { backendOrigin, callBackend, type BackendApi } from "./backend";

function makeApi(overrides: Partial<BackendApi> = {}): BackendApi {
  return {
    sessionToken: { get: async () => "jwt-token" },
    extension: { scriptUrl: "https://tunnel.example/extensions/main.js" },
    appMetafields: [],
    ...overrides,
  };
}

describe("backendOrigin", () => {
  it("prefers the app-url metafield and strips a trailing slash", () => {
    const api = makeApi({
      appMetafields: [{ metafield: { key: "app-url", value: "https://app.example/" } }],
    });
    expect(backendOrigin(api)).toBe("https://app.example");
  });

  it("falls back to the scriptUrl origin when no metafield is present", () => {
    expect(backendOrigin(makeApi())).toBe("https://tunnel.example");
  });

  it("ignores unrelated metafields", () => {
    const api = makeApi({ appMetafields: [{ metafield: { key: "other", value: "x" } }] });
    expect(backendOrigin(api)).toBe("https://tunnel.example");
  });
});

describe("callBackend", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("builds the URL with subpath + params, sends the bearer token, returns JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [1] }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callBackend(makeApi(), "localities/autocomplete", {
      query: "mar",
      country: "FR",
      language: undefined,
    });

    expect(result).toEqual({ suggestions: [1] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe(
      "https://tunnel.example/apps/woosmap/localities/autocomplete?query=mar&country=FR",
    );
    expect(init.headers.Authorization).toBe("Bearer jwt-token");
  });

  it("returns null on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await callBackend(makeApi(), "localities/details", { id: "1" })).toBeNull();
  });

  it("returns null when fetch throws (never blocks checkout)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await callBackend(makeApi(), "localities/details", { id: "1" })).toBeNull();
  });

  it("forwards the abort signal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await callBackend(makeApi(), "localities/autocomplete", {}, controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
  });
});
