/**
 * Which site this is: GET /site/ (Trello T84).
 *
 * The same bundle is served on woco.dev (the test site) and hellowoco.app
 * (production), so the SPA cannot tell them apart on its own. The backend
 * answers from its settings. The answer is fetched once per page load and
 * shared by every caller. Unknown or failed answers must not enable signup.
 */
import apiClient from "@/lib/api";

export type SiteRole = "production" | "staging";

export interface SiteInfo {
  hostname: string;
  role: SiteRole;
  isProduction: boolean;
  /** Production origin without a trailing slash, e.g. "https://hellowoco.app". */
  productionUrl: string;
  /** Production host for prose, e.g. "hellowoco.app". */
  productionHost: string;
}

interface SiteApiResponse {
  hostname?: unknown;
  role?: unknown;
  production_url?: unknown;
}

const DEFAULT_PRODUCTION_URL = "https://hellowoco.app";

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    // mapSiteInfo only passes a validated http(s) origin or the default, so
    // this is unreachable in practice; an empty host is the honest fallback.
    return "";
  }
}

export function mapSiteInfo(raw: SiteApiResponse): SiteInfo {
  if (raw.role !== "staging" && raw.role !== "production") throw new Error("Could not confirm which site this is.");
  const role: SiteRole = raw.role;
  // Only an http(s) origin may become an href; anything else falls back to the
  // known production address.
  const given = text(raw.production_url).trim().replace(/\/+$/, "");
  const productionUrl = /^https?:\/\/[^\s/]+$/i.test(given) ? given : DEFAULT_PRODUCTION_URL;
  return {
    hostname: text(raw.hostname),
    role,
    isProduction: role === "production",
    productionUrl,
    productionHost: hostOf(productionUrl),
  };
}

let cached: Promise<SiteInfo> | null = null;

export function getSiteInfo(): Promise<SiteInfo> {
  if (!cached) {
    // Start inside a resolved promise so that any synchronous failure of the
    // client becomes a rejection the caller already handles: a page must never
    // break because it could not learn which site it is on.
    cached = Promise.resolve()
      .then(() => apiClient.get<SiteApiResponse>("/site/"))
      .then((res) => mapSiteInfo(res.data ?? {}))
      .catch((err: unknown) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}

/** Tests only: forget the shared answer. */
export function resetSiteInfoCache(): void {
  cached = null;
}
