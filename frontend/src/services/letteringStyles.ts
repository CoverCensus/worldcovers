/**
 * Lettering styles: from Django GET /api/lettering-styles/ (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from /api/lettering-styles/ */
export interface LetteringStyleApiResultItem {
  letteringStyleId: number;
  createdDate?: string;
  modifiedDate?: string;
  letteringStyleName: string;
  letteringDescription?: string;
  createdBy?: number;
  modifiedBy?: number;
}

/** Normalized option for dropdowns / filters */
export interface LetteringStyleOption {
  id: number;
  name: string;
  description: string;
}

function mapApiResultToOption(item: LetteringStyleApiResultItem): LetteringStyleOption {
  return {
    id: item.letteringStyleId,
    name: item.letteringStyleName,
    description: item.letteringDescription ?? "",
  };
}

/**
 * Fetches lettering styles from Django GET /api/lettering-styles/.
 */
export async function getLetteringStyles(): Promise<LetteringStyleOption[]> {
  const results = await fetchAllPages<LetteringStyleApiResultItem>("lettering-styles");
  return results.map(mapApiResultToOption);
}
