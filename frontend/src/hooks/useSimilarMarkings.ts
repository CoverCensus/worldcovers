/**
 * Debounced "similar existing Markings" lookup for the Marking form (T48).
 *
 * Fires 800 ms after the key fields settle (the Search page's cadence), only
 * once state, town, type and inscription are all present, and copies the
 * form's own effect-and-cancel pattern (the catalog-code suggestion effect)
 * rather than introducing react-query: the form tests render without a
 * QueryClientProvider. A stale response never writes state after the inputs
 * changed (react.dev "Fetching data": the `ignore` flag).
 *
 * Advisory only: a failed request is an empty panel, never an error the form
 * has to handle.
 */
import { useEffect, useState } from "react";

import { useDebounce } from "@/hooks/useDebounce";
import { getSimilarMarkings, type SimilarMarking, type SimilarMarkingsParams } from "@/services/similarEntries";

export const SIMILAR_LOOKUP_DEBOUNCE_MS = 800;

export interface SimilarMarkingsState {
  rows: SimilarMarking[];
  matchCount: number;
  relatedCount: number;
  loading: boolean;
  error: boolean;
}

const IDLE: SimilarMarkingsState = { rows: [], matchCount: 0, relatedCount: 0, loading: false, error: false };

function isComplete(params: SimilarMarkingsParams): boolean {
  return [params.state, params.town, params.type, params.inscription].every((v) => v.trim().length > 0);
}

export function useSimilarMarkings(params: SimilarMarkingsParams): SimilarMarkingsState {
  // One string so the debounce and the effect key on value, not identity.
  const key = JSON.stringify({
    state: params.state.trim(),
    town: params.town.trim(),
    type: params.type.trim(),
    inscription: params.inscription.trim(),
    shapeId: params.shapeId ?? null,
    color: params.color?.trim() || null,
    isManuscript: params.isManuscript ?? null,
    widthMm: params.widthMm?.trim() || null,
    heightMm: params.heightMm?.trim() || null,
    excludeId: params.excludeId ?? null,
  });
  const debouncedKey = useDebounce(key, SIMILAR_LOOKUP_DEBOUNCE_MS);
  const [state, setState] = useState<SimilarMarkingsState>(IDLE);

  useEffect(() => {
    const settled = JSON.parse(debouncedKey) as SimilarMarkingsParams;
    if (!isComplete(settled)) {
      setState(IDLE);
      return;
    }
    let ignore = false;
    setState((prev) => ({ ...prev, loading: true, error: false }));
    getSimilarMarkings(settled)
      .then((result) => {
        if (!ignore) setState({ ...result, loading: false, error: false });
      })
      .catch(() => {
        if (!ignore) setState({ ...IDLE, error: true });
      });
    return () => {
      ignore = true;
    };
  }, [debouncedKey]);

  return state;
}
