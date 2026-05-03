/**
 * Reference works (v2 ReferenceWork entity): GET /reference-works/.
 */
import apiClient from "@/lib/api";

/** User object in createdBy/modifiedBy */
export interface ReferenceWorkUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

/** One item from GET /reference-works/ (DRF snake_case, matching v2 model) */
export interface ReferenceWorkApiResultItem {
  reference_work_id: number;
  created_by?: ReferenceWorkUser;
  modified_by?: ReferenceWorkUser;
  created_date: string;
  modified_date: string;
  code: string | null;
  title: string;
  authorship: string;
  publisher: string;
  publication_year: number | null;
  edition: string;
  volume: string;
  isbn: string;
  url: string;
}

/** Paginated response from GET /reference-works/ */
export interface ReferenceWorkApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ReferenceWorkApiResultItem[];
}

/** Normalized reference work for list/detail / dropdowns */
export interface ReferenceWorkRecord {
  id: number;
  code: string | null;
  title: string;
  authorship: string;
  publisher: string;
  publicationYear: number | null;
  edition: string;
  volume: string;
  isbn: string;
  url: string;
  createdDate: string;
  modifiedDate: string;
}

function mapApiResultToRecord(item: ReferenceWorkApiResultItem): ReferenceWorkRecord {
  return {
    id: item.reference_work_id,
    code: item.code ?? null,
    title: item.title,
    authorship: item.authorship,
    publisher: item.publisher,
    publicationYear: item.publication_year,
    edition: item.edition,
    volume: item.volume,
    isbn: item.isbn,
    url: item.url,
    createdDate: item.created_date,
    modifiedDate: item.modified_date,
  };
}

/**
 * Fetches reference works from GET /reference-works/.
 */
export async function getReferenceWorks(): Promise<ReferenceWorkRecord[]> {
  const res = await apiClient.get<ReferenceWorkApiResponse>("/reference-works/");
  const data = res.data;
  if (!Array.isArray(data.results)) {
    throw new Error("Reference works API: invalid response (missing results array)");
  }
  return data.results.map(mapApiResultToRecord);
}
