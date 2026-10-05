import { getLocale, getTranslations } from "next-intl/server";
import { MEDIA_BASE, ShowreelVideo } from "./ShowreelVideo";
import { VideoTranscript } from "./VideoTranscript";

/** The showreel between the cover and chapter 1: two narrated minutes on
 *  the engine, one cut per language. Hidden until `NEXT_PUBLIC_MEDIA_BASE`
 *  points at the media Worker. */
export async function ShowreelSection() {
  if (!MEDIA_BASE) return null;
  const t = await getTranslations("Showreel");
  const locale = await getLocale();
  // No Catalan cut: Catalan pages play the Spanish one. No Arabic or
  // Japanese cut: those pages play the English one, with their own
  // transcript underneath.
  const lang = /^(es|ca)/.test(locale) ? "es" : locale.startsWith("zh") ? "zh" : "en";

  return (
    <section
      aria-label={t("title")}
      className="mx-auto max-w-5xl px-6 py-14 md:py-20 2xl:max-w-6xl 2xl:px-8"
    >
      <div className="reveal">
        <ShowreelVideo
          lang={lang}
          title={t("title")}
          playLabel={t("play")}
          watchLabel={t("watch")}
          subtitlesLabel={t("subtitles")}
          fullscreenLabel={t("fullscreen")}
          exitFullscreenLabel={t("exitFullscreen")}
        />
        <VideoTranscript video="showreel" locale={locale} />
      </div>
    </section>
  );
}
