import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { youtubeUrl } from "@/i18n/locales";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ReadingPreferences } from "@/components/reading/ReadingPreferences";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { DocsSearchPalette, DocsSearchTrigger } from "@/components/docs/DocsSearchPalette";
import { Logo } from "@/components/brand/Logo";
import { MobileMenu } from "./MobileMenu";
import { NavLink } from "./NavLink";
import { HomeLink } from "./HomeLink";

const NAV_LINK =
  "inline-flex min-h-10 items-center rounded-md px-2 py-1 font-sans text-[0.8rem] font-medium text-slate transition-colors hover:text-foreground 2xl:text-sm 4xl:text-base";

export async function Navbar() {
  const t = await getTranslations("Navbar");
  const locale = await getLocale();

  return (
    <nav
      aria-label={t("mainNav")}
      data-site-nav=""
      className="sticky top-0 z-50 w-full border-b border-rule bg-background/85 backdrop-blur-md backdrop-saturate-150"
    >
      <div aria-hidden="true" className="tri-stripe h-[3px] w-full" />
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2 px-6 py-2.5 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <HomeLink label={t("home")} className="rounded-md text-foreground">
          <Logo className="text-[1.35rem] 2xl:text-2xl 4xl:text-3xl" />
        </HomeLink>
        {/* Wraps when text is enlarged (WCAG 1.4.4 / 1.4.8) instead of overflowing. */}
        <div className="hidden min-w-0 flex-wrap items-center justify-end gap-1.5 md:flex 2xl:gap-3 4xl:gap-4">
          <DocsSearchTrigger variant="compact" className="me-2" />
          <NavLink href="/docs" className={NAV_LINK}>
            {t("docs")}
          </NavLink>
          {/* The Sandbox is the CTA on the right, so the text links name the
              two reading sections. */}
          <NavLink href="/cookbook" className={NAV_LINK}>
            {t("cookbook")}
          </NavLink>
          {/* Below lg (xl for YouTube), these live in the footer and the
              mobile menu: the row would overflow at 768 px with them. */}
          <a
            href="https://github.com/drnachio/postext"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("githubAriaLabel")}
            className={`${NAV_LINK} hidden lg:inline-flex`}
          >
            {t("github")}
          </a>
          <a
            href={youtubeUrl(locale)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("youtubeAriaLabel")}
            className={`${NAV_LINK} hidden xl:inline-flex`}
          >
            {t("youtube")}
          </a>
          <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-rule" />
          <LanguageSwitcher />
          <ThemeToggle />
          <ReadingPreferences />
          <Link
            href="/sandbox"
            className="ms-2 inline-flex min-h-10 items-center whitespace-nowrap rounded-md bg-brand px-3.5 py-1.5 font-sans text-[0.8rem] font-semibold text-brand-contrast shadow-[0_1px_0_rgba(0,0,0,0.2)] transition-colors hover:bg-brand-hover 2xl:text-sm 4xl:px-5 4xl:py-2 4xl:text-base"
          >
            {t("tryIt")}
          </Link>
        </div>
        <MobileMenu />
      </div>
      <DocsSearchPalette />
    </nav>
  );
}
