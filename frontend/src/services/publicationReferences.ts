/**
 * Publication references: from Django GET /api/publication-references/
 * (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from /api/publication-references/ */
export interface PublicationReferenceApiResultItem {
  postmarkPublicationReferenceId: number;
  postmarkPublication: number;
  publicationTitle: string;
  publishedId: string;
  referenceLocation: string;
  createdDate: string;
}

/** Normalized publication reference for list/detail */
export interface PublicationReferenceRecord {
  id: number;
  postmarkPublication: number;
  publicationTitle: string;
  publishedId: string;
  referenceLocation: string;
  createdDate: string;
}

function mapApiResultToRecord(
  item: PublicationReferenceApiResultItem
): PublicationReferenceRecord {
  return {
    id: item.postmarkPublicationReferenceId,
    postmarkPublication: item.postmarkPublication,
    publicationTitle: item.publicationTitle ?? "",
    publishedId: item.publishedId ?? "",
    referenceLocation: item.referenceLocation ?? "",
    createdDate: item.createdDate ?? "",
  };
}

/**
 * Fetches publication references from Django GET /api/publication-references/.
 */
export async function getPublicationReferences(): Promise<
  PublicationReferenceRecord[]
> {
  const results = await fetchAllPages<PublicationReferenceApiResultItem>(
    "publication-references"
  );
  return results.map(mapApiResultToRecord);
}
