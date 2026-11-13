import { siteLocale } from "@/i18n/locales";

/** The narrated films on the Postext YouTube channel that the docs embed, one
 *  cut per site locale (#1374). The showreel and the postext-port tutorial are
 *  not here: they play from the media CDN. A re-upload changes a film's id:
 *  the ids and the durations come from the motion-graphics repository
 *  (`youtube/*.json`, `timeline_<lang>.json`), the titles are the
 *  `YouTubeVideos` messages and the posters are in
 *  `public/docs-video-posters/<id>.webp`. */
export const YOUTUBE_VIDEOS = {
  editing: {
    en: { id: "A0DTz1LMv_Y", duration: "6:20" },
    es: { id: "-Uuw60aG2Dg", duration: "6:17" },
    ca: { id: "d01bNm72-tQ", duration: "6:10" },
    zh: { id: "Tc7YKBw7cUI", duration: "6:13" },
    ja: { id: "ylE5H28Fi2Q", duration: "7:44" },
    ar: { id: "gC22hF58yR0", duration: "6:51" },
    pt: { id: "AzU8TKev044", duration: "6:23" },
    fr: { id: "2ujpMLfNVjQ", duration: "6:08" },
    de: { id: "99zzoLocE6c", duration: "6:19" },
    it: { id: "FBWO2GX-El0", duration: "6:21" },
  },
  contents: {
    en: { id: "R000j4XgIpM", duration: "4:20" },
    es: { id: "Wy1iaZyyyeM", duration: "4:14" },
    ca: { id: "DJ6AvdxwAz0", duration: "4:13" },
    zh: { id: "dUdZBBNdf0Q", duration: "4:16" },
    ja: { id: "a0pZb0soPrI", duration: "5:11" },
    ar: { id: "YjjNyWTAb_s", duration: "4:40" },
    pt: { id: "dveINjSxrpM", duration: "4:20" },
    fr: { id: "l8NtzJgjg84", duration: "4:11" },
    de: { id: "FUtsvcNMMpo", duration: "4:22" },
    it: { id: "4uDXI-jlHrE", duration: "4:09" },
  },
  resources: {
    en: { id: "oXiawH3QLCU", duration: "4:38" },
    es: { id: "XK4Ls0dTM9E", duration: "4:32" },
    ca: { id: "qMq4rg9FhaQ", duration: "4:30" },
    zh: { id: "CB6gx4N0MVo", duration: "4:29" },
    ja: { id: "XZYy7VVvWDQ", duration: "5:30" },
    ar: { id: "QNXotVsFKJI", duration: "5:04" },
    pt: { id: "_rN_SHKRV9M", duration: "4:40" },
    fr: { id: "-663_LtBypk", duration: "4:25" },
    de: { id: "QtAv1Ct05RU", duration: "4:32" },
    it: { id: "qvgfZVUItNw", duration: "4:30" },
  },
  footnotes: {
    en: { id: "n8TtshZOJUk", duration: "3:18" },
    es: { id: "xowZy9vbK5w", duration: "3:09" },
    ca: { id: "jAE60fderuM", duration: "3:08" },
    zh: { id: "w_bFsBLBd-c", duration: "3:22" },
    ja: { id: "pBuC0CF2vwY", duration: "4:03" },
    ar: { id: "PDltvQ5V4lg", duration: "3:39" },
    pt: { id: "V24pEkUFSZs", duration: "3:13" },
    fr: { id: "XozUAAgOfsY", duration: "3:05" },
    de: { id: "aGLxkkhuDtk", duration: "3:19" },
    it: { id: "WquKtJyIVSQ", duration: "3:11" },
  },
  backIndex: {
    en: { id: "tVkY6MUPl98", duration: "3:48" },
    es: { id: "mim4N3PwxzA", duration: "3:42" },
    ca: { id: "d1OVuNqkxnU", duration: "3:39" },
    zh: { id: "9JIsr1JmGkM", duration: "3:46" },
    ja: { id: "jusgN3CD7VY", duration: "4:47" },
    ar: { id: "XHaAqG84TR0", duration: "4:04" },
    pt: { id: "0YJi8l6rLPs", duration: "3:44" },
    fr: { id: "kJb1-KzsB3A", duration: "3:38" },
    de: { id: "bju8sZGgocc", duration: "3:46" },
    it: { id: "xvipF2JIqtk", duration: "3:38" },
  },
  citations: {
    en: { id: "ISqNyoFlsVk", duration: "3:57" },
    es: { id: "rUjMzyfJDLI", duration: "3:49" },
    ca: { id: "GcR49QP1A6k", duration: "3:45" },
    zh: { id: "6jjmvO9RjLw", duration: "3:55" },
    ja: { id: "xinz3rZxL1Q", duration: "4:42" },
    ar: { id: "re-mhmoIp8U", duration: "4:18" },
    pt: { id: "V_2XxoWtxqM", duration: "3:56" },
    fr: { id: "2NsgN6aP6tI", duration: "3:43" },
    de: { id: "14mZ7bVaPUk", duration: "3:54" },
    it: { id: "GIzRBhaP9Gg", duration: "3:47" },
  },
  citationStyles: {
    en: { id: "0wfe_PCLIuo", duration: "3:48" },
    es: { id: "VJFK7s8j8Xk", duration: "3:35" },
    ca: { id: "8RWuvB8QcZU", duration: "3:37" },
    zh: { id: "D4rly8PF0WU", duration: "3:54" },
    ja: { id: "F6XgtUxSFec", duration: "4:39" },
    ar: { id: "H1KPqhzQPeU", duration: "4:10" },
    pt: { id: "ZbL_biofZ5M", duration: "3:45" },
    fr: { id: "TqOlsfJxK1g", duration: "3:37" },
    de: { id: "0inKZ6Mh620", duration: "3:41" },
    it: { id: "2zX86Im4DZM", duration: "3:36" },
  },
  crossReferences: {
    en: { id: "2bbbZ6svP-M", duration: "3:28" },
    es: { id: "Ffi5gum2QKc", duration: "3:29" },
    ca: { id: "_dXXj6Lh5gY", duration: "3:25" },
    zh: { id: "lvhMVAofaqs", duration: "3:22" },
    ja: { id: "mmXnvGHLyt4", duration: "4:06" },
    ar: { id: "xvOLO-xe3-M", duration: "3:52" },
    pt: { id: "s2p6ULducGQ", duration: "3:33" },
    fr: { id: "n4-t9RDvWXk", duration: "3:24" },
    de: { id: "rrv9Bj7k26A", duration: "3:25" },
    it: { id: "yXmpqm9FZTE", duration: "3:26" },
  },
  comics: {
    en: { id: "E9skE9VdrNA", duration: "7:27" },
    es: { id: "Iy-vL-rGvh0", duration: "7:33" },
    ca: { id: "dz7MVKAmQpY", duration: "7:24" },
    zh: { id: "28n6wWLt5g0", duration: "7:22" },
    ja: { id: "5BLKjIHEX5I", duration: "9:10" },
    ar: { id: "PoZKnRsBLzQ", duration: "8:28" },
    pt: { id: "9igvD-Y-INA", duration: "7:42" },
    fr: { id: "IxStM8T5T5w", duration: "7:03" },
    de: { id: "CC-ROm5e4nI", duration: "7:26" },
    it: { id: "1dlwUjD2eDE", duration: "7:25" },
  },
  composedPages: {
    en: { id: "b2O_H_cO8do", duration: "5:07" },
    es: { id: "1_jPNJ_y9mk", duration: "5:09" },
    ca: { id: "PUWuAFWO2R8", duration: "4:56" },
    zh: { id: "gsx_HhIydcg", duration: "5:10" },
    ja: { id: "k9k8On7H7pE", duration: "6:14" },
    ar: { id: "1G2vJfwlve0", duration: "5:26" },
    pt: { id: "GtY6UujtRaQ", duration: "5:04" },
    fr: { id: "hTcbjB__BRM", duration: "4:46" },
    de: { id: "BVaB6MHrKoo", duration: "5:08" },
    it: { id: "efYxWNeZpAo", duration: "5:00" },
  },
  labelledImages: {
    en: { id: "BXlImsBjp14", duration: "5:19" },
    es: { id: "NmnWyHYXpz8", duration: "5:25" },
    ca: { id: "Hc5jIBvniAk", duration: "5:16" },
    zh: { id: "JP30z2Ol60E", duration: "5:18" },
    ja: { id: "8z2U5CIACJE", duration: "6:31" },
    ar: { id: "BDFdTBxf4d0", duration: "5:46" },
    pt: { id: "B3gwHygZYRM", duration: "5:31" },
    fr: { id: "WW-gvnY2nsY", duration: "5:07" },
    de: { id: "oOZi45DZXu0", duration: "5:20" },
    it: { id: "b1498dWHPj8", duration: "5:24" },
  },
  everyScript: {
    en: { id: "B-UpSYHC1-A", duration: "4:45" },
    es: { id: "SpHhjSp2ZNc", duration: "4:42" },
    ca: { id: "LnBGg_JGOyQ", duration: "4:36" },
    zh: { id: "bn-6pPv4T3U", duration: "4:38" },
    ja: { id: "74fESRAy8yY", duration: "5:27" },
    ar: { id: "3WRUJg55VPY", duration: "5:17" },
    pt: { id: "E-r3e3YRHKw", duration: "4:54" },
    fr: { id: "sjHZGoP6kII", duration: "4:23" },
    de: { id: "iPszXNrcrO4", duration: "4:49" },
    it: { id: "HMHTS7z6Ohg", duration: "4:41" },
  },
  checks: {
    en: { id: "IKQ7NVah5Go", duration: "5:06" },
    es: { id: "UcL5Gr4cCIo", duration: "5:06" },
    ca: { id: "c3VFoCN9t2g", duration: "5:02" },
    zh: { id: "laV5x5jgSKI", duration: "4:59" },
    ja: { id: "RdbSBhHAQPI", duration: "6:12" },
    ar: { id: "uZhGkKdXjJE", duration: "5:42" },
    pt: { id: "CjbjMQNpZFo", duration: "5:04" },
    fr: { id: "YXIgfOCnuJU", duration: "4:49" },
    de: { id: "gCf0BBfW3e0", duration: "5:18" },
    it: { id: "OkFcr7L54R8", duration: "5:02" },
  },
  music: {
    en: { id: "ow3sikXX0Rs", duration: "4:33" },
    es: { id: "Xu1HhegZ1F4", duration: "4:35" },
    ca: { id: "PA8p8Lo6fYg", duration: "4:34" },
    zh: { id: "SL7aaTwSJtE", duration: "4:38" },
    ja: { id: "iu6FBqA45I0", duration: "5:39" },
    ar: { id: "7uUlHTFGbjg", duration: "5:09" },
    pt: { id: "JNZexD85_ho", duration: "4:40" },
    fr: { id: "wMHCq-ThBiw", duration: "4:22" },
    de: { id: "zNAdFe1zSl4", duration: "4:46" },
    it: { id: "SC59xqUAFBo", duration: "4:35" },
  },
  exercises: {
    en: { id: "_v6dgY9waXM", duration: "4:20" },
    es: { id: "pupoiule17Q", duration: "4:23" },
    ca: { id: "3x2wV8AY8RE", duration: "4:23" },
    zh: { id: "kJCSWgUi2Uo", duration: "4:18" },
    ja: { id: "i0nZ7vUSvdo", duration: "5:49" },
    ar: { id: "0Tr14BLQWSg", duration: "4:57" },
    pt: { id: "BY7PTtLHBqM", duration: "4:33" },
    fr: { id: "kH-SvygKcOY", duration: "4:05" },
    de: { id: "5s0Ce7cOOmc", duration: "4:31" },
    it: { id: "ldyZcFUbtqA", duration: "4:19" },
  },
  everyLanguage: {
    en: { id: "jERgKQFceKQ", duration: "3:54" },
    es: { id: "eYzVNuxyODQ", duration: "3:44" },
    ca: { id: "Jsv3LbfhLZk", duration: "3:42" },
    zh: { id: "ykmTI6pnwrM", duration: "3:53" },
    ja: { id: "X87Jb9HMfCk", duration: "4:21" },
    ar: { id: "Y-jWWUQ5vJE", duration: "4:17" },
    pt: { id: "OqhBYDHIN64", duration: "4:00" },
    fr: { id: "fFsHzUMw28c", duration: "3:39" },
    de: { id: "U_APE3c7yTk", duration: "3:57" },
    it: { id: "diU4amjZgGI", duration: "3:43" },
  },
  everyOutput: {
    en: { id: "IrtI0vuXvg4", duration: "4:43" },
    es: { id: "5sRnkPXyUC8", duration: "4:51" },
    ca: { id: "SePcUQGAn9A", duration: "4:40" },
    zh: { id: "ODQfssGf4_A", duration: "4:32" },
    ja: { id: "2cELQIwJsnQ", duration: "5:46" },
    ar: { id: "waDrkAQFMFs", duration: "5:18" },
    pt: { id: "k48DeOEyhBk", duration: "4:43" },
    fr: { id: "UIN2S9FMilo", duration: "4:28" },
    de: { id: "zMCgo_INXJI", duration: "4:39" },
    it: { id: "x5RfF2IHIcg", duration: "4:33" },
  },
  justification: {
    en: { id: "EP5dbSd6Vlo", duration: "3:54" },
    es: { id: "OQJCtS4UXHI", duration: "3:53" },
    ca: { id: "TxixhVV7zC4", duration: "3:58" },
    zh: { id: "7SCVgp2HQ2o", duration: "3:59" },
    ja: { id: "LM_oi6auBjI", duration: "5:02" },
    ar: { id: "Mz91ScPVWlo", duration: "4:35" },
    pt: { id: "4Dfw8rc0c-4", duration: "4:05" },
    fr: { id: "oLP5wS6DDAQ", duration: "3:49" },
    de: { id: "e9eqJroTL84", duration: "4:04" },
    it: { id: "2uNNhVzBNVQ", duration: "3:55" },
  },
  wordFiles: {
    en: { id: "QsPj19rrzDg", duration: "3:49" },
    es: { id: "_GTzB57Ijwg", duration: "3:46" },
    ca: { id: "UFjIqTyMI5Y", duration: "3:35" },
    zh: { id: "dYbRjrKhwwA", duration: "3:49" },
    ja: { id: "stehu_VePfQ", duration: "4:42" },
    ar: { id: "hcmTkcFh028", duration: "4:17" },
    pt: { id: "bf3DMVBQPxg", duration: "3:52" },
    fr: { id: "vPCH8agCUqM", duration: "3:33" },
    de: { id: "B8QQycV1yUs", duration: "3:52" },
    it: { id: "wdb7vZiTkNI", duration: "3:41" },
  },
  indesign: {
    en: { id: "Rel3IvPCsg0", duration: "4:25" },
    es: { id: "e0-cA8hMw2g", duration: "4:24" },
    ca: { id: "Fhvrw8BLnTk", duration: "4:19" },
    zh: { id: "ZaV91XYhKp0", duration: "4:21" },
    ja: { id: "mqnmHdmuQWA", duration: "5:27" },
    ar: { id: "7FMv566OXEU", duration: "4:55" },
    pt: { id: "mjyGcX7TEgg", duration: "4:23" },
    fr: { id: "fRHJeLf-vBM", duration: "4:16" },
    de: { id: "-gMnnuenwtI", duration: "4:36" },
    it: { id: "J_MNweWbeho", duration: "4:24" },
  },
} as const;

export type YouTubeFilm = keyof typeof YOUTUBE_VIDEOS;

export function isYouTubeFilm(value: string): value is YouTubeFilm {
  return Object.prototype.hasOwnProperty.call(YOUTUBE_VIDEOS, value);
}

/** A film's cut for a route locale. */
export function youtubeCut(film: YouTubeFilm, locale: string): { id: string; duration: string } {
  return YOUTUBE_VIDEOS[film][siteLocale(locale)];
}

/** The film's page on YouTube. */
export function youtubeWatchUrl(id: string): string {
  return `https://youtu.be/${id}`;
}

/** The player, which sets no cookie until the reader plays the video. */
export function youtubeEmbedUrl(id: string, locale: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&hl=${siteLocale(locale)}`;
}

/** The self-hosted poster, so a page asks YouTube for nothing before play. */
export function youtubePoster(id: string): string {
  return `/docs-video-posters/${id}.webp`;
}
