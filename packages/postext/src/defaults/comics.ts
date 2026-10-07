import type {
  BalloonStyleConfig,
  ColorValue,
  ComicsConfig,
  Dimension,
  LetteringConfig,
  NamedPanelStyleConfig,
  PanelStyleConfig,
  ResolvedBalloonStyleConfig,
  ResolvedComicsConfig,
  ResolvedLetteringConfig,
  ResolvedNamedPanelStyleConfig,
  ResolvedPanelStyleConfig,
} from '../types';
import type { ResolvedConfig } from '../vdt';
import { chineseScriptOf, isJapaneseLanguage, localeScript, presentTag } from '../locale';
import { colorsEqual, dimensionsEqual } from './shared';

const HEX = (hex: string): ColorValue => ({ hex, model: 'hex' });
const PT = (value: number): Dimension => ({ value, unit: 'pt' });
const MM = (value: number): Dimension => ({ value, unit: 'mm' });
const EM = (value: number): Dimension => ({ value, unit: 'em' });

/** Whether a tag names Chinese, Japanese or Arabic, and which. */
function comicScript(locale: string | undefined): 'ja' | 'zh-Hans' | 'zh-Hant' | 'arab' | 'latin' {
  if (isJapaneseLanguage(locale)) return 'ja';
  const zh = chineseScriptOf(locale);
  if (zh === 'Hant') return 'zh-Hant';
  if (zh === 'Hans') return 'zh-Hans';
  if (localeScript(locale) === 'Arab') return 'arab';
  return 'latin';
}

/**
 * The lettering face of a document language (all on Google Fonts, loaded
 * by family name like any other face): `Comic Neue` (Latin, Greek,
 * Cyrillic and most others), `Zen Antique` for Japanese (kana in Mincho,
 * kanji in Gothic, the antique style of manga lettering), `Noto Sans SC`
 * for Simplified Chinese (LXGW WenKai, the usual pick, is not on Google
 * Fonts in its Simplified cut), `LXGW WenKai TC` for Traditional Chinese,
 * `Playpen Sans Arabic` for Arabic, Persian and Urdu.
 */
export function defaultComicFont(locale: string | undefined): string {
  switch (comicScript(locale)) {
    case 'ja': return 'Zen Antique';
    case 'zh-Hans': return 'Noto Sans SC';
    case 'zh-Hant': return 'LXGW WenKai TC';
    case 'arab': return 'Playpen Sans Arabic';
    default: return 'Comic Neue';
  }
}

/** The face of sound effects (`sfx`) in a document language: `Bangers`
 *  for Latin scripts, `Dela Gothic One` for Japanese, `ZCOOL KuaiLe` for
 *  Simplified Chinese, the lettering face for Traditional Chinese, `Lalezar`
 *  for Arabic. */
export function defaultComicSfxFont(locale: string | undefined): string {
  switch (comicScript(locale)) {
    case 'ja': return 'Dela Gothic One';
    case 'zh-Hans': return 'ZCOOL KuaiLe';
    case 'zh-Hant': return 'LXGW WenKai TC';
    case 'arab': return 'Lalezar';
    default: return 'Bangers';
  }
}

/** The panel style every panel starts from: a 1 pt black border, a white
 *  ground, the picture cropped to fill the cell. */
export const DEFAULT_PANEL_STYLE: ResolvedPanelStyleConfig = {
  borderWidth: PT(1),
  borderColor: HEX('#000000'),
  borderRadius: PT(0),
  borderStyle: 'solid',
  background: HEX('#ffffff'),
  fit: 'cover',
  bleed: false,
};

/** Room between tiers and between panels side by side: in manga as in
 *  Western comics the gap between tiers is about twice the gap inside a
 *  tier. */
export const DEFAULT_COMIC_GUTTER = { horizontal: MM(4), vertical: MM(2) };

