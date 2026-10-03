import CSL from 'citeproc';
import type {
  BibliographyOutput,
  CitationClusterInput,
  CitationEngine,
  CitationProcessor,
  CitationProcessorOptions,
  CitationStyleInfo,
  CslItem,
  CslName,
} from 'postext';
import { parseBibtex } from 'postext';
import { STYLE_CATALOG } from './catalog';

/** The XML of the styles and locales an engine can use. */
export interface CslSources {
  /** Style id → CSL XML. */
  styles: Readonly<Record<string, string>>;
  /** Locale (`en-US`, `zh-CN`…) → CSL locale XML. */
  locales: Readonly<Record<string, string>>;
}

/** The locale of `wanted` the sources hold: the tag itself, the first one
 *  of its language (`es` → `es-ES`, `zh-Hant` → `zh-TW`), else `en-US`. */
export function pickLocale(locales: Readonly<Record<string, string>>, wanted: string | undefined): string {
  const tag = (wanted ?? 'en-US').replace(/_/g, '-');
  if (locales[tag]) return tag;
  const lower = tag.toLowerCase();
  if (lower.startsWith('zh')) return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN';
  if (lower === 'pt-br') return 'pt-BR';
  const lang = lower.split('-')[0]!;
  const hit = Object.keys(locales).find((k) => k.toLowerCase().split('-')[0] === lang);
  return hit ?? 'en-US';
}

const CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&#38;').replace(/</g, '&#60;').replace(/>/g, '&#62;');
}

/** The authors of a work as a sentence names them, for a numbered style
 *  that prints none: "García", "García and Ruiz", "García et al.", "张三等". */
function narrativeAuthors(item: CslItem | undefined, and: string, etAl: string): string {
  const names: CslName[] = (item?.author ?? item?.editor ?? []) as CslName[];
  if (names.length === 0) return '';
  const nameOf = (n: CslName): string => n.literal ?? [n['non-dropping-particle'], n.family].filter(Boolean).join(' ');
  const first = nameOf(names[0]!);
  const cjk = CJK.test(first);
  if (names.length === 1) return first;
  if (names.length === 2) return cjk ? `${first}、${nameOf(names[1]!)}` : `${first} ${and} ${nameOf(names[1]!)}`;
  return cjk ? `${first}等` : `${first} ${etAl}`;
}

function numericStyle(xml: string): boolean {
  return /citation-format="numeric"/.test(xml) || /<citation[\s\S]*variable="citation-number"[\s\S]*<\/citation>/.test(xml);
}

/** The `<citation>` element of a style. */
function citationElement(xml: string): string {
  return /<citation\b[\s\S]*?<\/citation>/.exec(xml)?.[0] ?? '';
}

/** A style as the options ask for it: a numbered style's consecutive
 *  numbers joined into a range or kept apart, and, for notes without
 *  numbers, no "see note 3" for a work cited again. */
export function adjustStyle(xml: string, options: { collapseRanges?: boolean; unnumberedNotes?: boolean }): string {
  let out = xml;
  if (options.collapseRanges !== undefined && numericStyle(xml)) {
    const open = /<citation\b[^>]*>/.exec(out)?.[0];
    if (open) {
      const has = /\scollapse="citation-number"/.test(open);
      if (options.collapseRanges && !/\scollapse=/.test(open)) out = out.replace(open, open.replace('<citation', '<citation collapse="citation-number"'));
      else if (!options.collapseRanges && has) out = out.replace(open, open.replace(/\scollapse="citation-number"/, ''));
    }
  }
  if (options.unnumberedNotes) {
    // A branch for a later citation that points back to the first note
    // never applies: the work is written out again.
    out = out.replace(
      /<(if|else-if) position="subsequent">((?:(?!<\/?\1[\s>])[\s\S])*?first-reference-note-number[\s\S]*?)<\/\1>/g,
      (_m, tag: string, body: string) => `<${tag} variable="postext-unnumbered-note">${body}</${tag}>`,
    );
  }
  return out;
}

/** Short locator labels, for a numbered style whose citation leaves the
 *  locator out. */
