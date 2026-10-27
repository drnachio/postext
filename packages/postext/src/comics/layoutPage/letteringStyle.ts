// The lettering style of a comic: locale, direction and each role's style.
import type { ResolvedComicsConfig, ResolvedBalloonStyleConfig, ComicCastMember, ColorPaletteEntry } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import { dimensionToPx } from '../../units.js';
import { presentTag, isJapaneseLanguage, chineseScriptOf, isCjkLanguage, directionOf } from '../../hyphenation/locale.js';
import { DEFAULT_LETTERING_STATIC } from '../../defaults/comics.js';
import type { LetteringStyle } from '../lettering/types.js';
import type { ComicScriptItem } from '../types.js';
import { attrColor } from './settings.js';

/** The document language the lettering is set in (as
 *  {@link resolvedComics} reads it). */
export function comicLetteringLocale(resolved: ResolvedConfig): string {
  const h = resolved.bodyText.hyphenation;
  return presentTag(resolved.locale) ?? presentTag(h.tag) ?? presentTag(h.locale) ?? 'en';
}

/** Whether balloons are set vertically: `lettering.writingMode`, `auto`
 *  meaning vertical for Japanese and Traditional Chinese (the comics of
 *  both are lettered in columns) and in a vertical document. */
export function comicLetteringVertical(comics: ResolvedComicsConfig, resolved: ResolvedConfig, locale: string): boolean {
  const mode = comics.lettering.writingMode;
  if (mode === 'vertical') return true;
  if (mode === 'horizontal') return false;
  return isJapaneseLanguage(locale) || chineseScriptOf(locale) === 'Hant' || resolved.layout.writingMode === 'vertical-rl';
}

/** The role's own balloon style. */
export function roleStyleId(role: ComicScriptItem['role']): string {
  return role === 'speech' ? 'speech' : role;
}

/**
 * A balloon style of the config resolved to the lettering's px style
 * (SPEC D4 → D3): the style over the book's lettering, the speaker's cast
 * entry and the line's own `color` / `font` over both. One lettering size
 * per book: `fontScale` is the only factor (a sound effect's `size=` scales
 * the item, not the style).
 */
export function comicLetteringStyle(input: {
  style: ResolvedBalloonStyleConfig;
  comics: ResolvedComicsConfig;
  cast?: ComicCastMember;
  item?: Pick<ComicScriptItem, 'color' | 'font'>;
  locale: string;
  vertical: boolean;
  dpi: number;
  palette?: readonly ColorPaletteEntry[];
}): LetteringStyle {
  const { style: st, comics, cast, item, locale, vertical, dpi } = input;
  const L = comics.lettering;
  const em = dimensionToPx(L.fontSize, dpi);
  const size = em * (st.fontScale > 0 ? st.fontScale : 1);
  const cjk = isCjkLanguage(locale);
  const rtl = directionOf(locale) === 'rtl';
  // Leading: the book's, or what a column of CJK or a line of Arabic needs
  // when the book leaves the default.
  const lineHeight = L.lineHeight !== DEFAULT_LETTERING_STATIC.lineHeight ? L.lineHeight
    : vertical || cjk ? 1.5 : rtl ? 1.45 : L.lineHeight;
  const letterSpacing = dimensionToPx(st.letterSpacing ?? L.letterSpacing, dpi, size);
  const dropFinalStop = L.dropFinalStop === 'auto' ? undefined : L.dropFinalStop;
  const out: LetteringStyle = {
    id: st.id,
    shape: st.shape,
    fill: cast?.fill?.hex ?? st.fill.hex,
    stroke: st.stroke.hex,
    strokeWidth: dimensionToPx(st.strokeWidth, dpi, size),
    ...(st.dash ? { dash: true } : {}),
    ...(st.double ? { double: true } : {}),
    ...(st.wobble ? { wobble: st.wobble } : {}),
    roundness: st.roundness,
    ...(st.burstPoints ? { burstPoints: st.burstPoints } : {}),
    ...(st.burstDepth ? { burstDepthRatio: st.burstDepth } : {}),
    padding: dimensionToPx(st.padding, dpi, size),
    aspect: st.aspect,
    tail: st.tail,
    tailWidth: dimensionToPx(st.tailWidth, dpi, size),
    tailReach: st.tailReach,
    target: st.target,
    position: st.position,
    ...(st.butt ? { butt: true } : {}),
    fontFamily: item?.font?.trim() || cast?.fontFamily || st.fontFamily || L.fontFamily,
    fontSizePx: size,
    lineHeight,
    fontWeight: (st.bold ?? L.bold) ? 700 : 400,
    // Italics only in scripts that have them (the lettering of Arabic,
    // Hebrew and CJK is never slanted).
    ...((st.italic ?? L.italic) && !cjk && !rtl ? { italic: true } : {}),
    color: attrColor(item?.color, input.palette) ?? cast?.color?.hex ?? (st.color ?? L.color).hex,
    textTransform: st.textTransform ?? L.textTransform,
    ...(letterSpacing ? { letterSpacing } : {}),
    align: st.align,
    emphasis: 'bold-italic',
    writingMode: 'auto',
    maxColumnChars: L.maxColumnChars,
    ...(dropFinalStop !== undefined ? { dropFinalStop } : {}),
    ...(L.doubleDash ? { doubleDash: true } : {}),
    ...(st.halo ? { halo: dimensionToPx(st.halo, dpi, size), haloColor: st.haloColor?.hex ?? '#ffffff' } : {}),
    ...(st.rotate ? { rotate: st.rotate } : {}),
    ...(st.skew ? { skew: st.skew } : {}),
  };
  return out;
}
