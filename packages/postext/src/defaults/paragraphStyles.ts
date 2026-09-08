import type {
  Dimension,
  ParagraphStyleConfig,
  ResolvedParagraphStyleConfig,
  ResolvedBodyTextConfig,
} from '../types';
import { dimensionsEqual } from './shared';

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
    textAlign: partial.textAlign ?? (bodyText.textAlign === 'justify' ? 'justify' : 'left'),
    hyphenation: partial.hyphenation ?? bodyText.hyphenation.enabled,
    firstLineIndent: partial.firstLineIndent ?? bodyText.firstLineIndent,
    hangingIndent: partial.hangingIndent ?? ZERO,
    spaceBetween: partial.spaceBetween ?? ZERO,
    marginTop: partial.marginTop ?? ZERO,
    marginBottom: partial.marginBottom ?? ZERO,
  };
}

export function resolveParagraphStylesConfig(
  partial: ParagraphStyleConfig[] | undefined,
  bodyText: ResolvedBodyTextConfig,
): ResolvedParagraphStyleConfig[] {
  return (partial ?? DEFAULT_PARAGRAPH_STYLES).map((s) => resolveParagraphStyleConfig(s, bodyText));
}

/** Drop fields equal to their static default (zero dimensions, `name` equal
 *  to `id`). Inherited typographic fields are kept whenever explicitly set,
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
    if (s.hyphenation !== undefined) r.hyphenation = s.hyphenation;
    if (s.firstLineIndent !== undefined) r.firstLineIndent = s.firstLineIndent;
    if (s.hangingIndent !== undefined && !isZero(s.hangingIndent)) r.hangingIndent = s.hangingIndent;
    if (s.spaceBetween !== undefined && !isZero(s.spaceBetween)) r.spaceBetween = s.spaceBetween;
    if (s.marginTop !== undefined && !isZero(s.marginTop)) r.marginTop = s.marginTop;
    if (s.marginBottom !== undefined && !isZero(s.marginBottom)) r.marginBottom = s.marginBottom;
    return r;
  });
}

function isZero(d: Dimension): boolean {
  return d.value === 0 || dimensionsEqual(d, ZERO);
}
