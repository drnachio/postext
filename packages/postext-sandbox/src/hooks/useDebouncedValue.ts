'use client';

import { useEffect, useRef, useState } from 'react';

/** Trailing-edge debounce of a value. With `ms <= 0` the value passes
 *  through untouched (no extra render). A change that `immediate` answers
 *  for (asked once per change, with the value before and after) is taken
 *  without the wait. */
export function useDebouncedValue<T>(value: T, ms: number, immediate?: (from: T, to: T) => boolean): T {
  const [debounced, setDebounced] = useState(value);
  const seen = useRef(value);
  const immediateRef = useRef(immediate);
  immediateRef.current = immediate;
  useEffect(() => {
    const from = seen.current;
    seen.current = value;
    if (ms <= 0 || (from !== value && immediateRef.current?.(from, value))) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return ms <= 0 ? value : debounced;
}
