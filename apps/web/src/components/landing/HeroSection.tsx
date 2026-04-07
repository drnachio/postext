import { getTranslations } from "next-intl/server";
import { version } from "postext/package.json";
import { HeroAnimation } from "./HeroAnimation";

export async function HeroSection() {
  const t = await getTranslations("Hero");

  return (
    <section aria-labelledby="hero-heading" className="relative">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-12 px-6 pt-24 pb-16 md:flex-row md:items-center md:justify-between 2xl:max-w-6xl 2xl:gap-16 2xl:px-8 2xl:pt-32 2xl:pb-20 4xl:max-w-7xl 4xl:gap-20 4xl:px-12 4xl:pt-40 4xl:pb-24">
        <div className="text-left">
          <p className="font-mono text-xs text-gilt 2xl:text-sm 4xl:text-base">{`v${version}`}</p>
          <h1
            id="hero-heading"
            className="mt-4 max-w-md font-display text-2xl font-bold italic leading-[1.08] tracking-tight md:text-3xl 2xl:max-w-lg 2xl:text-4xl 4xl:max-w-xl 4xl:text-5xl"
            style={{ textWrap: "balance" }}
          >
            {t("title")}
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-slate 2xl:max-w-lg 2xl:text-lg 4xl:max-w-xl 4xl:text-xl">
            {t("subtitle")}
          </p>
          <div className="mt-8 flex gap-6 2xl:mt-10 4xl:mt-12">
            <a
              href="#install"
              role="button"
              className="border border-gilt bg-gilt px-6 py-3 font-display text-sm font-semibold text-background transition-colors hover:bg-gilt-hover 2xl:px-8 2xl:py-4 2xl:text-base 4xl:px-10 4xl:py-5 4xl:text-lg"
              style={{ touchAction: "manipulation" }}
            >
              {t("getStarted")}
            </a>
            <a
              href="https://github.com/drnachio/postext"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-rule px-6 py-3 font-display text-sm font-semibold text-foreground transition-colors hover:border-slate 2xl:px-8 2xl:py-4 2xl:text-base 4xl:px-10 4xl:py-5 4xl:text-lg"
              style={{ touchAction: "manipulation" }}
            >
              {t("viewOnGitHub")}
            </a>
          </div>
        </div>

        <HeroAnimation />
      </div>
    </section>
  );
}