/** The lettering, less its face (see {@link defaultComicFont}). */
export const DEFAULT_LETTERING_STATIC: Omit<ResolvedLetteringConfig, 'fontFamily'> = {
  fontSize: PT(7.5),
  lineHeight: 1.15,
  color: HEX('#000000'),
  bold: false,
  italic: false,
  letterSpacing: EM(0),
  writingMode: 'auto',
  textTransform: 'none',
  dropFinalStop: 'auto',
  doubleDash: false,
  inset: MM(1.5),
  joinSameSpeaker: 'butt',
  maxColumnChars: 8,
};

/** What every balloon style starts from: a speech balloon. */
const BALLOON_BASE: Omit<ResolvedBalloonStyleConfig, 'id' | 'name'> = {
  shape: 'oval',
  fill: HEX('#ffffff'),
  stroke: HEX('#000000'),
  strokeWidth: PT(0.6),
  dash: false,
  double: false,
  wobble: 0,
  roundness: 2.2,
  burstPoints: 14,
  burstDepth: 0.22,
  padding: EM(0.55),
  aspect: 1.6,
  tail: 'curved',
  tailWidth: EM(0.9),
  tailReach: 0.55,
  target: 'mouth',
  position: 'auto',
  butt: false,
  fontScale: 1,
  align: 'center',
  rotate: 0,
};

/** The built-in balloon styles, by kind (sound effects take their face from
 *  the document language at resolution). */
export const DEFAULT_BALLOON_STYLES: readonly BalloonStyleConfig[] = [
  { id: 'speech', name: 'Speech' },
  { id: 'thought', name: 'Thought', shape: 'cloud', tail: 'bubbles', target: 'head' },
  { id: 'whisper', name: 'Whisper', dash: true, fontScale: 0.9 },
  { id: 'shout', name: 'Shout', shape: 'burst', tail: 'wedge', fontScale: 1.15, bold: true, strokeWidth: PT(0.8) },
  { id: 'radio', name: 'Radio', shape: 'electric', tail: 'zigzag' },
  { id: 'caption', name: 'Caption', shape: 'rectangle', fill: HEX('#fff4c2'), tail: 'none', position: 'top-start', butt: true, align: 'start', aspect: 3 },
  { id: 'inner', name: 'Inner voice', shape: 'rounded', fill: HEX('#f2f2f2'), tail: 'none', italic: true, align: 'start', aspect: 3 },
  { id: 'note', name: 'Note', shape: 'rectangle', tail: 'none', position: 'bottom-end', butt: true, align: 'start', fontScale: 0.8, aspect: 4 },
  { id: 'sfx', name: 'Sound effect', shape: 'none', tail: 'none', fontScale: 2.4, bold: true, halo: PT(1.5), haloColor: HEX('#ffffff'), strokeWidth: PT(0) },
];

/** The ids of the built-in balloon styles. */
export const DEFAULT_BALLOON_STYLE_IDS: readonly string[] = DEFAULT_BALLOON_STYLES.map((s) => s.id);

function resolvePanelStyle(partial: PanelStyleConfig | undefined, base: ResolvedPanelStyleConfig): ResolvedPanelStyleConfig {
  return {
    borderWidth: partial?.borderWidth ?? base.borderWidth,
    borderColor: partial?.borderColor ?? base.borderColor,
    borderRadius: partial?.borderRadius ?? base.borderRadius,
    borderStyle: partial?.borderStyle ?? base.borderStyle,
    background: partial?.background ?? base.background,
    fit: partial?.fit ?? base.fit,
    bleed: partial?.bleed ?? base.bleed,
  };
}

