/** Helpers to distinguish cover vs marking rows in Contribution.submitted_data. */
import {
  formatPartialDateInput,
  partialDateInputFromPayload,
  partialDateInputFromSubmittedData,
} from "@/lib/partialDate";
import { formatSizeFromSubmittedData } from "@/lib/dimensionsMm";
import { ENTRY_LABELS } from "@/labels/entry";

const COVER_TYPE_LABELS: Record<string, string> = {
  FC: "Folded Cover",
  FL: "Folded Letter",
};

export function isCoverContributionData(sd: Record<string, unknown> | null | undefined): boolean {
  if (!sd || typeof sd !== "object") return false;
  const kind = String(sd.submission_kind ?? sd.submissionKind ?? "")
    .trim()
    .toLowerCase();
  if (kind === "cover") return true;
  if (kind === "marking") return false;

  const type = String(sd.type ?? "")
    .trim()
    .toUpperCase();
  const hasCoverType = type === "FC" || type === "FL";
  const hasMarkingType =
    type === "TOWNMARK" || type === "RATEMARK" || type === "AUXMARK";
  const hasTown = String(sd.town ?? "").trim().length > 0;
  const parentRaw = sd.parent_marking_id ?? sd.marking_id ?? sd.parentMarkingId;
  const hasParent =
    parentRaw != null && String(parentRaw).trim() !== "" && String(parentRaw) !== "0";
  const partialDate = partialDateInputFromSubmittedData(sd);
  const hasCoverDate =
    partialDate.unknown || partialDate.year.length > 0 || partialDate.month.length > 0 || partialDate.day.length > 0;

  return Boolean(hasParent && (hasCoverType || hasCoverDate) && !hasTown && !hasMarkingType);
}

/**
 * "Cover" or "Marking" for a contribution -- Ian, 2026-09-21: "from this I do
 * not know if it is a cover he is submitting or a marking. Could it say which
 * it is on the screen".
 *
 * Deliberately the same predicate `ContributionDetail` dispatches on, so the
 * label and the screen can never disagree. If the heuristic below is ever
 * wrong, the badge is wrong in the same direction -- which makes the
 * misclassification visible and reportable instead of silent.
 */
export function entryKindForContribution(
  sd: Record<string, unknown>,
): "Cover" | "Marking" {
  return isCoverContributionData(sd) ? "Cover" : "Marking";
}