const LOCATOR_LABELS: Readonly<Record<string, string>> = {
  page: 'p.', chapter: 'chap.', section: 'sec.', figure: 'fig.', volume: 'vol.', note: 'n.', line: 'l.', paragraph: 'para.', column: 'col.', verse: 'v.',
};

/** The locator a numbered style left out, added to its marker: GB/T 7714
 *  sets the page after the number, raised like it ("[5]45"); a raised
 *  marker takes the locator in parentheses ("¹(p. 33)"), a bracketed one
 *  inside its brackets ("[1, p. 33]"). */
function withLocator(html: string, locator: string, label: string | undefined, chinese: boolean): string {
  const word = chinese && (label ?? 'page') === 'page' ? '' : LOCATOR_LABELS[label ?? 'page'] ?? '';
  const loc = escapeHtml(word ? `${word}\u00a0${locator}` : locator);
  if (/<\/sup>$/.test(html)) return chinese ? `${html}<sup>${loc}</sup>` : `${html}<sup>(${loc})</sup>`;
  if (/[\])]$/.test(html)) return `${html.slice(0, -1)}, ${loc}${html.slice(-1)}`;
  return `${html} ${loc}`;
}

const FULL_WIDTH: Readonly<Record<string, string>> = { '(': '（', ')': '）', ',': '，', ';': '；', ':': '：' };

/**
 * An author-date citation in Chinese text with the full-width marks the
 * text around it uses: "（施雅风等，1988；刘时银等，2015）", not
 * "(施雅风等, 1988; 刘时银等, 2015)" (GB/T 7714—2015 writes ASCII ones;
 * the 2025 edition already writes these). Tags and character references
 * are left alone; the spaces around a full-width mark go, its blank is
 * its own.
 */
