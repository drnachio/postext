import { getTranslations } from "next-intl/server";
import { version } from "postext/package.json";
import { Link } from "@/i18n/navigation";
import { Kicker } from "@/components/brand/Kicker";
import { HeroArt } from "./HeroArt";
import { InstallChip } from "./InstallChip";

/** The cover: always night, whatever the theme — like the guide's. */
export async function HeroSection() {
  const t = await getTranslations("Hero");

  return (
    <section
      aria-labelledby="hero-heading"
      className="on-night dark relative isolate overflow-hidden bg-night text-cream"
    >
      <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-0 -z-10" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 -z-10 size-[42rem] rounded-full bg-blue/25 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-56 left-[-12rem] -z-10 size-[34rem] rounded-full bg-gold/10 blur-[140px]"
      />

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 pt-10 pb-14 md:pt-12 lg:grid-cols-12 lg:gap-8 lg:pb-16 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <div className="lg:col-span-6">
          <Kicker className="text-gold">
            {t("kicker")} <span className="mx-1.5 text-gold/50">·</span> v{version}
          </Kicker>
          <h1
            id="hero-heading"
            className="display hero-title mt-5 text-[2.6rem] text-white sm:text-[3.2rem] lg:text-[3.5rem] xl:text-[3.9rem] 2xl:text-[4.1rem]"
            style={{ textWrap: "balance" }}
          >
            {t.rich("title", {
              em: (chunks) => <em className="hero-em">{chunks}</em>,
            })}
          </h1>
          <span aria-hidden="true" className="mt-6 block h-[3px] w-14 bg-gold" />
          <p className="mt-5 max-w-xl font-body text-base leading-relaxed text-cream/80 italic lg:text-[1.05rem]">
            {t("subtitle")}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/sandbox"
              className="group inline-flex items-center gap-2 rounded-md bg-gold px-5 py-2.5 font-sans text-sm font-semibold text-night shadow-[0_10px_30px_-10px_rgba(216,162,26,0.6)] transition-all hover:-translate-y-0.5 hover:bg-[#e8b73a]"
            >
              {t("openSandbox")}
              <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <a
              href="#install"
              className="inline-flex items-center rounded-md border border-white/20 px-5 py-2.5 font-sans text-sm font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/5"
            >
              {t("getStarted")}
            </a>
          </div>
          <InstallChip className="mt-5" />
        </div>

        <div className="relative lg:col-span-6 lg:-mr-12 xl:-mr-20">
          <HeroArt label={t("artAlt")} className="h-auto w-full drop-shadow-[0_30px_60px_rgba(0,0,0,0.5)]" />
          <p className="kicker mt-2 text-center text-mist/60">{t("colophon")}</p>
        </div>
      </div>
      <div aria-hidden="true" className="tri-stripe h-1.5 w-full" />
    </section>
  );
}
