import { getLocale, getTranslations } from "next-intl/server";
import { Kicker } from "@/components/brand/Kicker";
import { MEDIA_BASE, ShowreelVideo } from "./ShowreelVideo";

/** The showreel between the cover and chapter 1: two narrated minutes on
 *  the engine, one cut per language. Hidden until `NEXT_PUBLIC_MEDIA_BASE`
 *  points at the media Worker. */
export async function ShowreelSection() {
  if (!MEDIA_BASE) return null;
  const t = await getTranslations("Showreel");
  const lang = (await getLocale()).startsWith("es") ? "es" : "en";

  return (
    <section
      aria-labelledby="showreel-heading"
      className="mx-auto max-w-5xl px-6 pt-4 pb-14 md:pb-20 2xl:max-w-6xl 2xl:px-8"
    >
      <div className="reveal">
        <Kicker className="text-brand">{t("kicker")}</Kicker>
        <h2
          id="showreel-heading"
          className="mt-3 mb-6 font-display text-2xl leading-tight font-medium tracking-[-0.015em] text-foreground md:text-[2rem]"
        >
          {t("title")}
        </h2>
        <ShowreelVideo
          lang={lang}
          title={t("title")}
          playLabel={t("play")}
          watchLabel={t("watch")}
        />
      </div>
    </section>
  );
}
