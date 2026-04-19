import { useEffect, useState } from "react";
import { getPostmarkYearRange } from "@/services/postmarks";

const FALLBACK_EARLIEST = 1700;
const FALLBACK_LATEST = 1880;

export interface UsePostmarkYearRangeReturn {
  earliestYear: number;
  latestYear: number;
  isLoading: boolean;
}

/**
 * Fetches the catalog's earliest/latest observed year from GET /postmarks-range/.
 * Falls back to {@link FALLBACK_EARLIEST}-{@link FALLBACK_LATEST} during loading or on error
 * so UI bounds remain usable.
 */
export function usePostmarkYearRange(): UsePostmarkYearRangeReturn {
  const [earliestYear, setEarliestYear] = useState<number>(FALLBACK_EARLIEST);
  const [latestYear, setLatestYear] = useState<number>(FALLBACK_LATEST);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const range = await getPostmarkYearRange();
        if (cancelled) return;
        if (range.earliestYear != null) setEarliestYear(range.earliestYear);
        if (range.latestYear != null) setLatestYear(range.latestYear);
      } catch {
        // keep fallbacks
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { earliestYear, latestYear, isLoading };
}

export default usePostmarkYearRange;
