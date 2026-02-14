import axios, { AxiosError } from 'axios';

const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const LOCALHOST_API_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/?$/i;

/**
 * Single source of truth for the Django REST API base URL.
 * - When the app is opened from a non-local host (e.g. hellowoco.app), we always use the current
 *   origin + /api so requests succeed (no ERR_CONNECTION_REFUSED) and no "local network" prompt.
 * - When on localhost, use VITE_API_BASE_URL if set, else http://127.0.0.1:8000/api.
 * Called at request time so the correct URL is used even after deploy (no stale build default).
 */
export function getApiBaseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (origin && !LOCALHOST_PATTERN.test(origin)) {
      return origin.endsWith("/api") ? origin : `${origin}/api`;
    }
  }
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && String(envUrl).trim()) {
    const base = String(envUrl).trim().replace(/\/+$/, "");
    const url = base.endsWith("/api") ? base : `${base}/api`;
    if (!LOCALHOST_API_PATTERN.test(url)) return url;
  }
  return "http://127.0.0.1:8000/api";
}

// Create axios instance; baseURL is set per request so production always uses current origin
const apiClient = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
  return config;
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const message = error.response?.data
      ? typeof error.response.data === 'string'
        ? error.response.data
        : (error.response.data as { message?: string }).message || 'An error occurred'
      : error.message || 'Network error';
    
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

// Filter options types
export interface ColorOption {
  value: string;
  label: string;
}

export interface FilterOptions {
  colors: ColorOption[];
  states?: { value: string; label: string }[];
  types?: { value: string; label: string }[];
  valuations?: { value: string; label: string }[];
}

// Django paginated response for list endpoints
export interface DjangoPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Fetch all pages from a Django list endpoint. Use the shared API base URL.
 */
export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const all: T[] = [];
  let nextPath: string | null = path.startsWith('/') ? path : `/${path}`;
  if (!nextPath.endsWith('/')) nextPath += '/';
  while (nextPath) {
    const response = await apiClient.get<DjangoPaginatedResponse<T>>(nextPath);
    all.push(...(response.data.results ?? []));
    const next = response.data.next;
    if (!next) break;
    const parsed = new URL(next);
    nextPath = parsed.pathname.replace(/^\/api/, '') + parsed.search;
  }
  return all;
}

// Django API color shape (from /api/colors/)
export interface DjangoColor {
  colorId: number;
  colorName: string;
  colorValue: string;
  createdDate?: string;
  modifiedDate?: string;
  createdBy?: number;
  modifiedBy?: number;
}

// API functions - use Django REST API
export const fetchColorOptions = async (): Promise<ColorOption[]> => {
  const response = await apiClient.get<DjangoPaginatedResponse<DjangoColor>>('/colors/');
  const results = response.data.results ?? [];
  return results.map((c) => ({
    value: c.colorName.toLowerCase().trim() || c.colorName,
    label: c.colorName,
  }));
};

export const fetchFilterOptions = async (): Promise<FilterOptions> => {
  const response = await apiClient.get<FilterOptions>('/filters');
  return response.data;
};

// Postmark list item from Django /api/postmarks/
export interface DjangoPostmarkListResult {
  postmark_id: number;
  postmark_key: string;
  facility_name: string;
  shape_name: string;
  rate_location?: string;
  rate_value?: string;
  is_manuscript: boolean;
  main_image: { image_url: string | null } | null;
  responsible_groups?: { id: number; name: string }[];
  state?: string;
  town?: string;
  date_range?: string;
  colors_display?: string;
  valuation_display?: string;
}

export const fetchPostmarks = async (): Promise<DjangoPostmarkListResult[]> => {
  const all: DjangoPostmarkListResult[] = [];
  let nextUrl: string | null = '/postmarks/';
  while (nextUrl) {
    const response = await apiClient.get<DjangoPaginatedResponse<DjangoPostmarkListResult>>(nextUrl);
    all.push(...(response.data.results ?? []));
    const next = response.data.next;
    if (!next) break;
    const parsed = new URL(next);
    nextUrl = parsed.pathname.replace(/^\/api/, '') + parsed.search;
  }
  return all;
};

/** Single postmark detail from GET /api/postmarks/:id/ (camelCase from Django) */
export interface DjangoPostmarkDetail {
  postmarkId?: number;
  postmark_id?: number;
  postmarkKey?: string;
  postmark_key?: string;
  facilityName?: string;
  facility_name?: string;
  shapeName?: string;
  shape_name?: string;
  state?: string;
  town?: string;
  dateRange?: string;
  date_range?: string;
  colorsDisplay?: string;
  colors_display?: string;
  valuationDisplay?: string;
  valuation_display?: string;
  mainImage?: { imageUrl?: string | null; image_url?: string | null } | null;
  main_image?: { imageUrl?: string | null; image_url?: string | null } | null;
  images?: Array<{ imageUrl?: string | null; image_url?: string | null }>;
  datesSeen?: Array<{ earliestDateSeen?: string; latestDateSeen?: string }>;
  dates_seen?: Array<{ earliest_date_seen?: string; latest_date_seen?: string }>;
  [key: string]: unknown;
}

export async function fetchPostmarkById(id: string | number): Promise<DjangoPostmarkDetail | null> {
  try {
    const response = await apiClient.get<DjangoPostmarkDetail>(`/postmarks/${id}/`);
    return response.data;
  } catch {
    return null;
  }
}

export default apiClient;
