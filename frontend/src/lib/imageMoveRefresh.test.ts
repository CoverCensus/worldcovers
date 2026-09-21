import { moveImageAndRefresh } from "./imageMoveRefresh";

describe("moveImageAndRefresh", () => {
  it("refreshes source and destination after a successful move", async () => {
    const source = [{ imageId: 2 }];
    const destination = [{ imageId: 1, isDefault: true }, { imageId: 3 }];

    await expect(
      moveImageAndRefresh(
        async () => ({ ok: true }),
        async () => source,
        async () => destination,
      ),
    ).resolves.toEqual({
      moved: true,
      source: { ok: true, value: source },
      destination: { ok: true, value: destination },
    });
  });

  it("does not refresh either side when the move is rejected", async () => {
    const loadSource = jest.fn();
    const loadDestination = jest.fn();

    await expect(
      moveImageAndRefresh(
        async () => ({ ok: false, message: "Move rejected" }),
        loadSource,
        loadDestination,
      ),
    ).resolves.toEqual({ moved: false, message: "Move rejected" });
    expect(loadSource).not.toHaveBeenCalled();
    expect(loadDestination).not.toHaveBeenCalled();
  });

  it("keeps the destination update when the source refresh fails", async () => {
    const destination = [{ imageId: 4, isDefault: true }];
    const result = await moveImageAndRefresh(
      async () => ({ ok: true }),
      async () => {
        throw new Error("Source failed");
      },
      async () => destination,
    );

    expect(result).toEqual({
      moved: true,
      source: { ok: false },
      destination: { ok: true, value: destination },
    });
  });

  it("keeps an empty final source when the destination refresh fails", async () => {
    const result = await moveImageAndRefresh(
      async () => ({ ok: true }),
      async () => [],
      async () => {
        throw new Error("Destination failed");
      },
    );

    expect(result).toEqual({
      moved: true,
      source: { ok: true, value: [] },
      destination: { ok: false },
    });
  });
});
