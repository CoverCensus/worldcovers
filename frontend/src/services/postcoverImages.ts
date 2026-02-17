/**
 * Postcover images: from GET /api/postcover-images/ when VITE_POSTCOVER_IMAGES_API_URL is set.
 * When not set, returns [] (app may use Supabase or other source for cover images).
 */

/** One item from GET /api/postcover-images/ */
export interface PostcoverImageApiResultItem {
  postcoverImageId: number;
  originalFilename: string;
  storageFilename: string;
  imageUrl: string;
  mimeType: string;
  imageWidth: number;
  imageHeight: number;
  fileSizeBytes: number;
  imageView: string;
  imageDescription: string;
  displayOrder: number;
  createdDate: string;
}

/** Paginated response from GET /api/postcover-images/ */
export interface PostcoverImageApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostcoverImageApiResultItem[];
}

/** Normalized postcover image for display (matches API shape) */
export interface PostcoverImageRecord {
  id: number;
  originalFilename: string;
  storageFilename: string;
  imageUrl: string;
  mimeType: string;
  imageWidth: number;
  imageHeight: number;
  fileSizeBytes: number;
  imageView: string;
  imageDescription: string;
  displayOrder: number;
  createdDate: string;
}

function mapApiResultToRecord(
  item: PostcoverImageApiResultItem
): PostcoverImageRecord {
  return {
    id: item.postcoverImageId,
    originalFilename: item.originalFilename,
    storageFilename: item.storageFilename,
    imageUrl: item.imageUrl,
    mimeType: item.mimeType,
    imageWidth: item.imageWidth,
    imageHeight: item.imageHeight,
    fileSizeBytes: item.fileSizeBytes,
    imageView: item.imageView,
    imageDescription: item.imageDescription,
    displayOrder: item.displayOrder,
    createdDate: item.createdDate,
  };
}

function getPostcoverImagesApiUrl(): string | null {
  const env = import.meta.env.VITE_POSTCOVER_IMAGES_API_URL;
  if (!env || typeof env !== "string" || env.trim() === "") return null;
  const base = env.trim().replace(/\/+$/, "");
  if (base.endsWith("/api/postcover-images")) return base;
  return `${base}/api/postcover-images`;
}

/**
 * Fetches postcover images from GET /api/postcover-images/.
 * When VITE_POSTCOVER_IMAGES_API_URL is not set, returns [].
 */
export async function getPostcoverImages(): Promise<PostcoverImageRecord[]> {
  const apiUrl = getPostcoverImagesApiUrl();
  if (!apiUrl) {
    return [];
  }

  const url = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Postcover images API error: ${res.status} ${res.statusText}`
    );
  }

  const data: PostcoverImageApiResponse = await res.json();
  if (!Array.isArray(data.results)) {
    throw new Error(
      "Postcover images API: invalid response (missing results array)"
    );
  }

  return data.results.map(mapApiResultToRecord);
}
