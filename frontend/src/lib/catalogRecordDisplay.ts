import type { PostmarkRecord } from "@/services/postmarks";
import { getPostmarkListImageUrl, normalizeImageUrl } from "@/services/postmarks";

/** Shown when a catalog field has no value (Catalog Search / Record Detail contract). */
export const CATALOG_FIELD_EMPTY = "—";

export function displayCatalogField(v: string | null | undefined): string {
  const s = v != null ? String(v).trim() : "";
  return s.length > 0 ? s : CATALOG_FIELD_EMPTY;
}

function postmarkTextFromRecord(record: PostmarkRecord): string {
  const cat = record.catalogTxt?.trim();
  const ins = record.inscriptionTxt?.trim();
  if (cat && ins) return `${cat} (${ins})`;
  return cat || ins || "";
}

function parseDateRangeParts(dateRange: string | null | undefined): { earliest: string; latest: string } {
  const dr = (dateRange ?? "").trim();
  if (!dr) return { earliest: "", latest: "" };
  const singleYear = /^(\d{4})$/.exec(dr);
  if (singleYear) {
    const y = singleYear[1];
    return { earliest: y, latest: y };
  }
  const range = /^(\d{4})\s*-\s*(\d{4})$/.exec(dr);
  if (range) {
    return { earliest: range[1], latest: range[2] };
  }
  return { earliest: "", latest: "" };
}

/** Lettering label; falls back to legacy combined `shape_lettering` when structured name is absent. */
function letteringField(record: PostmarkRecord): string {
  const letSt = record.letteringStyleName?.trim() ?? "";
  if (letSt) return letSt;
  return record.shapeLetteringDisplay?.trim() ?? "";
}

function framingField(record: PostmarkRecord): string {
  return record.framing?.trim() ?? "";
}

/** Values for the fixed catalog field block (search cards + record detail). */
export type CatalogFieldValues = {
  town: string;
  state: string;
  regionAbbrev: string;
  manuscript: string;
  postmarkTextLines: string[];
  postmarkTextSingle: string;
  /** Postmark shape / outline (API `shape` or postmark_shape name). */
  shape: string;
  lettering: string;
  framing: string;
  dimensions: string;
  color: string;
  datesSeen: string;
  earliestUse: string;
  latestUse: string;
};

export function buildCatalogFieldValues(record: PostmarkRecord): CatalogFieldValues {
  const combined =
    record.postmarkTextCombined?.trim() || postmarkTextFromRecord(record);
  const linesFromVariations = (record.postmarkTextVariations ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean);
  const postmarkTextLines =
    linesFromVariations.length > 0
      ? linesFromVariations
      : combined
        ? combined.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
        : [];
  const postmarkTextSingle =
    postmarkTextLines.length <= 1
      ? displayCatalogField(
          postmarkTextLines.length === 1 ? postmarkTextLines[0] : combined
        )
      : "";

  const dateParts = parseDateRangeParts(record.dateRange);
  const colorStr = record.color?.name?.trim() || "";

  return {
    town: displayCatalogField(record.town),
    state: displayCatalogField(record.state),
    regionAbbrev: displayCatalogField(record.regionAbbrev),
    manuscript: displayCatalogField(record.isManuscript ? "Yes" : "No"),
    postmarkTextLines: postmarkTextLines.length > 1 ? postmarkTextLines : [],
    postmarkTextSingle,
    shape: displayCatalogField(record.listingShape?.trim() || record.shapeName),
    lettering: displayCatalogField(letteringField(record)),
    framing: displayCatalogField(framingField(record)),
    dimensions: displayCatalogField(
      record.dimensionsDisplay?.trim() || record.sizeDisplay?.trim() || ""
    ),
    color: displayCatalogField(colorStr),
    datesSeen: displayCatalogField(
      record.datesSeenDisplay?.trim() || record.dateRange?.trim() || ""
    ),
    earliestUse: displayCatalogField(
      record.earliestUse?.trim() || dateParts.earliest
    ),
    latestUse: displayCatalogField(record.latestUse?.trim() || dateParts.latest),
  };
}

/** Search list card: field values plus title, image, and route id. */
export type CatalogSearchRowDisplay = CatalogFieldValues & {
  cardId: string;
  title: string;
  image: string | null;
  /** Optional 2nd image (gallery view shows two side-by-side); null when only one image exists. */
  image2: string | null;
  ratemarkCount: number;
  auxmarkCount: number;
};

/**
 * Build the search-listing title.
 * Format: `<post office>, <region abbrev> - "<inscription>"`.
 * Example: `Williamsburg, VA - "Wmsburg/VA"`.
 * Each segment is dropped if its source is empty; falls back to postmark_key
 * or CATALOG_FIELD_EMPTY when nothing is available.
 */
function buildSearchTitle(record: PostmarkRecord): string {
  const town = record.town?.trim() ?? "";
  const region = record.regionAbbrev?.trim() ?? "";
  const inscription = record.inscriptionTxt?.trim() ?? "";

  let location = "";
  if (town && region) location = `${town}, ${region}`;
  else if (town) location = town;
  else if (region) location = region;

  const inscriptionPart = inscription ? `"${inscription}"` : "";

  if (location && inscriptionPart) return `${location} - ${inscriptionPart}`;
  if (location) return location;
  if (inscriptionPart) return inscriptionPart;
  return record.postmarkKey?.trim() || CATALOG_FIELD_EMPTY;
}

export function buildCatalogSearchRow(record: PostmarkRecord): CatalogSearchRowDisplay {
  const fields = buildCatalogFieldValues(record);

  return {
    ...fields,
    cardId: `api-${record.id}`,
    title: buildSearchTitle(record),
    image: normalizeImageUrl(getPostmarkListImageUrl(record.mainImage)),
    image2: normalizeImageUrl(getPostmarkListImageUrl(record.secondImage ?? null)),
    ratemarkCount: typeof record.ratemarkCount === "number" ? record.ratemarkCount : 0,
    auxmarkCount: typeof record.auxmarkCount === "number" ? record.auxmarkCount : 0,
  };
}
