import { getLocale, getTranslations } from "next-intl/server";
import { abbreviate } from "@/components/brand/abbreviate";
import { Kicker } from "@/components/brand/Kicker";

const KEYS = ["measure", "renderers", "pdf", "server"] as const;

/** The guide's "In figures" box: a dark page-wide panel, gilt title, the
 *  figures in balanced columns. */
export async function FiguresSection() {
  const t = await getTranslations("Figures");
  const locale = await getLocale();
  const seen = new Set<string>();
  const ids = ["pdf-ua", "cmyk", "mit"];
  return (
    <section aria-labelledby="figures-heading" className="mx-auto max-w-6xl px-6 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
      <div className="reveal relative overflow-hidden rounded-sm bg-ink px-6 py-8 text-mist shadow-[0_30px_60px_-30px_rgba(14,16,20,0.6)] md:px-10 md:py-10 dark:ring-1 dark:ring-white/5">
        <div aria-hidden="true" className="tri-stripe absolute inset-x-0 top-0 h-1" />
        <Kicker as="div" className="text-gold">
          <h2 id="figures-heading">{t("title")}</h2>
        </Kicker>
        <dl className="mt-6 grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {KEYS.map((k, i) => (
            <div key={k} className="lg:border-s lg:border-white/10 lg:ps-6 lg:first:border-s-0 lg:first:ps-0">
              <dt className="sr-only">{t(`${k}Label`)}</dt>
              <dd>
                <span
                  className={`display block text-4xl md:text-5xl ${i === 0 ? "text-gold" : "text-white"}`}
                >
                  {/* Figures read left to right, also in an Arabic page. */}
                  <bdi dir="ltr">{abbreviate(t(`${k}Value`), locale, ids, seen)}</bdi>
                </span>
                <span className="mt-3 block font-sans text-sm leading-relaxed text-mist">{abbreviate(t(`${k}Label`), locale, ids, seen)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
