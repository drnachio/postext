import { getLocale, getTranslations } from "next-intl/server";
import { abbreviate } from "@/components/brand/abbreviate";
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
  const seen = new Set<string>();

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
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-rule bg-background transition-[border-color,box-shadow] duration-300 hover:border-gilt/50 hover:shadow-[0_18px_40px_-28px_rgba(14,16,20,0.5)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gilt dark:bg-surface"
              >
                {/* A figure plate: the glyph numbered like a figure in the guide. */}
                <div className="relative flex h-32 items-center justify-center border-b border-rule bg-tint/60 dark:bg-surface-2/60">
                  <span className="absolute top-3 start-4 font-sans text-[0.7rem] font-bold tracking-[0.18em] text-gilt tabular-nums">
                    2.{i + 1}
                  </span>
                  <span className="text-gilt transition-transform duration-300 group-hover:scale-105 dark:text-gold [&_svg]:h-[4.5rem] [&_svg]:w-[7.75rem]">
                    <Glyph />
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5 pt-4">
                  <h3 className="font-head text-lg font-bold tracking-[-0.01em] text-foreground md:text-xl">
                    {t(`${key}Title`)}
                  </h3>
                  <p className="mt-2 font-body text-[0.92rem] leading-[1.65] text-foreground/75">
                    {abbreviate(t(`${key}Description`), locale, ["svg", "epub"], seen)}
                  </p>
                  <span className="mt-auto pt-4 font-sans text-xs font-bold tracking-[0.12em] text-gilt uppercase dark:text-gold">
                    {t("docsLink")}{" "}
                    <span
                      aria-hidden
                      className="inline-block transition-transform duration-300 group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1"
                    >
                      →
                    </span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
