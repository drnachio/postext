"use client";

import { createContext, useContext, useCallback, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  /** True when the reader picked a theme; false when it follows the system. */
  chosen: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  /** Forget the reader's choice and follow the system again. */
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  chosen: false,
  toggleTheme: () => {},
  setTheme: () => {},
  resetTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getStoredTheme(): Theme {
  const stored = localStorage.getItem("postext-theme");
  if (stored === "light" || stored === "dark") return stored;
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

function getChosen(): boolean {
  try {
    const stored = localStorage.getItem("postext-theme");
    return stored === "light" || stored === "dark";
  } catch {
    return false;
  }
}

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(t);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getStoredTheme, () => "dark" as Theme);
  const chosen = useSyncExternalStore(subscribe, getChosen, () => false);

  // Keep the DOM class in sync with the resolved theme
  if (typeof window !== "undefined") {
    applyTheme(theme);
  }

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem("postext-theme", next);
    applyTheme(next);
    // Trigger re-render via storage event for useSyncExternalStore
    window.dispatchEvent(new StorageEvent("storage"));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(getStoredTheme() === "dark" ? "light" : "dark");
  }, [setTheme]);

  const resetTheme = useCallback(() => {
    localStorage.removeItem("postext-theme");
    applyTheme(getStoredTheme());
    window.dispatchEvent(new StorageEvent("storage"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, chosen, toggleTheme, setTheme, resetTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
