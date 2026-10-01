import type { CitationsConfig, ResolvedCitationsConfig } from '../types';
import { dimensionsEqual } from './shared';

export const DEFAULT_CITATIONS_CONFIG: ResolvedCitationsConfig = {
  style: 'apa',
  link: true,
  marker: 'style',
  collapseRanges: true,
  notes: 'footnote',
  bibliography: {
    scope: 'book',
    auto: true,
    fontSize: { value: 0.9, unit: 'em' },
    hangingIndent: { value: 2, unit: 'em' },
    entrySpacing: { value: 0.3, unit: 'em' },
    doi: 'link',
    includeUncited: false,
    groupByLanguage: false,
  },
};

const MARKERS: ReadonlySet<string> = new Set(['style', 'brackets', 'parentheses', 'superscript', 'corner']);
const DOI: ReadonlySet<string> = new Set(['link', 'text', 'hide']);

export function resolveCitationsConfig(partial?: CitationsConfig): ResolvedCitationsConfig {
  const d = DEFAULT_CITATIONS_CONFIG;
  const b = partial?.bibliography;
  const db = d.bibliography;
  const style = typeof partial?.style === 'string' && partial.style.trim().length > 0 ? partial.style.trim() : d.style;
  return {
    style,
    ...(typeof partial?.customStyle === 'string' && partial.customStyle.trim().length > 0 ? { customStyle: partial.customStyle } : {}),
    ...(typeof partial?.locale === 'string' && partial.locale.trim().length > 0 ? { locale: partial.locale.trim() } : {}),
    link: partial?.link ?? d.link,
    marker: typeof partial?.marker === 'string' && MARKERS.has(partial.marker) ? partial.marker : d.marker,
    collapseRanges: partial?.collapseRanges ?? d.collapseRanges,
    notes: partial?.notes === 'warichu' ? 'warichu' : 'footnote',
    bibliography: {
      ...(typeof b?.title === 'string' ? { title: b.title } : {}),
      scope: b?.scope === 'chapter' ? 'chapter' : 'book',
      auto: b?.auto ?? db.auto,
      fontSize: b?.fontSize ?? db.fontSize,
      ...(b?.lineHeight ? { lineHeight: b.lineHeight } : {}),
      hangingIndent: b?.hangingIndent ?? db.hangingIndent,
      entrySpacing: b?.entrySpacing ?? db.entrySpacing,
      ...(b?.labelWidth ? { labelWidth: b.labelWidth } : {}),
      doi: typeof b?.doi === 'string' && DOI.has(b.doi) ? b.doi : db.doi,
      includeUncited: b?.includeUncited ?? db.includeUncited,
      groupByLanguage: b?.groupByLanguage ?? db.groupByLanguage,
    },
  };
}

export function stripCitationsDefaults(c?: CitationsConfig): CitationsConfig | undefined {
  if (!c) return undefined;
  const d = DEFAULT_CITATIONS_CONFIG;
  const out: CitationsConfig = {};
  if (c.style !== undefined && c.style !== d.style) out.style = c.style;
  if (c.customStyle) out.customStyle = c.customStyle;
  if (c.locale) out.locale = c.locale;
  if (c.link !== undefined && c.link !== d.link) out.link = c.link;
  if (c.marker !== undefined && c.marker !== d.marker) out.marker = c.marker;
  if (c.collapseRanges !== undefined && c.collapseRanges !== d.collapseRanges) out.collapseRanges = c.collapseRanges;
  if (c.notes !== undefined && c.notes !== d.notes) out.notes = c.notes;
  const b = c.bibliography;
  if (b) {
    const db = d.bibliography;
    const ob: NonNullable<CitationsConfig['bibliography']> = {};
    if (b.title !== undefined) ob.title = b.title;
    if (b.scope !== undefined && b.scope !== db.scope) ob.scope = b.scope;
    if (b.auto !== undefined && b.auto !== db.auto) ob.auto = b.auto;
    if (b.fontSize && !dimensionsEqual(b.fontSize, db.fontSize)) ob.fontSize = b.fontSize;
    if (b.lineHeight) ob.lineHeight = b.lineHeight;
    if (b.hangingIndent && !dimensionsEqual(b.hangingIndent, db.hangingIndent)) ob.hangingIndent = b.hangingIndent;
    if (b.entrySpacing && !dimensionsEqual(b.entrySpacing, db.entrySpacing)) ob.entrySpacing = b.entrySpacing;
    if (b.labelWidth) ob.labelWidth = b.labelWidth;
    if (b.doi !== undefined && b.doi !== db.doi) ob.doi = b.doi;
    if (b.includeUncited !== undefined && b.includeUncited !== db.includeUncited) ob.includeUncited = b.includeUncited;
    if (b.groupByLanguage !== undefined && b.groupByLanguage !== db.groupByLanguage) ob.groupByLanguage = b.groupByLanguage;
    if (Object.keys(ob).length > 0) out.bibliography = ob;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
