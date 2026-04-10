import { useState, useEffect } from 'react';
import { ColorOption } from '@/lib/api';
import { getColors } from '@/services/colors';
import { getPostmarkShapes } from '@/services/postmarkShapes';
import { getShapes } from '@/services/shapes';
import { getAdministrativeUnits } from '@/services/administrativeUnits';

interface ShapeOption {
  value: string;
  label: string;
}

interface StateOption {
  value: string;
  label: string;
}

interface UseFilterOptionsReturn {
  colorOptions: ColorOption[];
  shapeOptions: ShapeOption[];
  stateOptions: StateOption[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// function mapToColorOption(name: string): ColorOption {
//   const value = name.toLowerCase().trim();
//   return { value: value || name, label: name };
// }

interface UseFilterOptionsOptions {
  /** When true, only states assigned to the user (Dashboard). When false, all states (Search). */
  assignedStatesOnly?: boolean;
  /** Shape source for the shape dropdown. */
  shapeSource?: "postmarkType" | "commonShape";
}

export const useFilterOptions = (options?: UseFilterOptionsOptions): UseFilterOptionsReturn => {
  const [colorOptions, setColorOptions] = useState<ColorOption[]>([]);
  const [shapeOptions, setShapeOptions] = useState<ShapeOption[]>([]);
  const [stateOptions, setStateOptions] = useState<StateOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const assignedStatesOnly = options?.assignedStatesOnly ?? false;
  const shapeSource = options?.shapeSource ?? "postmarkType";

  const fetchOptions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [colors, shapes, states] = await Promise.all([
        getColors(),
        shapeSource === "commonShape" ? getShapes() : getPostmarkShapes(),
        getAdministrativeUnits(assignedStatesOnly),
      ]);
      setColorOptions(colors.map((c) => ({ value: c.name, label: c.name })));
      setShapeOptions(shapes.map((s) => ({ value: String(s.id), label: s.name })));
      setStateOptions(states);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch filter options';
      setError(errorMessage);
      console.error('Error fetching filter options:', errorMessage);
      setColorOptions([]);
      setShapeOptions([]);
      setStateOptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOptions();
  }, [assignedStatesOnly, shapeSource]);

  return {
    colorOptions,
    shapeOptions,
    stateOptions,
    isLoading,
    error,
    refetch: fetchOptions,
  };
};

export default useFilterOptions;
