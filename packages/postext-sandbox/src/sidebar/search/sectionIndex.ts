// Which Design-panel sections can hold a settings-search hit, decided
// without rendering them. Pure.
//
// Each section's text is its title, the labels its component tree reads
// (`SECTION_SEARCH_KEYS`, generated from the source) in the viewer's
// language, and the words its rows take from the book itself: names and
// values in its slice of the config, palette names, font families, units,
// resource ids. A section is a candidate when every query word starts a word
// of that text — a superset of the rows that will match, so mounting only
// the candidates never loses a result (`sectionSearchIndex.test.ts` checks
// that against rendered sections).

import type { PostextConfig, Resource } from 'postext';
import {
  DEFAULT_BODY_TEXT_CONFIG,
  DEFAULT_CALLOUT_STYLES,
  DEFAULT_CHIP_STYLES,
  DEFAULT_FOOTER_SLOT,
  DEFAULT_HEADER_SLOT,
  DEFAULT_HEADING_STYLES,
  DEFAULT_PARAGRAPH_STYLES,
  DEFAULT_PARTS_CONFIG,
  DEFAULT_TOC_CONFIG,
} from 'postext';
import type { SandboxLabels } from '../../types/labels';
import {
  SETTINGS_GROUPS,
  SETTINGS_SECTIONS,
  type SettingsGroupId,
  type SettingsSectionEntry,
  type SettingsSectionId,
} from '../sections/registry';
import { sectionHasOverrides } from '../sections/sectionOverrides';
import { SECTION_SEARCH_KEYS, type SearchWordSource } from './sectionSearchIndex.generated';
import { matchesTokens, normalizeText } from './normalize';

export interface SectionSearchText {
  id: SettingsSectionId;
  /** The section shows colour values (a hex word never rules it out). */
  colors: boolean;
  /** Normalized section title. */
  title: string;
  /** Normalized label strings, one per key (for ranking). */
  labels: readonly string[];
  /** Every word the section's rows may show, normalized, one string. */
  all: string;
}

/** Colour formats a colour field can display besides the value itself. */
const COLOR_WORDS = ['transparent', 'hex', 'rgb', 'cmyk', 'hsl'];
const DIMENSION_UNITS = ['cm', 'mm', 'in', 'pt', 'px', 'em', 'rem'];

/** What a section shows while its config key is unset: the built-in
 *  styles and slots (names, ids, colours). */
const DEFAULT_SLICES: Partial<Record<keyof PostextConfig, unknown>> = {
  calloutStyles: DEFAULT_CALLOUT_STYLES,
  chipStyles: DEFAULT_CHIP_STYLES,
  paragraphStyles: DEFAULT_PARAGRAPH_STYLES,
  headingStyles: DEFAULT_HEADING_STYLES,
  toc: DEFAULT_TOC_CONFIG,
  parts: DEFAULT_PARTS_CONFIG,
  header: DEFAULT_HEADER_SLOT,
  footer: DEFAULT_FOOTER_SLOT,
};

/** A query word with a digit (a level number, a size, a colour's
 *  components) is not indexed: it never rules a section out. */
function isIndexedToken(token: string): boolean {
  return !/\d/.test(token);
}

/** Could be part of a hex colour a colour field displays (`ffffff`). */
const HEX_WORD = /^[0-9a-f]+$/;

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 12 || value === null || value === undefined) return;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out, depth + 1);
  else if (typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out, depth + 1);
}

function collectFontFamilies(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 12 || value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const v of value) collectFontFamilies(v, out, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === 'fontFamily' && typeof v === 'string') out.add(v);
    else collectFontFamilies(v, out, depth + 1);
  }
}

const labelTextCache = new WeakMap<SandboxLabels, Map<SettingsSectionId, { title: string; labels: string[] }>>();

function sectionLabelText(labels: SandboxLabels, entry: SettingsSectionEntry): { title: string; labels: string[] } {
  let byId = labelTextCache.get(labels);
  if (!byId) {
    byId = new Map();
    labelTextCache.set(labels, byId);
  }
  let text = byId.get(entry.id);
  if (!text) {
    const record = labels as unknown as Record<string, unknown>;
    const strings: string[] = [];
    for (const key of SECTION_SEARCH_KEYS[entry.id].keys) {
      const value = record[key];
      if (typeof value === 'string' && value.length > 0) strings.push(normalizeText(value));
    }
    text = { title: normalizeText(String(record[entry.labelKey] ?? '')), labels: strings };
    byId.set(entry.id, text);
  }
  return text;
}

