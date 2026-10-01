"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LOCALE_INFO, htmlLang, isSiteLocale } from "@/i18n/locales";


export function CompactLanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("Language");
  const [open, setOpen] = useState(false);
  // Opens downward from the phone layout's top bar, upward from the
  // activity bar's foot.
  const [below, setBelow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

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

  // A disclosure: the button opens a short list of language buttons (the
  // current one marked), each a 44×44 target (WCAG 2.5.5).
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          const top = ref.current?.getBoundingClientRect().top ?? 0;
          setBelow(top < window.innerHeight / 2);
          setOpen(!open);
        }}
        aria-label={t("label")}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className="flex h-11 w-11 items-center justify-center rounded-md font-sans text-xs font-semibold text-slate transition-colors hover:bg-surface hover:text-foreground"
        style={{ touchAction: "manipulation" }}
      >
        {isSiteLocale(locale) ? (
          <abbr title={LOCALE_INFO[locale].name} className="no-underline">{LOCALE_INFO[locale].code}</abbr>
        ) : locale.toUpperCase()}
      </button>

      {open && (
        <ul
          id={listId}
          aria-label={t("label")}
          className="absolute left-1/2 z-50 my-1 min-w-[3rem] -translate-x-1/2 rounded-md border py-1 shadow-lg"
          style={{
            ...(below ? { top: "100%" } : { bottom: "100%" }),
            borderColor: "var(--rule)",
            backgroundColor: "var(--background)",
          }}
        >
          {routing.locales.map((l) => (
            <li key={l}>
              <button
                type="button"
                lang={htmlLang(l)}
                onClick={() => handleSelect(l)}
                aria-current={l === locale ? "true" : undefined}
                aria-label={LOCALE_INFO[l].name}
                className={`flex min-h-11 w-full min-w-11 items-center justify-center px-3 font-mono text-xs transition-colors hover:bg-surface hover:text-foreground ${l === locale ? "font-semibold text-brand" : "text-slate"}`}
              >
                <abbr title={LOCALE_INFO[l].name} className="no-underline">{LOCALE_INFO[l].code}</abbr>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