function resolveLettering(partial: LetteringConfig | undefined, locale: string | undefined): ResolvedLetteringConfig {
  const d = DEFAULT_LETTERING_STATIC;
  return {
    fontFamily: partial?.fontFamily?.trim() || defaultComicFont(locale),
    fontSize: partial?.fontSize ?? d.fontSize,
    lineHeight: typeof partial?.lineHeight === 'number' && partial.lineHeight > 0 ? partial.lineHeight : d.lineHeight,
    color: partial?.color ?? d.color,
    bold: partial?.bold ?? d.bold,
    italic: partial?.italic ?? d.italic,
    letterSpacing: partial?.letterSpacing ?? d.letterSpacing,
    writingMode: partial?.writingMode ?? d.writingMode,
    textTransform: partial?.textTransform ?? d.textTransform,
    dropFinalStop: partial?.dropFinalStop ?? d.dropFinalStop,
    doubleDash: partial?.doubleDash ?? d.doubleDash,
    inset: partial?.inset ?? d.inset,
    joinSameSpeaker: partial?.joinSameSpeaker ?? d.joinSameSpeaker,
    maxColumnChars: typeof partial?.maxColumnChars === 'number' && partial.maxColumnChars >= 1 ? Math.round(partial.maxColumnChars) : d.maxColumnChars,
  };
}

/** A balloon style laid over another (both partial). */
function layBalloon(over: BalloonStyleConfig, under: BalloonStyleConfig | undefined): BalloonStyleConfig {
  if (!under) return over;
  const out: BalloonStyleConfig = { ...under };
  for (const [k, v] of Object.entries(over)) if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  return out;
}

function resolveBalloonStyle(partial: BalloonStyleConfig, locale: string | undefined): ResolvedBalloonStyleConfig {
  const b = BALLOON_BASE;
  const sfxFont = partial.id === 'sfx' && partial.fontFamily === undefined ? defaultComicSfxFont(locale) : undefined;
  const out: ResolvedBalloonStyleConfig = {
    id: partial.id,
    name: partial.name ?? partial.id,
    shape: partial.shape ?? b.shape,
    fill: partial.fill ?? b.fill,
    stroke: partial.stroke ?? b.stroke,
    strokeWidth: partial.strokeWidth ?? b.strokeWidth,
    dash: partial.dash ?? b.dash,
    double: partial.double ?? b.double,
    wobble: partial.wobble ?? b.wobble,
    roundness: partial.roundness ?? b.roundness,
    burstPoints: partial.burstPoints ?? b.burstPoints,
    burstDepth: partial.burstDepth ?? b.burstDepth,
    padding: partial.padding ?? b.padding,
    aspect: partial.aspect ?? b.aspect,
    tail: partial.tail ?? b.tail,
    tailWidth: partial.tailWidth ?? b.tailWidth,
    tailReach: partial.tailReach ?? b.tailReach,
    target: partial.target ?? b.target,
    position: partial.position ?? b.position,
    butt: partial.butt ?? b.butt,
    fontScale: partial.fontScale ?? b.fontScale,
    align: partial.align ?? b.align,
    rotate: partial.rotate ?? b.rotate,
  };
  const family = partial.fontFamily ?? sfxFont;
  if (family) out.fontFamily = family;
  if (partial.bold !== undefined) out.bold = partial.bold;
  if (partial.italic !== undefined) out.italic = partial.italic;
  if (partial.color) out.color = partial.color;
  if (partial.textTransform) out.textTransform = partial.textTransform;
  if (partial.letterSpacing) out.letterSpacing = partial.letterSpacing;
  if (partial.halo) out.halo = partial.halo;
  if (partial.haloColor) out.haloColor = partial.haloColor;
  return out;
}

/** The balloon styles: each built-in one with the config's entry of the
 *  same id laid over it, then the config's other styles (laid over the
 *  speech balloon) in their order. */
function resolveBalloonStyles(partial: BalloonStyleConfig[] | undefined, locale: string | undefined): ResolvedBalloonStyleConfig[] {
  const own = (partial ?? []).filter((s) => s && typeof s.id === 'string' && s.id.length > 0);
  const byId = new Map<string, BalloonStyleConfig>();
  for (const s of own) if (!byId.has(s.id)) byId.set(s.id, s);
  const builtIn = DEFAULT_BALLOON_STYLES.map((d) => resolveBalloonStyle(layBalloon(byId.get(d.id) ?? { id: d.id }, d), locale));
  const extra = [...byId.values()].filter((s) => !DEFAULT_BALLOON_STYLE_IDS.includes(s.id)).map((s) => resolveBalloonStyle(s, locale));
  return [...builtIn, ...extra];
}

