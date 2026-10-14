/** A stored rate amount without trailing zeros ("3.00" -> "3", "12.50" -> "12.5").
 * Strips zeros only; never rounds, since fractional rates are real (12-1/2, 18.75). */
export function formatRateNumber(value: string | number | null | undefined): string {
  if (value == null || String(value).trim() === "") return "";
  const cents = Number(String(value).trim());
  if (!Number.isFinite(cents)) return "";
  return String(cents);
}

export function formatRateValue(value: string | number | null | undefined): string {
  const cents = formatRateNumber(value);
  return cents ? `${cents}¢` : "";
}
