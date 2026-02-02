import { useState, useEffect } from 'react';
import { fetchColorOptions, ColorOption } from '@/lib/api';
import { getColors as getColorsFromSupabase } from '@/services/colors';

interface UseFilterOptionsReturn {
  colorOptions: ColorOption[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function mapToColorOption(name: string): ColorOption {
  const value = name.toLowerCase().trim();
  return { value: value || name, label: name };
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
      try {
        const fallback = await getColorsFromSupabase();
        setColorOptions(fallback.map((c) => mapToColorOption(c.name)));
        setError(null);
      } catch (fallbackErr) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch filter options';
        setError(errorMessage);
        console.error('Error fetching filter options:', errorMessage);
        setColorOptions([]);
      }
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
