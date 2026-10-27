import type { Submission } from "@/lib/submission";
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
import type { CountyIntent } from "@/lib/contributionDisplay";
import type { ReferenceWorkRecord } from "@/services/referenceWorks";

type Data = Submission;

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
type FieldKeys = { name: string; keys: (keyof Submission)[]; emptyKeeps?: boolean };

const CITATION_KEYS: (keyof Submission)[] = ["reference_work_ids", "reference_work_details"];

const boundaryKeys = (prefix: "marking_erd" | "marking_lrd"): (keyof Submission)[] => [
  prefix, `${prefix}_granularity`, `${prefix}_unknown`,
  `${prefix}_date_year`, `${prefix}_date_month`, `${prefix}_date_day`,
];

const MARKING_FIELDS: FieldKeys[] = [
  { name: "catalogCode", keys: ["catalog_code"] },
  { name: "state", keys: ["state"] },
  // T70: "" means the edit says nothing about the county (approval leaves links alone).
  { name: "county", keys: ["county", "county_id"], emptyKeeps: true },
  { name: "town", keys: ["town"] },
  { name: "type", keys: ["type"] },
  { name: "inscription", keys: ["inscription_txt"] },
  { name: "manuscript", keys: ["is_manuscript"] },
  { name: "irregular", keys: ["is_irreg"] },
  { name: "shape", keys: ["shape", "shape_id"] },
  {
    name: "lettering",
    keys: [
      "lettering_style_id", "lettering_id", "lettering_style", "lettering_style_name", "lettering",
    ],
  },
  { name: "color", keys: ["color", "color_id"] },
  { name: "width", keys: ["width_mm"] },
  { name: "height", keys: ["height_mm"] },
  { name: "impression", keys: ["impression"] },
  { name: "rate", keys: ["rate_val"] },
  { name: "dateFmt", keys: ["date_fmt"] },
  { name: "description", keys: ["description"] },
  { name: "erd", keys: boundaryKeys("marking_erd") },
  { name: "lrd", keys: boundaryKeys("marking_lrd") },
  { name: "citations", keys: CITATION_KEYS },
];

const COVER_FIELDS: FieldKeys[] = [
  { name: "type", keys: ["type"], emptyKeeps: true },
  { name: "institutional", keys: ["is_institutional"], emptyKeeps: true },
  { name: "backstamp", keys: ["is_backstamp"], emptyKeeps: true },
  { name: "description", keys: ["description"] },
  { name: "citations", keys: CITATION_KEYS },
];

const COVER_DATE_KEYS: (keyof Submission)[] = [
  "cover_date_unknown", "cover_date_year", "cover_date_month", "cover_date_day",
  "cover_date", "cover_granularity",
];

const isEmpty = (value: unknown) => value == null || String(value).trim() === "";

function markingKeys(name: string): (keyof Submission)[] {
  const field = MARKING_FIELDS.find((f) => f.name === name);
  if (!field) throw new Error(`Unknown marking field "${name}"`);
  return field.keys;
}

function mentions(sd: Data, field: FieldKeys): boolean {
  return field.keys.some((key) => key in sd && !(field.emptyKeeps && isEmpty(sd[key])));
}

/** The baseline with each field the edit speaks to replaced by the edit's keys. */
function overlay(baseline: Data, sd: Data, fields: FieldKeys[]): Data {
  const merged: Data = { ...baseline };
  for (const field of fields) {
    if (!mentions(sd, field)) continue;
    for (const key of field.keys) delete merged[key];
    for (const key of field.keys) if (key in sd) Object.assign(merged, { [key]: sd[key] });
  }
  return merged;
}

const text = (value: unknown) => (value == null ? "" : String(value).trim());
const yesNo = (value: boolean | null) => (value == null ? "" : value ? "Yes" : "No");

