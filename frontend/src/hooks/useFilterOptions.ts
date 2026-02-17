import { useState, useEffect } from 'react';
import { ColorOption } from '@/lib/api';
import { getColors } from '@/services/colors';
import { getPostmarkShapes } from '@/services/postmarkShapes';

interface ShapeOption {
  value: string;
  label: string;
}

interface UseFilterOptionsReturn {
  colorOptions: ColorOption[];
  shapeOptions: ShapeOption[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// function mapToColorOption(name: string): ColorOption {
//   const value = name.toLowerCase().trim();
//   return { value: value || name, label: name };
// }

export const useFilterOptions = (): UseFilterOptionsReturn => {
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [shapeOptions, setShapeOptions] = useState<ShapeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOptions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [colors, shapes] = await Promise.all([
        getColors(),
        getPostmarkShapes(),
      ]);
      setColorOptions(colors.map((c) => ({ value: String(c.id), label: c.name })));
      setShapeOptions(shapes.map((s) => ({ value: String(s.id), label: s.name })));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch filter options';
      setError(errorMessage);
      console.error('Error fetching filter options:', errorMessage);
      setColorOptions([]);
      setShapeOptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, []);

  return {
    colorOptions,
    shapeOptions,
    isLoading,
    error,
    refetch: fetchOptions,
  };
};

export default useFilterOptions;