export function parentMarkingIdFromContribution(sd: Record<string, unknown>): number | null {
  const raw = sd.parent_marking_id ?? sd.marking_id ?? sd.parentMarkingId;
  if (raw == null || raw === "") return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function materializedCoverIdFromContribution(sd: Record<string, unknown>): number | null {
  const raw = sd.cover_id ?? sd.coverId;
  if (raw == null || raw === "") return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function coverContributionDisplayName(
  sd: Record<string, unknown>,
  contributionId: number,
  parentLocation?: { town?: string | null; state?: string | null },
): string {
  const typeCode = String(sd.type ?? "").trim().toUpperCase();
  const typeLabel = COVER_TYPE_LABELS[typeCode] || typeCode || "Cover";
  const date = formatPartialDateInput(partialDateInputFromSubmittedData(sd));
  const town = String(sd.town ?? "").trim() || parentLocation?.town?.trim() || "";
  const state = String(sd.state ?? "").trim() || parentLocation?.state?.trim() || "";
  const location = [town, state].filter(Boolean).join(", ");
  const parts = [location, typeLabel];
  if (date) parts.push(date);
  const label = parts.filter(Boolean).join(" - ");
  return label || `Submission #${contributionId}`;
}

export function coverContributionDisplayLabel(
  contribution: { displayName?: unknown; display_name?: unknown },
  sd: Record<string, unknown>,
  contributionId: number,
  parentLocation?: { town?: string | null; state?: string | null },
): string {
  return (
    String(contribution.displayName ?? contribution.display_name ?? "").trim() ||
    coverContributionDisplayName(sd, contributionId, parentLocation)
  );
}

const MARKING_TYPE_LABELS: Record<string, string> = {
  TOWNMARK: ENTRY_LABELS.markingType.TOWNMARK,
  RATEMARK: ENTRY_LABELS.markingType.RATEMARK,
  AUXMARK: ENTRY_LABELS.markingType.AUXMARK,
};

export interface ContributionCardField {
  label: string;
  value: string;
}

export interface ContributionCardPresentation {
  entryKind: "Cover" | "Marking";
  title: string;
  fields: ContributionCardField[];
}

interface ContributionCardPresentationInput {
  id: number;
  submittedData: Record<string, unknown>;
  town?: unknown;
  state?: unknown;
  type?: unknown;
  shape?: unknown;
  color?: unknown;
  size?: unknown;
}

function displayValue(value: unknown): string {
  const text = String(value ?? "").trim();
  return text === "-" || text.toLowerCase() === "unknown" ? "" : text;
}

function markingBoundaryDate(
  sd: Record<string, unknown>,
  prefix: "marking_erd" | "marking_lrd",
): string {
  const camelPrefix = prefix === "marking_erd" ? "markingErd" : "markingLrd";
  return formatPartialDateInput(
    partialDateInputFromPayload(
      sd,
      {
        unknown: `${prefix}_unknown`,
        year: `${prefix}_date_year`,
        month: `${prefix}_date_month`,
        day: `${prefix}_date_day`,
        legacyDate: prefix,
        legacyGranularity: `${prefix}_granularity`,
      },
      {
        unknown: `${camelPrefix}Unknown`,
        year: `${camelPrefix}DateYear`,
        month: `${camelPrefix}DateMonth`,
        day: `${camelPrefix}DateDay`,
        legacyDate: camelPrefix,
        legacyGranularity: `${camelPrefix}Granularity`,
      },
    ),
  );
}

function markingDateLabel(sd: Record<string, unknown>): string {
  const earliest =
    markingBoundaryDate(sd, "marking_erd") ||
    displayValue(sd.first_seen ?? sd.firstSeen);
  const latest =
    markingBoundaryDate(sd, "marking_lrd") ||
    displayValue(sd.last_seen ?? sd.lastSeen);
  if (earliest && latest && earliest !== latest) return `${earliest} - ${latest}`;
  if (earliest || latest) return earliest || latest;
  return displayValue(sd.date_range ?? sd.dateRange);
}

export function contributionCardPresentation({
  id,
  submittedData: sd,
  town,
  state,
  type,
  shape,
  color,
  size,
}: ContributionCardPresentationInput): ContributionCardPresentation {
  const isCover = isCoverContributionData(sd);
  const entryKind = isCover ? "Cover" : "Marking";
  const locationTown = displayValue(town) || displayValue(sd.town);
  const locationState = displayValue(state) || displayValue(sd.state);
  const title = [locationTown, locationState].filter(Boolean).join(", ") || `Submission #${id}`;
  const rawType = displayValue(type) || displayValue(sd.type).toUpperCase();
  const typeLabel = isCover
    ? COVER_TYPE_LABELS[rawType.toUpperCase()] || rawType
    : MARKING_TYPE_LABELS[rawType.toUpperCase()] || rawType;
  const fields: ContributionCardField[] = [];

  if (typeLabel) {
    fields.push({ label: isCover ? "Cover type" : "Marking type", value: typeLabel });
  }

  if (isCover) {
    const coverDate = formatPartialDateInput(partialDateInputFromSubmittedData(sd));
    if (coverDate) fields.push({ label: "Cover date", value: coverDate });
  } else {
    const inscription = displayValue(sd.inscription_txt ?? sd.inscriptionTxt);
    const dateSeen = markingDateLabel(sd);
    const shapeLabel = displayValue(shape) || displayValue(sd.shape);
    const sizeLabel = displayValue(size) || formatSizeFromSubmittedData(sd);
    const colorLabel = displayValue(color) || displayValue(sd.color);
    if (inscription) fields.push({ label: "Inscription", value: `"${inscription}"` });
    if (dateSeen) fields.push({ label: "Date seen", value: dateSeen });
    if (shapeLabel) fields.push({ label: "Shape", value: shapeLabel });
    if (sizeLabel) fields.push({ label: "Size", value: sizeLabel });
    if (colorLabel) fields.push({ label: "Colour", value: colorLabel });
  }

  return { entryKind, title, fields };
}
