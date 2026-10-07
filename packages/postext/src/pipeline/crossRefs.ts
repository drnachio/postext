/**
 * Cross-references to anchors (#262, #263): `:ref{id="sec-intro"}` naming a
 * heading with an identifier, an anchor set in the text or a container
 * opened with one. The label comes from the book outline — the heading's
 * number and title, the anchor's text — and, for a page reference, the
 * label of the page the target landed on in the previous layout round.
 */

import type { ContentBlock, InlineSpan, RefCase } from '../parse';
import type { OutlineEntry } from '../types';
import { stringsFor } from '../locale';

const NBSP = ' ';

/** A target a cross-reference may name, as the outline knows it. */
export interface AnchorTarget {
  id: string;
  kind: 'heading' | 'anchor';
  /** Heading level (1–6); absent for an anchor. */
  level?: number;
  /** The printed number of a numbered heading (`''` otherwise). */
  number: string;
  /** A heading's title, an anchor's text (`[text]{#id}`) or a container's
   *  `title`; `''` when it has none. */
  title: string;
  /** Label of the page it landed on, once laid out. */
  pageLabel?: string;
  /** 0-based book page index of that page, once laid out. */
  pageIndex?: number;
  /** A labelled equation's or a numbered statement's default label (#530):
   *  "(3)", "Theorem 2". */
  numberLabel?: string;
}

/** Anchor targets by identifier. */
export type AnchorTargets = ReadonlyMap<string, AnchorTarget>;

/** The targets of an outline: every heading with an identifier and every
 *  anchor, the first setting of an identifier winning. */
export function anchorTargetsOf(outline: readonly OutlineEntry[] | undefined): AnchorTargets {
  const out = new Map<string, AnchorTarget>();
  for (const e of outline ?? []) {
    if (e.anchorId === undefined || out.has(e.anchorId)) continue;
    if (e.kind !== 'heading' && e.kind !== 'anchor') continue;
    out.set(e.anchorId, {
      id: e.anchorId,
      kind: e.kind,
      ...(e.kind === 'heading' ? { level: e.level } : {}),
      number: e.numbered ? e.number : '',
      title: e.title,
      ...(e.pageLabel !== undefined ? { pageLabel: e.pageLabel } : {}),
      ...(e.pageIndex !== undefined ? { pageIndex: e.pageIndex } : {}),
      ...(e.numberLabel !== undefined ? { numberLabel: e.numberLabel } : {}),
    });
  }
  return out;
}

/** The pandoc-crossref prefixes (`@sec:intro`, `@fig:map`): a reference
 *  written with one names the identifier with or without it. */
export const CROSSREF_PREFIXES: readonly string[] = ['sec', 'fig', 'tbl', 'eq', 'lst'];

/** The identifier a reference names, without a pandoc-crossref prefix
 *  (`sec:intro` → `intro`); `undefined` when it carries none. */
export function unprefixedId(id: string): string | undefined {
  const colon = id.indexOf(':');
  if (colon <= 0) return undefined;
  return CROSSREF_PREFIXES.includes(id.slice(0, colon)) ? id.slice(colon + 1) : undefined;
}

/** The resource a reference names: its id as written, else without a
 *  pandoc-crossref prefix (`@fig:map` names resource `map`) when only that
 *  one is a resource. */
export function resourceRefId(id: string, isResource: (id: string) => boolean): string {
  if (isResource(id)) return id;
  const bare = unprefixedId(id);
  return bare !== undefined && isResource(bare) ? bare : id;
}

/** The target `id` names: the identifier as written, else without its
 *  pandoc-crossref prefix. */
export function findAnchorTarget(targets: AnchorTargets | undefined, id: string): AnchorTarget | undefined {
  if (!targets) return undefined;
  const direct = targets.get(id);
  if (direct) return direct;
  const bare = unprefixedId(id);
  return bare !== undefined ? targets.get(bare) : undefined;
}

/** The words a cross-reference prints around a number, per document
 *  language: `{n}` stands for the number or the page label. */
export interface CrossRefStrings {
  /** A level-1 heading: "chapter 3". */
  chapter: string;
  /** Any other heading: "section 3.2". */
  section: string;
  /** A page: "p. 112". */
  page: string;
  /** The style of a reference that sets none (`crossRefs.defaultStyle`). */
  defaultStyle?: 'default' | 'number' | 'title' | 'page';
}

