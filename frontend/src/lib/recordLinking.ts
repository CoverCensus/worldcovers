
export function parseMarkingIdInput(raw: string): number | null {
  const value = parseInt(raw.trim().replace(/^api-/, ""), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}
