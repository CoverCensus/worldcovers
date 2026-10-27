import type { Submission } from "@/lib/submission";
// Adapter: turn a contribution's submitted_data blob into the structured
// MarkingFieldInput consumed by buildMarkingFields. The goal is that
// ContributionDetail renders the same field sequence as RecordDetail.
//
// Input is the shared Submission type, read at the API boundary.

import type { MarkingFieldInput } from "@/lib/markingFields";
import { formatRateValue } from "@/lib/rateDisplay";
import {
  formatPartialDateInput,
  markingBoundaryDateInputFromSubmission,
  formatDateSeenLike,
} from "@/lib/partialDate";
import { isTrueCircleShapeName } from "@/lib/shapeDisplay";
import { mapApiMarkingToRecord, type MarkingTypeValue } from "@/services/markings";

export interface ContributionLookups {
  letteringOptions: { id: number; name: string }[];
  dateFormatOptions: { id: number; name: string; description?: string }[];
}

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

function yearOnly(value: unknown): string {
  const s = toStr(value);
  if (!s) return "";
  const m = /^(\d{4})/.exec(s);
  return m ? m[1] : s;
}

function markingBoundaryDate(sd: Submission, prefix: "marking_erd" | "marking_lrd"): string {
  return formatPartialDateInput(markingBoundaryDateInputFromSubmission(sd, prefix));
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const s = toStr(value);
    if (s) return s;
  }
  return "";
}

function readEarliestLatest(sd: Submission): { earliest: string; latest: string } {
  const dr = toStr(sd.date_range);
  const drParts = dr ? dr.split(/\s*-\s*/).map((s) => s.trim()) : [];
  const erd = markingBoundaryDate(sd, "marking_erd");
  const lrd = markingBoundaryDate(sd, "marking_lrd");
  const e = erd || yearOnly(firstNonEmpty(sd.first_seen, drParts[0]));
  const l = lrd || yearOnly(firstNonEmpty(sd.last_seen, drParts[1]));
  return { earliest: e, latest: l };
}

function formatDimensions(sd: Submission, shapeName: string, isManuscript: boolean): string {
  const w = toStr(sd.width_mm);
  const h = toStr(sd.height_mm);
  if (!isManuscript && isTrueCircleShapeName(shapeName)) {
    const d = w || h;
    if (d) return `${d} mm diameter`;
    return "";
  }
  if (w && h) return `${w}x${h} mm`;
  if (w) return `${w} mm`;
  if (h) return `${h} mm`;
  return "";
}

function readImpression(sd: Submission): string {
  const s = toStr(sd.impression);
  if (!s) return "";
  if (s.toLowerCase() === "normal") return "";
  return s;
}

function readIsIrreg(sd: Submission): boolean | null {
  return sd.is_irreg === true;
}

function readLetteringId(sd: Submission): number | undefined {
  const direct =
    sd.lettering_style_id ??
    sd.lettering_id ??
    (typeof sd.lettering_style === "object" ? sd.lettering_style?.id : undefined);
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && direct.trim() !== "") {
    const n = parseInt(direct, 10);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

// Resolve "Lettering" display text: prefer the id lookup, fall back to the
// embedded *_name field if the id isn't usable, then to the bare "lettering"
// name the backend resolves the FK from. Returns "" when none is available
// (renderer prints "-").
function resolveLettering(sd: Submission, lookups: ContributionLookups): string {
  const id = readLetteringId(sd);
  if (id != null) {
    const opt = lookups.letteringOptions.find((o) => o.id === id);
    if (opt) return opt.name;
  }
  return toStr(sd.lettering_style_name ?? sd.lettering);
}

function resolveDateFormat(sd: Submission, lookups: ContributionLookups): string {
  const code = toStr(sd.date_fmt);
  if (!code) return "";
  const opt = lookups.dateFormatOptions.find(
    (o) =>
      String(o.description ?? "").trim().toLowerCase() === code.toLowerCase() ||
      String(o.name ?? "").trim().toLowerCase() === code.toLowerCase(),
  );
  return opt ? opt.name : code;
}

// The contributor's description is the analogue of RecordDetail's
// editor-only "Catalog text" field. Reference works are rendered
// separately via the contribution payload's reference_work_* keys.
function buildCatalogText(sd: Submission): string {
  return toStr(sd.description);
}

export function submittedDataToFieldInput(
  sd: Submission,
  lookups: ContributionLookups,
  opts: { contributionId: number },
): MarkingFieldInput {
  const rawType = toStr(sd.type);
  const type =
    normalizeMarkingType(rawType) ??
    (toStr(sd.rate_val) ? "RATEMARK" : null);

  const isManuscript = sd.is_manuscript === true;
  const shapeName = toStr(sd.shape);
  const { earliest, latest } = readEarliestLatest(sd);

  const lettering = resolveLettering(sd, lookups);

  return {
    type,
    isManuscript,
    state: toStr(sd.state),
    county: toStr(sd.county),
    town: toStr(sd.town),
    inscriptionTxt: toStr(sd.inscription_txt),
    earliestSeen: earliest,
    latestSeen: latest,
    datesSeen: mapApiMarkingToRecord({
      dates_seen: (Array.isArray(sd.marking_dates_seen) ? sd.marking_dates_seen : [])
        .map((date, index) => ({ ...date, id: index + 1 })),
    }).datesSeen.map(formatDateSeenLike).join(", "),
    shapeName,
    rateValFormatted: formatRateValue(toStr(sd.rate_val)),
    dateFmt: resolveDateFormat(sd, lookups),
    impression: readImpression(sd),
    isIrreg: readIsIrreg(sd),
    colorName: toStr(sd.color),
    letteringName: lettering,
    dimensions: formatDimensions(sd, shapeName, isManuscript),
    catalogTxt: buildCatalogText(sd),
    code: "",
  };
}