function sourceWords(
  source: SearchWordSource,
  config: PostextConfig,
  resources: readonly Resource[],
  fonts: () => string[],
): string[] {
  switch (source) {
    case 'color':
      return [...COLOR_WORDS, ...(config.colorPalette ?? []).flatMap((e) => [e.name, e.id])];
    case 'dimension':
      return DIMENSION_UNITS;
    case 'font':
      return fonts();
    case 'resources':
      // Pickers name a resource by its caption and id.
      return resources.flatMap((r) => (r.caption ? [r.id, r.caption] : [r.id]));
  }
}

/** Search text for every section, in registry order. */
export function buildSectionSearchIndex(
  labels: SandboxLabels,
  config: PostextConfig,
  resources: readonly Resource[],
): SectionSearchText[] {
  let fontCache: string[] | null = null;
  const fonts = () => {
    if (!fontCache) {
      const set = new Set<string>([DEFAULT_BODY_TEXT_CONFIG.fontFamily]);
      collectFontFamilies(DEFAULT_HEADER_SLOT, set);
      collectFontFamilies(config, set);
      fontCache = [...set];
    }
    return fontCache;
  };
  const record = config as unknown as Record<string, unknown>;
  return SETTINGS_SECTIONS.map((entry) => {
    const text = sectionLabelText(labels, entry);
    const { sources, literals } = SECTION_SEARCH_KEYS[entry.id];
    const dynamic: string[] = [...literals];
    for (const key of entry.configKeys) {
      collectStrings(record[key], dynamic);
      collectStrings(DEFAULT_SLICES[key], dynamic);
    }
    for (const source of sources) dynamic.push(...sourceWords(source, config, resources, fonts));
    const all = [text.title, ...text.labels, normalizeText(dynamic.join(' | '))].join(' | ');
    return { id: entry.id, colors: sources.includes('color'), title: text.title, labels: text.labels, all };
  });
}

export interface SearchPlanGroup {
  id: SettingsGroupId;
  sections: SettingsSectionId[];
}

/** How strongly a candidate section matches: its title (3), one of its
 *  labels on its own (2 + a small bonus per matching label), or only
 *  across several of its words (1). */
function score(text: SectionSearchText, tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;
  if (matchesTokens(text.title, tokens)) return 3;
  let hits = 0;
  for (const l of text.labels) if (matchesTokens(l, tokens)) hits++;
  return hits > 0 ? 2 + Math.min(hits, 50) / 100 : 1;
}

/** The sections to mount for a search, grouped, best group first (ties keep
 *  the browsing order; sections keep it inside a group). `overriddenOnly`
 *  keeps the sections that carry overrides. */
export function planSettingsSearch(
  index: readonly SectionSearchText[],
  tokens: readonly string[],
  overriddenOnly: boolean,
  config: PostextConfig,
): SearchPlanGroup[] {
  const indexed = tokens.filter(isIndexedToken);
  const scores = new Map<SettingsSectionId, number>();
  for (const text of index) {
    const required = text.colors ? indexed.filter((t) => !HEX_WORD.test(t)) : indexed;
    if (required.length > 0 && !matchesTokens(text.all, required)) continue;
    if (overriddenOnly && !sectionHasOverrides(config, text.id)) continue;
    scores.set(text.id, score(text, indexed));
  }
  const groups: Array<SearchPlanGroup & { best: number; order: number }> = [];
  SETTINGS_GROUPS.forEach((g, order) => {
    const sections = SETTINGS_SECTIONS.filter((s) => s.group === g.id && scores.has(s.id)).map((s) => s.id);
    if (sections.length === 0) return;
    const best = Math.max(...sections.map((id) => scores.get(id)!));
    groups.push({ id: g.id, sections, best, order });
  });
  groups.sort((a, b) => b.best - a.best || a.order - b.order);
  return groups.map(({ id, sections }) => ({ id, sections }));
}
