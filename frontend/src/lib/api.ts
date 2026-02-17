import axios, { AxiosError } from 'axios';

// API base URL from environment variable
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api';

// Create axios instance with default configuration
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 second timeout
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
