/**
 * Order a marking's associated covers by their earliest observed date
 * (issues.md 174 -- Ian, 2026-09-23: "sorted earliest to latest in the cover
 * thumbnail area").
 *
 * A cover has no date column; its dates are DateSeen rows, each with its own
 * precision. The sort key keeps that honesty: the stored sortable `date` when
 * the row has one, else the year/month/day parts with missing parts as 1 --
 * a key for ordering only, never shown as a claimed day. No year, no key.
 */
import type { AssociatedCover, AssociatedDateSeen } from "@/services/markings";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO-shaped sort key for one observation, or null when it has no year. */
export function dateSeenSortKey(d: AssociatedDateSeen): string | null {
  if (d.date && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) return d.date;
  if (d.dateYear == null) return null;
  return `${String(d.dateYear).padStart(4, "0")}-${pad(d.dateMonth ?? 1)}-${pad(d.dateDay ?? 1)}`;
}

/** The observation that sorts first, or null when none carries a year. */
export function earliestDateSeen(datesSeen: readonly AssociatedDateSeen[]): AssociatedDateSeen | null {
  let best: AssociatedDateSeen | null = null;
  let bestKey: string | null = null;
  for (const d of datesSeen) {
    const key = dateSeenSortKey(d);
    if (key == null) continue;
    if (bestKey == null || key < bestKey) {
      best = d;
      bestKey = key;
    }
  }
  return best;
}

function coverSortKey(cover: AssociatedCover): string | null {
  const earliest = earliestDateSeen(cover.coverDetails?.datesSeen ?? []);
  return earliest ? dateSeenSortKey(earliest) : null;
}

/** Earliest first, undated last, ties in their incoming order. Returns a copy. */
export function sortCoversEarliestFirst(covers: readonly AssociatedCover[]): AssociatedCover[] {
  return covers
    .map((cover, index) => ({ cover, index, key: coverSortKey(cover) }))
    .sort((a, b) => {
      if (a.key == null && b.key == null) return a.index - b.index;
      if (a.key == null) return 1;
      if (b.key == null) return -1;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index;
    })
    .map((x) => x.cover);
}
