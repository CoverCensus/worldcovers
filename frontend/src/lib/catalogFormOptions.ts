/** Shared form options for catalog/submission forms (Contribute, Edit Catalog) */
export const STATE_OPTIONS = [
  { value: "MA", label: "Massachusetts" },
  { value: "NY", label: "New York" },
  { value: "PA", label: "Pennsylvania" },
  { value: "CT", label: "Connecticut" },
];

export const TYPE_OPTIONS = [
  { value: "Circular Date Stamp", label: "Circular Date Stamp" },
  { value: "Straight Line", label: "Straight Line" },
  { value: "Manuscript", label: "Manuscript" },
  { value: "Oval", label: "Oval" },
];

export const RARITY_OPTIONS = [
  { value: "Common", label: "Common" },
  { value: "Scarce", label: "Scarce" },
  { value: "Rare", label: "Rare" },
  { value: "Very Rare", label: "Very Rare" },
];

export const MANUSCRIPT_OPTIONS = [
  { value: "Yes", label: "Yes" },
  { value: "No", label: "No" },
];

export const SUBMISSION_IMAGES_BUCKET = "submission-images";
export const MAX_IMAGE_SIZE_MB = 10;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/tiff"];
