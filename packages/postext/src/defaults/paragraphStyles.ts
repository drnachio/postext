import type {
  Dimension,
  ParagraphStyleConfig,
  ResolvedParagraphStyleConfig,
  ResolvedBodyTextConfig,
} from '../types';
import { dimensionsEqual, startEndAsLeftRight } from './shared';

/** No paragraph styles ship by default — a document declares its own. */
export const DEFAULT_PARAGRAPH_STYLES: ParagraphStyleConfig[] = [];

const ZERO: Dimension = { value: 0, unit: 'em' };

/** Resolve one paragraph style against the resolved body text: every unset
 *  typographic field inherits the body value, so a style with just an `id`
 *  renders exactly like running text. */
function resolveParagraphStyleConfig(
  partial: ParagraphStyleConfig,
  bodyText: ResolvedBodyTextConfig,
): ResolvedParagraphStyleConfig {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    fontFamily: partial.fontFamily ?? bodyText.fontFamily,
    fontSize: partial.fontSize ?? bodyText.fontSize,
    lineHeight: partial.lineHeight ?? bodyText.lineHeight,
    color: partial.color ?? bodyText.color,
    textAlign: startEndAsLeftRight(partial.textAlign ?? bodyText.textAlign),
    ...(partial.boldColor ? { boldColor: partial.boldColor } : {}),
    ...(partial.italicColor ? { italicColor: partial.italicColor } : {}),
    fontWeight: partial.fontWeight ?? bodyText.fontWeight,
    boldFontWeight: partial.boldFontWeight ?? bodyText.boldFontWeight,
    italic: partial.italic ?? false,
    smallCaps: partial.smallCaps ?? false,
    hyphenation: partial.hyphenation ?? bodyText.hyphenation.enabled,
    indent: partial.indent ?? ZERO,
    // Absent unless set, so styles without it resolve as before (#424).
    ...(partial.endIndent && partial.endIndent.value > 0 ? { endIndent: partial.endIndent } : {}),
    firstLineIndent: partial.firstLineIndent ?? bodyText.firstLineIndent,
    hangingIndent: partial.hangingIndent ?? ZERO,
    spaceBetween: partial.spaceBetween ?? ZERO,
    marginTop: partial.marginTop ?? ZERO,
    marginBottom: partial.marginBottom ?? ZERO,
    snapToGrid: partial.snapToGrid ?? true,
    textTransform: partial.textTransform === 'uppercase' ? 'uppercase' : 'none',
  };
}

export function resolveParagraphStylesConfig(
  partial: ParagraphStyleConfig[] | undefined,
  bodyText: ResolvedBodyTextConfig,
): ResolvedParagraphStyleConfig[] {
  return (partial ?? DEFAULT_PARAGRAPH_STYLES).map((s) => resolveParagraphStyleConfig(s, bodyText));
}

/** Drop fields equal to their static default (zero dimensions, `name` equal
 *  to `id`, `italic` / `smallCaps` off, `snapToGrid` on, no `textTransform`). Inherited typographic fields
 *  (weights included) are kept whenever explicitly set,
 *  since their effective default depends on the body text. Returns
 *  `undefined` when no styles remain. */
export function stripParagraphStylesDefaults(
  styles: ParagraphStyleConfig[] | undefined,
): ParagraphStyleConfig[] | undefined {
  if (!styles || styles.length === 0) return undefined;
  return styles.map((s) => {
    const r: ParagraphStyleConfig = { id: s.id };
    if (s.name !== undefined && s.name !== s.id) r.name = s.name;
    if (s.fontFamily !== undefined) r.fontFamily = s.fontFamily;
    if (s.fontSize !== undefined) r.fontSize = s.fontSize;
    if (s.lineHeight !== undefined) r.lineHeight = s.lineHeight;
    if (s.color !== undefined) r.color = s.color;
    if (s.textAlign !== undefined) r.textAlign = s.textAlign;
    if (s.boldColor !== undefined) r.boldColor = s.boldColor;
    if (s.italicColor !== undefined) r.italicColor = s.italicColor;
    if (s.fontWeight !== undefined) r.fontWeight = s.fontWeight;
    if (s.boldFontWeight !== undefined) r.boldFontWeight = s.boldFontWeight;
    if (s.italic) r.italic = true;
    if (s.smallCaps) r.smallCaps = true;
    if (s.hyphenation !== undefined) r.hyphenation = s.hyphenation;
    if (s.indent !== undefined && !isZero(s.indent)) r.indent = s.indent;
    if (s.endIndent !== undefined && !isZero(s.endIndent)) r.endIndent = s.endIndent;
    if (s.firstLineIndent !== undefined) r.firstLineIndent = s.firstLineIndent;
    if (s.hangingIndent !== undefined && !isZero(s.hangingIndent)) r.hangingIndent = s.hangingIndent;
    if (s.spaceBetween !== undefined && !isZero(s.spaceBetween)) r.spaceBetween = s.spaceBetween;
    if (s.marginTop !== undefined && !isZero(s.marginTop)) r.marginTop = s.marginTop;
    if (s.marginBottom !== undefined && !isZero(s.marginBottom)) r.marginBottom = s.marginBottom;
    if (s.snapToGrid === false) r.snapToGrid = false;
    if (s.textTransform !== undefined && s.textTransform !== 'none') r.textTransform = s.textTransform;
    return r;
  });
}

function isZero(d: Dimension): boolean {
  return d.value === 0 || dimensionsEqual(d, ZERO);
}
