/**
 * Video addresses (#454): recognise YouTube and Vimeo links, and build the
 * page a reader is sent to (the QR code, the PDF link) and the player a
 * screen output embeds.
 */
import type { Resource, ResolvedVideoPlayerOptions, VideoSource } from '../types';

/** A YouTube or Vimeo video recognised from a link. */
export interface ParsedVideoUrl {
  source: Exclude<VideoSource, 'file'>;
  /** The video id: 11 characters on YouTube, digits on Vimeo. */
  id: string;
  /** Vimeo's privacy hash of an unlisted video (`vimeo.com/123/abc`,
   *  `player.vimeo.com/video/123?h=abc`). */
  hash?: string;
  /** Start time in whole seconds (`t=90`, `t=1m30s`, `#t=90s`). */
  start?: number;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Seconds from `90`, `90s`, `1m30s`, `1h2m3s`. */
function parseTime(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Recognise a YouTube or Vimeo link: watch pages, short links, Shorts,
 *  embeds (youtube-nocookie too), Vimeo channel, group and showcase pages
 *  and unlisted links. A bare host-less id is not accepted. */
export function parseVideoUrl(input: string | undefined): ParsedVideoUrl | undefined {
  if (!input) return undefined;
  let url: URL;
  try {
    url = new URL(input.trim().replace(/^(?!https?:\/\/)/i, 'https://'));
  } catch {
    return undefined;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  const hashTime = /(?:^|&)t=([^&]+)/.exec(url.hash.slice(1))?.[1];
  if (host === 'youtu.be') {
    const id = parts[0];
    if (!id || !YOUTUBE_ID.test(id)) return undefined;
    const start = parseTime(url.searchParams.get('t') ?? url.searchParams.get('start'));
    return { source: 'youtube', id, ...(start ? { start } : {}) };
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    let id: string | undefined;
    if (parts[0] === 'watch' || parts.length === 0) id = url.searchParams.get('v') ?? undefined;
    else if (['embed', 'shorts', 'live', 'v', 'e'].includes(parts[0]!)) id = parts[1];
    if (!id || !YOUTUBE_ID.test(id)) return undefined;
    const start = parseTime(url.searchParams.get('t') ?? url.searchParams.get('start') ?? hashTime);
    return { source: 'youtube', id, ...(start ? { start } : {}) };
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const at = parts.findIndex((p) => /^\d+$/.test(p));
    if (at < 0) return undefined;
    const id = parts[at]!;
    const next = parts[at + 1];
    const hash = url.searchParams.get('h') ?? (next && /^[0-9a-f]{6,}$/i.test(next) ? next : undefined);
    const start = parseTime(hashTime);
    return { source: 'vimeo', id, ...(hash ? { hash } : {}), ...(start ? { start } : {}) };
  }
  return undefined;
}

/** The page of a YouTube or Vimeo video, the address printed in its QR code
 *  and linked from the PDF, starting at `start` seconds. */
export function videoWatchUrl(parsed: ParsedVideoUrl, start?: number): string {
  const t = start ?? parsed.start;
  if (parsed.source === 'youtube') {
    return `https://youtu.be/${parsed.id}${t ? `?t=${t}` : ''}`;
  }
  return `https://vimeo.com/${parsed.id}${parsed.hash ? `/${parsed.hash}` : ''}${t ? `#t=${t}s` : ''}`;
}

/** The address a reader of a printed page is sent to for a video resource:
 *  the YouTube or Vimeo page, or the production address of a self-hosted
 *  file (`video.url`). `undefined` when there is none (a file not
 *  published yet, a link that is neither YouTube nor Vimeo is still
 *  returned as written when it is an http(s) address). */
export function resourceVideoLink(resource: Resource): string | undefined {
  const v = resource.video;
  if (!v) return undefined;
  if (v.source === 'file') return httpUrl(v.url);
  const parsed = parseVideoUrl(v.url);
  if (parsed && parsed.source === v.source) return videoWatchUrl(parsed, v.start);
  return httpUrl(v.url);
}

function httpUrl(url: string | undefined): string | undefined {
  const t = url?.trim();
  return t && /^https?:\/\/\S+$/i.test(t) ? t : undefined;
}

/** The `src` of the YouTube or Vimeo player for a video, with the player
 *  options the platform honours: controls, autoplay (muted, as browsers
 *  require), loop, start and end, privacy-enhanced mode (youtube-nocookie,
 *  Vimeo `dnt`) and, on Vimeo, the speed and picture-in-picture buttons.
 *  Download is never offered by the embedded players. */
export function videoEmbedUrl(
  parsed: ParsedVideoUrl,
  player: ResolvedVideoPlayerOptions,
  range: { start?: number; end?: number } = {},
): string {
  const start = range.start ?? parsed.start;
  const q = new URLSearchParams();
  if (parsed.source === 'youtube') {
    if (!player.controls) q.set('controls', '0');
    if (player.autoplay) q.set('autoplay', '1');
    if (player.autoplay || player.muted) q.set('mute', '1');
    if (player.loop) {
      q.set('loop', '1');
      q.set('playlist', parsed.id);
    }
    if (!player.fullscreen) q.set('fs', '0');
    q.set('rel', '0');
    q.set('playsinline', '1');
    if (start) q.set('start', String(Math.floor(start)));
    if (range.end) q.set('end', String(Math.floor(range.end)));
    const host = player.privacy ? 'https://www.youtube-nocookie.com' : 'https://www.youtube.com';
    return `${host}/embed/${parsed.id}?${q.toString()}`;
  }
  if (parsed.hash) q.set('h', parsed.hash);
  if (!player.controls) q.set('controls', '0');
  if (player.autoplay) q.set('autoplay', '1');
  if (player.autoplay || player.muted) q.set('muted', '1');
  if (player.loop) q.set('loop', '1');
  if (player.privacy) q.set('dnt', '1');
  if (!player.pictureInPicture) q.set('pip', '0');
  if (!player.playbackRate) q.set('speed', '0');
  q.set('playsinline', '1');
  return `https://player.vimeo.com/video/${parsed.id}?${q.toString()}${start ? `#t=${Math.floor(start)}s` : ''}`;
}

/** The `allow` attribute of a YouTube or Vimeo `<iframe>`: what the player
 *  may use. */
export function videoEmbedAllow(player: ResolvedVideoPlayerOptions): string {
  return [
    'accelerometer',
    ...(player.autoplay ? ['autoplay'] : []),
    'encrypted-media',
    ...(player.fullscreen ? ['fullscreen'] : []),
    'gyroscope',
    ...(player.pictureInPicture ? ['picture-in-picture'] : []),
  ].join('; ');
}

/** The attributes of an HTML5 `<video>` element for the player options, in
 *  the order they are written: `controls`, `controlslist` (the buttons the
 *  browser hides: `nodownload`, `nofullscreen`, `noremoteplayback`,
 *  `noplaybackrate`), `disablepictureinpicture`, `disableremoteplayback`,
 *  `autoplay`, `muted`, `loop`, `playsinline`, `preload`. Each value is
 *  `true` for a boolean attribute. */
export function videoElementAttributes(player: ResolvedVideoPlayerOptions): Array<[string, string | true]> {
  const attrs: Array<[string, string | true]> = [];
  if (player.controls) attrs.push(['controls', true]);
  const hidden = [
    ...(player.download ? [] : ['nodownload']),
    ...(player.fullscreen ? [] : ['nofullscreen']),
    ...(player.remotePlayback ? [] : ['noremoteplayback']),
    ...(player.playbackRate ? [] : ['noplaybackrate']),
  ];
  if (hidden.length > 0) attrs.push(['controlslist', hidden.join(' ')]);
  if (!player.pictureInPicture) attrs.push(['disablepictureinpicture', true]);
  if (!player.remotePlayback) attrs.push(['disableremoteplayback', true]);
  if (player.autoplay) attrs.push(['autoplay', true]);
  if (player.autoplay || player.muted) attrs.push(['muted', true]);
  if (player.loop) attrs.push(['loop', true]);
  attrs.push(['playsinline', true]);
  attrs.push(['preload', player.preload]);
  return attrs;
}

/** A media fragment (`#t=10,40`) that plays a self-hosted file from `start`
 *  to `end` seconds; empty when neither is set. */
export function mediaFragment(range: { start?: number; end?: number }): string {
  if (!range.start && !range.end) return '';
  return `#t=${range.start ?? 0}${range.end ? `,${range.end}` : ''}`;
}

const MIME_BY_FORMAT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
};

/** The media type of a self-hosted video by its format (`mp4`, `webm`…). */
export function videoMimeType(format: string | undefined): string {
  return MIME_BY_FORMAT[(format ?? 'mp4').toLowerCase()] ?? 'video/mp4';
}

/** YouTube's poster frames for a video, largest first: `maxresdefault`
 *  (1280×720, not every video has one), `sddefault` and `hqdefault` (4:3,
 *  letterboxed). Hosts fetch the first that exists. */
export function youtubePosterUrls(id: string): string[] {
  return ['maxresdefault', 'sddefault', 'hqdefault'].map((name) => `https://i.ytimg.com/vi/${id}/${name}.jpg`);
}