/** "28.00" and "28" are the same size; compare sizes and rates as numbers. */
function canonicalNumbers(data: Data): Data {
  const out = { ...data };
  for (const key of ["width_mm", "height_mm", "rate_val"] as const) {
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

// T70: approval links a county only to a town that has none, and never
// replaces one. The server's verdict (county_intent) is the source of truth:
// it names the county from the Region and compares against the town the edit
// now points at, not the old town's baseline. Without a verdict the row only
// shows the two names.
function countyRow(
  current: Data,
  proposed: Data,
  currentName: string,
  proposedName: string,
  intent: CountyIntent | null | undefined,
): ComparisonRow {
  if (intent && (intent.countyId != null || intent.error)) {
    const shownCurrent = intent.townFound ? intent.currentCounty ?? "" : currentName;
    const shown = intent.countyName || proposedName;
    const changed = intent.willLink || (intent.valid && shown.toLowerCase() !== shownCurrent.toLowerCase()) || !!intent.error;
    return { key: "county", label: "County", current: shownCurrent, proposed: shown, changed, ...(changed ? { note: intent.note } : {}) };
  }
  const proposedId = text(proposed.county_id);
  const shown = proposedName || (proposedId ? `County #${proposedId}` : "");
  const sameById = proposedId !== "" && proposedId === text(current.county_id);
  if (sameById) return row("county", "County", currentName, currentName);
  return row("county", "County", currentName, shown);
}

export function compareMarkingEdit(
  baseline: Data,
  sd: Data,
  lookups: ContributionLookups,
  referenceWorks: ReferenceWorkRecord[],
  contributionId: number,
  countyIntent?: CountyIntent | null,
): ComparisonRow[] {
  // state_abbrev is a comparison aid, not a submit key the formatter knows.
  const { state_abbrev: stateAbbrev, ...current } = baseline;
  const proposed = overlay(current, sd, MARKING_FIELDS);
  if (proposed.is_manuscript === true || text(proposed.is_manuscript) === "true") {
    // Approval clears these for a manuscript whatever the edit says.
    for (const name of ["shape", "lettering", "irregular"]) {
      for (const key of markingKeys(name)) delete proposed[key];
    }
  }
  const before = submittedDataToFieldInput(canonicalNumbers(current), lookups, { contributionId });
  const after = submittedDataToFieldInput(canonicalNumbers(proposed), lookups, { contributionId });
  const added = "Approval adds this as a recorded date";

  // Either spelling of the current state is the same state.
  const sameStateByAbbrev =
    text(stateAbbrev) !== "" && text(stateAbbrev).toLowerCase() === after.state.toLowerCase();
  return [
    row("catalogCode", "Catalog code", text(current.catalog_code), text(proposed.catalog_code)),
    { ...row("state", "State", before.state, after.state), ...(sameStateByAbbrev ? { changed: false } : {}) },
    countyRow(current, proposed, before.county ?? "", after.county ?? "", countyIntent),
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
  for (const key of COVER_DATE_KEYS) if (key in sd) Object.assign(proposed, { [key]: sd[key] });
  const date = (data: Data) => formatPartialDateInput(partialDateInputFromSubmittedData(data));
  const bool = (value: unknown) =>
    value === true || text(value) === "true" ? "Yes" : value === false || text(value) === "false" ? "No" : "";

  return [
    row("type", "Type", coverTypeLabel(text(baseline.type)), coverTypeLabel(text(proposed.type))),
    row(
      "date", "Date", date(baseline), date(proposed),
      COVER_DATE_KEYS.some((key) => !isEmpty(sd[key])) ? undefined : "This edit has no date, so approval clears it",
    ),
    row("institutional", "Institutionally Owned", bool(baseline.is_institutional), bool(proposed.is_institutional)),
    row("backstamp", "Backstamp", bool(baseline.is_backstamp), bool(proposed.is_backstamp)),
    row("description", "Description", text(baseline.description), text(proposed.description)),
    row("citations", "Citations", citationText(baseline, referenceWorks), citationText(proposed, referenceWorks)),
  ];
}
