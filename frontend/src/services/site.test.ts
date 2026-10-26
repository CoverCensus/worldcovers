// Trello T84 -- the site answer is mapped defensively: unknown reads as production,
// and only an http(s) origin may become the production link.
import { mapSiteInfo } from "./site";

describe("mapSiteInfo", () => {
  it("maps a staging answer and strips the trailing slash", () => {
    const info = mapSiteInfo({ hostname: "woco.dev", role: "staging", production_url: "https://hellowoco.app/" });
    expect(info.isProduction).toBe(false);
    expect(info.productionUrl).toBe("https://hellowoco.app");
    expect(info.productionHost).toBe("hellowoco.app");
  });

  it("rejects an unknown site role", () => {
    expect(() => mapSiteInfo({ role: "development" })).toThrow();
    expect(() => mapSiteInfo({})).toThrow();
  });

  it("refuses a non-http production url and falls back to the known address", () => {
    expect(mapSiteInfo({ role: "staging", production_url: "javascript:alert(1)" }).productionUrl).toBe("https://hellowoco.app");
    expect(mapSiteInfo({ role: "staging", production_url: "https://example.org/path" }).productionUrl).toBe("https://hellowoco.app");
  });
});
