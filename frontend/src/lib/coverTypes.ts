/**
 * Cover type vocabulary (Trello T67; Ian's 2026-09-23 "Cover Options" thread).
 *
 * One place for the codes, their labels and the form default. Before this,
 * six screens each carried an FC/FL ternary, and the edit form silently turned
 * any other stored value into FL. Order here is the order the form offers.
 * FC stays for the rows that already carry it.
 */
export const COVER_TYPE_LABELS: Readonly<Record<string, string>> = {
  FL: "Folded Letter",
  FLF: "Folded Letter Front",
  ENV: "Envelope",
  ENVF: "Envelope Front",
  FC: "Folded Cover",
  UNK: "Unknown",
};

export const COVER_TYPE_OPTIONS: readonly { value: string; label: string }[] = Object.entries(
  COVER_TYPE_LABELS,
).map(([value, label]) => ({ value, label: `${value} - ${label}` }));

/** A blank form claims nothing: a submitter who does not know picks Unknown. */
export const DEFAULT_COVER_TYPE = "UNK";

function code(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toUpperCase();
}

export function isCoverTypeCode(raw: string | null | undefined): boolean {
  return Object.prototype.hasOwnProperty.call(COVER_TYPE_LABELS, code(raw));
}

/** Human label for a code; the raw code when unrecognised; "" for blank. */
export function coverTypeLabel(raw: string | null | undefined): string {
  const c = code(raw);
  if (!c) return "";
  return COVER_TYPE_LABELS[c] ?? c;
}

/** A stored code is kept as it is; anything else falls back to the default. */
export function normalizeCoverType(raw: string | null | undefined): string {
  const c = code(raw);
  return isCoverTypeCode(c) ? c : DEFAULT_COVER_TYPE;
}