export function fullWidthCitation(html: string): string {
  return html
    .split(/(<[^>]*>|&#?\w+;)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/[(),;:]/g, (c) => FULL_WIDTH[c]!)))
    .join('')
    .replace(/[ \u00a0]*([（），；：])[ \u00a0]*/g, '$1');
}

/** A citation engine over citeproc-js and the given CSL sources. */
export function createCiteprocEngine(sources: CslSources): CitationEngine {
  return {
    styles: (): readonly CitationStyleInfo[] => STYLE_CATALOG.filter((s) => sources.styles[s.id] !== undefined),
    parseBibtex: (source: string) => parseBibtex(source),
    createProcessor(options: CitationProcessorOptions): CitationProcessor {
      const xml = adjustStyle(
        options.style.trimStart().startsWith('<') ? options.style : (sources.styles[options.style] ?? sources.styles.apa!),
        options,
      );
      // A numbered style whose citation prints no locator (Vancouver,
      // Nature, GB/T 7714): the wrapper adds it.
      const dropsLocator = !/variable="locator"|macro="[^"]*locator[^"]*"/.test(citationElement(xml));
      const items = new Map(options.items.map((i) => [i.id, i]));
      const locale = pickLocale(sources.locales, options.locale);
      const sys = {
        retrieveLocale: (lang: string) => sources.locales[pickLocale(sources.locales, lang)] ?? sources.locales['en-US'],
        retrieveItem: (id: string) => items.get(id),
      };
      const engine = new CSL.Engine(sys, xml, locale, true);
      engine.opt.development_extensions.wrap_url_and_doi = true;
      engine.setOutputFormat('html');
      const kind: CitationProcessor['kind'] = engine.opt.class === 'note' ? 'note' : 'in-text';
      const numeric = numericStyle(xml);
      const chineseText = locale.startsWith('zh');
      const and = engine.getTerm('and') || 'and';
      const etAl = engine.getTerm('et-al') || 'et al.';
      let cited: string[] = [];
      return {
        kind,
        numeric,
        cite(clusters: readonly CitationClusterInput[]): string[] {
          const known = clusters.map((c) => ({ ...c, items: c.items.filter((it) => items.has(it.id)) }));
          const citations = known.map((c, index) => ({
            citationID: `c${index}`,
            citationItems: c.items.map((it) => ({
              id: it.id,
              ...(it.locator ? { locator: it.locator, label: it.label ?? 'page' } : {}),
              ...(it.prefix ? { prefix: escapeHtml(it.prefix) } : {}),
              ...(it.suffix ? { suffix: escapeHtml(it.suffix) } : {}),
              ...(it.suppressAuthor ? { 'suppress-author': true } : {}),
            })),
            properties: {
              noteIndex: c.noteIndex ?? 0,
              // An author-date or author-page style writes "García (2020)"
              // itself; a numbered or a note style does not.
              ...(c.mode === 'narrative' && kind === 'in-text' && !numeric ? { mode: 'composite' } : {}),
            },
          }));
          const withItems = citations.filter((c) => c.citationItems.length > 0);
          const out = withItems.length > 0 ? engine.rebuildProcessorState(withItems, 'html') : [];
          const byId = new Map(out.map(([id, , html]) => [id, html]));
          cited = [...new Set(known.flatMap((c) => c.items.map((it) => it.id)))];
          return known.map((c, index) => {
            let html = byId.get(`c${index}`) ?? '';
            const single = c.items.length === 1 ? c.items[0]! : undefined;
            if (numeric && dropsLocator && kind === 'in-text' && single?.locator && html) {
              html = withLocator(html, single.locator, single.label, locale.startsWith('zh') || /gb-t-7714|GB\/T 7714/i.test(xml.slice(0, 4000)));
            }
            // "p. 33" stays on one line.
            html = html.replace(/(^|[\s(>])(\p{L}{1,6}\.) (?=[\dIVXLCivxlc])/gu, '$1$2\u00a0');
            if (c.mode === 'narrative' && kind === 'in-text' && numeric && c.items.length > 0) {
              const who = c.items.map((it) => narrativeAuthors(items.get(it.id), and, etAl)).filter(Boolean).join('; ');
              const glue = /^<sup>/.test(html) || CJK.test(who) ? '' : ' ';
              return who ? `${escapeHtml(who)}${glue}${html}` : html;
            }
            html = html.replace(/\[?NO_PRINTED_FORM\]?\s*/g, '');
            if (chineseText && kind === 'in-text' && !numeric) html = fullWidthCitation(html);
            // An author-page style with nothing for the parentheses (MLA,
            // "as Stillinger records") leaves the space before them.
            return c.mode === 'narrative' && kind === 'in-text' && !numeric ? html.trim() : html;
          });
        },
        bibliography(ids?: readonly string[]): BibliographyOutput {
          const uncited = (ids ?? []).filter((id) => items.has(id) && !cited.includes(id));
          if (uncited.length > 0) engine.updateUncitedItems(uncited);
          const result = engine.makeBibliography();
          if (!result) return { entries: [], hangingIndent: false, labelColumn: false, entrySpacing: 0 };
          const [meta, html] = result;
          const wanted = ids ? new Set(ids) : undefined;
          const entries: BibliographyOutput['entries'] = [];
          meta.entry_ids.forEach((group, i) => {
            const id = group[0]!;
            if (wanted && !wanted.has(id)) return;
            const raw = html[i] ?? '';
            const label = /<div class="csl-left-margin">([\s\S]*?)<\/div>/.exec(raw)?.[1]?.trim();
            const body = /<div class="csl-right-inline">([\s\S]*?)<\/div>\s*<\/div>\s*$/.exec(raw)?.[1]
              ?? /<div class="csl-entry">([\s\S]*?)<\/div>\s*$/.exec(raw)?.[1]
              ?? raw;
            entries.push({ id, html: body.replace(/\s+/g, ' ').trim(), ...(label ? { label } : {}) });
          });
          return {
            entries,
            hangingIndent: Boolean(meta.hangingindent),
            labelColumn: Boolean(meta['second-field-align']),
            entrySpacing: meta.entryspacing ?? 0,
          };
        },
        citationNumbers(): ReadonlyMap<string, number> {
          return new Map(Object.values(engine.registry.registry).map((r) => [r.id, r.seq]));
        },
      };
    },
  };
}
