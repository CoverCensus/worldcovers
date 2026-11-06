import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarkingsPage } from "@/services/markings";
import { rememberCatalogLocation } from "@/lib/catalogParams";
import {
  hasPageAfter,
  neighboursOf,
  readCatalogQuery,
  rememberCatalogQuery,
  rememberCatalogRow,
  searchWithPage,
  type CatalogQuery,
} from "@/lib/catalogCursor";

export interface CatalogNeighbour {
  id: number;
  /** The catalog page this neighbour sits on. */
  page: number;
}

export interface CatalogNeighbours {
  previous: CatalogNeighbour | null;
  next: CatalogNeighbour | null;
  /** One-based position in the whole result set, when the count is known. */
  position: { n: number; total: number } | null;
  /** Record that the viewer stepped to a neighbour, so Back and the next step line up. */
  step: (neighbour: CatalogNeighbour) => void;
}

const STALE_MS = 5 * 60 * 1000;

function usePage(query: CatalogQuery | null, page: number, enabled: boolean) {
  // Keyed on the view without its page, so a page prefetched before a step
  // across the edge is the cache hit the next record page lands on.
  const view = query ? searchWithPage(query.search, 1) : "";
  return useQuery({
    queryKey: ["catalog-neighbours", view, query?.pageSize ?? 0, page],
    queryFn: () => getMarkingsPage(page, query!.pageSize, query!.options),
    enabled: enabled && query != null && page >= 1,
    staleTime: STALE_MS,
  });
}

/**
 * Previous/Next for a marking opened from the catalog (Trello T95).
 *
 * Replays the list query the catalog remembered (see lib/catalogCursor.ts),
 * so the neighbours follow the list's own sort. The page the marking is on
 * is fetched first; the page before or after only when the marking sits at
 * that edge. No remembered query, or a marking that is not on the remembered
 * page (a new tab, a deep link, a changed list), yields no neighbours.
 */
export function useCatalogNeighbours(markingId: number | null): CatalogNeighbours | null {
  // Read once per mounted record page; EntryDetail keys the page by id.
  const [query] = useState(() => readCatalogQuery());
  const enabled = markingId != null && query != null;
  const current = usePage(query, query?.page ?? 0, enabled);

  const rows = current.data?.results ?? [];
  const position = markingId != null ? neighboursOf(rows, markingId) : null;
  const page = query?.page ?? 0;
  const pageSize = query?.pageSize ?? 0;
  const count = current.data?.count ?? null;

  const atFirstRow = position != null && position.prev == null;
  const atLastRow = position != null && position.next == null;
  const needBefore = enabled && atFirstRow && page > 1;
  const needAfter = enabled && atLastRow && hasPageAfter(page, pageSize, count, current.data?.next ?? null);
  const before = usePage(query, page - 1, needBefore);
  const after = usePage(query, page + 1, needAfter);

  if (!enabled || position == null || query == null) return null;

  const previous: CatalogNeighbour | null =
    position.prev != null
      ? { id: position.prev, page }
      : needBefore && before.data && before.data.results.length > 0
        ? { id: before.data.results[before.data.results.length - 1].id, page: page - 1 }
        : null;
  const next: CatalogNeighbour | null =
    position.next != null
      ? { id: position.next, page }
      : needAfter && after.data && after.data.results.length > 0
        ? { id: after.data.results[0].id, page: page + 1 }
        : null;

  const step = (neighbour: CatalogNeighbour) => {
    const search = searchWithPage(query.search, neighbour.page);
    if (neighbour.page !== query.page) {
      rememberCatalogQuery({ ...query, search, page: neighbour.page });
      rememberCatalogLocation(search);
    }
    rememberCatalogRow(search, neighbour.id);
  };

  return {
    previous,
    next,
    position: count != null ? { n: (page - 1) * pageSize + position.index + 1, total: count } : null,
    step,
  };
}
