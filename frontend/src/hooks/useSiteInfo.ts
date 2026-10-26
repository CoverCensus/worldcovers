import { useEffect, useState } from "react";
import { getSiteInfo, type SiteInfo } from "@/services/site";

/**
 * The server's answer to "which site is this?" (Trello T84), or null until it
 * arrives or when it cannot be fetched. Signup waits for a known site.
 */
export function useSiteInfo(retry = 0): SiteInfo | null {
  const [site, setSite] = useState<SiteInfo | null>(null);

  // Share successful answers; retry a failed lookup when requested.
  useEffect(() => {
    let cancelled = false;
    getSiteInfo()
      .then((info) => {
        if (!cancelled) setSite(info);
      })
      .catch(() => {
        if (!cancelled) setSite(null);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  return site;
}
