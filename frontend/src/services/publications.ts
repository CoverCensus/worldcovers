/**
 * Publications: from GET /api/publications/ when VITE_PUBLICATIONS_API_URL is set.
 * No Supabase fallback (no matching table).
 */

/** User object in createdBy/modifiedBy */
export interface PublicationUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
}

/** One item from GET /api/publications/ */
export interface PublicationApiResultItem {
  postmarkPublicationId: number;
  createdBy: PublicationUser;
  modifiedBy: PublicationUser;
  createdDate: string;
  modifiedDate: string;
  publicationTitle: string;
  author: string;
  publisher: string;
  publicationDate: string;
  isbn: string;
  edition: string;
  publicationType: string;
}

/** Paginated response from GET /api/publications/ */
export interface PublicationApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PublicationApiResultItem[];
}

/** Normalized publication for list/detail / dropdowns */
export interface PublicationRecord {
  id: number;
  publicationTitle: string;
  author: string;
  publisher: string;
  publicationDate: string;
  isbn: string;
  edition: string;
  publicationType: string;
  createdDate: string;
  modifiedDate: string;
}

function mapApiResultToRecord(item: PublicationApiResultItem): PublicationRecord {
  return {
    id: item.postmarkPublicationId,
    publicationTitle: item.publicationTitle,
    author: item.author,
    publisher: item.publisher,
    publicationDate: item.publicationDate,
    isbn: item.isbn,
    edition: item.edition,
    publicationType: item.publicationType,
    createdDate: item.createdDate,
    modifiedDate: item.modifiedDate,
  };
}

function getPublicationsApiUrl(): string | null {
  const env = import.meta.env.VITE_PUBLICATIONS_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/publications")) return base;
  return `${base}/api/publications`;
}

/**
 * Fetches publications from GET /api/publications/.
 * When VITE_PUBLICATIONS_API_URL is not set, returns [].
 */
export async function getPublications(): Promise<PublicationRecord[]> {
  const apiUrl = getPublicationsApiUrl();
  if (!apiUrl) {
    return [];
  }

  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Publications API error: ${res.status} ${res.statusText}`);
  }

  const data: PublicationApiResponse = await res.json();
  if (!Array.isArray(data.results)) {
    throw new Error(
      "Publications API: invalid response (missing results array)"
    );
  }

  return data.results.map(mapApiResultToRecord);
}
