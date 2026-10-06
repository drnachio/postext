// The guide's two videos (#478): the showreel and the postext-port skill
// tutorial, narrated cuts streamed as HLS from the media CDN (the
// `postext-media` Worker in front of Cloudflare R2, the player the home
// page and the docs use). Every edition plays its own language's cut
// (Catalan, Arabic and Japanese since #510).

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

type VideoLang = GuideLang;

/** The cut each edition plays. */
const CUT: Record<VideoLang, 'en' | 'es' | 'zh' | 'ca' | 'ar' | 'ja'> = { en: 'en', es: 'es', 'zh-Hans': 'zh', ca: 'ca', ar: 'ar', ja: 'ja' };

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
    duration: { en: 130.65, es: 137.12, 'zh-Hans': 142.73, ca: 129.35, ar: 147.83, ja: 169.72 },
    caption: {
      en: 'Postext in two minutes: how it sets a page, the Sandbox and what comes out of it. In the Folio view a click plays it on the page; in print, the QR code opens it.',
      es: 'Postext en dos minutos: cómo compone una página, el Sandbox y lo que sale de él. En la vista Folio, un clic lo reproduce sobre la página; impreso, lo abre el código QR.',
      'zh-Hans': '两分钟了解Postext：它怎样排出一页、Sandbox，以及能输出什么。在书页视图中点击它，就在页面上播放；印刷版上扫描二维码即可观看。',
      ca: 'Postext en dos minuts: com compon una pàgina, el Sandbox i el que en surt. A la vista Folio, un clic el reprodueix sobre la pàgina; imprès, l\'obre el codi QR.',
      ar: 'Postext في دقيقتين ونصف: كيف ينضّد الصفحة، وبيئة Sandbox، وما يخرج منها. في عرض Folio تشغّله نقرة فوق الصفحة؛ وفي النسخة المطبوعة يفتحه رمز QR.',
      ja: '三分で見るPostext。ページの組み方、Sandbox、そこから出てくるもの。Folioビューではクリックするとページの上で再生され、印刷物ではQRコードから開ける。',
    },
    altText: {
      en: 'The closing card of the video: the Postext logo, the line "The programmable typesetter for the web", postext.dev and the command pnpm add postext.',
      es: 'La tarjeta final del vídeo: el logotipo de Postext, el lema «El tipógrafo programable para la web», postext.dev y la orden pnpm add postext.',
      'zh-Hans': '视频的结尾画面：Postext的标志、一句口号、网址postext.dev和安装命令pnpm add postext。',
      ca: 'La targeta final del vídeo: el logotip de Postext, el lema «El tipògraf programable per al web», postext.dev i l\'ordre pnpm add postext.',
      ar: 'البطاقة الختامية للفيديو: شعار Postext، وعبارة «المنضِّد القابل للبرمجة للويب»، وعنوان postext.dev، والأمر pnpm add postext.',
      ja: '動画の最後の画面。Postextのロゴ、「ウェブで動く、プログラムできる組版システム」という一文、postext.dev、インストールのコマンドpnpm add postext。',
    },
  },
  {
    id: GUIDE_VIDEO_IDS.tutorial,
    path: 'tutorial',
    placement: { position: 'auto', span: 'page' },
    duration: { en: 312.48, es: 308.1, 'zh-Hans': 318.68, ca: 300.6, ar: 332.55, ja: 391.1 },
    caption: {
      en: 'The postext-port skill at work: an agent brings a book that was already typeset into Postext, a chapter at a time, and checks every page it sets.',
      es: 'El skill postext-port trabajando: un agente pasa a Postext un libro que ya estaba maquetado, capítulo a capítulo, y revisa cada página que compone.',
      'zh-Hans': 'postext-port技能的实际操作：智能体把一本已经排好的书逐章转成Postext，并检查排出的每一页。',
      ca: 'L\'skill postext-port treballant: un agent porta a Postext un llibre que ja estava maquetat, capítol a capítol, i revisa cada pàgina que compon.',
      ar: 'مهارة postext-port أثناء العمل: وكيل ينقل إلى Postext كتابًا كان منضَّدًا من قبل، فصلًا بعد فصل، ويفحص كل صفحة ينضّدها.',
      ja: '作業中のpostext-portスキル。エージェントが、すでに組まれた本を一章ずつPostextに移し、組んだページをすべて確かめる。',
    },
    altText: {
      en: 'A frame of the tutorial: a request to the agent to convert a book with the postext-port skill, beside a folder holding the reference PDF, the fonts and the illustrations.',
      es: 'Un fotograma del tutorial: la petición al agente para convertir un libro con el skill postext-port, junto a una carpeta con el PDF de referencia, las fuentes y las ilustraciones.',
      'zh-Hans': '教程中的一帧：请智能体用postext-port技能转换一本书的请求，旁边是装有样张PDF、字体和插图原稿的文件夹。',
      ca: 'Un fotograma del tutorial: la petició a l\'agent per convertir un llibre amb l\'skill postext-port, al costat d\'una carpeta amb el PDF de referència, les fonts i les il·lustracions.',
      ar: 'إطار من الدرس: طلب إلى الوكيل أن يحوّل كتابًا بمهارة postext-port، بجانب مجلد فيه ملف PDF المرجعي والخطوط والرسوم.',
      ja: 'チュートリアルの一コマ。postext-portスキルで本を変換するようエージェントに頼む文面と、その横に見本のPDF、フォント、イラストを収めたフォルダー。',
    },
  },
];

/** Each cut's posters, a chunk of their own. */
const POSTERS: Record<(typeof CUT)[VideoLang], () => Promise<{ SHOWREEL_POSTER: string; TUTORIAL_POSTER: string }>> = {
  en: () => import('./videoPosters/en'),
  es: () => import('./videoPosters/es'),
  zh: () => import('./videoPosters/zh'),
  ca: () => import('./videoPosters/ca'),
  ar: () => import('./videoPosters/ar'),
  ja: () => import('./videoPosters/ja'),
};

/** The blob id of a video's poster in one edition. */
export function guideVideoPosterId(id: string, lang: VideoLang): string {
  return `default-video-${id}-${CUT[lang]}`;
}

/** The posters' bytes for an edition, by blob id (a chunk of its own, loaded
 *  only for the editions with videos). */
export async function guideVideoPosters(lang: GuideLang): Promise<Record<string, Uint8Array>> {
  if (!guideHasVideos(lang)) return {};
  const mod = await POSTERS[CUT[lang]]();
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
      // They start on their own (muted) the first time their page is
      // shown, in Folio and in the HTML view.
      player: { autoplay: true },
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
  return SPECS.map((s) => [s.id, s.path, s.placement, s.duration, s.caption, s.altText, VERSION, GUIDE_MEDIA_BASE, 'autoplay']);
}
