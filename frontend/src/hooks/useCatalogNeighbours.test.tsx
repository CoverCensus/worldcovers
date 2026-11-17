/** @jest-environment jsdom */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getMarkingsPage } from "@/services/markings";
import { catalogHref } from "@/lib/catalogParams";
import { readCatalogQuery, rememberCatalogQuery, takeCatalogRow } from "@/lib/catalogCursor";
import { useCatalogNeighbours } from "./useCatalogNeighbours";

jest.mock("@/services/markings", () => ({ getMarkingsPage: jest.fn() }));

const page = (ids: number[]) => ({ results: ids.map((id) => ({ id })), count: 6, next: null, previous: null });
const PAGES: Record<number, ReturnType<typeof page>> = { 1: page([10, 11, 12]), 2: page([20, 21, 22]) };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
  (getMarkingsPage as jest.Mock).mockImplementation((p: number) => Promise.resolve(PAGES[p]));
});

it("yields nothing without a remembered list", async () => {
  const { result } = renderHook(() => useCatalogNeighbours(11), { wrapper });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(result.current).toBeNull();
  expect(getMarkingsPage).not.toHaveBeenCalled();
});

it("finds both neighbours on the remembered page and the position in the whole list", async () => {
  rememberCatalogQuery({ search: "state=TX", page: 1, pageSize: 3, options: { state: "TX" } });
  const { result } = renderHook(() => useCatalogNeighbours(11), { wrapper });
  await waitFor(() => expect(result.current).not.toBeNull());
  expect(result.current).toMatchObject({ previous: { id: 10, page: 1 }, next: { id: 12, page: 1 }, position: { n: 2, total: 6 } });
  expect(getMarkingsPage).toHaveBeenCalledTimes(1);
  expect(getMarkingsPage).toHaveBeenCalledWith(1, 3, { state: "TX" });
});

it("reaches across a page edge for the next marking and moves the cursor when stepped", async () => {
  rememberCatalogQuery({ search: "state=TX", page: 1, pageSize: 3, options: { state: "TX" } });
  const { result } = renderHook(() => useCatalogNeighbours(12), { wrapper });
  await waitFor(() => expect(result.current?.next).toEqual({ id: 20, page: 2 }));
  expect(result.current?.previous).toEqual({ id: 11, page: 1 });
  expect(result.current?.position).toEqual({ n: 3, total: 6 });

  result.current!.step(result.current!.next!);
  expect(readCatalogQuery()).toMatchObject({ search: "state=TX&page=2", page: 2 });
  expect(catalogHref()).toBe("/search?state=TX&page=2");
  expect(takeCatalogRow("state=TX&page=2")).toBe(20);
});

it("reaches back a page for the previous marking and stops at the ends", async () => {
  rememberCatalogQuery({ search: "state=TX&page=2", page: 2, pageSize: 3, options: { state: "TX" } });
  const { result } = renderHook(() => useCatalogNeighbours(20), { wrapper });
  await waitFor(() => expect(result.current?.previous).toEqual({ id: 12, page: 1 }));
  expect(result.current?.next).toEqual({ id: 21, page: 2 });

  const last = renderHook(() => useCatalogNeighbours(22), { wrapper });
  await waitFor(() => expect(last.result.current?.previous).toEqual({ id: 21, page: 2 }));
  expect(last.result.current?.next).toBeNull();
});

it("yields nothing when the marking is not on the remembered page", async () => {
  rememberCatalogQuery({ search: "state=TX", page: 1, pageSize: 3, options: { state: "TX" } });
  const { result } = renderHook(() => useCatalogNeighbours(99), { wrapper });
  await waitFor(() => expect(getMarkingsPage).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(result.current).toBeNull();
});
