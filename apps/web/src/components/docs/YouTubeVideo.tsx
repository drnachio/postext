import { getLocale, getTranslations } from "next-intl/server";
import { NewTabNote } from "@/components/ui/NewTabNote";
import {
  isYouTubeFilm,
  youtubeCut,
  youtubeEmbedUrl,
  youtubePoster,
  youtubeWatchUrl,
} from "@/lib/youtubeVideos";
import { YouTubePlayer } from "./YouTubePlayer";

/** `<YouTubeVideo film="footnotes" />` in the docs: a film of the Postext
 *  channel, in the cut of the page's language (#1374). */
export async function YouTubeVideo({ film }: { film: string }) {
  if (!isYouTubeFilm(film)) throw new Error(`<YouTubeVideo>: unknown film "${film}"`);
  const locale = await getLocale();
  const t = await getTranslations("YouTubeVideos");
  const { id, duration } = youtubeCut(film, locale);
  const title = t(film);
  const watchUrl = youtubeWatchUrl(id);

  return (
    <figure className="docs-figure">
      <YouTubePlayer
        embedUrl={youtubeEmbedUrl(id, locale)}
        watchUrl={watchUrl}
        poster={youtubePoster(id)}
        title={title}
        playLabel={t("play")}
        duration={duration}
        // the Chinese and Japanese posters set their title vertically, down the right edge
        freeCorner={locale === "ja" || locale === "zh" ? "start" : "end"}
      />
      <figcaption className="docs-figcaption">
        <span className="block">{title}</span>
        <a href={watchUrl} target="_blank" rel="noreferrer">
          {t("watch")}
          <NewTabNote />
        </a>
        {" · "}
        {t("hint")}
      </figcaption>
    </figure>
  );
}
