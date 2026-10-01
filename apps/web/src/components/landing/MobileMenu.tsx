"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { youtubeUrl } from "@/i18n/locales";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ReadingPreferences } from "@/components/reading/ReadingPreferences";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("Navbar");
  const locale = useLocale();

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? t("closeMenu") : t("openMenu")}
        aria-expanded={open}
        className="flex min-h-10 min-w-10 items-center justify-center rounded-md p-2 text-slate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        style={{ touchAction: "manipulation" }}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open && (
        <>
          <div
            className="absolute inset-x-0 top-full z-40 h-[100dvh] bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <nav
            className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain border-b border-rule bg-background p-6 shadow-lg"
            aria-label={t("mobileNav")}
          >
            <ul className="flex flex-col gap-1">
              <li>
                <Link
                  href="/docs"
                  onClick={() => setOpen(false)}
                  className="flex min-h-10 items-center font-sans text-lg font-medium text-foreground transition-colors hover:text-brand"
                >
                  {t("docs")}
                </Link>
              </li>
              <li>
                <Link
                  href="/cookbook"
                  onClick={() => setOpen(false)}
                  className="flex min-h-10 items-center font-sans text-lg font-medium text-foreground transition-colors hover:text-brand"
                >
                  {t("cookbook")}
                </Link>
              </li>
              <li>
                <Link
                  href="/sandbox"
                  onClick={() => setOpen(false)}
                  className="flex min-h-10 items-center font-sans text-lg font-medium text-foreground transition-colors hover:text-brand"
                >
                  {t("sandbox")}
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/drnachio/postext"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("githubAriaLabel")}
                  onClick={() => setOpen(false)}
                  className="flex min-h-10 items-center font-sans text-lg font-medium text-foreground transition-colors hover:text-brand"
                >
                  {t("github")}
                </a>
              </li>
              <li>
                <a
                  href={youtubeUrl(locale)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("youtubeAriaLabel")}
                  onClick={() => setOpen(false)}
                  className="flex min-h-10 items-center font-sans text-lg font-medium text-foreground transition-colors hover:text-brand"
                >
                  {t("youtube")}
                </a>
              </li>
            </ul>
            <div className="mt-4 border-t border-rule pt-4">
              <ReadingPreferences variant="disclosure" />
            </div>
            <div className="mt-2 flex items-center justify-evenly border-t border-rule pt-4">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