/** Resolve `PostextConfig.comics` against the document language (the
 *  default faces follow it). */
export function resolveComicsConfig(partial: ComicsConfig | undefined, locale?: string): ResolvedComicsConfig {
  const panel = resolvePanelStyle(partial?.panel, DEFAULT_PANEL_STYLE);
  const panelStyles: ResolvedNamedPanelStyleConfig[] = (partial?.panelStyles ?? [])
    .filter((s) => s && typeof s.id === 'string' && s.id.length > 0)
    .map((s: NamedPanelStyleConfig) => ({ id: s.id, name: s.name ?? s.id, ...resolvePanelStyle(s, panel) }));
  const m = partial?.frame?.margins;
  return {
    readingDirection: partial?.readingDirection === 'ltr' || partial?.readingDirection === 'rtl' ? partial.readingDirection : 'auto',
    artDirection: partial?.artDirection === 'rtl' ? 'rtl' : 'ltr',
    mirrorArt: partial?.mirrorArt === true,
    frame: m
      ? { margins: { top: m.top ?? MM(0), bottom: m.bottom ?? MM(0), left: m.left ?? MM(0), right: m.right ?? MM(0), mirror: m.mirror ?? false } }
      : {},
    gutter: {
      horizontal: partial?.gutter?.horizontal ?? DEFAULT_COMIC_GUTTER.horizontal,
      vertical: partial?.gutter?.vertical ?? DEFAULT_COMIC_GUTTER.vertical,
    },
    panel,
    panelStyles,
    lettering: resolveLettering(partial?.lettering, locale),
    balloonStyles: resolveBalloonStyles(partial?.balloonStyles, locale),
    cast: (partial?.cast ?? []).filter((c) => c && typeof c.id === 'string' && c.id.length > 0),
    runningHeads: partial?.runningHeads === true,
  };
}

const defaultsByLocale = new Map<string, ResolvedComicsConfig>();

/** The comics settings of a resolved config: `resolved.comics`, else the
 *  defaults of the document language (a document with a `:::page` and no
 *  `comics` section). */
export function resolvedComics(resolved: ResolvedConfig): ResolvedComicsConfig {
  if (resolved.comics) return resolved.comics;
  const h = resolved.bodyText.hyphenation;
  const locale = presentTag(resolved.locale) ?? presentTag(h.tag) ?? presentTag(h.locale);
  const key = locale ?? '';
  let hit = defaultsByLocale.get(key);
  if (!hit) {
    hit = resolveComicsConfig(undefined, locale);
    defaultsByLocale.set(key, hit);
  }
  return hit;
}

/** The panel style a page or panel names: the named style, else the
 *  default one. */
export function pickPanelStyle(comics: ResolvedComicsConfig, id: string | undefined): ResolvedPanelStyleConfig {
  if (id) {
    const hit = comics.panelStyles.find((s) => s.id === id);
    if (hit) return hit;
  }
  return comics.panel;
}

/** The balloon style a script line names, or undefined. */
export function pickBalloonStyle(comics: ResolvedComicsConfig, id: string | undefined): ResolvedBalloonStyleConfig | undefined {
  return id ? comics.balloonStyles.find((s) => s.id === id) : undefined;
}

function stripPanelStyle<T extends PanelStyleConfig>(s: T, base: ResolvedPanelStyleConfig): Partial<T> {
  const r: Partial<T> = {};
  if (s.borderWidth !== undefined && !dimensionsEqual(s.borderWidth, base.borderWidth)) r.borderWidth = s.borderWidth;
  if (s.borderColor !== undefined && !colorsEqual(s.borderColor, base.borderColor)) r.borderColor = s.borderColor;
  if (s.borderRadius !== undefined && !dimensionsEqual(s.borderRadius, base.borderRadius)) r.borderRadius = s.borderRadius;
  if (s.borderStyle !== undefined && s.borderStyle !== base.borderStyle) r.borderStyle = s.borderStyle;
  if (s.background !== undefined && !colorsEqual(s.background, base.background)) r.background = s.background;
  if (s.fit !== undefined && s.fit !== base.fit) r.fit = s.fit;
  if (s.bleed !== undefined && s.bleed !== base.bleed) r.bleed = s.bleed;
  return r;
}

function equalValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if ('hex' in a && 'hex' in b) return colorsEqual(a as ColorValue, b as ColorValue);
  if ('unit' in a && 'unit' in b) return dimensionsEqual(a as Dimension, b as Dimension);
  return false;
}

/** Drop every field equal to its default: what persisting the config
 *  needs. `locale` decides the default faces. Returns undefined when
 *  nothing is left. */
export function stripComicsDefaults(config: ComicsConfig | undefined, locale?: string): ComicsConfig | undefined {
  if (!config) return undefined;
  const out: ComicsConfig = {};
  if (config.readingDirection !== undefined && config.readingDirection !== 'auto') out.readingDirection = config.readingDirection;
  if (config.artDirection !== undefined && config.artDirection !== 'ltr') out.artDirection = config.artDirection;
  if (config.mirrorArt === true) out.mirrorArt = true;
  if (config.frame?.margins && Object.values(config.frame.margins).some((v) => v !== undefined)) out.frame = { margins: config.frame.margins };
  if (config.gutter) {
    const g: NonNullable<ComicsConfig['gutter']> = {};
    if (config.gutter.horizontal && !dimensionsEqual(config.gutter.horizontal, DEFAULT_COMIC_GUTTER.horizontal)) g.horizontal = config.gutter.horizontal;
    if (config.gutter.vertical && !dimensionsEqual(config.gutter.vertical, DEFAULT_COMIC_GUTTER.vertical)) g.vertical = config.gutter.vertical;
    if (Object.keys(g).length > 0) out.gutter = g;
  }
  if (config.panel) {
    const p = stripPanelStyle(config.panel, DEFAULT_PANEL_STYLE);
    if (Object.keys(p).length > 0) out.panel = p;
  }
  const panel = resolvePanelStyle(config.panel, DEFAULT_PANEL_STYLE);
  if (config.panelStyles && config.panelStyles.length > 0) {
    out.panelStyles = config.panelStyles.map((s) => ({
      id: s.id,
      ...(s.name !== undefined && s.name !== s.id ? { name: s.name } : {}),
      ...stripPanelStyle(s, panel),
    }));
  }
  if (config.lettering) {
    const d: ResolvedLetteringConfig = { ...DEFAULT_LETTERING_STATIC, fontFamily: defaultComicFont(locale) };
    const l: LetteringConfig = {};
    for (const [k, v] of Object.entries(config.lettering)) {
      if (v === undefined) continue;
      if (equalValue(v, (d as unknown as Record<string, unknown>)[k])) continue;
      (l as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(l).length > 0) out.lettering = l;
  }
  if (config.balloonStyles && config.balloonStyles.length > 0) {
    const kept = config.balloonStyles.flatMap((s) => {
      const builtIn = DEFAULT_BALLOON_STYLES.find((d) => d.id === s.id);
      const base = resolveBalloonStyle(builtIn ?? { id: s.id }, locale);
      const r: BalloonStyleConfig = { id: s.id };
      for (const [k, v] of Object.entries(s)) {
        if (k === 'id' || v === undefined) continue;
        if (k === 'name' && v === (builtIn?.name ?? s.id)) continue;
        if (k !== 'name' && equalValue(v, (base as unknown as Record<string, unknown>)[k])) continue;
        (r as unknown as Record<string, unknown>)[k] = v;
      }
      // A built-in style left as it is needs no entry.
      return builtIn && Object.keys(r).length === 1 ? [] : [r];
    });
    if (kept.length > 0) out.balloonStyles = kept;
  }
  if (config.cast && config.cast.length > 0) out.cast = config.cast;
  if (config.runningHeads === true) out.runningHeads = true;
  return Object.keys(out).length > 0 ? out : undefined;
}
