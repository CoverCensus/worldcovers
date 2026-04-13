/**
 * Cover images: GET /cover-images/.
 */
import apiClient from "@/lib/api";

/** One item from GET /cover-images/ (DRF snake_case) */
export interface CoverImageApiResultItem {
  cover_image_id: number;
  original_filename: string;
  storage_filename: string;
  image_url: string;
  mime_type: string;
  image_width: number;
  image_height: number;
  file_size_bytes: number;
  image_view: string;
  image_description: string;
  display_order: number;
  created_date: string;
}

/** Paginated response from GET /cover-images/ */
export interface CoverImageApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CoverImageApiResultItem[];
}

/** Normalized cover image for display */
export interface CoverImageRecord {
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

function mapApiResultToRecord(item: CoverImageApiResultItem): CoverImageRecord {
  return {
    id: item.cover_image_id,
    originalFilename: item.original_filename,
    storageFilename: item.storage_filename,
    imageUrl: item.image_url,
    mimeType: item.mime_type,
    imageWidth: item.image_width,
    imageHeight: item.image_height,
    fileSizeBytes: item.file_size_bytes,
    imageView: item.image_view,
    imageDescription: item.image_description,
    displayOrder: item.display_order,
    createdDate: item.created_date,
  };
}

/**
 * Fetches cover images from GET /cover-images/.
 */
export async function getCoverImages(): Promise<CoverImageRecord[]> {
  const res = await apiClient.get<CoverImageApiResponse>("/cover-images/");
  const data = res.data;
  if (!Array.isArray(data.results)) {
    throw new Error("Cover images API: invalid response (missing results array)");
  }
  return data.results.map(mapApiResultToRecord);
}
