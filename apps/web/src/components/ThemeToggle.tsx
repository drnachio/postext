"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useTranslations } from "next-intl";

export function ThemeToggle() {
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
      className="flex items-center justify-center rounded-md p-2 text-slate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
      style={{ touchAction: "manipulation" }}
    >
      {isLight ? (
        <Moon className="size-5 2xl:size-6 4xl:size-7" />
      ) : (
        <Sun className="size-5 2xl:size-6 4xl:size-7" />
      )}
    </button>
  );
}
