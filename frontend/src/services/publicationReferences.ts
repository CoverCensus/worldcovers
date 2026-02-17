/**
 * Publication references: from GET /api/publication-references/ when
 * VITE_PUBLICATION_REFERENCES_API_URL is set. No Supabase fallback (no matching table).
 */

/** One item from GET /api/publication-references/ */
export interface PublicationReferenceApiResultItem {
  postmarkPublicationReferenceId: number;
  postmarkPublication: number;
  publicationTitle: string;
  publishedId: string;
  referenceLocation: string;
  createdDate: string;
}

/** Paginated response from GET /api/publication-references/ */
export interface PublicationReferenceApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PublicationReferenceApiResultItem[];
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
    publicationTitle: item.publicationTitle,
    publishedId: item.publishedId,
    referenceLocation: item.referenceLocation,
    createdDate: item.createdDate,
  };
}

function getPublicationReferencesApiUrl(): string | null {
  const env = import.meta.env.VITE_PUBLICATION_REFERENCES_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/publication-references")) return base;
  return `${base}/api/publication-references`;
}

/**
 * Fetches publication references from GET /api/publication-references/.
 * When VITE_PUBLICATION_REFERENCES_API_URL is not set, returns [].
 */
export async function getPublicationReferences(): Promise<
  PublicationReferenceRecord[]
> {
  const apiUrl = getPublicationReferencesApiUrl();
  if (!apiUrl) {
    return [];
  }

  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Publication references API error: ${res.status} ${res.statusText}`
    );
  }

  const data: PublicationReferenceApiResponse = await res.json();
  if (!Array.isArray(data.results)) {
    throw new Error(
      "Publication references API: invalid response (missing results array)"
    );
  }

  return data.results.map(mapApiResultToRecord);
}
