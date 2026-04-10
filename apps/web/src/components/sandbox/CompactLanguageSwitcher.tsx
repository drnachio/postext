"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LOCALE_CODES: Record<string, string> = {
  en: "EN",
  es: "ES",
};

export function CompactLanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Language");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function handleSelect(nextLocale: string) {
    setOpen(false);
    if (nextLocale !== locale) {
      router.replace(pathname, { locale: nextLocale });
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={t("label")}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center justify-center rounded-md p-2 font-mono text-xs font-semibold transition-colors"
        style={{
          color: "var(--slate)",
          touchAction: "manipulation",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--foreground)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--slate)")}
      >
        {LOCALE_CODES[locale] ?? locale.toUpperCase()}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("label")}
          className="absolute left-1/2 z-50 mb-1 min-w-[3rem] -translate-x-1/2 rounded-md border py-1 shadow-lg"
          style={{
            bottom: "100%",
            borderColor: "var(--rule)",
            backgroundColor: "var(--background)",
          }}
        >
          {routing.locales.map((l) => (
            <li key={l} role="option" aria-selected={l === locale}>
              <button
                type="button"
                onClick={() => handleSelect(l)}
                className="flex w-full items-center justify-center px-3 py-1.5 font-mono text-xs transition-colors"
                style={{
                  color: l === locale ? "var(--gilt)" : "var(--slate)",
                  fontWeight: l === locale ? 600 : 400,
                }}
                onMouseEnter={(e) => {
                  if (l !== locale) {
                    e.currentTarget.style.backgroundColor = "var(--surface)";
                    e.currentTarget.style.color = "var(--foreground)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  if (l !== locale) e.currentTarget.style.color = "var(--slate)";
                }}
              >
                {LOCALE_CODES[l] ?? l.toUpperCase()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
