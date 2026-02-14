import { useState, useEffect } from 'react';
import { fetchColorOptions, ColorOption } from '@/lib/api';

interface UseFilterOptionsReturn {
  colorOptions: ColorOption[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export const useFilterOptions = (): UseFilterOptionsReturn => {
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const colors = await fetchColorOptions();
      setColorOptions(Array.isArray(colors) ? colors : []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch filter options';
      setError(errorMessage);
      console.error('Error fetching filter options:', errorMessage);
      setColorOptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  return {
    colorOptions,
    isLoading,
    error,
    refetch: fetchOptions,
  };
};

export default useFilterOptions;
