/**
 * Date formats: from Django GET /api/date-formats/ (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from /api/date-formats/ */
export interface DateFormatApiResultItem {
  dateFormatId: number;
  createdDate?: string;
  modifiedDate?: string;
  formatName: string;
  formatDescription?: string;
  createdBy?: number;
  modifiedBy?: number;
}

/** Normalized option for dropdowns / filters */
export interface DateFormatOption {
  id: number;
  name: string;
  description: string;
}

function mapApiResultToOption(item: DateFormatApiResultItem): DateFormatOption {
  return {
    id: item.dateFormatId,
    name: item.formatName,
    description: item.formatDescription ?? "",
  };
}

/**
 * Fetches date formats from Django GET /api/date-formats/.
 */
export async function getDateFormats(): Promise<DateFormatOption[]> {
  const results = await fetchAllPages<DateFormatApiResultItem>("date-formats");
  return results.map(mapApiResultToOption);
}
