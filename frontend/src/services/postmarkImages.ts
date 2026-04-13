/**
 * Postmark images: GET /postmark-images/.
 */
import apiClient from "@/lib/api";

/** One item from GET /postmark-images/ */
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

/** Paginated response from GET /postmark-images/ */
export interface PostmarkImageApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostmarkImageApiResultItem[];
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
  imageStatus: string;
  submitterName: string;
  submitterEmail: string;
  imageDescription: string;
  displayOrder: number;
  uploadedBy: number;
  createdDate: string;
}

function mapApiResultToRecord(item: PostmarkImageApiResultItem): PostmarkImageRecord {
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

/**
 * Fetches postmark images from GET /postmark-images/.
 */
export async function getPostmarkImages(): Promise<PostmarkImageRecord[]> {
  const res = await apiClient.get<PostmarkImageApiResponse>("/postmark-images/");
  const data = res.data;
  if (!Array.isArray(data.results)) {
    throw new Error("Postmark images API: invalid response (missing results array)");
  }
  return data.results.map(mapApiResultToRecord);
}
