export type ImageMoveResponse =
  | { ok: true }
  | { ok: false; message: string };

export type RefreshResult<T> =
  | { ok: true; value: T }
  | { ok: false };

export type ImageMoveRefreshResult<S, D> =
  | { moved: false; message: string }
  | {
      moved: true;
      source: RefreshResult<S>;
      destination: RefreshResult<D>;
    };

function refreshResult<T>(result: PromiseSettledResult<T>): RefreshResult<T> {
  return result.status === "fulfilled"
    ? { ok: true, value: result.value }
    : { ok: false };
}

export async function moveImageAndRefresh<S, D>(
  move: () => Promise<ImageMoveResponse>,
  loadSource: () => Promise<S>,
  loadDestination: () => Promise<D>,
): Promise<ImageMoveRefreshResult<S, D>> {
  const moveResult = await move();
  if (moveResult.ok === false) {
    return { moved: false, message: moveResult.message };
  }

  const [source, destination] = await Promise.allSettled([
    loadSource(),
    loadDestination(),
  ]);
  return {
    moved: true,
    source: refreshResult(source),
    destination: refreshResult(destination),
  };
}
