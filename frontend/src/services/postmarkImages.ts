/**
 * Postmark images: from Django GET /api/postmark-images/
 * (single base URL: VITE_API_BASE_URL).
 */

import { fetchAllPages } from "@/lib/api";

/** One item from /api/postmark-images/ (camelCase or snake_case) */
export interface PostmarkImageApiResultItem {
  postmarkImageId?: number;
  postmark_image_id?: number;
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
  uploadedBy?: number;
  uploaded_by?: number;
  createdDate?: string;
  created_date?: string;
  [key: string]: unknown;
}

/** Normalized postmark image for display */
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
  imageDescription: string;
  displayOrder: number;
  uploadedBy: number;
  createdDate: string;
}

function mapApiResultToRecord(
  item: PostmarkImageApiResultItem
): PostmarkImageRecord {
  const id = item.postmarkImageId ?? item.postmark_image_id ?? 0;
  const imageUrl = item.imageUrl ?? item.image_url ?? "";
  return {
    id,
    originalFilename: item.originalFilename ?? item.original_filename ?? "",
    storageFilename: item.storageFilename ?? item.storage_filename ?? "",
    imageUrl,
    mimeType: item.mimeType ?? item.mime_type ?? "",
    imageWidth: item.imageWidth ?? item.image_width ?? 0,
    imageHeight: item.imageHeight ?? item.image_height ?? 0,
    fileSizeBytes: item.fileSizeBytes ?? item.file_size_bytes ?? 0,
    imageView: item.imageView ?? item.image_view ?? "",
    imageDescription: item.imageDescription ?? item.image_description ?? "",
    displayOrder: item.displayOrder ?? item.display_order ?? 0,
    uploadedBy: item.uploadedBy ?? item.uploaded_by ?? 0,
    createdDate: item.createdDate ?? item.created_date ?? "",
  };
}

/**
 * Fetches postmark images from Django GET /api/postmark-images/.
 */
export async function getPostmarkImages(): Promise<PostmarkImageRecord[]> {
  const results = await fetchAllPages<PostmarkImageApiResultItem>(
    "postmark-images"
  );
  return results.map(mapApiResultToRecord);
}
