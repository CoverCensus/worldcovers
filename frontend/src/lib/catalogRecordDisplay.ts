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
  return record.framingStyleName?.trim() ?? "";
}

/** Values for the fixed catalog field block (search cards + record detail). */
export type CatalogFieldValues = {
  town: string;
  state: string;
  manuscript: string;
  postmarkTextLines: string[];
  postmarkTextSingle: string;
  /** Legacy “postmark type” / outline (API `type` or postmark_shape name). */
  type: string;
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
    manuscript: displayCatalogField(record.isManuscript ? "Yes" : "No"),
    postmarkTextLines: postmarkTextLines.length > 1 ? postmarkTextLines : [],
    postmarkTextSingle,
    type: displayCatalogField(record.listingType?.trim() || record.shapeName),
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
};

export function buildCatalogSearchRow(record: PostmarkRecord): CatalogSearchRowDisplay {
  const fields = buildCatalogFieldValues(record);
  return {
    ...fields,
    cardId: `api-${record.id}`,
    title: record.inscriptionTxt?.trim() || CATALOG_FIELD_EMPTY,
    image: normalizeImageUrl(getPostmarkListImageUrl(record.mainImage)),
  };
}
