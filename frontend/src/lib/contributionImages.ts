import apiClient from "@/lib/api";
import type { MarkingImage } from "@/services/markings";

/** Build a public URL for a contribution image meta dict (storage_filename or direct url). */
export function contributionMetaImageUrl(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const obj = meta as Record<string, unknown>;
  for (const key of ["url", "image_url", "imageUrl", "public_url", "publicUrl"]) {
    const raw = obj[key];
    if (typeof raw === "string" && raw.trim()) {
      return absolutizeMediaPath(raw.trim());
    }
  }
  const sf = obj.storage_filename ?? obj.storageFilename;
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
  sd: Record<string, unknown>,
): unknown[] {
  const keys = [
    "cover_image_metas",
    "coverImageMetas",
    "marking_image_metas",
    "markingImageMetas",
    "image_metas",
    "imageMetas",
  ];
  for (const key of keys) {
    const raw = sd[key];
    if (Array.isArray(raw) && raw.length > 0) return raw;
  }
  const single = sd.image_meta ?? sd.imageMeta;
  return single && typeof single === "object" ? [single] : [];
}

/** Synthetic MarkingImage rows for draft previews (negative imageId = not persisted as Image yet). */
export function markingImagesFromContributionMetas(
  metas: unknown[],
  subjectId: number,
): MarkingImage[] {
  const rows: MarkingImage[] = [];
  metas.forEach((meta, idx) => {
    const imageUrl = contributionMetaImageUrl(meta);
    if (!imageUrl) return;
    const obj = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
    const storageFilename =
      typeof obj.storage_filename === "string"
        ? obj.storage_filename
        : typeof obj.storageFilename === "string"
          ? obj.storageFilename
          : "";
    const originalFilename =
      typeof obj.original_filename === "string"
        ? obj.original_filename
        : typeof obj.originalFilename === "string"
          ? obj.originalFilename
          : "";
    rows.push({
      imageId: -(idx + 1),
      subjectType: "COVER",
      subjectId,
      imageUrl,
      imageView: "FRONT",
      originalFilename,
      storageFilename,
      imageDescription: "",
      isTracing: false,
      displayOrder: idx,
    });
  });
  return rows;
}
