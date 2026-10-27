import { isCoverSubmission as isCoverContributionData, type Submission } from "@/lib/submission";
/** Helpers to distinguish cover vs marking rows in Contribution.submitted_data. */
import {
  formatPartialDateInput,
  markingBoundaryDateInputFromSubmission,
  partialDateInputFromSubmittedData,
  type PartialDateInput,
} from "@/lib/partialDate";
import { formatSizeFromSubmittedData } from "@/lib/dimensionsMm";
import { ENTRY_LABELS } from "@/labels/entry";
import { COVER_TYPE_LABELS } from "@/lib/coverTypes";


export { isCoverSubmission as isCoverContributionData } from "@/lib/submission";

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
  sd: Submission,
): "Cover" | "Marking" {
  return isCoverContributionData(sd) ? "Cover" : "Marking";
}

export function parentMarkingIdFromContribution(sd: Submission): number | null {
  const raw = sd.parent_marking_id;
  if (raw == null || raw === "") return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function materializedCoverIdFromContribution(sd: Submission): number | null {
  const raw = sd.cover_id;
  if (raw == null || raw === "") return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function coverContributionDisplayName(
  sd: Submission,
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
  sd: Submission,
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
  submittedData: Submission;
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

function markingBoundaryDate(sd: Submission, prefix: "marking_erd" | "marking_lrd"): string {
  return formatPartialDateInput(markingBoundaryDateInputFromSubmission(sd, prefix));
}

function markingDateLabel(sd: Submission): string {
  const earliest =
    markingBoundaryDate(sd, "marking_erd") ||
    displayValue(sd.first_seen);
  const latest =
    markingBoundaryDate(sd, "marking_lrd") ||
    displayValue(sd.last_seen);
  if (earliest && latest && earliest !== latest) return `${earliest} - ${latest}`;
  if (earliest || latest) return earliest || latest;
  return displayValue(sd.date_range);
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
    const inscription = displayValue(sd.inscription_txt);
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

/**
 * The Cover a contributor submitted together with a new Marking (Trello T37),
 * read from submitted_data.pending_cover. Approval turns it into its own cover
 * contribution; until then it travels inside the Marking submission.
 */
export interface PendingCoverSummary {
  type: string;
  date: PartialDateInput;
  isInstitutional: boolean;
  isBackstamp: boolean;
  description: string;
  /** storage_filename of each saved upload, relative to the media root. */
  imageStorageFilenames: string[];
  noImage: boolean;
}

function truthy(v: unknown): boolean {
  return v === true || String(v ?? "").trim().toLowerCase() === "true";
}

export function pendingCoverFromSubmittedData(
  sd: Submission | null | undefined,
): PendingCoverSummary | null {
  const raw = sd?.pending_cover;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const pc = raw;
  const metas = pc.image_metas ?? [];
  return {
    type: String(pc.type ?? "").trim().toUpperCase(),
    date: partialDateInputFromSubmittedData(pc),
    isInstitutional: truthy(pc.is_institutional),
    isBackstamp: truthy(pc.is_backstamp),
    description: String(pc.description ?? ""),
    imageStorageFilenames: metas
      .map((m) => String(m?.storage_filename ?? "").replace(/^\/+/, ""))
      .filter((v) => v.length > 0),
    noImage: truthy(pc.no_cover_image),
  };
}

/** Set on the Marking submission once approval created its Cover submission. */
export function pendingCoverContributionIdFromSubmittedData(
  sd: Submission | null | undefined,
): number | null {
  const raw = sd?.pending_cover_contribution_id;
  if (raw == null || raw === "") return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Set on a cover contribution that approval created from a Marking submission. */
export function createdFromContributionIdFromSubmittedData(
  sd: Submission | null | undefined,
): number | null {
  const raw = sd?.created_from_contribution_id;
  if (raw == null || raw === "") return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Trello T70: a county the contributor typed because it was not in the list. Never applied by approval. */
export function countyProposedFromSubmittedData(
  sd: Submission | null | undefined,
): string {
  return String(sd?.county_proposed ?? "").trim();
}

/** Trello T70: the server's verdict on a submission's county (ContributionDetailSerializer.county_intent). */
export interface CountyIntent {
  countyId: number | null;
  countyName: string;
  valid: boolean;
  error: string | null;
  townFound: boolean;
  currentCounty: string | null;
  willLink: boolean;
  note: string;
  countyProposed: string;
}

export function countyIntentFromApi(raw: unknown): CountyIntent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => (v == null ? "" : String(v));
  return {
    countyId: typeof o.county_id === "number" ? o.county_id : null,
    countyName: str(o.county_name),
    valid: o.valid === true,
    error: o.error == null ? null : str(o.error),
    townFound: o.town_found === true,
    currentCounty: o.current_county == null ? null : str(o.current_county),
    willLink: o.will_link === true,
    note: str(o.note),
    countyProposed: str(o.county_proposed),
  };
}
