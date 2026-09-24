"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useTranslations } from "next-intl";

/** `compact`: the smaller size used in the Sandbox's activity bar. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const t = useTranslations("Theme");

  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? t("toggleDark") : t("toggleLight")}
      className={`flex items-center justify-center rounded-md ${compact ? "p-1.5" : "p-2"} text-slate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
      style={{ touchAction: "manipulation" }}
    >
      {isLight ? (
        <Moon className={compact ? "size-4" : "size-5 2xl:size-6 4xl:size-7"} />
      ) : (
        <Sun className={compact ? "size-4" : "size-5 2xl:size-6 4xl:size-7"} />
      )}
    </button>
  );
}
