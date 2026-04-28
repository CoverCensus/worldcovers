import axios, { AxiosError } from 'axios';

// API base URL from environment variable
// Use same-origin fallback to avoid mixed-content issues on HTTPS pages.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v2';

// Create axios instance with default configuration
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
});

function extractErrorMessage(data: unknown): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) {
    const first = data.find((v) => typeof v === 'string');
    return typeof first === 'string' ? first : null;
  }
  if (typeof data !== 'object') return null;

  const payload = data as Record<string, unknown>;
  const direct =
    (typeof payload.detail === 'string' && payload.detail) ||
    (typeof payload.message === 'string' && payload.message) ||
    (typeof payload.error === 'string' && payload.error) ||
    (typeof payload.non_field_errors === 'string' && payload.non_field_errors);
  if (direct) return direct;

  if (Array.isArray(payload.non_field_errors)) {
    const first = payload.non_field_errors.find((v) => typeof v === 'string');
    if (typeof first === 'string') return first;
  }

  for (const value of Object.values(payload)) {
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value)) {
      const first = value.find((v) => typeof v === 'string' && v.trim());
      if (typeof first === 'string') return first;
    }
  }

  return null;
}

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const parsedMessage = extractErrorMessage(error.response?.data);
    const message = parsedMessage || error.message || 'Network error';
    
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

// API functions
export const fetchColorOptions = async (): Promise<ColorOption[]> => {
  const response = await apiClient.get<ColorOption[]>('/filters/colors');
  return response.data;
};

export const fetchFilterOptions = async (): Promise<FilterOptions> => {
  const response = await apiClient.get<FilterOptions>('/filters');
  return response.data;
};

export default apiClient;
