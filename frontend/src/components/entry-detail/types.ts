/** Shared gallery slide for marking and cover entry detail pages. */
export type EntryGalleryImage = {
  imageUrl: string | null;
  originalFilename?: string;
  /** Shown on marking gallery only (e.g. Townmark, Cover for linked cover images). */
  subjectLabel?: string;
  isDefault: boolean;
  isTracing: boolean;
  imageId: number | null;
};
