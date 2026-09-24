import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { DocsSearchPalette, DocsSearchTrigger } from "@/components/docs/DocsSearchPalette";
import { Logo } from "@/components/brand/Logo";
import { MobileMenu } from "./MobileMenu";

const NAV_LINK =
  "rounded-md px-2 py-1 font-sans text-[0.8rem] font-medium text-slate transition-colors hover:text-foreground 2xl:text-sm 4xl:text-base";

export async function Navbar() {
  const t = await getTranslations("Navbar");

  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-50 w-full border-b border-rule bg-background/85 backdrop-blur-md backdrop-saturate-150"
    >
      <div aria-hidden="true" className="tri-stripe h-[3px] w-full" />
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2.5 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <Link href="/" aria-label={t("home")} className="rounded-md text-foreground">
          <Logo className="text-[1.35rem] 2xl:text-2xl 4xl:text-3xl" />
        </Link>
        <div className="hidden items-center gap-1.5 md:flex 2xl:gap-3 4xl:gap-4">
          <DocsSearchTrigger variant="compact" className="mr-2" />
          <Link href="/docs" className={NAV_LINK}>
            {t("docs")}
          </Link>
          <Link href="/sandbox" className={NAV_LINK}>
            {t("sandbox")}
          </Link>
          <a
            href="https://github.com/drnachio/postext"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("githubAriaLabel")}
            className={NAV_LINK}
          >
            {t("github")}
          </a>
          <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-rule" />
          <LanguageSwitcher />
          <ThemeToggle />
          <Link
            href="/sandbox"
            className="ml-2 rounded-md bg-brand px-3.5 py-1.5 font-sans text-[0.8rem] font-semibold text-brand-contrast shadow-[0_1px_0_rgba(0,0,0,0.2)] transition-colors hover:bg-brand-hover 2xl:text-sm 4xl:px-5 4xl:py-2 4xl:text-base"
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
