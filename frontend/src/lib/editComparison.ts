// T39: what approving an edit would change, field by field.
//
// The API sends the target's current values (edit_baseline) in the same keys
// the edit forms submit. Approval merges an edit the RFC 7396 way: a field the
// edit leaves out keeps its current value, and an explicit "" clears it
// (contribution_apply._apply_marking_edit / _apply_cover_edit). So the
// proposed side is the baseline with the edit's fields laid over it, and both
// sides go through the same formatter so equal values print equally.
import { markingTypeLabel } from "@/lib/catalogRecordDisplay";
import {
  submittedDataToFieldInput,
  type ContributionLookups,
} from "@/lib/contributionToFields";
import { coverTypeLabel } from "@/lib/coverTypes";
import { formatPartialDateInput, partialDateInputFromSubmittedData } from "@/lib/partialDate";
import { submissionCitations } from "@/lib/submissionCitations";
import type { ReferenceWorkRecord } from "@/services/referenceWorks";

type Data = Record<string, unknown>;

export type ComparisonRow = {
  key: string;
  label: string;
  current: string;
  proposed: string;
  changed: boolean;
  /** Says what approval does when that differs from a plain replace. */
  note?: string;
};

/**
 * One field's submit keys. `emptyKeeps`: approval ignores an empty value for
 * this field (cover type, institutional, backstamp), so "" is not a clear.
 */
type FieldKeys = { name: string; keys: string[]; emptyKeeps?: boolean };

const CITATION_KEYS = [
  "reference_work_ids", "referenceWorkIds", "reference_work_ids[]",
  "reference_work_details", "referenceWorkDetails",
];

const boundaryKeys = (prefix: "marking_erd" | "marking_lrd", camel: string) => [
  prefix, `${prefix}_granularity`, `${prefix}_unknown`,
  `${prefix}_date_year`, `${prefix}_date_month`, `${prefix}_date_day`,
  camel, `${camel}Granularity`, `${camel}Unknown`,
  `${camel}DateYear`, `${camel}DateMonth`, `${camel}DateDay`,
];

const MARKING_FIELDS: FieldKeys[] = [
  { name: "catalogCode", keys: ["catalog_code", "catalogCode"] },
  { name: "state", keys: ["state"] },
  { name: "town", keys: ["town"] },
  { name: "type", keys: ["type", "marking_type", "markingType"] },
  { name: "inscription", keys: ["inscription_txt", "inscriptionTxt"] },
  { name: "manuscript", keys: ["is_manuscript", "isManuscript"] },
  { name: "irregular", keys: ["is_irreg", "isIrreg", "isIrregular"] },
  { name: "shape", keys: ["shape", "shape_id", "shapeId"] },
  {
    name: "lettering",
    keys: [
      "lettering_style_id", "letteringStyleId", "lettering_id", "lettering_style",
      "letteringStyle", "lettering_style_name", "letteringStyleName", "lettering",
    ],
  },
  { name: "color", keys: ["color", "color_id", "colorId"] },
  { name: "width", keys: ["width_mm", "widthMm"] },
  { name: "height", keys: ["height_mm", "heightMm"] },
  { name: "impression", keys: ["impression"] },
  { name: "rate", keys: ["rate_val", "rateVal"] },
  { name: "dateFmt", keys: ["date_fmt", "dateFmt"] },
  { name: "description", keys: ["desc", "description"] },
  { name: "erd", keys: boundaryKeys("marking_erd", "markingErd") },
  { name: "lrd", keys: boundaryKeys("marking_lrd", "markingLrd") },
  { name: "citations", keys: CITATION_KEYS },
];

const COVER_FIELDS: FieldKeys[] = [
  { name: "type", keys: ["type"], emptyKeeps: true },
  { name: "institutional", keys: ["is_institutional"], emptyKeeps: true },
  { name: "backstamp", keys: ["is_backstamp"], emptyKeeps: true },
  { name: "description", keys: ["description"] },
  { name: "citations", keys: CITATION_KEYS },
];

const COVER_DATE_KEYS = [
  "cover_date_unknown", "cover_date_year", "cover_date_month", "cover_date_day",
  "cover_date", "cover_granularity", "coverDate", "coverGranularity",
];

const isEmpty = (value: unknown) => value == null || String(value).trim() === "";

function mentions(sd: Data, field: FieldKeys): boolean {
  return field.keys.some((key) => key in sd && !(field.emptyKeeps && isEmpty(sd[key])));
}

/** The baseline with each field the edit speaks to replaced by the edit's keys. */
function overlay(baseline: Data, sd: Data, fields: FieldKeys[]): Data {
  const merged: Data = { ...baseline };
  for (const field of fields) {
    if (!mentions(sd, field)) continue;
    for (const key of field.keys) delete merged[key];
    for (const key of field.keys) if (key in sd) merged[key] = sd[key];
  }
  return merged;
}

const text = (value: unknown) => (value == null ? "" : String(value).trim());
const yesNo = (value: boolean | null) => (value == null ? "" : value ? "Yes" : "No");

