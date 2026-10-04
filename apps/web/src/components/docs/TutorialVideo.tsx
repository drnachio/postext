import { getLocale, getTranslations } from "next-intl/server";
import { MEDIA_BASE, ShowreelVideo } from "@/components/landing/ShowreelVideo";
import { VideoTranscript } from "@/components/landing/VideoTranscript";

/** `<TutorialVideo />` in the docs: the narrated postext-port tutorial, one
 *  cut per language, on the same player as the home page showreel. Nothing
 *  renders while `NEXT_PUBLIC_MEDIA_BASE` is unset. */
export async function TutorialVideo() {
  if (!MEDIA_BASE) return null;
  const t = await getTranslations("Tutorial");
  const locale = await getLocale();
  // No Catalan cut: Catalan pages play the Spanish one.
  const lang = /^(es|ca)/.test(locale) ? "es" : locale.startsWith("zh") ? "zh" : "en";

  return (
    <div className="my-6">
      <ShowreelVideo
        video="tutorial"
        lang={lang}
        title={t("title")}
        playLabel={t("play")}
        watchLabel={t("watch")}
        subtitlesLabel={t("subtitles")}
        fullscreenLabel={t("fullscreen")}
        exitFullscreenLabel={t("exitFullscreen")}
      />
      <VideoTranscript video="tutorial" locale={locale} />
    </div>
  );
}
