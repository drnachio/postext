import type {
  ColorValue,
  ResolvedVideoPlayerOptions,
  ResolvedVideoStyleConfig,
  VideoPlayerOptions,
  VideoStyleConfig,
} from '../types';
import { DEFAULT_MAIN_COLOR, colorsEqual, dimensionsEqual } from './shared';

const WHITE: ColorValue = { hex: '#ffffff', model: 'hex' };
const BLACK: ColorValue = { hex: '#000000', model: 'hex' };

/** The browser's own player: everything offered, nothing automatic. */
export const DEFAULT_VIDEO_PLAYER_OPTIONS: ResolvedVideoPlayerOptions = {
  controls: true,
  download: true,
  fullscreen: true,
  playbackRate: true,
  pictureInPicture: true,
  remotePlayback: true,
  autoplay: false,
  muted: false,
  loop: false,
  exclusive: true,
  preload: 'metadata',
  privacy: true,
};

export const DEFAULT_VIDEO_STYLE_CONFIG: ResolvedVideoStyleConfig = {
  playMark: {
    enabled: true,
    shape: 'circle',
    position: 'center',
    size: { value: 12, unit: 'mm' },
    inset: { value: 4, unit: 'mm' },
    color: WHITE,
    background: DEFAULT_MAIN_COLOR,
    backgroundOpacity: 0.9,
  },
  qr: {
    enabled: true,
    position: 'bottom-right',
    size: { value: 18, unit: 'mm' },
    inset: { value: 3, unit: 'mm' },
    errorCorrection: 'M',
    quietZone: 2,
    color: BLACK,
    background: WHITE,
    radius: { value: 1, unit: 'mm' },
  },
  linkPoster: true,
  html: 'player',
  player: DEFAULT_VIDEO_PLAYER_OPTIONS,
};

/** Player options laid over `base` (only the fields `partial` sets). */
export function resolveVideoPlayerOptions(
  partial?: VideoPlayerOptions,
  base: ResolvedVideoPlayerOptions = DEFAULT_VIDEO_PLAYER_OPTIONS,
): ResolvedVideoPlayerOptions {
  if (!partial) return { ...base };
  const out = { ...base };
  for (const key of Object.keys(base) as Array<keyof ResolvedVideoPlayerOptions>) {
    const v = partial[key];
    if (v !== undefined && v !== null) (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

function clamp01(n: number | undefined, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

export function resolveVideoStyleConfig(partial?: VideoStyleConfig): ResolvedVideoStyleConfig {
  const d = DEFAULT_VIDEO_STYLE_CONFIG;
  if (!partial) {
    return { ...d, playMark: { ...d.playMark }, qr: { ...d.qr }, player: { ...d.player } };
  }
  const pm = partial.playMark ?? {};
  const qr = partial.qr ?? {};
  const quiet = qr.quietZone;
  return {
    playMark: {
      enabled: pm.enabled ?? d.playMark.enabled,
      shape: pm.shape ?? d.playMark.shape,
      position: pm.position ?? d.playMark.position,
      size: pm.size ?? d.playMark.size,
      inset: pm.inset ?? d.playMark.inset,
      color: pm.color ?? d.playMark.color,
      background: pm.background ?? d.playMark.background,
      backgroundOpacity: clamp01(pm.backgroundOpacity, d.playMark.backgroundOpacity),
    },
    qr: {
      enabled: qr.enabled ?? d.qr.enabled,
      position: qr.position ?? d.qr.position,
      size: qr.size ?? d.qr.size,
      inset: qr.inset ?? d.qr.inset,
      errorCorrection: qr.errorCorrection ?? d.qr.errorCorrection,
      quietZone: typeof quiet === 'number' && Number.isFinite(quiet) ? Math.max(0, Math.min(8, Math.round(quiet))) : d.qr.quietZone,
      color: qr.color ?? d.qr.color,
      background: qr.background ?? d.qr.background,
      radius: qr.radius ?? d.qr.radius,
    },
    linkPoster: partial.linkPoster ?? d.linkPoster,
    html: partial.html ?? d.html,
    player: resolveVideoPlayerOptions(partial.player),
  };
}

type Group = Record<string, unknown>;

function stripGroup(
  group: Group | undefined,
  defaults: Group,
): Group | undefined {
  if (!group) return undefined;
  const out: Group = {};
  for (const [key, value] of Object.entries(group)) {
    if (value === undefined) continue;
    const def = defaults[key];
    const same = def && typeof def === 'object' && value && typeof value === 'object'
      ? ('hex' in (def as object) ? colorsEqual(value as ColorValue, def as ColorValue) : dimensionsEqual(value as never, def as never))
      : value === def;
    if (!same) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function stripVideoStyleDefaults(videoStyle?: VideoStyleConfig): VideoStyleConfig | undefined {
  if (!videoStyle) return undefined;
  const d = DEFAULT_VIDEO_STYLE_CONFIG;
  const result: VideoStyleConfig = {};
  const playMark = stripGroup(videoStyle.playMark as Group | undefined, d.playMark as unknown as Group);
  if (playMark) result.playMark = playMark;
  const qr = stripGroup(videoStyle.qr as Group | undefined, d.qr as unknown as Group);
  if (qr) result.qr = qr;
  const player = stripGroup(videoStyle.player as Group | undefined, d.player as unknown as Group);
  if (player) result.player = player;
  if (videoStyle.linkPoster !== undefined && videoStyle.linkPoster !== d.linkPoster) result.linkPoster = videoStyle.linkPoster;
  if (videoStyle.html !== undefined && videoStyle.html !== d.html) result.html = videoStyle.html;
  return Object.keys(result).length > 0 ? result : undefined;
}
