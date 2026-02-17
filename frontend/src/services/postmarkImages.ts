/**
 * Postmark images: from GET /api/postmark-images/ when VITE_POSTMARK_IMAGES_API_URL is set.
 * When not set, returns [] (app uses Supabase or postmark mainImage for images).
 */

/** One item from GET /api/postmark-images/ */
export interface PostmarkImageApiResultItem {
  postmarkImageId: number;
  originalFilename: string;
  storageFilename: string;
  imageUrl: string;
  mimeType: string;
  imageWidth: number;
  imageHeight: number;
  fileSizeBytes: number;
  imageView: string;
  imageStatus: string;
  submitterName: string;
  submitterEmail: string;
  imageDescription: string;
  displayOrder: number;
  uploadedBy: number;
  createdDate: string;
}

/** Paginated response from GET /api/postmark-images/ */
export interface PostmarkImageApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostmarkImageApiResultItem[];
}

/** Normalized postmark image for display (matches API shape) */
export interface PostmarkImageRecord {
  id: number;
  originalFilename: string;
  storageFilename: string;
  imageUrl: string;
  mimeType: string;
  imageWidth: number;
  imageHeight: number;
  fileSizeBytes: number;
  imageView: string;
  imageStatus: string;
  submitterName: string;
  submitterEmail: string;
  imageDescription: string;
  displayOrder: number;
  uploadedBy: number;
  createdDate: string;
}

function mapApiResultToRecord(
  item: PostmarkImageApiResultItem
): PostmarkImageRecord {
  return {
    id: item.postmarkImageId,
    originalFilename: item.originalFilename,
    storageFilename: item.storageFilename,
    imageUrl: item.imageUrl,
    mimeType: item.mimeType,
    imageWidth: item.imageWidth,
    imageHeight: item.imageHeight,
    fileSizeBytes: item.fileSizeBytes,
    imageView: item.imageView,
    imageStatus: item.imageStatus,
    submitterName: item.submitterName,
    submitterEmail: item.submitterEmail,
    imageDescription: item.imageDescription,
    displayOrder: item.displayOrder,
    uploadedBy: item.uploadedBy,
    createdDate: item.createdDate,
  };
}

function getPostmarkImagesApiUrl(): string | null {
  const env = import.meta.env.VITE_POSTMARK_IMAGES_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/postmark-images")) return base;
  return `${base}/api/postmark-images`;
}

/**
 * Fetches postmark images from GET /api/postmark-images/.
 * When VITE_POSTMARK_IMAGES_API_URL is not set, returns [].
 */
export async function getPostmarkImages(): Promise<PostmarkImageRecord[]> {
  const apiUrl = getPostmarkImagesApiUrl();
  if (!apiUrl) {
    return [];
  }

  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Postmark images API error: ${res.status} ${res.statusText}`
    );
  }

  const data: PostmarkImageApiResponse = await res.json();
  if (!Array.isArray(data.results)) {
    throw new Error(
      "Postmark images API: invalid response (missing results array)"
    );
  }

  return data.results.map(mapApiResultToRecord);
}
