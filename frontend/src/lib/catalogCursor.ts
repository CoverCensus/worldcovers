/**
 * Catalog cursor: which list query the viewer came from, and which row.
 *
 * Trello T95 (Mike Ludeman, Texas editor): after opening a marking from a
 * 1,200-row state list, Back dropped him at the top of the list, and there
 * was no way to step to the next marking without going back at all.
 *
 * Two small records in sessionStorage, next to the view mirror that
 * `catalogParams.ts` already keeps (issue #87):
 *
 * - the **query** the catalog last ran: its serialized search string, page,
 *   page size, and the exact options object it handed to `getMarkingsPage`.
 *   The marking page replays that call to find its neighbours, so Previous
 *   and Next follow the list's own sort (the backend ordering always ends in
 *   `id`, so the sequence is total) without a second parser of the URL.
 * - the **row** the viewer opened, keyed by the search string, so the catalog
 *   can scroll that row back into view when the viewer returns to that same
 *   view. It is read once and cleared.
 *
 * sessionStorage rather than router state for the reasons ENGINEERING-ARCHIVE
 * records for the view mirror: detail pages are reloaded and reached several
 * navigations deep, and router state survives neither. A fresh tab has no
 * cursor and shows no Previous/Next, which is the honest answer.
 */

import type { getMarkingsPage } from "@/services/markings";

export type CatalogListOptions = NonNullable<Parameters<typeof getMarkingsPage>[2]>;

export interface CatalogQuery {
  /** Serialized catalog search string without the leading `?`. */
  search: string;
  page: number;
  pageSize: number;
  options: CatalogListOptions;
}

const QUERY_KEY = "worldcovers.catalog.lastQuery";
const ROW_KEY = "worldcovers.catalog.lastRow";

function write(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing / storage disabled: the catalog still works, it just
    // cannot restore the row or offer neighbours.
  }
}

function read(key: string): unknown {
  try {
    const raw = sessionStorage.getItem(key);
    return raw == null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function stripQuestionMark(search: string): string {
  return search.replace(/^\?/, "");
}

export function rememberCatalogQuery(query: CatalogQuery): void {
  write(QUERY_KEY, { ...query, search: stripQuestionMark(query.search) });
}

export function readCatalogQuery(): CatalogQuery | null {
  const value = read(QUERY_KEY);
  if (!value || typeof value !== "object") return null;
  const q = value as Partial<CatalogQuery>;
  if (typeof q.search !== "string") return null;
  if (typeof q.page !== "number" || !Number.isInteger(q.page) || q.page < 1) return null;
  if (typeof q.pageSize !== "number" || !Number.isInteger(q.pageSize) || q.pageSize < 1) return null;
  if (!q.options || typeof q.options !== "object") return null;
  return { search: q.search, page: q.page, pageSize: q.pageSize, options: q.options };
}

export function rememberCatalogRow(search: string, id: number): void {
  write(ROW_KEY, { search: stripQuestionMark(search), id });
}

/**
 * The row remembered for this exact view, or null. Reading clears it, so a
 * later filter change on the same page does not scroll again.
 */
export function takeCatalogRow(search: string): number | null {
  const value = read(ROW_KEY);
  try {
    sessionStorage.removeItem(ROW_KEY);
  } catch {
    // Nothing to clear.
  }
  if (!value || typeof value !== "object") return null;
  const row = value as { search?: unknown; id?: unknown };
  if (row.search !== stripQuestionMark(search)) return null;
  return typeof row.id === "number" && Number.isFinite(row.id) ? row.id : null;
}

/** The same search string with its `page` param set (page 1 is omitted, as the catalog writes it). */
export function searchWithPage(search: string, page: number): string {
  const params = new URLSearchParams(stripQuestionMark(search));
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  return params.toString();
}

export interface NeighbourPosition {
  /** Zero-based index of the row within the page. */
  index: number;
  /** Id of the row before it on this page, or null at the page's first row. */
  prev: number | null;
  /** Id of the row after it on this page, or null at the page's last row. */
  next: number | null;
}

/** Where `id` sits in one page of rows, or null when it is not on that page. */
export function neighboursOf(rows: ReadonlyArray<{ id: number }>, id: number): NeighbourPosition | null {
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  return {
    index,
    prev: index > 0 ? rows[index - 1].id : null,
    next: index < rows.length - 1 ? rows[index + 1].id : null,
  };
}

/** True when the list has rows after this page. `count` may be unknown (deferred). */
export function hasPageAfter(page: number, pageSize: number, count: number | null, next: string | null): boolean {
  if (count != null) return page * pageSize < count;
  return next != null;
}
