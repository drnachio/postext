// The stylesheet of a reflowable book, derived from the resolved
// configuration: the print typography as defaults a reading system may
// override. Sizes are in ems of the body text (the reader's chosen size),
// line heights are ratios, colours come from the resolved palette, and no
// rule sets a width the screen would have to honour.

import { type ResolvedConfig, dimensionToPx, fontVariantNumeric, featureFamilyParts, primaryFontFamily, type Dimension, type ColorValue } from 'postext';
import { round } from './inline.js';
import { setsFigures, familyName, familyStack, ruleText } from './css/helpers.js';
import type { StylesheetOptions, Stylesheet, CssRule } from './css/types.js';
import { createTextRules } from './css/text.js';
import { createFigureRules } from './css/figures.js';
import { createBoxRules } from './css/boxes.js';
import { createApparatusRules } from './css/apparatus.js';
import { createVerseRules } from './css/verse.js';

export type { StylesheetOptions, CssRule, Stylesheet } from './css/types.js';
export { familyStack, familyName } from './css/helpers.js';

export function bookStylesheet(config: ResolvedConfig, fontFaces: string, options: StylesheetOptions): Stylesheet {
  const dpi = config.page.dpi;
  const body = config.bodyText;
  const bodyPx = dimensionToPx(body.fontSize, dpi);
  const families = new Set<string>();
  // A style's figures (#1237) go with its family: `font-variant-numeric`
  // inherits, so where any style sets them every family states its own.
  const figures = setsFigures(config);
  const fam = (f: string) => {
    families.add(familyName(f));
    const numeric = fontVariantNumeric(featureFamilyParts(primaryFontFamily(f)).features);
    return `font-family: ${familyStack(f)}${figures ? `;\n  font-variant-numeric: ${numeric || 'normal'}` : ''}`;
  };
  /** A length in ems of `basePx` (the body size unless given). */
  const em = (d: Dimension, basePx = bodyPx) => `${round(dimensionToPx(d, dpi, basePx) / basePx)}em`;
  /** A line height as a ratio of the font size. */
  const lh = (d: Dimension, fontPx: number) => {
    const px = d.unit === 'em' || d.unit === 'rem' ? d.value * fontPx : dimensionToPx(d, dpi, fontPx);
    return `line-height: ${round(px / fontPx)}`;
  };
  const color = (c: ColorValue | undefined, prop = 'color') => (c?.hex && c.hex !== 'transparent' ? `${prop}: ${c.hex}` : undefined);
  const px = (d: Dimension, basePx = bodyPx) => dimensionToPx(d, dpi, basePx);
  /** `paragraphSpacing` in ems of `basePx` (#1115): `true` is a line of
   *  `lineHeight`, a length that length, else none. */
  const spacingEm = (spacing: boolean | Dimension | undefined, lineHeight: Dimension, basePx = bodyPx): number => {
    if (spacing === true) return round(px(lineHeight, basePx) / basePx);
    if (!spacing || typeof spacing !== 'object') return 0;
    const d = px(spacing, basePx);
    return Number.isFinite(d) && d > 0 ? round(d / basePx) : 0;
  };
  // Right to left (#402): the content documents declare it (`dir` on the
  // root, as EPUB asks, rather than the CSS `direction`); the rules use
  // logical sides (`margin-inline-start`, `text-align: start`), so they
  // hold in both directions.
  const rtl = config.direction === 'rtl';
  const out: (string | CssRule)[] = [];

  out.push('@charset "UTF-8";\n');
  if (fontFaces) out.push(fontFaces);

  createTextRules({
    config, options, dpi, body, bodyPx, fam, em, lh, color, px, spacingEm, out
  });

  createFigureRules({
    config, options, dpi, bodyPx, fam, em, color, px, out
  });

  createBoxRules({
    config, options, dpi, body, bodyPx, fam, em, lh, color, px, spacingEm, rtl, out
  });

  createApparatusRules({
    config, options, dpi, body, bodyPx, fam, lh, color, px, out
  });

  createVerseRules({
    config, options, dpi, body, bodyPx, fam, em, lh, color, px, out
  });
  return {
    css: out.filter(Boolean).map((r) => (typeof r === 'string' ? r : ruleText(r))).join('\n'),
    families,
    rules: out.filter((r): r is CssRule => typeof r !== 'string'),
  };
}

/**
 * What a chapter's stylesheet changes in the book's (`base`): each rule of
 * `variant` whose declarations differ from those of the rule with the same
 * selector (the n-th of that selector, in order), with the declarations it
 * changes or adds, and `unset` for those it drops; a rule the book's
 * stylesheet does not have, whole. Written as a stylesheet linked after
 * the book's: the same selectors come later, so they win, and the
 * cascade between rules stays as in the chapter's own stylesheet (a class
 * on the body would raise their specificity above the book's other rules).
 * Empty when nothing differs.
 */
export function stylesheetOverrides(base: readonly CssRule[], variant: readonly CssRule[]): string {
  const keyed = (rules: readonly CssRule[]): Map<string, CssRule> => {
    const seen = new Map<string, number>();
    const out = new Map<string, CssRule>();
    for (const r of rules) {
      const n = seen.get(r.selector) ?? 0;
      seen.set(r.selector, n + 1);
      out.set(`${r.selector}\u0000${n}`, r);
    }
    return out;
  };
  const prop = (d: string) => d.slice(0, d.indexOf(':')).trim();
  const was = keyed(base);
  const out: string[] = [];
  for (const [key, r] of keyed(variant)) {
    const before = was.get(key);
    if (!before) {
      out.push(ruleText(r));
      continue;
    }
    const old = new Set(before.decls);
    const changed = r.decls.filter((d) => !old.has(d));
    const kept = new Set(r.decls.map(prop));
    const dropped = before.decls.map(prop).filter((p) => !kept.has(p)).map((p) => `${p}: unset`);
    if (changed.length + dropped.length > 0) out.push(ruleText({ selector: r.selector, decls: [...changed, ...dropped] }));
  }
  return out.join('\n');
}

/** `config` under a part's palette (palette id → hex): every colour equal
 *  to the base value of an entry the part changes takes the part's value,
 *  as the engine recolours the printed text (`applyPartPalettesToFlow`;
 *  the resolved configuration keeps values, not palette links). */
export function withPalette(config: ResolvedConfig, overrides: Readonly<Record<string, string>> | undefined): ResolvedConfig {
  if (!overrides || !config.colorPalette) return config;
  const remap = new Map<string, string>();
  for (const e of config.colorPalette) {
    const hex = overrides[e.id];
    if (!hex) continue;
    const next = hex.startsWith('#') ? hex : `#${hex}`;
    if (next.toLowerCase() !== e.value.hex.toLowerCase()) remap.set(e.value.hex.toLowerCase(), next);
  }
  if (remap.size === 0) return config;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== 'object') return v;
    const o = v as Record<string, unknown>;
    if (typeof o.hex === 'string' && typeof o.model === 'string') {
      const next = remap.get(o.hex.toLowerCase());
      return next ? { ...o, hex: next } : o;
    }
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, k === 'colorPalette' ? x : walk(x)]));
  };
  return walk(config) as ResolvedConfig;
}
