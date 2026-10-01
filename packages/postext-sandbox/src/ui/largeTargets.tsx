'use client';

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from 'react';

/** "Large targets": every pointer target at least 44×44 CSS px (WCAG 2.5.5,
 *  Target Size Enhanced). The editor is compact by default; this is the
 *  conforming alternate version, one switch away in the activity bar.
 *
 *  The choice is kept per browser. With nothing stored it follows the
 *  pointer: on for touch screens (`pointer: coarse`), off with a mouse.
 *  Components read it through `useLargeTargets()`; styles read the
 *  `data-pt-targets="large"` attribute on the sandbox root through the
 *  `pt-large:` Tailwind variant and the floor in `styles.ts`. */
const STORAGE_KEY = 'postext-sandbox-large-targets';
const COARSE = '(pointer: coarse)';

const listeners = new Set<() => void>();
/** The choice made on this page; wins over storage, so the switch works
 *  even where localStorage is blocked. */
let override: boolean | null = null;

function read(): boolean {
  if (override !== null) return override;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    // storage blocked: fall back to the pointer
  }
  return typeof window !== 'undefined' && window.matchMedia?.(COARSE).matches === true;
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const media = window.matchMedia?.(COARSE);
  const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) { override = null; onChange(); } };
  media?.addEventListener('change', onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    media?.removeEventListener('change', onChange);
    window.removeEventListener('storage', onStorage);
  };
}

interface LargeTargetsValue {
  large: boolean;
  setLarge: (on: boolean) => void;
}

const LargeTargetsContext = createContext<LargeTargetsValue>({ large: false, setLarge: () => {} });

export function LargeTargetsProvider({ children }: { children: ReactNode }) {
  const large = useSyncExternalStore(subscribe, read, () => false);
  const setLarge = useCallback((on: boolean) => {
    override = on;
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      // storage blocked: the choice lasts for this page only
    }
    for (const l of listeners) l();
  }, []);
  return <LargeTargetsContext value={{ large, setLarge }}>{children}</LargeTargetsContext>;
}

export function useLargeTargets(): LargeTargetsValue {
  return useContext(LargeTargetsContext);
}
