import apiClient from "@/lib/api";
import { getMarkingCount } from "@/services/markings";
import { getPostOfficeCount } from "@/services/postOffices";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), defaults: { baseURL: "/api/v2" } },
  ensureCsrfToken: jest.fn(),
}));

test.each([
  ["/markings/count/", getMarkingCount],
  ["/post-offices/count/", getPostOfficeCount],
])("reads an exact total from %s without fetching a page", async (path, getCount) => {
  const get = apiClient.get as jest.Mock;
  get.mockReset();
  get.mockResolvedValueOnce({ data: { count: 88677 } });
  await expect(getCount()).resolves.toBe(88677);
  expect(get).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith(path);
});
