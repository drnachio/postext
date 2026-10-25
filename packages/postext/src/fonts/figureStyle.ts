// Figure styles per text style (#1237): old-style figures in running text,
// lining and tabular ones in tables and headings. A style's `figureStyle`
// asks its font for the OpenType features that set them (`onum`, `lnum`,
// `tnum`, `pnum`), and the resolved configuration names its family with
// them: a *feature family* (`Lora@onum`, `Lora@lnum+tnum`). Every font
// string the pipeline writes carries it, so the widths of a style's text
// are measured apart from the same family's other text, and each painter
// knows what to set:
//
// - a canvas measures and paints in the faces a host declares under that
//   name, the base family's files with `featureSettings` (Chrome applies
//   the descriptor to canvas text, measured and painted);
// - HTML sets the base family with `font-variant-numeric`;
// - the PDF embeds the base family's files with the features, laid out by
//   fontkit or HarfBuzz as the browser sets them;
// - Node (the CLI) registers a copy of the file whose `cmap` maps the
//   characters to the glyphs the features choose (`freezeFontFeatures`).
//
// A generic family (`serif`) names no face to declare and takes no
// features.

import type { FigureStyle } from '../types.js';
import { isGenericFamily } from './faces.js';
import { primaryFontFamily } from '../measure/font.js';

/** Every {@link FigureStyle} value, in the order a picker lists them. */
export const FIGURE_STYLES: readonly FigureStyle[] = [
  'default',
  'oldstyle',
  'lining',
  'tabular',
  'proportional',
  'oldstyle-tabular',
  'oldstyle-proportional',
  'lining-tabular',
  'lining-proportional',
];

/** The features a feature family may carry, in the order it names them. */
const FEATURE_ORDER = ['onum', 'lnum', 'pnum', 'tnum'] as const;
export type FigureFeature = (typeof FEATURE_ORDER)[number];

const FORM: Record<string, FigureFeature> = { oldstyle: 'onum', lining: 'lnum' };
const SPACING: Record<string, FigureFeature> = { proportional: 'pnum', tabular: 'tnum' };

const CSS_VALUE: Record<FigureFeature, string> = {
  onum: 'oldstyle-nums',
  lnum: 'lining-nums',
  pnum: 'proportional-nums',
  tnum: 'tabular-nums',
};

/** Whether `value` is a {@link FigureStyle} value. */
export function isFigureStyle(value: unknown): value is FigureStyle {
  return typeof value === 'string' && (FIGURE_STYLES as readonly string[]).includes(value);
}

/** The features `style` turns on (none for `'default'` or a value it does
 *  not know). */
export function figureFeatures(style: FigureStyle | undefined): FigureFeature[] {
  if (!isFigureStyle(style) || style === 'default') return [];
  const out = style.split('-').map((part) => FORM[part] ?? SPACING[part]);
  return FEATURE_ORDER.filter((f) => out.includes(f));
}

const SEPARATOR = '@';
const FEATURES_RE = /^(?:onum|lnum|pnum|tnum)(?:\+(?:onum|lnum|pnum|tnum))*$/;

