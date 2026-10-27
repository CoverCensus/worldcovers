import { isCoverTypeCode } from "@/lib/coverTypes";
import { partialDateInputFromSubmittedData } from "@/lib/partialDate";

// The proposed content of a Submission. The Contribution holds its author,
// status, and review history. Drafts and edits can omit fields; an explicit
// empty value can clear a field. Keep that distinction when reading or sending.
//
// These field readers define both the runtime boundary and the TypeScript
// type. Pages use the resulting Submission, never a second list of JSON keys.

type Reader<T> = (value: unknown, path: string, unsupported: string[]) => T;
type Field<T> = { read: Reader<T>; aliases: string[] };
type Fields = Record<string, Field<unknown>>;
type ReadFields<S extends Fields> = { [K in keyof S]?: ReturnType<S[K]["read"]> | null };

function field<T>(read: Reader<T>, ...aliases: string[]): Field<T> {
  return { read, aliases };
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Submission field: ${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  throw new Error(`Invalid Submission field: ${path} must be text.`);
}

function number(value: unknown, path: string): number | string {
  if (value === "") return "";
  if ((typeof value === "number" || typeof value === "string") && Number.isFinite(Number(value))) {
    return value;
  }
  throw new Error(`Invalid Submission field: ${path} must be a number.`);
}

function boolean(value: unknown, path: string): boolean | "" {
  if (value === "") return "";
  if (typeof value === "boolean") return value;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : value;
  if (normalized === 1 || normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === 0 || normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  throw new Error(`Invalid Submission field: ${path} must be true or false.`);
}

function json(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function kind(value: unknown, path: string): "marking" | "cover" | "" {
  const name = text(value, path).trim().toLowerCase();
  if (name === "marking" || name === "cover" || name === "") return name;
  throw new Error(`Invalid Submission field: ${path} must be marking or cover.`);
}

function array<T>(read: Reader<T>): Reader<T[]> {
  return (value, path, unsupported) => {
    const rows = json(value);
    if (!Array.isArray(rows)) throw new Error(`Invalid Submission field: ${path} must be a list.`);
    return rows.map((row, index) => read(row, `${path}[${index}]`, unsupported));
  };
}

function readFields<S extends Fields>(value: unknown, fields: S, path: string, unsupported: string[]): ReadFields<S> {
  const raw = object(value, path);
  const result: Record<string, unknown> = {};
  const recognized = new Set<string>();
  for (const [key, spec] of Object.entries(fields)) {
    const camel = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const names = [key, camel, ...spec.aliases];
    names.forEach((name) => recognized.add(name));
    // Canonical keys win, including explicit null and empty values.
    const name = names.find((candidate) => Object.prototype.hasOwnProperty.call(raw, candidate) && raw[candidate] !== undefined);
    if (name === undefined) continue;
    result[key] = raw[name] === null ? null : spec.read(raw[name], `${path}.${key}`, unsupported);
  }
  for (const key of Object.keys(raw)) {
    if (!recognized.has(key)) unsupported.push(`${path}.${key}`);
  }
  // Only this boundary constructs typed data from an external object.
  return result as ReadFields<S>;
}

const imageFields = {
  storage_filename: field(text), original_filename: field(text),
  image_description: field(text), image_width: field(number), image_height: field(number),
  url: field(text, "image_url", "imageUrl", "public_url", "publicUrl"),
  image_tag: field(text), is_tracing: field(boolean),
  file_checksum: field(text), mime_type: field(text), file_size_bytes: field(number), tracing: field(boolean),
};
export type SubmissionImage = ReadFields<typeof imageFields>;
const image: Reader<SubmissionImage> = (value, path, unsupported) => readFields(value, imageFields, path, unsupported);

const imageUrl: Reader<string> = (value, path, unsupported) =>
  typeof value === "string" ? value : image(value, path, unsupported).url ?? "";

const dateFields = {
  date_year: field(number), date_month: field(number), date_day: field(number),
  date: field(text), granularity: field(text),
};
const date = (value: unknown, path: string, unsupported: string[]) => readFields(value, dateFields, path, unsupported);

const coverFields = {
  type: field(text), cover_date: field(text), cover_granularity: field(text),
  cover_date_unknown: field(boolean), cover_date_year: field(number),
  cover_date_month: field(number), cover_date_day: field(number),
  is_institutional: field(boolean), is_backstamp: field(boolean),
  description: field(text), no_cover_image: field(boolean), image_metas: field(array(image)),
};
export type PendingCoverSubmission = ReadFields<typeof coverFields>;

const provenanceFields = {
  src: field(text), cancel_no: field(text), vphc_code: field(text),
  rules_version: field(text), why_unmatched: field(text), flags: field(array(text)),
  county: field(text), state: field(text),
};

const referenceFields = {
  reference_work_id: field(number), page_number: field(text), url: field(text),
};
export type SubmissionReference = ReadFields<typeof referenceFields>;

function references(value: unknown, path: string, unsupported: string[]) {
  const parsed = json(value);
  const rows = Array.isArray(parsed) ? parsed : Object.entries(object(parsed, path))
    .map(([id, detail]) => ({ ...object(detail, path), reference_work_id: id }));
  return rows.map((row, index) => readFields(row, referenceFields, `${path}[${index}]`, unsupported));
}

function referenceIds(value: unknown): number[] {
  const parsed = json(value);
  const rows = Array.isArray(parsed) ? parsed.flat() : String(parsed ?? "").split(",");
  return [...new Set(rows.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function textMap(value: unknown, path: string): Record<string, string> {
  return Object.fromEntries(Object.entries(object(json(value), path)).map(([key, item]) => [key, text(item, path)]));
}

const lookupFields = { id: field(number, "lettering_style_id", "letteringStyleId"), name: field(text) };

function lookup(value: unknown, path: string, unsupported: string[]): string | number | ReadFields<typeof lookupFields> {
  if (typeof value === "string" || typeof value === "number") return value;
  return readFields(value, lookupFields, path, unsupported);
}

const submissionFields = {
  ...coverFields,
  submission_kind: field(kind), entity_type: field(kind),
  state: field(text), state_abbrev: field(text), town: field(text),
  county: field(text), county_id: field(number), county_proposed: field(text),
  type: field(text, "marking_type", "markingType"),
  inscription_txt: field(text), is_manuscript: field(boolean), is_irreg: field(boolean, "isIrregular"),
  shape: field(text), shape_id: field(number), color: field(text), color_id: field(number),
  width_mm: field(text, "width"), height_mm: field(text, "height"), dimensions: field(text),
  rate_val: field(text), impression: field(text),
  lettering_id: field(number), lettering_style_id: field(number), lettering_style: field(lookup),
  lettering_style_name: field(text), lettering: field(text), date_fmt: field(text),
  description: field(text, "desc"),
  first_seen: field(text), last_seen: field(text), date_range: field(text), dates_observed: field(text),
  marking_dates_seen: field(array(date)),
  marking_erd: field(text), marking_erd_granularity: field(text), marking_erd_unknown: field(boolean),
  marking_erd_date_year: field(number), marking_erd_date_month: field(number), marking_erd_date_day: field(number),
  marking_lrd: field(text), marking_lrd_granularity: field(text), marking_lrd_unknown: field(boolean),
  marking_lrd_date_year: field(number), marking_lrd_date_month: field(number), marking_lrd_date_day: field(number),
  has_adhesive: field(boolean), placement: field(text),
  contributor_comment: field(text, "comment_for_editor", "commentForEditor", "comment"),
  review_notes: field(text), display_submitter_name: field(boolean), no_marking_image: field(boolean),
  image_meta: field(image),
  marking_image_metas: field(array(image)), cover_image_metas: field(array(image)),
  marking_images: field(array(imageUrl)), ratemark_images: field(array(imageUrl), "RatemarkImages"),
  auxmark_images: field(array(imageUrl), "AuxmarkImages"),
  marking_image_tags: field(array(text)), cover_image_tags: field(array(text)),
  existing_image_tags: field(textMap),
  removed_existing_image_keys: field(array(text)),
  post_office_id: field(number), original_marking_id: field(number),
  edit_marking_id: field(number), marking_modified_at_baseline: field(text),
  parent_marking_id: field(number, "marking_id"), cover_id: field(number),
  edit_cover_id: field(number), edit_cover_marking_id: field(number),
  materialized_cover_marking_id: field(number, "cover_marking_id", "coverMarkingId"),
  source_marking_image_id: field(number), source_marking_image_position: field(number),
  routing_deferred: field(boolean),
  catalog_code: field(text, "code"), catalog_code_source: field(text),
  catalog_code_reference_code: field(text), catalog_code_region_abbrev: field(text),
  reference_work_ids: field(referenceIds, "reference_work_ids[]"), reference_work_details: field(references),
  pending_cover: field((value, path, unsupported) => readFields(json(value), coverFields, path, unsupported)),
  pending_cover_contribution_id: field(number), created_from_contribution_id: field(number),
  vphc: field((value, path, unsupported) => readFields(value, provenanceFields, path, unsupported)),
  // Older saved rows contain these submit controls.
  save_as_draft: field(boolean), status: field(text),
};

export type Submission = ReadFields<typeof submissionFields>;

export function isCoverSubmission(sd: Submission | null | undefined): boolean {
  if (!sd || typeof sd !== "object") return false;
  const kind = String(sd.submission_kind ?? "")
    .trim()
    .toLowerCase();
  if (kind === "cover") return true;
  if (kind === "marking") return false;

  const type = String(sd.type ?? "")
    .trim()
    .toUpperCase();
  const hasCoverType = isCoverTypeCode(type);
  const hasMarkingType =
    type === "TOWNMARK" || type === "RATEMARK" || type === "AUXMARK";
  const hasTown = String(sd.town ?? "").trim().length > 0;
  const parentRaw = sd.parent_marking_id;
  const hasParent =
    parentRaw != null && String(parentRaw).trim() !== "" && String(parentRaw) !== "0";
  const partialDate = partialDateInputFromSubmittedData(sd);
  const hasCoverDate =
    partialDate.unknown || partialDate.year.length > 0 || partialDate.month.length > 0 || partialDate.day.length > 0;

  return Boolean(hasParent && (hasCoverType || hasCoverDate) && !hasTown && !hasMarkingType);
}


export type SubmissionRead = { data: Submission; unsupported: string[] };

/** Read API data once. Extra fields do not erase recognized review content. */
export function readSubmission(value: unknown): SubmissionRead {
  const unsupported: string[] = [];
  const data = readFields(value ?? {}, submissionFields, "Submission", unsupported);
  // Django uses a nonempty desc before description for Markings. Covers use
  // description. Match that rule when an older record has both names.
  const raw = object(value ?? {}, "Submission");
  if (!isCoverSubmission(data) && raw.desc) data.description = text(raw.desc, "Submission.desc");
  return { data, unsupported };
}

// Request controls are not proposed catalog fields. File bytes travel only in
// multipart requests. JSON and multipart forms use the same typed field names.
export type SubmissionRequest = Submission & {
  desc?: string;
  comment_for_editor?: string;
  marking_id?: number | string;
  edit_contribution_id?: number;
  abandon_draft?: boolean;
  drop_pending_cover?: boolean;
  pending_cover_removed_image_keys?: string[];
  removed_existing_image_keys?: string[];
  image_order?: string[];
  marking_image_descriptions?: string[];
  cover_image_descriptions?: string[];
  existing_image_descriptions?: Record<string, string>;
};

type UploadKey = "marking_image" | "cover_image" | "pending_cover_image";

/** Typed multipart writer; only this transport boundary uses FormData.append. */
export class SubmissionFormData extends FormData {
  append(name: keyof SubmissionRequest | "reference_work_ids[]" | UploadKey, value: string | Blob, filename?: string): void {
    if (typeof value === "string") super.append(name, value);
    else if (filename === undefined) super.append(name, value);
    else super.append(name, value, filename);
  }
}
