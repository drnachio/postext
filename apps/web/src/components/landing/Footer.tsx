import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/brand/Logo";
import { Kicker } from "@/components/brand/Kicker";

const LINK = "font-sans text-sm text-mist/80 transition-colors hover:text-gold 2xl:text-base";

/** The colophon: night, the three part colours along the head, the mark
 *  and the typefaces the site is set in. */
export async function Footer() {
  const t = await getTranslations("Footer");
  const nav = await getTranslations("Navbar");

  return (
    <footer role="contentinfo" className="on-night dark relative bg-night text-cream">
      <div aria-hidden="true" className="tri-stripe h-1.5 w-full" />
      <div className="mx-auto max-w-6xl px-6 pt-12 pb-8 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <Link href="/" aria-label={nav("home")} className="inline-block rounded-md text-white">
              <Logo className="text-3xl" />
            </Link>
            <p className="mt-5 max-w-sm font-body text-base leading-relaxed text-cream/80 italic">{t("tagline")}</p>
            <p className="mt-4 font-sans text-sm text-mist/70">
              {t("builtWith")}{" "}
              <a
                href="https://github.com/chenglou/pretext"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cream underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
              >
                @chenglou/pretext
              </a>
            </p>
          </div>

          <nav aria-label="Footer navigation" className="grid grid-cols-3 gap-8 md:col-span-7">
            <div>
              <Kicker className="text-gold">{t("product")}</Kicker>
              <ul className="mt-5 space-y-3">
                <li><Link href="/docs" className={LINK}>{t("docs")}</Link></li>
                <li><Link href="/sandbox" className={LINK}>{t("sandbox")}</Link></li>
              </ul>
            </div>
            <div>
              <Kicker className="text-gold">{t("resources")}</Kicker>
              <ul className="mt-5 space-y-3">
                <li>
                  <a href="https://github.com/drnachio/postext" target="_blank" rel="noopener noreferrer" className={LINK}>
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="https://www.npmjs.com/package/postext" target="_blank" rel="noopener noreferrer" className={LINK}>
                    npm
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <Kicker className="text-gold">{t("legal")}</Kicker>
              <ul className="mt-5 space-y-3">
                <li><Link href="/license" className={LINK}>{t("mitLicense")}</Link></li>
                <li><Link href="/privacy-policy" className={LINK}>{t("privacyPolicy")}</Link></li>
                <li><Link href="/cookie-policy" className={LINK}>{t("cookiePolicy")}</Link></li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 font-sans text-xs text-mist/60 md:flex-row md:items-center md:justify-between 2xl:text-sm">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          <p className="font-body italic">{t("colophon")}</p>
        </div>
      </div>
    </footer>
  );
}