const CROSS_REF_STRINGS: Readonly<Record<string, CrossRefStrings>> = {
  en: { chapter: `chapter${NBSP}{n}`, section: `section${NBSP}{n}`, page: `p.${NBSP}{n}` },
  es: { chapter: `capítulo${NBSP}{n}`, section: `sección${NBSP}{n}`, page: `pág.${NBSP}{n}` },
  fr: { chapter: `chapitre${NBSP}{n}`, section: `section${NBSP}{n}`, page: `p.${NBSP}{n}` },
  de: { chapter: `Kapitel${NBSP}{n}`, section: `Abschnitt${NBSP}{n}`, page: `S.${NBSP}{n}` },
  it: { chapter: `capitolo${NBSP}{n}`, section: `sezione${NBSP}{n}`, page: `p.${NBSP}{n}` },
  // "seção": the Brazilian spelling, which Portugal accepts as well (AO90).
  pt: { chapter: `capítulo${NBSP}{n}`, section: `seção${NBSP}{n}`, page: `p.${NBSP}{n}` },
  ca: { chapter: `capítol${NBSP}{n}`, section: `secció${NBSP}{n}`, page: `p.${NBSP}{n}` },
  nl: { chapter: `hoofdstuk${NBSP}{n}`, section: `paragraaf${NBSP}{n}`, page: `p.${NBSP}{n}` },
  'zh-hans': { chapter: '第{n}章', section: '第{n}节', page: '第{n}页' },
  'zh-hant': { chapter: '第{n}章', section: '第{n}節', page: '第{n}頁' },
  // 「第3章」, 「2.3節」 (a dotted section number takes no 第: 第2.3節 reads
  // oddly in Japanese), 「45ページ」.
  ja: { chapter: '第{n}章', section: '{n}節', page: '{n}ページ' },
  // «انظر الفصل ٣», «القسم ٢-١», «ص ١٢» (ص for صفحة).
  ar: { chapter: `الفصل${NBSP}{n}`, section: `القسم${NBSP}{n}`, page: `ص${NBSP}{n}` },
};

/** The built-in cross-reference words for a document language. */
export function defaultCrossRefStrings(locale: unknown): CrossRefStrings {
  return stringsFor(CROSS_REF_STRINGS, locale);
}

/** A heading number as a reference prints it: without the stop or the
 *  space a numbering template may end with ("1.2." → "1.2"). */
function bareNumber(number: string): string {
  return number.replace(/[\s.:)、。]+$/u, '').trim();
}

function applyCase(text: string, refCase: RefCase | undefined): string {
  if (refCase === undefined || text.length === 0) return text;
  switch (refCase) {
    case 'lower':
      return text.toLocaleLowerCase();
    case 'upper':
      return text.toLocaleUpperCase();
    case 'capitalize': {
      const first = [...text][0]!;
      return first.toLocaleUpperCase() + text.slice(first.length);
    }
  }
}

/** A template with its words in `refCase` and `{n}` replaced. */
function fill(template: string, n: string, refCase: RefCase | undefined): string {
  const at = template.indexOf('{n}');
  if (at < 0) return applyCase(template, refCase);
  const before = applyCase(template.slice(0, at), refCase);
  const after = template.slice(at + 3);
  // `capitalize` reaches the words after the number when none come before.
  return `${before}${n}${before.trim().length > 0 ? after : applyCase(after, refCase)}`;
}

/** Whether a heading number already holds the words of the template it
 *  would be set in: a space ("Chapter 3"), or the template's words around
 *  `{n}` ("第三章" against "第{n}章", "Capítulo 2" against "capítulo {n}"). */
function numberIsWorded(number: string, template: string): boolean {
  if (/\s/u.test(number)) return true;
  const at = template.indexOf('{n}');
  if (at < 0) return false;
  const before = template.slice(0, at).trim().toLocaleLowerCase();
  const after = template.slice(at + 3).trim().toLocaleLowerCase();
  const n = number.toLocaleLowerCase();
  return (before.length > 0 && n.startsWith(before)) || (after.length > 0 && n.endsWith(after));
}

/** What a page reference prints before the target is laid out. */
export const UNKNOWN_PAGE = '?';

