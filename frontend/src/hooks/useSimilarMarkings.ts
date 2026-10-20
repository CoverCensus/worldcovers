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
import { useEffect, useRef, useState } from "react";

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

function normalise(params: SimilarMarkingsParams): SimilarMarkingsParams {
  return {
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
  };
}

function isComplete(params: SimilarMarkingsParams): boolean {
  return [params.state, params.town, params.type, params.inscription].every((v) => v.length > 0);
}

export function useSimilarMarkings(params: SimilarMarkingsParams): SimilarMarkingsState {
  const settled = normalise(params);
  // The effect keys on a value, not an object identity, so the debounce sees
  // one change per real edit. It reads the latest params from the ref rather
  // than parsing the key back.
  const key = Object.values(settled).join("\u001f");
  const latest = useRef(settled);
  latest.current = settled;
  const debouncedKey = useDebounce(key, SIMILAR_LOOKUP_DEBOUNCE_MS);
  const [state, setState] = useState<SimilarMarkingsState>(IDLE);

  useEffect(() => {
    const current = latest.current;
    if (!isComplete(current)) {
      setState(IDLE);
      return;
    }
    let ignore = false;
    setState((prev) => ({ ...prev, loading: true, error: false }));
    getSimilarMarkings(current)
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