/** "28.00" and "28" are the same size; compare sizes and rates as numbers. */
function canonicalNumbers(data: Data): Data {
  const out = { ...data };
  for (const key of ["width_mm", "widthMm", "height_mm", "heightMm", "rate_val", "rateVal"]) {
    const n = Number(text(out[key]));
    if (text(out[key]) && Number.isFinite(n)) out[key] = String(n);
  }
  return out;
}

function citationText(data: Data, referenceWorks: ReferenceWorkRecord[]): string {
  return submissionCitations(data, referenceWorks)
    .map((item) => {
      const name = item.referenceWork?.code || item.referenceWork?.title || `Reference ${item.id}`;
      return item.citationDetail ? `${name} (${item.citationDetail})` : name;
    })
    .sort()
    .join("; ");
}

function row(key: string, label: string, current: string, proposed: string, note?: string): ComparisonRow {
  const changed = current.toLowerCase() !== proposed.toLowerCase();
  return { key, label, current, proposed, changed, ...(changed && note ? { note } : {}) };
}

export function compareMarkingEdit(
  baseline: Data,
  sd: Data,
  lookups: ContributionLookups,
  referenceWorks: ReferenceWorkRecord[],
  contributionId: number,
): ComparisonRow[] {
  // state_abbrev is a comparison aid, not a submit key the formatter knows.
  const { state_abbrev: stateAbbrev, ...current } = baseline;
  const proposed = overlay(current, sd, MARKING_FIELDS);
  if (proposed.is_manuscript === true || text(proposed.is_manuscript) === "true") {
    // Approval clears these for a manuscript whatever the edit says.
    for (const name of ["shape", "lettering", "irregular"]) {
      for (const key of MARKING_FIELDS.find((f) => f.name === name)!.keys) delete proposed[key];
    }
  }
  const before = submittedDataToFieldInput(canonicalNumbers(current), lookups, { contributionId });
  const after = submittedDataToFieldInput(canonicalNumbers(proposed), lookups, { contributionId });
  const added = "Approval adds this as a recorded date";

  const rows = [
    row("catalogCode", "Catalog code", text(current.catalog_code), text(proposed.catalog_code)),
    row("state", "State", before.state, after.state),
    row("town", "Town", before.town, after.town),
    row("type", "Type", markingTypeLabel(before.type), markingTypeLabel(after.type)),
    row("inscription", "Inscription", before.inscriptionTxt, after.inscriptionTxt),
    row("manuscript", "Manuscript", yesNo(before.isManuscript), yesNo(after.isManuscript)),
    row("shape", "Shape", before.shapeName, after.shapeName),
    row("lettering", "Lettering style", before.letteringName, after.letteringName),
    row("irregular", "Irregular", yesNo(before.isIrreg), yesNo(after.isIrreg)),
    row("color", "Color", before.colorName, after.colorName),
    row("dimensions", "Dimensions", before.dimensions, after.dimensions),
    row("impression", "Impression", before.impression, after.impression),
    row("rate", "Rate Value", before.rateValFormatted, after.rateValFormatted),
    row("dateFmt", "Date format", before.dateFmt, after.dateFmt),
    row("description", "Description", before.catalogTxt, after.catalogTxt),
    row("erd", "Earliest Seen", before.earliestSeen, after.earliestSeen, added),
    row("lrd", "Latest Seen", before.latestSeen, after.latestSeen, added),
    row("citations", "Citations", citationText(current, referenceWorks), citationText(proposed, referenceWorks)),
  ];
  // Either spelling of the current state is the same state.
  const state = rows.find((r) => r.key === "state")!;
  if (state.changed && text(stateAbbrev).toLowerCase() === state.proposed.toLowerCase()) {
    state.changed = false;
  }
  return rows;
}

export function compareCoverEdit(
  baseline: Data,
  sd: Data,
  referenceWorks: ReferenceWorkRecord[],
): ComparisonRow[] {
  const proposed = overlay(baseline, sd, COVER_FIELDS);
  // Approval rebuilds the cover's date from the edit alone
  // (_sync_cover_date_seen), so an edit without a date clears it.
  for (const key of COVER_DATE_KEYS) delete proposed[key];
  for (const key of COVER_DATE_KEYS) if (key in sd) proposed[key] = sd[key];
  const date = (data: Data) => formatPartialDateInput(partialDateInputFromSubmittedData(data));
  const bool = (value: unknown) =>
    value === true || text(value) === "true" ? "Yes" : value === false || text(value) === "false" ? "No" : "";

  return [
    row("type", "Type", coverTypeLabel(text(baseline.type)), coverTypeLabel(text(proposed.type))),
    row(
      "date", "Date", date(baseline), date(proposed),
      COVER_DATE_KEYS.some((key) => key in sd) ? undefined : "This edit has no date, so approval clears it",
    ),
    row("institutional", "Institutionally Owned", bool(baseline.is_institutional), bool(proposed.is_institutional)),
    row("backstamp", "Backstamp", bool(baseline.is_backstamp), bool(proposed.is_backstamp)),
    row("description", "Description", text(baseline.description), text(proposed.description)),
    row("citations", "Citations", citationText(baseline, referenceWorks), citationText(proposed, referenceWorks)),
  ];
}
