"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("Navbar");

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
        className="flex items-center justify-center rounded-md p-2 text-slate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
        style={{ touchAction: "manipulation" }}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 top-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <nav
            className="fixed inset-x-0 top-[57px] z-50 border-b border-rule bg-background p-6 shadow-lg"
            aria-label="Mobile navigation"
          >
            <ul className="flex flex-col gap-4">
              <li>
                <Link
                  href="/docs"
                  onClick={() => setOpen(false)}
                  className="block font-body text-base text-slate transition-colors hover:text-foreground"
                >
                  {t("docs")}
                </Link>
              </li>
              <li>
                <Link
                  href="/sandbox"
                  onClick={() => setOpen(false)}
                  className="block font-body text-base text-slate transition-colors hover:text-foreground"
                >
                  {t("sandbox")}
                </Link>
              </li>
              <li>
                <a
                  href="#install"
                  onClick={() => setOpen(false)}
                  className="block font-body text-base text-slate transition-colors hover:text-foreground"
                >
                  {t("getStarted")}
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/drnachio/postext"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("githubAriaLabel")}
                  onClick={() => setOpen(false)}
                  className="block font-body text-base text-slate transition-colors hover:text-foreground"
                >
                  {t("github")}
                </a>
              </li>
            </ul>
            <div className="mt-4 flex items-center justify-evenly border-t border-rule pt-4">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
