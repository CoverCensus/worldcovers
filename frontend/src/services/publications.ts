/**
 * Publications: from Django GET /api/publications/ (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** User object in createdBy/modifiedBy */
export interface PublicationUser {
  id: number;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/** One item from /api/publications/ */
export interface PublicationApiResultItem {
  postmarkPublicationId: number;
  createdBy?: PublicationUser;
  modifiedBy?: PublicationUser;
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
    publicationTitle: item.publicationTitle ?? "",
    author: item.author ?? "",
    publisher: item.publisher ?? "",
    publicationDate: item.publicationDate ?? "",
    isbn: item.isbn ?? "",
    edition: item.edition ?? "",
    publicationType: item.publicationType ?? "",
    createdDate: item.createdDate ?? "",
    modifiedDate: item.modifiedDate ?? "",
  };
}

/**
 * Fetches publications from Django GET /api/publications/.
 */
export async function getPublications(): Promise<PublicationRecord[]> {
  const results = await fetchAllPages<PublicationApiResultItem>("publications");
  return results.map(mapApiResultToRecord);
}
