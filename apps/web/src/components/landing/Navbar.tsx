import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export async function Navbar() {
  const t = await getTranslations("Navbar");

  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-50 w-full border-b border-rule bg-background/95 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-2 2xl:max-w-6xl 2xl:px-8 4xl:max-w-7xl 4xl:px-12">
        <Link href="/" aria-label={t("home")} className="flex items-baseline gap-0 text-xl tracking-tight">
          <span className="font-logo text-5xl font-black text-gilt 2xl:text-6xl 4xl:text-7xl">P</span>
          <span className="-ml-2 font-display text-2xl text-foreground 2xl:text-3xl 4xl:text-4xl">ostext</span>
        </Link>
        <div className="flex items-center gap-4 2xl:gap-6 4xl:gap-8">
          <Link
            href="/docs"
            className="font-body text-sm text-slate transition-colors hover:text-foreground 2xl:text-base 4xl:text-lg"
          >
            {t("docs")}
          </Link>
          <a
            href="#install"
            className="font-body text-sm text-slate transition-colors hover:text-foreground 2xl:text-base 4xl:text-lg"
          >
            {t("getStarted")}
          </a>
          <a
            href="https://github.com/drnachio/postext"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("githubAriaLabel")}
            className="font-body text-sm text-slate transition-colors hover:text-foreground 2xl:text-base 4xl:text-lg"
          >
            {t("github")}
          </a>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
