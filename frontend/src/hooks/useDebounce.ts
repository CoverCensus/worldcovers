import { useState, useEffect } from 'react';

/**
 * Returns a debounced value that updates only after `delay` ms of no changes.
 * Use for text inputs to avoid API calls on every keypress.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
