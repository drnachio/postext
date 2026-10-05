// The guide's two videos (#478): the showreel and the postext-port skill
// tutorial, narrated cuts streamed as HLS from the media CDN (the
// `postext-media` Worker in front of Cloudflare R2, the player the home
// page and the docs use). Only the English, Spanish and Simplified Chinese
// editions carry them: those are the languages the videos were cut in.

import type { Resource, ResourcePlacement } from 'postext';
import type { GuideLang } from './lang';

/** The media CDN; each video lives under `<video>/<version>/<cut>/`. */
export const GUIDE_MEDIA_BASE = 'https://postext-media.a2r-crew.workers.dev';
const VERSION = 'v1';

/** The ids the guide's markdown refers to. */
export const GUIDE_VIDEO_IDS = {
  showreel: 'postext-showreel',
  tutorial: 'skill-tutorial',
} as const;

type VideoLang = 'en' | 'es' | 'zh-Hans';

/** The cut each edition plays. */
const CUT: Record<VideoLang, 'en' | 'es' | 'zh'> = { en: 'en', es: 'es', 'zh-Hans': 'zh' };

/** Whether an edition of the guide carries the videos. */
export function guideHasVideos(lang: GuideLang): lang is VideoLang {
  return lang in CUT;
}

interface VideoSpec {
  id: string;
  path: 'showreel' | 'tutorial';
  placement: ResourcePlacement;
  /** Length of each cut in seconds. */
  duration: Record<VideoLang, number>;
  caption: Record<VideoLang, string>;
  altText: Record<VideoLang, string>;
}

const SPECS: VideoSpec[] = [
  {
    id: GUIDE_VIDEO_IDS.showreel,
    path: 'showreel',
    placement: { position: 'auto', span: 'page' },
    duration: { en: 124.08, es: 131.65, 'zh-Hans': 137.63 },
    caption: {
      en: 'Postext in two minutes: how it sets a page, the Sandbox and what comes out of it. In the Folio view a click plays it on the page; in print, the QR code opens it.',
      es: 'Postext en dos minutos: cómo compone una página, el Sandbox y lo que sale de él. En la vista Folio, un clic lo reproduce sobre la página; impreso, lo abre el código QR.',
      'zh-Hans': '两分钟了解Postext：它怎样排出一页、Sandbox，以及能输出什么。在书页视图中点击它，就在页面上播放；印刷版上扫描二维码即可观看。',
    },
    altText: {
      en: 'The opening frame of the video: the Postext logo, the line "The programmable typesetter for the web", postext.dev and the command pnpm add postext.',
      es: 'El primer fotograma del vídeo: el logotipo de Postext, el lema «El tipógrafo programable para la web», postext.dev y la orden pnpm add postext.',
      'zh-Hans': '视频的第一帧：Postext的标志、一句口号、网址postext.dev和安装命令pnpm add postext。',
    },
  },
  {
    id: GUIDE_VIDEO_IDS.tutorial,
    path: 'tutorial',
    placement: { position: 'auto', span: 'page' },
    duration: { en: 310.17, es: 306.1, 'zh-Hans': 316.93 },
    caption: {
      en: 'The postext-port skill at work: an agent brings a book that was already typeset into Postext, a chapter at a time, and checks every page it sets.',
      es: 'El skill postext-port trabajando: un agente pasa a Postext un libro que ya estaba maquetado, capítulo a capítulo, y revisa cada página que compone.',
      'zh-Hans': 'postext-port技能的实际操作：智能体把一本已经排好的书逐章转成Postext，并检查排出的每一页。',
    },
    altText: {
      en: 'A frame of the tutorial: a request to the agent to convert a book with the postext-port skill, beside a folder holding the reference PDF, the fonts and the illustrations.',
      es: 'Un fotograma del tutorial: la petición al agente para convertir un libro con el skill postext-port, junto a una carpeta con el PDF de referencia, las fuentes y las ilustraciones.',
      'zh-Hans': '教程中的一帧：请智能体用postext-port技能转换一本书的请求，旁边是装有样张PDF、字体和插图原稿的文件夹。',
    },
  },
];

/** The blob id of a video's poster in one edition. */
export function guideVideoPosterId(id: string, lang: VideoLang): string {
  return `default-video-${id}-${CUT[lang]}`;
}

/** The posters' bytes for an edition, by blob id (a chunk of its own, loaded
 *  only for the editions with videos). */
export async function guideVideoPosters(lang: GuideLang): Promise<Record<string, Uint8Array>> {
  if (!guideHasVideos(lang)) return {};
  const mod = CUT[lang] === 'es' ? await import('./videoPosters/es') : CUT[lang] === 'zh' ? await import('./videoPosters/zh') : await import('./videoPosters/en');
  const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return {
    [guideVideoPosterId(GUIDE_VIDEO_IDS.showreel, lang)]: bytes(mod.SHOWREEL_POSTER),
    [guideVideoPosterId(GUIDE_VIDEO_IDS.tutorial, lang)]: bytes(mod.TUTORIAL_POSTER),
  };
}

/** The address a video's cut is streamed from. */
export function guideVideoUrl(path: VideoSpec['path'], lang: VideoLang): string {
  return `${GUIDE_MEDIA_BASE}/${path}/${VERSION}/${CUT[lang]}/master.m3u8`;
}

/** The video resources of an edition (none for the editions without a cut):
 *  HLS streams played from their address, their posters stored under
 *  {@link guideVideoPosterId}. */
export function guideVideoResources(lang: GuideLang, now: number): Resource[] {
  if (!guideHasVideos(lang)) return [];
  return SPECS.map((spec) => ({
    id: spec.id,
    typeId: 'video',
    kind: 'video',
    video: {
      source: 'file',
      url: guideVideoUrl(spec.path, lang),
      format: 'hls',
      width: 1920,
      height: 1080,
      duration: spec.duration[lang],
      poster: { fileId: guideVideoPosterId(spec.id, lang), format: 'jpeg', width: 1280, height: 720 },
    },
    placement: spec.placement,
    caption: spec.caption[lang],
    altText: spec.altText[lang],
    createdAt: now,
    updatedAt: now,
  }));
}

/** A pure description of every edition's videos, for the built-in preset's
 *  fingerprint. */
export function guideVideosSignature(): unknown[] {
  return SPECS.map((s) => [s.id, s.path, s.placement, s.duration, s.caption, s.altText, VERSION, GUIDE_MEDIA_BASE]);
}
