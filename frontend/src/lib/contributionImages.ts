import type { Submission, SubmissionImage } from "@/lib/submission";
import apiClient from "@/lib/api";
import type { MarkingImage } from "@/services/markings";

/** Build a public URL for a contribution image meta dict (storage_filename or direct url). */
export function contributionMetaImageUrl(meta: SubmissionImage): string | null {
  if (!meta || typeof meta !== "object") return null;
  if (meta.url?.trim()) return absolutizeMediaPath(meta.url.trim());
  const sf = meta.storage_filename;
  if (typeof sf !== "string" || !sf.trim()) return null;
  const relative = sf.startsWith("/") ? sf : `/${sf.replace(/^\/+/, "")}`;
  const mediaPath = relative.startsWith("/media/") ? relative : `/media/${relative.replace(/^\/+/, "")}`;

  const viteBase = (import.meta.env.VITE_IMAGE_URL as string | undefined)?.trim();
  if (viteBase) {
    return `${viteBase.replace(/\/+$/, "")}/${sf.replace(/^\/+/, "")}`;
  }
  return absolutizeMediaPath(mediaPath);
}

function absolutizeMediaPath(path: string): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = apiClient.defaults.baseURL;
  if (base && /^https?:\/\//i.test(base)) {
    try {
      const origin = new URL(base).origin;
      const relative = path.startsWith("/") ? path : `/${path}`;
      return `${origin}${relative}`;
    } catch {
      return path;
    }
  }
  return path;
}

/** Cover/marking image metas stored on Contribution.submitted_data. */
export function contributionImageMetasFromSubmittedData(
  sd: Submission,
): SubmissionImage[] {
  const keys = [
    "cover_image_metas",
    "marking_image_metas",
    "image_metas",
  ] as const;
  for (const key of keys) {
    const raw = sd[key];
    if (Array.isArray(raw) && raw.length > 0) return raw;
  }
  const single = sd.image_meta;
  return single && typeof single === "object" ? [single] : [];
}

/** Synthetic MarkingImage rows for draft previews (negative imageId = not persisted as Image yet). */
export function markingImagesFromContributionMetas(
  metas: SubmissionImage[],
  subjectId: number,
): MarkingImage[] {
  const rows: MarkingImage[] = [];
  metas.forEach((meta, idx) => {
    const imageUrl = contributionMetaImageUrl(meta);
    if (!imageUrl) return;
    const obj = meta;
    const storageFilename = obj.storage_filename ?? "";
    const originalFilename = obj.original_filename ?? "";
    // Read dimensions from the same submitted_data keys contribution_apply
    // uses when it creates the real Image row, so a draft preview and the row
    // it becomes agree. Absent or unparseable means 0, which the shape
    // classifier reads as indeterminate (issues.md 167).
    const metaDimension = (v: unknown): number => {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    rows.push({
      imageId: -(idx + 1),
      subjectType: "COVER",
      subjectId,
      imageUrl,
      imageView: "FRONT",
      originalFilename,
      storageFilename,
      imageDescription: typeof obj.image_description === "string" ? obj.image_description : "",
      isTracing: false,
      displayOrder: idx,
      imageWidth: metaDimension(obj.image_width),
      imageHeight: metaDimension(obj.image_height),
    });
  });
  return rows;
}

/** True for preview rows from Contribution.submitted_data (not yet Image rows). */
export function isDraftContributionImage(imageId: number): boolean {
  return imageId < 0;
}

/** Fetch a draft contribution preview into a File for catalog image upload. */
export async function fileFromContributionDraftImage(img: {
  imageUrl: string;
  originalFilename?: string;
  storageFilename?: string;
}): Promise<File> {
  const url = contributionMetaImageUrl({
    url: img.imageUrl,
    storage_filename: img.storageFilename,
    original_filename: img.originalFilename,
  }) ?? img.imageUrl;
  if (!url) {
    throw new Error("Draft image is missing a URL.");
  }
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Could not read draft image (${res.status}).`);
  }
  const blob = await res.blob();
  const name =
    (img.originalFilename || "").trim() ||
    (img.storageFilename || "").split("/").pop() ||
    "cover-image.jpg";
  const type =
    blob.type && blob.type.startsWith("image/") ? blob.type : guessMimeFromFilename(name);
  return new File([blob], name, { type });
}

function guessMimeFromFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  return "image/jpeg";
}
