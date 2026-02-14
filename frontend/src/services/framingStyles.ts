/**
 * Framing styles: from Django GET /api/framing-styles/ (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from /api/framing-styles/ */
export interface FramingStyleApiResultItem {
  framingStyleId: number;
  createdDate?: string;
  modifiedDate?: string;
  framingStyleName: string;
  framingDescription?: string;
  createdBy?: number;
  modifiedBy?: number;
}

/** Normalized option for dropdowns / filters */
export interface FramingStyleOption {
  id: number;
  name: string;
  description: string;
}

function mapApiResultToOption(item: FramingStyleApiResultItem): FramingStyleOption {
  return {
    id: item.framingStyleId,
    name: item.framingStyleName,
    description: item.framingDescription ?? "",
  };
}

/**
 * Fetches framing styles from Django GET /api/framing-styles/.
 */
export async function getFramingStyles(): Promise<FramingStyleOption[]> {
  const results = await fetchAllPages<FramingStyleApiResultItem>("framing-styles");
  return results.map(mapApiResultToOption);
}
