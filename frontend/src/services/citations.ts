/**
 * Citations (v2 Citation entity): GET /citations/.
 * Links a ReferenceWork to a subject (Cover or Postmark) with a
 * free-form `citation_detail` string.
 */
import apiClient from "@/lib/api";

/** Subject polymorphic discriminator (v2 model) */
export type CitationSubjectType = "COVER" | "POSTMARK";

/** One item from GET /citations/ (DRF snake_case) */
export interface CitationApiResultItem {
  citation_id: number;
  reference_work_id: number;
  subject_id: number;
  subject_type: CitationSubjectType;
  citation_detail: string;
  created_date: string;
  modified_date: string;
}

/** Paginated response from GET /citations/ */
export interface CitationApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CitationApiResultItem[];
}

/** Normalized citation for list/detail */
export interface CitationRecord {
  id: number;
  referenceWorkId: number;
  subjectId: number;
  subjectType: CitationSubjectType;
  citationDetail: string;
  createdDate: string;
  modifiedDate: string;
}

function mapApiResultToRecord(item: CitationApiResultItem): CitationRecord {
  return {
    id: item.citation_id,
    referenceWorkId: item.reference_work_id,
    subjectId: item.subject_id,
    subjectType: item.subject_type,
    citationDetail: item.citation_detail,
    createdDate: item.created_date,
    modifiedDate: item.modified_date,
  };
}

/**
 * Fetches citations from GET /citations/.
 */
export async function getCitations(): Promise<CitationRecord[]> {
  const res = await apiClient.get<CitationApiResponse>("/citations/");
  const data = res.data;
  if (!Array.isArray(data.results)) {
    throw new Error("Citations API: invalid response (missing results array)");
  }
  return data.results.map(mapApiResultToRecord);
}
