import { getLocale, getTranslations } from "next-intl/server";
import { ChapterOpener } from "@/components/brand/ChapterOpener";
import {
  JustificationGlyph,
  MathGlyph,
  OutputGlyph,
  ResourcesGlyph,
  SingleInkGlyph,
  TablesGlyph,
} from "./FeatureGlyphs";
import { Link } from "@/i18n/navigation";
import { featureDocPath } from "@/lib/featureDocs";

/** Key prefixes of the feature cards, in display order (the same order as
 *  `FEATURE_KEYS`). Adding a card touches the message files, this glyph map
 *  and the docs map in `lib/featureDocs.ts`, which sends each card to the
 *  section of the docs that explains it. */
const FEATURES = [
  ["justification", JustificationGlyph],
  ["resources", ResourcesGlyph],
  ["tables", TablesGlyph],
  ["singleInk", SingleInkGlyph],
  ["math", MathGlyph],
  ["output", OutputGlyph],
] as const;

export async function FeaturesSection() {
  const t = await getTranslations("Features");
  const tl = await getTranslations("Landing");
  const locale = await getLocale();

  return (
    <section aria-labelledby="features-heading">
      <ChapterOpener
        id="features-heading"
        color="gilt"
        number="2"
        kicker={`${tl("chapter")} 2 · ${t("eyebrow")}`}
        title={t("title")}
        lead={t("lead")}
      />
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-20 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <ol className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([key, Glyph], i) => (
            <li key={key} className="reveal">
              <Link
                href={featureDocPath(key, locale)}
                className="group relative flex h-full flex-col overflow-hidden rounded-md border-l-[4px] border-gold bg-tint/70 p-5 pl-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(14,16,20,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gilt dark:bg-surface"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="font-sans text-xs font-bold tracking-[0.18em] text-gilt uppercase">2.{i + 1}</span>
                  <span className="text-gilt transition-transform duration-300 group-hover:scale-105 dark:text-gold">
                    <Glyph />
                  </span>
                </div>
                <h3 className="mt-3 font-head text-lg font-bold tracking-[-0.01em] text-foreground md:text-xl">
                  {t(`${key}Title`)}
                </h3>
                <p className="mt-2 font-body text-[0.92rem] leading-[1.65] text-foreground/75">
                  {t(`${key}Description`)}
                </p>
                <span className="mt-auto pt-4 font-sans text-xs font-bold tracking-[0.12em] text-gilt uppercase dark:text-gold">
                  {t("docsLink")}{" "}
                  <span aria-hidden className="inline-block transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
