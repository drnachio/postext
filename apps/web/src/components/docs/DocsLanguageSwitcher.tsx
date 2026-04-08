"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

interface DocsLanguageSwitcherProps {
  slug: string;
  availableLocales: string[];
}

export function DocsLanguageSwitcher({
  slug,
  availableLocales,
}: DocsLanguageSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("Language");

  const nextLocale = locale === "en" ? "es" : "en";
  const canSwitch = availableLocales.includes(nextLocale);

  if (!canSwitch) return null;

  function handleSwitch() {
    router.replace(`/docs/${slug}`, { locale: nextLocale });
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      aria-label={t("switchTo")}
      className="font-mono text-xs font-semibold text-slate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue rounded-md px-2 py-1 2xl:text-sm 4xl:text-base"
      style={{ touchAction: "manipulation" }}
    >
      {t("current")}
    </button>
  );
}
