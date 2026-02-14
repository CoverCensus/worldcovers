/**
 * Postcover images: from Django GET /api/postcover-images/
 * (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from /api/postcover-images/ (camelCase or snake_case) */
export interface PostcoverImageApiResultItem {
  postcoverImageId?: number;
  postcover_image_id?: number;
  originalFilename?: string;
  original_filename?: string;
  storageFilename?: string;
  storage_filename?: string;
  imageUrl?: string;
  image_url?: string;
  mimeType?: string;
  mime_type?: string;
  imageWidth?: number;
  image_width?: number;
  imageHeight?: number;
  image_height?: number;
  fileSizeBytes?: number;
  file_size_bytes?: number;
  imageView?: string;
  image_view?: string;
  imageDescription?: string;
  image_description?: string;
  displayOrder?: number;
  display_order?: number;
  createdDate?: string;
  created_date?: string;
}

/** Normalized postcover image for display */
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
  const id = item.postcoverImageId ?? item.postcover_image_id ?? 0;
  return {
    id,
    originalFilename: item.originalFilename ?? item.original_filename ?? "",
    storageFilename: item.storageFilename ?? item.storage_filename ?? "",
    imageUrl: item.imageUrl ?? item.image_url ?? "",
    mimeType: item.mimeType ?? item.mime_type ?? "",
    imageWidth: item.imageWidth ?? item.image_width ?? 0,
    imageHeight: item.imageHeight ?? item.image_height ?? 0,
    fileSizeBytes: item.fileSizeBytes ?? item.file_size_bytes ?? 0,
    imageView: item.imageView ?? item.image_view ?? "",
    imageDescription: item.imageDescription ?? item.image_description ?? "",
    displayOrder: item.displayOrder ?? item.display_order ?? 0,
    createdDate: item.createdDate ?? item.created_date ?? "",
  };
}

/**
 * Fetches postcover images from Django GET /api/postcover-images/.
 */
export async function getPostcoverImages(): Promise<PostcoverImageRecord[]> {
  const results = await fetchAllPages<PostcoverImageApiResultItem>(
    "postcover-images"
  );
  return results.map(mapApiResultToRecord);
}
