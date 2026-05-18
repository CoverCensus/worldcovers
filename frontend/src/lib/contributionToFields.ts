// Adapter: turn a contribution's submitted_data blob into the structured
// MarkingFieldInput consumed by buildMarkingFields. The goal is that
// ContributionDetail renders the same field sequence as RecordDetail.
//
// Fail-loud policy: every key we read OR deliberately ignore is listed in
// KNOWN_SUBMITTED_DATA_KEYS. Any key we have not seen before causes the
// adapter to throw; ContributionDetail catches the throw and renders a
// visible error banner. This keeps the page from silently dropping fields
// when the backend payload grows.

import type { MarkingFieldInput } from "@/lib/markingFields";
import type { MarkingTypeValue } from "@/services/markings";

export interface ContributionLookups {
  letteringOptions: { id: number; name: string }[];
  framingOptions: { id: number; name: string }[];
  dateFormatOptions: { id: number; name: string; description?: string }[];
}

// Every submitted_data key the adapter knows about. Split into
// "consumed" (mapped into the field view) and "ignored" (meta keys that
// don't appear in the catalog field list -- comments, image arrays, etc.).
// To add a new field: add the key here AND map it inside
// submittedDataToFieldInput. To deliberately ignore a new meta key: add
// the key here only.
export const KNOWN_SUBMITTED_DATA_KEYS: ReadonlySet<string> = new Set([
  // consumed: identity / location / type
  "state",
  "town",
  "type",
  "marking_type", "markingType",
  "manuscript",
  "is_manuscript", "isManuscript",
  // consumed: inscription text
  "inscription_txt", "inscriptionTxt",
  // consumed: dates seen
  "first_seen", "firstSeen",
  "last_seen", "lastSeen",
  "date_range", "dateRange",
  "dates_observed", "datesObserved",
  // consumed: physical attributes
  "shape", "shape_id", "shapeId",
  "color", "color_id", "colorId",
  "rate_val", "rateVal",
  "impression",
  "is_irreg", "isIrreg", "isIrregular",
  "width_mm", "widthMm",
  "height_mm", "heightMm",
  "dimensions",
  // consumed: lookup-resolved fields (id forms + nested + name fallbacks)
  "lettering_style_id", "letteringStyleId",
  "lettering_id",
  "lettering_style", "letteringStyle",
  "lettering_style_name", "letteringStyleName",
  "framing_style_id", "framingStyleId",
  "framing_style_ids", "framingStyleIds",
  "framing_style", "framingStyle",
  "framing_name", "framingName",
  "framing",
  "date_format_id", "dateFormatId",
  "date_format_ids", "dateFormatIds",
  "date_format", "dateFormat",
  "date_fmt", "dateFmt",
  // consumed: free-text catalog suggestions from the contributor
  "description",
  "desc",
  "references",
  // ignored: contributor comments (rendered separately above the field list)
  "contributor_comment", "contributorComment",
  "comment_for_editor", "commentForEditor",
  "review_notes", "reviewNotes",
  "comment",
  // ignored: image payloads (rendered in the carousel above the field list)
  "image_meta",
  "image_metas", "imageMetas",
  "marking_images", "markingImages",
  "marking_image_metas", "markingImageMetas",
  "marking_image_tags", "markingImageTags",
  "cover_image_metas", "coverImageMetas",
  "cover_image_tags", "coverImageTags",
  "postmark_images", "postmarkImages", "PostmarkImages",
  "ratemark_images", "ratemarkImages", "RatemarkImages",
  "auxmark_images", "auxmarkImages", "AuxmarkImages",
  // ignored: bookkeeping that doesn't appear in the field list
  "submitter_name", "submitterName",
  "original_postmark_id", "originalPostmarkId",
  "post_office_id", "postOfficeId",
  "submission_kind", "submissionKind",
  "entity_type", "entityType",
  "routing_deferred", "routingDeferred",
  // ignored: submit-mode controls that older rows captured into
  // submitted_data before the backend started stripping them.
  "save_as_draft", "saveAsDraft",
  "status",
  // ignored: reference-work payload from the contribute form
  "reference_work_ids", "referenceWorkIds",
  "reference_work_ids[]",
  "reference_work_details", "referenceWorkDetails",
]);

function toStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function normalizeMarkingType(raw: string): MarkingTypeValue | null {
  const v = raw.toLowerCase().replace(/[\s/_-]+/g, "");
  if (v === "townmark") return "TOWNMARK";
  if (v === "ratemark") return "RATEMARK";
  if (v.includes("aux")) return "AUXMARK";
  return null;
}

