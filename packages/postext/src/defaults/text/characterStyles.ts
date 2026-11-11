import type { CharacterStyleConfig, ColorValue, ResolvedCharacterStyleConfig } from '../../types.js';
import { safeColor, safeDimension } from './safeValues.js';

/** Static defaults of a character style: the text's face, upright, in its
 *  own case. */
export const DEFAULT_CHARACTER_STYLE_STATIC = {
  italic: false,
  textTransform: 'none' as const,
  smallCaps: false,
};

/** No character style ships by default: a highlight is `:mark[…]`, an
 *  underline `:underline[…]` and small capitals `:smallcaps[…]`. */
export const DEFAULT_CHARACTER_STYLES: CharacterStyleConfig[] = [];

/** A weight rounded to the CSS steps, 100–900; undefined for anything
 *  that is not a finite number. */
function weightOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(100, Math.min(900, Math.round(value / 100) * 100)) : undefined;
}

function resolveCharacterStyleConfig(partial: CharacterStyleConfig, markIds: ReadonlySet<string>): ResolvedCharacterStyleConfig {
  const d = DEFAULT_CHARACTER_STYLE_STATIC;
  const weight = weightOf(partial.fontWeight);
  const color: ColorValue | undefined = safeColor(partial.color);
  const fontSize = safeDimension(partial.fontSize);
  const letterSpacing = safeDimension(partial.letterSpacing);
  const family = typeof partial.fontFamily === 'string' ? partial.fontFamily.trim() : '';
  return {
    id: String(partial.id),
    name: typeof partial.name === 'string' && partial.name !== '' ? partial.name : String(partial.id),
    ...(family ? { fontFamily: family } : {}),
    ...(fontSize ? { fontSize } : {}),
    ...(weight !== undefined ? { fontWeight: weight } : {}),
    italic: partial.italic === true ? true : d.italic,
    ...(color ? { color } : {}),
    ...(letterSpacing ? { letterSpacing } : {}),
    textTransform: partial.textTransform === 'uppercase' ? 'uppercase' : d.textTransform,
    smallCaps: partial.smallCaps === true ? true : d.smallCaps,
    // Only a highlight style the design declares: the run never takes the
    // first one by accident.
    ...(typeof partial.mark === 'string' && markIds.has(partial.mark) ? { mark: partial.mark } : {}),
  };
}

/** The book's character styles with their defaults filled in and their
 *  values checked: a colour that is no hex colour, a length that is no
 *  length, a case or a weight outside the list are dropped, and a `mark`
 *  is kept only when `markIds` (the resolved highlight styles) holds it. */
export function resolveCharacterStylesConfig(
  partial: CharacterStyleConfig[] | undefined,
  markIds: ReadonlySet<string> = new Set(),
): ResolvedCharacterStyleConfig[] {
  const list = Array.isArray(partial) ? partial : DEFAULT_CHARACTER_STYLES;
  return list.filter((s) => s && typeof s === 'object' && s.id !== undefined && s.id !== '').map((s) => resolveCharacterStyleConfig(s, markIds));
}

/** The style a `:span[…]{style="id"}` names, or `undefined` when no style
 *  has that id (the run then sets as the text around it, and
 *  `collectContentWarnings` reports it). */
export function pickCharacterStyle(
  styles: readonly ResolvedCharacterStyleConfig[],
  id: string | undefined,
): ResolvedCharacterStyleConfig | undefined {
  return id === undefined || id === '' ? undefined : styles.find((s) => s.id === id);
}

/** A style with every field equal to its static default dropped (and
 *  `name` equal to `id`). */
function stripCharacterStyle(s: CharacterStyleConfig): CharacterStyleConfig {
  const d = DEFAULT_CHARACTER_STYLE_STATIC;
  const r: CharacterStyleConfig = { id: s.id };
  if (s.name !== undefined && s.name !== s.id) r.name = s.name;
  if (s.fontFamily !== undefined) r.fontFamily = s.fontFamily;
  if (s.fontSize !== undefined) r.fontSize = s.fontSize;
  if (s.fontWeight !== undefined) r.fontWeight = s.fontWeight;
  if (s.italic !== undefined && s.italic !== d.italic) r.italic = s.italic;
  if (s.color !== undefined) r.color = s.color;
  if (s.letterSpacing !== undefined) r.letterSpacing = s.letterSpacing;
  if (s.textTransform !== undefined && s.textTransform !== d.textTransform) r.textTransform = s.textTransform;
  if (s.smallCaps !== undefined && s.smallCaps !== d.smallCaps) r.smallCaps = s.smallCaps;
  if (s.mark !== undefined && s.mark !== '') r.mark = s.mark;
  return r;
}

/** Drop every field equal to its static default. Returns `undefined` for
 *  an absent or empty list (the default has no style). */
export function stripCharacterStylesDefaults(styles: CharacterStyleConfig[] | undefined): CharacterStyleConfig[] | undefined {
  if (!styles || styles.length === 0) return undefined;
  return styles.map(stripCharacterStyle);
}