function unquoted(family: string): string {
  const f = family.trim();
  return /^(["']).*\1$/.test(f) ? f.slice(1, -1).trim() : f;
}

/** A family name's parts: the family its files are, and the features a
 *  feature family sets them with (none for a plain family). */
export interface FeatureFamilyParts {
  family: string;
  features: readonly FigureFeature[];
}

/** The parts of a family name {@link featureFamily} wrote
 *  (`Lora@onum+tnum` → Lora, onum and tnum); a plain family comes back as
 *  it is, with no features. */
export function featureFamilyParts(family: string): FeatureFamilyParts {
  const f = unquoted(family);
  const at = f.lastIndexOf(SEPARATOR);
  const tail = at > 0 ? f.slice(at + 1) : '';
  if (!FEATURES_RE.test(tail)) return { family, features: [] };
  return { family: f.slice(0, at), features: tail.split('+') as FigureFeature[] };
}

/** Whether `family` is a feature family. */
export function isFeatureFamily(family: string): boolean {
  return featureFamilyParts(family).features.length > 0;
}

/** The family a feature family's files are (`Lora@onum` → Lora); any
 *  other family as it is. */
export function baseFontFamily(family: string): string {
  return featureFamilyParts(family).family;
}

/** The feature family that sets `family`'s base family in `features` (the
 *  base family itself when there are none). */
export function featureFamily(family: string, features: readonly FigureFeature[]): string {
  const base = unquoted(baseFontFamily(family));
  const list = FEATURE_ORDER.filter((f) => features.includes(f));
  return list.length > 0 ? `${base}${SEPARATOR}${list.join('+')}` : base;
}

/** Whether a family can be declared with features; the host's answer, by
 *  default every family but a generic one. */
let takesFeatures: (family: string) => boolean = () => true;

/**
 * Tell the engine which families a host can declare with features (#1237):
 * one whose files it has. A family it cannot (a face only installed on the
 * reader's system, which no file declares again under a feature family's
 * name) takes no figure style: its text keeps the font's own figures in
 * the family itself, instead of a fallback face. Set it before the first
 * build, in every thread that lays out (a layout worker too); `undefined`
 * gives every family back. Configurations resolved before keep what they
 * resolved to.
 */
export function setFigureStyleFamilies(test: ((family: string) => boolean) | undefined): void {
  takesFeatures = test ?? (() => true);
}

/**
 * The family a style sets its text in once its `figureStyle` applies:
 * unset keeps `fontFamily` as it is (with the figures it inherits),
 * `'default'` sets its base family, any other value the feature family of
 * the base family. A font stack is cut to its first family
 * (`primaryFontFamily`); a generic family, and one the host cannot declare
 * with features ({@link setFigureStyleFamilies}), takes no features.
 */
export function withFigureStyle(fontFamily: string, style: FigureStyle | undefined): string {
  if (!isFigureStyle(style)) return fontFamily;
  const base = unquoted(baseFontFamily(primaryFontFamily(fontFamily)));
  if (isGenericFamily(base) || !takesFeatures(base)) return base;
  return featureFamily(base, figureFeatures(style));
}

/** The `featureSettings` descriptor of a feature family's faces
 *  (`"onum" 1, "tnum" 1`); empty for none. */
export function fontFeatureSettings(features: readonly FigureFeature[]): string {
  return features.map((f) => `"${f}" 1`).join(', ');
}

/** The CSS `font-variant-numeric` value of a feature family's features
 *  (`oldstyle-nums tabular-nums`); empty for none. */
export function fontVariantNumeric(features: readonly FigureFeature[]): string {
  return features.map((f) => CSS_VALUE[f]).join(' ');
}

/** The quotes a family takes in a style attribute, as written or escaped. */
const QUOTES = ["'", '&#39;', '&#x27;', '&apos;'];

/** A `font:` value (`400 16px 'Lora@onum'`) whose family is a feature
 *  family in quotes, in the base family followed by the declaration of its
 *  figures; undefined for any other value. */
function featureFontValue(value: string): string | undefined {
  for (const q of QUOTES) {
    if (value.length < 2 * q.length || !value.endsWith(q)) continue;
    const open = value.lastIndexOf(q, value.length - q.length - 1);
    if (open < 0) return undefined;
    const parts = featureFamilyParts(value.slice(open + q.length, value.length - q.length));
    if (parts.features.length === 0) return undefined;
    return `${value.slice(0, open)}${q}${parts.family}${q};font-variant-numeric:${fontVariantNumeric(parts.features)}`;
  }
  return undefined;
}

/**
 * CSS (a style attribute's declarations, an HTML page's markup) with each
 * `font:` that names a feature family in single quotes (as the HTML
 * backend writes it, `'Lora@onum'`, or escaped, `&#39;Lora@onum&#39;`)
 * set in the base family, followed by the `font-variant-numeric` of its
 * features: a page sets the figures with the base family's faces as any
 * host declares them. The `font` shorthand resets `font-variant-numeric`,
 * so it follows the shorthand it belongs to. Read in one pass: a
 * declaration ends at `;`, at the attribute's `"` (or `&quot;`), or at a
 * tag's bracket.
 */
export function featureFontCss(css: string): string {
  if (!css.includes('@')) return css;
  let out = '';
  let from = 0;
  for (let at = css.indexOf('font:'); at >= 0; at = css.indexOf('font:', at + 5)) {
    const start = at + 5;
    let end = start;
    while (end < css.length) {
      const c = css[end];
      if (c === ';' || c === '"' || c === '<' || c === '>') break;
      if (c === '&') {
        // An entity is one character: `&#39;` quotes the family.
        if (css.startsWith('&quot;', end)) break;
        const semi = css.indexOf(';', end);
        if (semi > end && semi - end <= 8) {
          end = semi + 1;
          continue;
        }
      }
      end++;
    }
    const rewritten = featureFontValue(css.slice(start, end));
    if (rewritten !== undefined) {
      out += `${css.slice(from, start)}${rewritten}`;
      from = end;
    }
    // No declaration holds another: the next is looked for past this one.
    at = Math.max(at, end - 5);
  }
  return out + css.slice(from);
}