function isManuscriptValue(sd: Record<string, unknown>): boolean {
  if (sd.is_manuscript === true || sd.isManuscript === true) return true;
  const ms = toStr(sd.manuscript).toLowerCase();
  return ms === "yes" || ms === "true";
}

function formatRateValue(raw: unknown): string {
  const s = toStr(raw);
  if (!s) return "";
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return "";
  return (n / 100).toFixed(2);
}

function yearOnly(value: unknown): string {
  const s = toStr(value);
  if (!s) return "";
  const m = /^(\d{4})/.exec(s);
  return m ? m[1] : s;
}

function readEarliestLatest(sd: Record<string, unknown>): { earliest: string; latest: string } {
  const dr = toStr(sd.date_range ?? sd.dateRange);
  const drParts = dr ? dr.split(/\s*-\s*/).map((s) => s.trim()) : [];
  const e = yearOnly(sd.first_seen ?? sd.firstSeen ?? drParts[0]);
  const l = yearOnly(sd.last_seen ?? sd.lastSeen ?? drParts[1]);
  return { earliest: e, latest: l };
}

function isCircleShape(name: string): boolean {
  const s = name.toLowerCase();
  if (!s) return false;
  if (s === "c - circle") return true;
  return s.includes("circle");
}

function formatDimensions(sd: Record<string, unknown>, shapeName: string, isManuscript: boolean): string {
  const w = toStr(sd.width_mm ?? sd.widthMm);
  const h = toStr(sd.height_mm ?? sd.heightMm);
  if (!isManuscript && isCircleShape(shapeName)) {
    const d = w || h;
    if (d) return `${d} mm diameter`;
    return "";
  }
  if (w && h) return `${w}x${h} mm`;
  if (w) return `${w} mm`;
  if (h) return `${h} mm`;
  const leg = toStr(sd.dimensions);
  return leg;
}

function readImpression(sd: Record<string, unknown>): string {
  const s = toStr(sd.impression);
  if (!s) return "";
  if (s.toLowerCase() === "normal") return "";
  return s;
}

function readIsIrreg(sd: Record<string, unknown>): boolean | null {
  if (sd.is_irreg === true || sd.isIrreg === true || sd.isIrregular === true) return true;
  if (sd.is_irreg === false || sd.isIrreg === false || sd.isIrregular === false) return false;
  return null;
}

