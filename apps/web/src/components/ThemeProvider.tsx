"use client";

import { createContext, useContext, useCallback, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
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

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(t);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getStoredTheme, () => "dark" as Theme);

  // Keep the DOM class in sync with the resolved theme
  if (typeof window !== "undefined") {
    applyTheme(theme);
  }

  const toggleTheme = useCallback(() => {
    const next = getStoredTheme() === "dark" ? "light" : "dark";
    localStorage.setItem("postext-theme", next);
    applyTheme(next);
    // Trigger re-render via storage event for useSyncExternalStore
    window.dispatchEvent(new StorageEvent("storage"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
