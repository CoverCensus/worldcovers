import apiClient from "@/lib/api";

/** One item from the external /api/post-offices/ response */
export interface PostOfficeApiResultItem {
  postOfficeId: number;
  referenceCode: string;
  currentName: string;
  currentType: string;
  latitude: number | null;
  longitude: number | null;
  /** State/region name (for town dropdown filtering) */
  stateName?: string | null;
}

/** Paginated response from GET /post-offices/ */
export interface PostOfficesApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: PostOfficeApiResultItem[];
}

/** Normalized option for dropdowns/filters */
export interface PostOfficeOption {
  id: number;
  referenceCode: string;
  name: string;
  type: string;
  latitude: number | null;
  longitude: number | null;
  town?: string;
  state?: string;
}

function mapApiResultToOption(item: PostOfficeApiResultItem): PostOfficeOption {
  return {
    id: item.postOfficeId,
    referenceCode: item.referenceCode,
    name: item.currentName ?? "",
    type: item.currentType ?? "",
    latitude: item.latitude,
    longitude: item.longitude,
    town: (item.currentName ?? "").trim() || undefined,
    state: (item.stateName ?? "").trim() || undefined,
  };
}

/** One item from GET /post-offices/town-options/ */
export interface TownOptionItem {
  town: string;
  state: string;
}

/** Returns the total number of post office records from the paginated list endpoint. */
export async function getPostOfficeCount(): Promise<number> {
  const res = await apiClient.get<PostOfficesApiResponse>("/post-offices/", {
    params: { page_size: "1" },
  });
  return typeof res.data.count === "number" ? res.data.count : 0;
}

/** Fetches post office town options from GET /post-offices/town-options/. */
export async function getPostOffices(): Promise<PostOfficeOption[]> {
  const res = await apiClient.get<TownOptionItem[]>("/post-offices/town-options/");
  const data = res.data;
  if (!Array.isArray(data)) {
    throw new Error("Post offices API: invalid town-options response");
  }
  return data.map((item, i) => ({
    id: i,
    referenceCode: "",
    name: `${item.town}, ${item.state}`,
    type: "",
    latitude: null,
    longitude: null,
    town: item.town.trim(),
    state: item.state.trim(),
  }));
}
