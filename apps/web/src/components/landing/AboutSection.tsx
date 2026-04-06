import { getTranslations } from "next-intl/server";

export async function AboutSection() {
  const t = await getTranslations("About");

  return (
    <section aria-labelledby="about-heading" className="mx-auto w-full max-w-5xl px-6 py-24 2xl:max-w-6xl 2xl:px-8 2xl:py-32 4xl:max-w-7xl 4xl:px-12 4xl:py-40">
      <div className="grid grid-cols-1 gap-16 md:grid-cols-12 2xl:gap-20 4xl:gap-24">
        {/* Left — explanation */}
        <div className="md:col-span-5">
          <p className="font-mono text-xs uppercase tracking-widest text-slate 2xl:text-sm 4xl:text-base">
            {t("eyebrow")}
          </p>
          <h2
            id="about-heading"
            className="mt-4 font-display text-3xl font-bold italic leading-tight tracking-tight 2xl:text-4xl 4xl:text-5xl"
            style={{ textWrap: "balance" }}
          >
            {t("titleLine1")}
            <br />
            {t("titleLine2")}
          </h2>
          <p className="mt-6 leading-[1.8] text-slate 2xl:text-lg 4xl:text-xl">
            {t("paragraph1")}
          </p>
          <p className="mt-4 leading-[1.8] text-slate 2xl:text-lg 4xl:text-xl">
            {t("paragraph2prefix")}
            <a
              href="https://github.com/chenglou/pretext"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline decoration-rule underline-offset-4 hover:decoration-foreground"
            >
              {t("pretextLink")}
            </a>
            {t("paragraph2suffix")}
          </p>
        </div>

        {/* Divider */}
        <div className="hidden md:col-span-1 md:flex md:justify-center" aria-hidden="true">
          <div className="column-rule" />
        </div>

        {/* Right — visual: markdown → typeset output */}
        <div className="md:col-span-6">
          <div className="space-y-6 2xl:space-y-8 4xl:space-y-10">
            <div>
              <p className="mb-2 font-mono text-xs text-slate 2xl:text-sm 4xl:text-base">{t("inputLabel")}</p>
              <pre
                className="overflow-x-auto border border-rule bg-surface p-5 font-mono text-sm leading-7 text-slate 2xl:p-6 2xl:text-base 2xl:leading-8 4xl:p-8 4xl:text-lg 4xl:leading-9"
                aria-label={t("inputAriaLabel")}
              >
{`# Chapter One

The quick brown fox jumps over
the lazy dog. A paragraph with
a {{figure:hero-img}} reference
and a footnote.[^1]

[^1]: Additional context placed
at column bottom automatically.`}
              </pre>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs text-slate 2xl:text-sm 4xl:text-base">{t("outputLabel")}</p>
              <div
                className="flex gap-4 border border-rule bg-surface p-5 2xl:gap-6 2xl:p-6 4xl:gap-8 4xl:p-8"
                role="img"
                aria-label={t("outputAriaLabel")}
              >
                <div className="flex-1 space-y-2 2xl:space-y-3 4xl:space-y-4">
                  <div className="h-3 w-3/4 bg-rule 2xl:h-4 4xl:h-5" />
                  <div className="h-2 w-full bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="h-2 w-full bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="h-2 w-5/6 bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="mt-3 h-12 w-full border border-rule bg-background 2xl:mt-4 2xl:h-16 4xl:mt-5 4xl:h-20" />
                  <div className="h-2 w-full bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="h-2 w-4/5 bg-rule/50 2xl:h-3 4xl:h-4" />
                </div>
                <div className="column-rule" />
                <div className="flex-1 space-y-2 2xl:space-y-3 4xl:space-y-4">
                  <div className="h-2 w-full bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="h-2 w-full bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="h-2 w-full bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="h-2 w-3/4 bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="h-2 w-full bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="h-2 w-full bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="h-2 w-2/3 bg-rule/50 2xl:h-3 4xl:h-4" />
                  <div className="mt-4 border-t border-rule pt-2 2xl:mt-5 2xl:pt-3 4xl:mt-6 4xl:pt-4">
                    <div className="h-1.5 w-3/4 bg-rule/30 2xl:h-2 4xl:h-3" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
