/**
 * The date part of a PostmasterTenure write (Trello T71).
 *
 * The API stores a date plus the precision the source stated (YEAR, MONTH or
 * DAY). The form collects month / day / year through PartialDateFields; this
 * turns those parts into the payload, or says why it cannot. A postmaster
 * date always needs a year: a month or day alone has no place in a succession.
 */
import { validatePartialDate, type PartialDateInput } from "@/lib/partialDate";

export type TenureDatePayload = {
  date_appointed: string | null;
  date_appointed_granularity: "YEAR" | "MONTH" | "DAY" | null;
};

export type TenureDateResult = { ok: true; value: TenureDatePayload } | { ok: false; error: string };

export function tenurePayloadDate(parts: PartialDateInput): TenureDateResult {
  const blank = !parts.year.trim() && !parts.month.trim() && !parts.day.trim();
  if (parts.unknown || blank) {
    return { ok: true, value: { date_appointed: null, date_appointed_granularity: null } };
  }
  const checked = validatePartialDate(parts);
  if (checked.ok === false) return { ok: false, error: checked.error };
  const { legacyDate, legacyGranularity } = checked.value;
  if (legacyDate == null || legacyGranularity == null) {
    return { ok: false, error: "A postmaster date needs a year; add the year or tick Date unknown." };
  }
  return { ok: true, value: { date_appointed: legacyDate, date_appointed_granularity: legacyGranularity } };
}

/** The reverse mapping, for editing an existing row. */
export function partsFromTenureDate(date: string | null, granularity: string): PartialDateInput {
  if (!date) return { unknown: true, year: "", month: "", day: "" };
  const [year, month, day] = date.split("-");
  if (granularity === "YEAR") return { unknown: false, year, month: "", day: "" };
  if (granularity === "MONTH") return { unknown: false, year, month: String(Number(month)), day: "" };
  return { unknown: false, year, month: String(Number(month)), day: String(Number(day)) };
}
