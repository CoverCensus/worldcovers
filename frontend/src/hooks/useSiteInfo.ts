import { useEffect, useState } from "react";
import { getSiteInfo, type SiteInfo } from "@/services/site";

/**
 * The server's answer to "which site is this?" (Trello T84), or null until it
 * arrives or when it cannot be fetched. Callers treat null as production, so
 * nothing test-site-specific flashes on hellowoco.app while the request is
 * in flight.
 */
export function useSiteInfo(): SiteInfo | null {
  const [site, setSite] = useState<SiteInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSiteInfo()
      .then((info) => {
        if (!cancelled) setSite(info);
      })
      .catch(() => {
        // Unknown site: behave as production (no notice, no badge).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return site;
}