function readNestedId(value: unknown, snake: string, camel: string): number | undefined {
  if (value == null || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  const v = obj[snake] ?? obj[camel];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function readLetteringId(sd: Record<string, unknown>): number | undefined {
  const direct =
    sd.lettering_style_id ??
    sd.letteringStyleId ??
    sd.lettering_id ??
    readNestedId(sd.lettering_style, "lettering_style_id", "letteringStyleId") ??
    readNestedId(sd.letteringStyle, "lettering_style_id", "letteringStyleId");
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && direct.trim() !== "") {
    const n = parseInt(direct, 10);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function readFramingIds(sd: Record<string, unknown>): number[] {
  const arr = Array.isArray(sd.framing_style_ids)
    ? sd.framing_style_ids
    : Array.isArray(sd.framingStyleIds)
      ? sd.framingStyleIds
      : null;
  if (arr) {
    return arr
      .map((x) => (typeof x === "number" ? x : typeof x === "string" ? parseInt(x, 10) : NaN))
      .filter((x): x is number => !Number.isNaN(x));
  }
  const single =
    sd.framing_style_id ??
    sd.framingStyleId ??
    readNestedId(sd.framing_style, "framing_style_id", "framingStyleId") ??
    readNestedId(sd.framingStyle, "framing_style_id", "framingStyleId");
  if (typeof single === "number") return [single];
  if (typeof single === "string" && single.trim() !== "") {
    const n = parseInt(single, 10);
    return Number.isNaN(n) ? [] : [n];
  }
  return [];
}

function readDateFormatId(sd: Record<string, unknown>): number | undefined {
  const arr = Array.isArray(sd.date_format_ids)
    ? sd.date_format_ids
    : Array.isArray(sd.dateFormatIds)
      ? sd.dateFormatIds
      : null;
  if (arr && arr.length > 0) {
    const first = arr[0];
    if (typeof first === "number") return first;
    if (typeof first === "string" && first.trim() !== "") {
      const n = parseInt(first, 10);
      return Number.isNaN(n) ? undefined : n;
    }
  }
  const direct =
    sd.date_format_id ??
    sd.dateFormatId ??
    readNestedId(sd.date_format, "date_format_id", "dateFormatId") ??
    readNestedId(sd.dateFormat, "date_format_id", "dateFormatId");
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && direct.trim() !== "") {
    const n = parseInt(direct, 10);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

// Resolve "Lettering" display text: prefer the id lookup, fall back to the
// embedded *_name field if the id isn't usable. Returns "" when neither is
// available (renderer prints "-").
function resolveLettering(sd: Record<string, unknown>, lookups: ContributionLookups): string {
  const id = readLetteringId(sd);
  if (id != null) {
    const opt = lookups.letteringOptions.find((o) => o.id === id);
    if (opt) return opt.name;
  }
  return toStr(sd.lettering_style_name ?? sd.letteringStyleName);
}

function resolveFraming(sd: Record<string, unknown>, lookups: ContributionLookups): string {
  const ids = readFramingIds(sd);
  if (ids.length > 0) {
    const names = ids
      .map((id) => lookups.framingOptions.find((o) => o.id === id)?.name ?? "")
      .filter((s) => s.length > 0);
    if (names.length > 0) return names.join(", ");
  }
  return toStr(sd.framing_name ?? sd.framingName ?? sd.framing);
}

function resolveDateFormat(sd: Record<string, unknown>, lookups: ContributionLookups): string {
  const id = readDateFormatId(sd);
  if (id != null) {
    const opt = lookups.dateFormatOptions.find((o) => o.id === id);
    if (opt) return opt.name;
  }
  return toStr(sd.date_fmt ?? sd.dateFmt);
}

// Combine the contributor's description (free text catalog suggestion) with
// references into a single "Catalog text" block. RecordDetail's "Catalog
// text" field is editor-only; the analogue from a contribution is the
// description the contributor filled in.
function buildCatalogText(sd: Record<string, unknown>): string {
  const desc = toStr(sd.description ?? sd.desc);
  const refs = toStr(sd.references);
  const parts: string[] = [];
  if (desc) parts.push(desc);
  if (refs) parts.push(`References: ${refs}`);
  return parts.join("\n\n");
}

// Lettering / Framing are presented under a single "Lettering" row in the
// canonical field list (RecordDetail only shows lettering, not framing).
// Show framing inline so it isn't silently dropped from a contribution
// review.
function combineLetteringAndFraming(lettering: string, framing: string): string {
  if (lettering && framing) return `${lettering} (${framing})`;
  return lettering || framing;
}

export function submittedDataToFieldInput(
  sd: Record<string, unknown>,
  lookups: ContributionLookups,
  opts: { contributionId: number },
): MarkingFieldInput {
  // Strict allowlist check first. Any unrecognized key is a programmer
  // signal that the contribution payload has grown and the adapter needs
  // to be updated. Throwing surfaces the gap visibly in the UI rather
  // than silently dropping the data.
  for (const key of Object.keys(sd)) {
    if (!KNOWN_SUBMITTED_DATA_KEYS.has(key)) {
      throw new Error(
        `Unknown submitted_data key "${key}" on contribution ${opts.contributionId}. ` +
          `Add the key to KNOWN_SUBMITTED_DATA_KEYS in lib/contributionToFields.ts ` +
          `and either map it in submittedDataToFieldInput or list it as deliberately ignored.`,
      );
    }
  }

  const rawType = toStr(sd.type ?? sd.marking_type ?? sd.markingType);
  const type =
    normalizeMarkingType(rawType) ??
    (toStr(sd.rate_val ?? sd.rateVal) ? "RATEMARK" : null);

  const isManuscript = isManuscriptValue(sd);
  const shapeName = toStr(sd.shape);
  const { earliest, latest } = readEarliestLatest(sd);

  const lettering = resolveLettering(sd, lookups);
  const framing = resolveFraming(sd, lookups);

  return {
    type,
    isManuscript,
    state: toStr(sd.state),
    town: toStr(sd.town),
    inscriptionTxt: toStr(sd.inscription_txt ?? sd.inscriptionTxt),
    earliestSeen: earliest,
    latestSeen: latest,
    shapeName,
    rateValFormatted: formatRateValue(sd.rate_val ?? sd.rateVal),
    dateFmt: resolveDateFormat(sd, lookups),
    impression: readImpression(sd),
    isIrreg: readIsIrreg(sd),
    colorName: toStr(sd.color),
    letteringName: combineLetteringAndFraming(lettering, framing),
    dimensions: formatDimensions(sd, shapeName, isManuscript),
    catalogTxt: buildCatalogText(sd),
    code: "",
  };
}
