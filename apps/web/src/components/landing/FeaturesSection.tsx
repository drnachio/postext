import { getTranslations } from "next-intl/server";
import { ChapterOpener } from "@/components/brand/ChapterOpener";
import {
  JustificationGlyph,
  MathGlyph,
  OutputGlyph,
  ResourcesGlyph,
  SingleInkGlyph,
  TablesGlyph,
} from "./FeatureGlyphs";

/** Key prefixes of the feature cards, in display order. Each entry expects a
 *  `<key>Title` and `<key>Description` pair in the `Features` namespace of
 *  both message files — adding a card touches the message files and the
 *  glyph map. */
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
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <ol className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([key, Glyph], i) => (
            <li
              key={key}
              className="reveal group relative flex flex-col overflow-hidden rounded-md border-l-[4px] border-gold bg-tint/70 p-6 pl-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(14,16,20,0.45)] dark:bg-surface 2xl:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="font-sans text-xs font-bold tracking-[0.18em] text-gilt uppercase">2.{i + 1}</span>
                <span className="text-gilt transition-transform duration-300 group-hover:scale-105 dark:text-gold">
                  <Glyph />
                </span>
              </div>
              <h3 className="mt-4 font-head text-xl font-bold tracking-[-0.01em] text-foreground 2xl:text-2xl">
                {t(`${key}Title`)}
              </h3>
              <p className="mt-3 font-body text-[0.95rem] leading-[1.7] text-foreground/75 2xl:text-base">
                {t(`${key}Description`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
