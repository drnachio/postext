'use client';

import { useEffect, useState } from 'react';

/** Trailing-edge debounce of a value. With `ms <= 0` the value passes
 *  through untouched (no extra render). */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (ms <= 0) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return ms <= 0 ? value : debounced;
}
