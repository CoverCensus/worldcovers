import axios, { AxiosError } from 'axios';

/**
 * Single source of truth for the Django REST API base URL.
 * Set VITE_API_BASE_URL in .env (e.g. https://hellowoco.app for production).
 * - If you set the full API root: https://hellowoco.app/api
 * - If you set only the host: https://hellowoco.app → we append /api
 * Default when unset: http://127.0.0.1:8000/api
 */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
  const base = String(raw).trim().replace(/\/+$/, '');
  return base.endsWith('/api') ? base : `${base}/api`;
}

// Create axios instance with the single base URL (all API calls use this)
const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
  withCredentials: true,
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

export default apiClient;
