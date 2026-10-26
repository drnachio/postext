import { useEffect, useRef, useState } from 'react';

/**
 * Holds a local value while the user is editing and commits to the upstream
 * `onChange` only after `delayMs` of quiet. External `value` changes are
 * mirrored into the local state unless the user is mid-edit (to avoid
 * clobbering in-flight typing / dragging with a stale upstream snapshot).
 *
 * Returns `[local, commit, flush]`:
 *   - `commit(v)` stages `v` locally and (re)starts the debounce timer.
 *   - `flush()` cancels the timer and commits immediately (use on blur / drop).
 */
export function useDebouncedCommit<T>(
  value: T,
  onChange: (v: T) => void,
  delayMs = 120,
): [T, (v: T) => void, () => void] {
  const [local, setLocal] = useState<T>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingRef = useRef(false);
  const localRef = useRef<T>(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!editingRef.current) {
      setLocal(value);
      localRef.current = value;
    }
  }, [value]);

  const commit = (v: T) => {
    editingRef.current = true;
    localRef.current = v;
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      editingRef.current = false;
      timerRef.current = null;
      onChangeRef.current(localRef.current);
    }, delayMs);
  };

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (editingRef.current) {
      editingRef.current = false;
      onChangeRef.current(localRef.current);
    }
  };

  return [local, commit, flush];
}