/**
 * The label of a cross-reference to an anchor target:
 * - `default` / `full`: a numbered heading as "chapter 3" / "section 3.2",
 *   an unnumbered one by its title, an anchor by its text, else its page;
 * - `number`: the bare number (the title when there is none);
 * - `title`: the title or the anchor's text;
 * - `page`: "p. 112"; `pageNumber`: "112".
 * `text="…"` overrides it all.
 */
export function resolveAnchorRefLabel(
  ref: NonNullable<InlineSpan['ref']>,
  target: AnchorTarget,
  strings: CrossRefStrings,
): string {
  if (ref.text !== undefined && ref.text.length > 0) return ref.text;
  const page = target.pageLabel !== undefined && target.pageLabel.length > 0 ? target.pageLabel : UNKNOWN_PAGE;
  const title = target.title;
  // A labelled equation or a numbered statement (#530) prints its label —
  // "(3)", "Theorem 2" — and `number` its number as written.
  if (target.numberLabel !== undefined) {
    switch (ref.style ?? strings.defaultStyle) {
      case 'page':
        return fill(strings.page, page, ref.case);
      case 'pageNumber':
        return page;
      case 'number':
        return target.number;
      case 'title':
        return title.length > 0 ? title : applyCase(target.numberLabel, ref.case);
      default:
        return applyCase(target.numberLabel, ref.case);
    }
  }
  const number = bareNumber(target.number);
  switch (ref.style ?? strings.defaultStyle) {
    case 'page':
      return fill(strings.page, page, ref.case);
    case 'pageNumber':
      return page;
    case 'title':
      return title.length > 0 ? title : fill(strings.page, page, ref.case);
    case 'number':
      return number.length > 0 ? number : title.length > 0 ? title : page;
    default: {
      if (target.kind === 'heading' && number.length > 0) {
        const template = target.level === 1 ? strings.chapter : strings.section;
        // A number its template already words ("Chapter 3", "第三章")
        // prints as is.
        return numberIsWorded(number, template) ? number : fill(template, number, ref.case);
      }
      return title.length > 0 ? title : fill(strings.page, page, ref.case);
    }
  }
}

/** Whether a reference prints its target's page, so its label moves with
 *  the layout (the document is laid out again until it settles, #263). */
export function refPrintsPage(
  ref: NonNullable<InlineSpan['ref']>,
  target: AnchorTarget | undefined,
  defaultStyle?: CrossRefStrings['defaultStyle'],
): boolean {
  if (ref.text !== undefined && ref.text.length > 0) return false;
  if (ref.style === undefined && defaultStyle !== undefined && defaultStyle !== 'default') ref = { ...ref, style: defaultStyle };
  if (ref.style === 'page' || ref.style === 'pageNumber') return true;
  if (!target) return false;
  // A counted target prints its number, known before layout (#530).
  if (target.numberLabel !== undefined) return false;
  const titled = target.title.length > 0;
  if (ref.style === 'title') return !titled;
  if (ref.style === 'number') return bareNumber(target.number).length === 0 && !titled;
  return !(target.kind === 'heading' && bareNumber(target.number).length > 0) && !titled;
}

/** Every inline `:ref` of the parsed content (paragraphs, headings, list
 *  items, quotations). */
function* refsOf(blocks: readonly ContentBlock[]): Generator<NonNullable<InlineSpan['ref']>> {
  for (const b of blocks) for (const s of b.spans) if (s.ref) yield s.ref;
}

/** Whether the parsed content holds a reference that names no resource of
 *  `resourceIds` — one that may name an anchor (#262). */
export function hasAnchorRefs(blocks: readonly ContentBlock[], resourceIds: ReadonlySet<string>): boolean {
  for (const ref of refsOf(blocks)) {
    if (resourceIds.has(ref.resourceId)) continue;
    const bare = unprefixedId(ref.resourceId);
    if (bare !== undefined && resourceIds.has(bare)) continue;
    return true;
  }
  return false;
}

/** Whether a reference of the parsed content prints the page of an anchor
 *  of `targets`: the document is then laid out until the pages settle. */
export function printsAnchorPages(
  blocks: readonly ContentBlock[],
  targets: AnchorTargets,
  defaultStyle?: CrossRefStrings['defaultStyle'],
): boolean {
  for (const ref of refsOf(blocks)) {
    const target = findAnchorTarget(targets, ref.resourceId);
    if (target && refPrintsPage(ref, target, defaultStyle)) return true;
  }
  return false;
}
