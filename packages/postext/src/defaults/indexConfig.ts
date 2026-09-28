import type { Dimension, IndexConfig, ResolvedBodyTextConfig, ResolvedIndexConfig } from '../types';

const ONE_EM: Dimension = { value: 1, unit: 'em' };
const TWO_EM: Dimension = { value: 2, unit: 'em' };
const ZERO: Dimension = { value: 0, unit: 'em' };

/** Static defaults of the `index` section (#165). Typography inherits the
 *  body text at resolve time; the labels follow the document language. */
export const DEFAULT_INDEX_CONFIG = {
  indent: ONE_EM,
  turnoverIndent: TWO_EM,
  entrySpacing: ZERO,
  separator: ', ',
  locatorSeparator: ', ',
  rangeSeparator: '–',
  mergeRanges: true,
  rangeFormat: 'full' as const,
  main: { bold: true, italic: false },
  see: { italic: true },
  groups: { enabled: true, fontWeight: 700 },
};

export function resolveIndexConfig(
  partial: IndexConfig | undefined,
  bodyText: ResolvedBodyTextConfig,
): ResolvedIndexConfig {
  const d = DEFAULT_INDEX_CONFIG;
  const fontFamily = partial?.fontFamily ?? bodyText.fontFamily;
  const fontSize = partial?.fontSize ?? bodyText.fontSize;
  const lineHeight = partial?.lineHeight ?? bodyText.lineHeight;
  const color = partial?.color ?? bodyText.color;
  const g = partial?.groups;
  return {
    fontFamily,
    fontSize,
    lineHeight,
    fontWeight: partial?.fontWeight ?? bodyText.fontWeight,
    color,
    indent: partial?.indent ?? d.indent,
    turnoverIndent: partial?.turnoverIndent ?? d.turnoverIndent,
    entrySpacing: partial?.entrySpacing ?? d.entrySpacing,
    separator: partial?.separator ?? d.separator,
    locatorSeparator: partial?.locatorSeparator ?? d.locatorSeparator,
    rangeSeparator: partial?.rangeSeparator ?? d.rangeSeparator,
    mergeRanges: partial?.mergeRanges ?? d.mergeRanges,
    rangeFormat: partial?.rangeFormat === 'chicago' ? 'chicago' : d.rangeFormat,
    main: { bold: partial?.main?.bold ?? d.main.bold, italic: partial?.main?.italic ?? d.main.italic },
    see: {
      ...(partial?.see?.label !== undefined ? { label: partial.see.label } : {}),
      ...(partial?.see?.alsoLabel !== undefined ? { alsoLabel: partial.see.alsoLabel } : {}),
      italic: partial?.see?.italic ?? d.see.italic,
    },
    ...(partial?.locale ? { locale: partial.locale } : {}),
    groups: {
      enabled: g?.enabled ?? d.groups.enabled,
      fontFamily: g?.fontFamily ?? fontFamily,
      fontSize: g?.fontSize ?? fontSize,
      fontWeight: g?.fontWeight ?? d.groups.fontWeight,
      italic: g?.italic ?? false,
      color: g?.color ?? color,
      // One line of the index's own leading: a blank line between groups.
      marginTop: g?.marginTop ?? lineHeight,
      ...(g?.symbolsLabel !== undefined ? { symbolsLabel: g.symbolsLabel } : {}),
      ...(g?.numbersLabel !== undefined ? { numbersLabel: g.numbersLabel } : {}),
    },
  };
}

function definedFields<T extends object>(obj: T | undefined): T | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

/** Drop unset fields and the static defaults. Returns `undefined` when
 *  nothing remains. */
export function stripIndexDefaults(index: IndexConfig | undefined): IndexConfig | undefined {
  if (!index) return undefined;
  const d = DEFAULT_INDEX_CONFIG;
  const r = definedFields({ ...index }) ?? {};
  if (r.separator === d.separator) delete r.separator;
  if (r.locatorSeparator === d.locatorSeparator) delete r.locatorSeparator;
  if (r.rangeSeparator === d.rangeSeparator) delete r.rangeSeparator;
  if (r.mergeRanges === d.mergeRanges) delete r.mergeRanges;
  if (r.rangeFormat === d.rangeFormat) delete r.rangeFormat;
  if (r.main) {
    const m = definedFields(r.main);
    if (m?.bold === d.main.bold) delete m.bold;
    if (m?.italic === d.main.italic) delete m.italic;
    if (m && Object.keys(m).length > 0) r.main = m;
    else delete r.main;
  }
  if (r.see) {
    const s = definedFields(r.see);
    if (s?.italic === d.see.italic) delete s.italic;
    if (s && Object.keys(s).length > 0) r.see = s;
    else delete r.see;
  }
  if (r.groups) {
    const g = definedFields(r.groups);
    if (g?.enabled === d.groups.enabled) delete g.enabled;
    if (g?.fontWeight === d.groups.fontWeight) delete g.fontWeight;
    if (g && Object.keys(g).length > 0) r.groups = g;
    else delete r.groups;
  }
  return Object.keys(r).length > 0 ? r : undefined;
}
