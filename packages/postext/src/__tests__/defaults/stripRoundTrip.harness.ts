import { describe, it, expect } from 'vitest';
import {
  resolveCodeStyleConfig,
  resolveComicsConfig,
  resolveDebugConfig,
  resolveFolioConfig,
  resolveHtmlViewerConfig,
  resolveLineNumbersConfig,
  resolvePdfGenerationConfig,
  resolvePrintConfig,
  resolveContrastConfig,
  resolveChecksConfig,
  resolveDieCutsConfig,
  stripConfigDefaults,
} from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { DesignElement, PostextConfig } from '../../types.js';

// #694: the strip must not change what a configuration resolves to. Three
// values were lost in two days because each stripper compared a value with
// one default while the resolver took it from somewhere else: the default
// of the document (#651), the value the section inherits (#691), a slot
// that is empty on purpose (#694). The cases below are not written one by
// one: they are generated from the configuration itself. Every field of a
// resolved configuration is set to the empty value of its type (`false`,
// 0, an empty string, list, slot or section), to the default of a plain
// document and to a value of another document; every field that follows
// another one is set back to what it was once the other has moved. Each
// configuration must resolve the same before and after the strip.

export type Fields = Record<string, unknown>;
export type Step = string | { key: 'id' | 'level'; value: unknown; index: number };
export type Path = Step[];

export const isFields = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v);
export const isDimension = (v: unknown): v is { value: number; unit: string } =>
  isFields(v) && typeof v.value === 'number' && typeof v.unit === 'string' && Object.keys(v).length === 2;
export const isColor = (v: unknown): v is { hex: string } => isFields(v) && typeof v.hex === 'string';
export const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)) as T);
export const show = (path: Path) => path.map((s) => (typeof s === 'string' ? s : `[${s.key}=${String(s.value)}]`)).join('.');

/** `value` as text with its keys sorted, less four ways two resolved
 *  configurations differ and read the same:
 *  - `bodyText.hyphenation.tag` (the language the patterns were asked
 *    for) in a document that names its `locale`, which every reader takes
 *    first: patterns named for the document's own language are dropped
 *    (#651), and the tag with them;
 *  - `pages: 'all'` on a slot element, the default: the built-in running
 *    head and folio are stored without it;
 *  - the slot of a heading design that is switched off, which nothing
 *    reads (one with no slot resolves to the running head's);
 *  - the display name of the built-in box, chip or highlight style listed alone and
 *    without one (`[{ id: 'note' }]` is the built-in list, whose style is
 *    named "Note"; given so, it is listed under its id). */
function reading(value: unknown, named: boolean, key = '', builtIn = false): string {
  if (Array.isArray(value)) {
    const alone = value.length === 1 && isFields(value[0])
      && ((key === 'calloutStyles' && value[0].id === 'note') || (key === 'chipStyles' && value[0].id === 'chip') || (key === 'markStyles' && value[0].id === 'mark'));
    return `[${value.map((item) => reading(item, named, '', alone)).join(',')}]`;
  }
  if (!isFields(value)) return JSON.stringify(value) ?? 'null';
  const parts: string[] = [];
  for (const k of Object.keys(value).sort()) {
    const v = value[k];
    if (v === undefined || typeof v === 'function') continue;
    if (k === 'tag' && key === 'hyphenation' && named) continue;
    if (k === 'pages' && v === 'all' && typeof value.kind === 'string') continue;
    if (k === 'slot' && key === 'advancedDesign' && value.enabled === false) continue;
    if (k === 'name' && builtIn) continue;
    parts.push(`${JSON.stringify(k)}:${reading(v, named, k)}`);
  }
  return `{${parts.join(',')}}`;
}

/** What the layout and the backends read of `config`: the resolved
 *  configuration, with the sections it carries only when they are set (or
 *  not at all) resolved either way, so a section left at its defaults and
 *  one left out compare equal. */
function read(config: PostextConfig): string {
  const resolved = resolveAllConfig(config);
  const documentLocale = config.locale ?? config.bodyText?.hyphenation?.locale;
  return reading({
    ...resolved,
    pdfGeneration: resolvePdfGenerationConfig(config.pdfGeneration),
    print: resolvePrintConfig(config.print),
    contrast: resolveContrastConfig(config.contrast),
    checks: resolveChecksConfig(config.checks),
    folio: resolveFolioConfig(config.folio, resolved.page.sizePreset),
    dieCuts: resolveDieCutsConfig(config.dieCuts),
    lineNumbers: resolveLineNumbersConfig(config.lineNumbers, resolved.bodyText),
    codeStyle: resolveCodeStyleConfig(config.codeStyle, resolved.bodyText),
    comics: resolveComicsConfig(config.comics, documentLocale),
    debug: resolveDebugConfig(config.debug),
    htmlViewer: resolveHtmlViewerConfig(config.htmlViewer),
    // Read as written: the strip leaves them alone.
    resourceTypes: config.resourceTypes,
    customFonts: config.customFonts,
  }, !!config.locale);
}

/** Whether `config` reads the same once stripped; `null` for a
 *  configuration the resolver rejects (a value of the wrong type). */
export function survives(config: PostextConfig): boolean | null {
  let before: string;
  try {
    before = read(config);
  } catch {
    return null;
  }
  return read(stripConfigDefaults(config)) === before;
}

/** Every node of `value` a configuration may set: scalars, dimensions and
 *  colours whole, lists whole and item by item, sections whole and field
 *  by field. Items of a list that carry an `id` or a `level` are named by
 *  it, since a configuration lists only the ones it changes. */
export function nodes(value: unknown, path: Path = [], out: { path: Path; value: unknown }[] = []): { path: Path; value: unknown }[] {
  if (value === undefined || value === null || typeof value === 'function') return out;
  if (path.length > 0) out.push({ path, value });
  if (isDimension(value) || isColor(value)) return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (!isFields(item)) return;
      const key = 'id' in item ? 'id' : 'level' in item ? 'level' : null;
      if (key) nodes(item, [...path, { key, value: item[key], index }], out);
    });
    return out;
  }
  if (isFields(value)) for (const [k, v] of Object.entries(value)) nodes(v, [...path, k], out);
  return out;
}

export function at(root: unknown, path: Path): unknown {
  let node = root;
  for (const step of path) {
    if (typeof step === 'string') {
      if (!isFields(node)) return undefined;
      node = node[step];
    } else {
      if (!Array.isArray(node)) return undefined;
      node = node.find((item) => isFields(item) && item[step.key] === step.value);
    }
  }
  return node;
}

/** `config` with `value` at `path`, the sections and list items on the way
 *  created as a configuration would write them. */
export function withAt(config: PostextConfig, path: Path, value: unknown): PostextConfig {
  const root = clone(config) as Fields;
  let node: unknown = root;
  path.forEach((step, i) => {
    const last = i === path.length - 1;
    if (typeof step === 'string') {
      const holder = node as Fields;
      if (last) {
        holder[step] = clone(value);
        return;
      }
      const next = path[i + 1]!;
      if (typeof next === 'string' ? !isFields(holder[step]) : !Array.isArray(holder[step])) holder[step] = typeof next === 'string' ? {} : [];
      node = holder[step];
      return;
    }
    const list = node as unknown[];
    let item = list.find((entry) => isFields(entry) && entry[step.key] === step.value);
    if (last) {
      const index = item ? list.indexOf(item) : list.length;
      list[index] = clone(value);
      return;
    }
    if (!item) {
      item = { [step.key]: step.value };
      list.push(item);
    }
    node = item;
  });
  return root as PostextConfig;
}

export const pt = (value: number) => ({ value, unit: 'pt' as const });
export const hex = (value: string) => ({ hex: value, model: 'hex' as const });
export const text = (id: string, content: string, extra: Fields = {}): DesignElement => ({
  kind: 'text', id, content, fontSize: pt(9),
  placement: { anchor: { to: 'container', edge: 'top-left' } },
  ...extra,
} as DesignElement);

/** A document that moves something in every section and sets what a
 *  plain one leaves unset: styles with slots, margins, a layout and body
 *  type of their own, levels beside headings-wide values, named tables,
 *  boxes, chips and paragraphs. */
const RICH: PostextConfig = {
  locale: 'en',
  page: {
    sizePreset: 'custom', width: { value: 19, unit: 'cm' }, height: { value: 26, unit: 'cm' },
    margins: { top: pt(60), bottom: pt(70), left: pt(50), right: pt(55), mirror: true },
    backgroundColor: hex('#fdfaf3'),
    pageNumbering: { format: 'lower-roman', startAt: 3 },
    baselineGrid: { enabled: true },
  },
  layout: {
    layoutType: 'double', gutterWidth: pt(22), sideColumnPercent: 40,
    columnRule: { enabled: true, color: hex('#aa3344'), lineWidth: pt(2) },
    floatsUnderOpener: true,
  },
  bodyText: {
    fontFamily: 'Literata', fontSize: pt(10.5), lineHeight: pt(15), color: hex('#221144'), textAlign: 'left',
    fontWeight: 500, boldFontWeight: 800, firstLineIndent: pt(14), paragraphSpacing: pt(4),
    hyphenation: { enabled: false, exceptions: ['Alice', 'You-Tube'], capitalized: false },
    hyphenateAcrossColumns: 'withinPage',
    blockquote: { fontStyle: 'normal', marginLeft: pt(30) },
    verse: { indent: pt(20) },
  },
  headings: {
    fontFamily: 'Archivo', lineHeight: pt(21), color: hex('#553311'), textAlign: 'center', fontWeight: 800,
    marginTop: pt(31), marginBottom: pt(9), keepWithNext: false, snapToGrid: false, inlineMarks: false,
    balancing: { enabled: false, maxLinesPerHeading: 2, trailing: false },
    levels: [
      {
        level: 1, fontSize: pt(30), fontWeight: 900, italic: true, numberingTemplate: 'Chapter {1}', span: 'page',
        breakBefore: { enabled: true, parity: 'odd' }, textTransform: 'uppercase', letterSpacing: pt(1),
        advancedDesign: { enabled: true, slot: { elements: [text('title', '{titleText}')] } },
      },
      { level: 2, fontSize: pt(18), color: hex('#117755'), numberingTemplate: '{1}.{2}', hidden: true },
      { level: 3, fontFamily: 'Lora', marginTop: pt(12), snapToGrid: true },
    ],
  },
  headingStyles: [
    {
      id: 'cover', name: 'Cover', numbered: false, toc: false, runningChapter: false,
      header: { elements: [text('coverHead', 'Cover')] }, footer: { elements: [text('coverFoot', '{pageNumber}')] },
      margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10), mirror: false },
      layout: { layoutType: 'single', gutterWidth: pt(30), columnRule: { enabled: false } },
      bodyStyle: { fontFamily: 'Archivo', fontSize: pt(12), lineHeight: pt(16), color: hex('#101010'), textAlign: 'center' },
      palette: { band: '#f6c297' },
      breakBefore: { enabled: true, parity: 'even' },
      fontSize: pt(40), fontWeight: 300, italic: true, hidden: true, span: 'page',
      numberingTemplate: '{1}',
      advancedDesign: { enabled: true, slot: { elements: [text('coverTitle', '{titleText}')] } },
    },
    { id: 'plain' },
  ],
  parts: {
    page: false, breakBefore: { parity: 'even' }, breakAfter: { enabled: false, parity: 'even' },
    margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20), mirror: false },
    design: { elements: [text('partTitle', '{partTitle}')] }, versoDesign: { elements: [text('partVerso', '{partNumber}')] },
    bodyStyle: { fontFamily: 'Archivo', fontSize: pt(13), color: hex('#202020') },
  },
  header: { elements: [text('runningHead', '{chapterTitle}', { parity: 'odd' })] },
  footer: { elements: [text('folio', '{pageNumber}', { fontWeight: 700 })] },
  tableStyle: { fontFamily: 'Archivo', fontSize: pt(8), headerBold: false, cellPadding: pt(5), borderColor: hex('#444444') },
  tableStyles: [{ id: 'grid', name: 'Grid', fontSize: pt(7), headerBold: true }, { id: 'bare', name: 'Bare' }],
  captionStyle: { fontFamily: 'Archivo', fontSize: pt(8), color: hex('#333355'), labelBold: false, labelSeparator: ' — ' },
  paragraphStyles: [
    { id: 'lead', name: 'Lead', fontSize: pt(13), lineHeight: pt(18), fontWeight: 600, italic: true, firstLineIndent: pt(0), textAlign: 'center' },
    { id: 'note', name: 'Note' },
  ],
  calloutStyles: [
    {
      id: 'box', name: 'Box', title: 'Note', backgroundEnabled: false, borderRadius: pt(4), keepTogether: false,
      marginTop: pt(10), snapToGrid: false, placement: 'top', span: 'page',
      body: { fontFamily: 'Archivo', fontSize: pt(9), color: hex('#404040') },
    },
    { id: 'aside', name: 'Aside' },
  ],
  chipStyles: [{ id: 'key', name: 'Key', fontWeight: 700, background: hex('#eeeeaa') }, { id: 'tag', name: 'Tag' }],
  markStyles: [{ id: 'key', name: 'Key idea', background: hex('#ccf0d0'), paddingTop: pt(1) }, { id: 'mark' }],
  unorderedLists: { color: hex('#aa0000'), indent: pt(20), itemSpacing: pt(3) },
  orderedLists: { color: hex('#0000aa'), indent: pt(22), fontWeight: 700 },
  toc: { title: 'Contents', leader: '·', levels: [{ level: 1, fontWeight: 700 }, { level: 2, italic: true }] },
  index: { columns: 3, separator: ' · ', see: { italic: false } },
  footnotes: { numbering: 'chapter', fontSize: pt(7.5), rule: { enabled: false }, wordBreak: 'normal' },
  crossRefs: { color: hex('#0044aa') },
  citations: { style: 'apa', hyphenateNames: false },
  math: { enabled: true, fontSize: pt(11) },
  lineNumbers: { enabled: true, every: 5 },
  codeStyle: { fontFamily: 'JetBrains Mono', fontSize: pt(8) },
  diagramStyle: { singleInk: true },
  videoStyle: { qr: { enabled: false } },
  cjk: { compression: 'none' },
  pdfGeneration: { colorSpace: 'cmyk', forms: { currency: '$', separatorStyle: 0 } },
  print: { black: { text: 'k' } },
  contrast: { level: 'AAA' },
  checks: { contentInConfig: { allow: ['Editorial Cometa'], maxWords: 3 } },
  folio: { cover: { stiffness: 0.9 } },
  dieCuts: { shapes: [{ id: 'porthole', shape: 'circle', x: pt(60), y: pt(80), width: pt(70), height: pt(70), leaves: 3 }], pages: [{ pages: '5', die: 'porthole' }], corners: { radius: pt(12) } },
  debug: { pageOutline: { enabled: true } },
  htmlViewer: { fitFiguresToPage: false },
} as unknown as PostextConfig;

const GRID = { enabled: true, charsPerLine: 26, linesPerPage: 24 };
export const CONTEXTS: Record<string, PostextConfig> = {
  plain: {},
  rich: RICH,
  grid: { locale: 'zh-Hans', cjk: { grid: GRID }, footnotes: { wordBreak: 'keep-all' } },
  japaneseVertical: { locale: 'ja', layout: { writingMode: 'vertical-rl' } },
  arabic: { locale: 'ar' },
  richArabic: { ...RICH, locale: 'ar-MA', direction: 'rtl' },
  richJapanese: { ...RICH, locale: 'ja', layout: { ...RICH.layout, writingMode: 'vertical-rl' }, comics: {} },
  newspaper: { page: { sizePreset: 'broadsheet' }, layout: { layoutType: 'double' } },
};

const PLAIN = JSON.parse(JSON.stringify(resolveAllConfig({}))) as Fields;
export const resolvedOf = (config: PostextConfig) => JSON.parse(JSON.stringify(resolveAllConfig(clone(config)))) as Fields;

/** Values seen under each field name in any context: another document's
 *  value for a field whose own type says nothing (an alignment, a format). */
const POOL = new Map<string, Map<string, unknown>>();
for (const config of Object.values(CONTEXTS)) {
  for (const source of [resolvedOf(config), config]) {
    for (const { path, value } of nodes(source)) {
      const last = path[path.length - 1];
      if (typeof last !== 'string' || (typeof value !== 'string' && typeof value !== 'number')) continue;
      if (!POOL.has(last)) POOL.set(last, new Map());
      POOL.get(last)!.set(JSON.stringify(value), value);
    }
  }
}

/** The values to try at a node: the empty one of its type, the plain
 *  document's, the other way for a flag, and a few another document has. */
export function candidates(path: Path, value: unknown): unknown[] {
  const plain = at(PLAIN, path);
  const out: unknown[] = plain !== undefined ? [plain] : [];
  const last = path[path.length - 1];
  const pooled = typeof last === 'string' ? [...(POOL.get(last)?.values() ?? [])].slice(0, 4) : [];
  if (typeof value === 'boolean') out.push(true, false);
  else if (typeof value === 'number') out.push(0, value + 1, ...pooled.filter((v) => typeof v === 'number'));
  else if (typeof value === 'string') out.push('', ...pooled.filter((v) => typeof v === 'string'));
  else if (isDimension(value)) out.push({ value: 0, unit: value.unit }, { value: value.value + 3, unit: value.unit });
  else if (isColor(value)) out.push(hex('#000000'), hex('#13579b'));
  else if (Array.isArray(value)) out.push([]);
  else if (isFields(value)) {
    // An item of a keyed list emptied keeps the key that names it.
    out.push(typeof last === 'string' ? {} : { [last!.key]: last!.value }, ...('elements' in value ? [{ elements: [] }] : []));
    // The one section a configuration may switch off with `false`.
    if (last === 'dropCap') out.push(false);
  }
  const seen = new Set<string>();
  return out.filter((v) => {
    const key = JSON.stringify(v);
    if (key === JSON.stringify(value) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A value of another document for the node: what moving it looks like. */
export function moved(path: Path, value: unknown): unknown {
  if (typeof value === 'boolean') return !value;
  return candidates(path, value).find((v) => {
    if (typeof value === 'number') return typeof v === 'number' && v !== 0;
    if (typeof value === 'string') return typeof v === 'string' && v !== '';
    if (isDimension(value)) return isDimension(v) && v.value !== 0;
    if (isColor(value)) return isColor(v);
    return false;
  });
}

/** A style inherits the fields of what it styles: the fields of a heading
 *  level are tried on every heading style, the house table's on every
 *  named one, the body's on every paragraph style. */
const BORROWED: { from: Path; into: string }[] = [
  { from: ['headings', { key: 'level', value: 1, index: 0 }], into: 'headingStyles' },
  { from: ['tableStyle'], into: 'tableStyles' },
  { from: ['bodyText'], into: 'paragraphStyles' },
];

export function targets(config: PostextConfig): { path: Path; value: unknown }[] {
  const resolved = resolvedOf(config);
  const out = [...nodes(resolved), ...nodes(config)];
  for (const { from, into } of BORROWED) {
    const items = (config as Fields)[into];
    if (!Array.isArray(items)) continue;
    for (const item of items as Fields[]) {
      const head: Step = { key: 'id', value: item.id, index: 0 };
      for (const node of nodes(at(resolved, from))) {
        if (node.path[0] === 'level') continue;
        out.push({ path: [into, head, ...node.path], value: node.value });
      }
    }
  }
  const seen = new Set<string>();
  return out.filter(({ path }) => {
    const key = show(path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The sweep below, cut in parts. One file ran it all on one worker for
 *  four minutes, the longest of the package's suite by far (#1118); each
 *  part is a file of its own, so the workers share it. A unit is one
 *  section of one document, or one document's followers; units go to
 *  the part with the least work so far, heaviest first, weighed by the
 *  configurations they try. Every part computes the same split. */
type Unit = { name: string; weight: number; run: () => void };

/** A follower sweep tries about this many configurations per leaf. */
const FOLLOWER_WEIGHT = 0.07;

function units(): Unit[] {
  const out: Unit[] = [];
  for (const [name, context] of Object.entries(CONTEXTS)) {
    const bySection = new Map<string, { path: Path; value: unknown }[]>();
    for (const target of targets(context)) {
      const section = String(target.path[0]);
      if (!bySection.has(section)) bySection.set(section, []);
      bySection.get(section)!.push(target);
    }
    for (const [section, list] of bySection) {
      let cases = 0;
      for (const { path, value } of list) cases += candidates(path, value).length;
      out.push({
        name: `one field set at a time, ${name}: ${section}`,
        weight: cases * cost(context),
        run: () => {
          const lost: string[] = [];
          for (const { path, value } of list) {
            for (const candidate of candidates(path, value)) {
              if (survives(withAt(context, path, candidate)) === false) lost.push(`${show(path)} = ${JSON.stringify(candidate)}`);
            }
          }
          expect(lost).toEqual([]);
        },
      });
    }
  }
  // A field that follows another one (a level its headings, a style the
  // document, a caption the body): once the other has moved, the field set
  // back to what it was is no longer a default.
  for (const name of ['plain', 'rich', 'grid', 'japaneseVertical']) {
    const context = CONTEXTS[name]!;
    const before = resolvedOf(context);
    const leaves = nodes(before).filter(({ value }) => !Array.isArray(value) && (!isFields(value) || isDimension(value) || isColor(value)));
    out.push({
      name: `a field set back after the one it follows has moved, ${name}`,
      weight: leaves.length * leaves.length * FOLLOWER_WEIGHT * cost(context) / 100,
      run: () => {
        const lost: string[] = [];
        let tried = 0;
        for (const { path, value } of leaves) {
          const other = moved(path, value);
          if (other === undefined) continue;
          const shifted = withAt(context, path, other);
          let after: Fields;
          try {
            after = resolvedOf(shifted);
          } catch {
            continue;
          }
          for (const follower of leaves) {
            if (follower.path === path) continue;
            const now = at(after, follower.path);
            if (now === undefined || JSON.stringify(now) === JSON.stringify(follower.value)) continue;
            const kept = survives(withAt(shifted, follower.path, follower.value));
            if (kept === null) continue;
            tried++;
            if (!kept) lost.push(`${show(follower.path)} = ${JSON.stringify(follower.value)} under ${show(path)} = ${JSON.stringify(other)}`);
          }
        }
        expect(tried).toBeGreaterThan(100);
        expect(lost).toEqual([]);
      },
    });
  }
  return out;
}

/** What one configuration of `context` costs to resolve and strip, about:
 *  a document that sets more lists more for each reader to walk. */
function cost(context: PostextConfig): number {
  return 1 + JSON.stringify(context).length / 2000;
}

/** Registers part `part` (from 1) of `of`. */
export function registerSweep(part: number, of: number): void {
  const load = new Array<number>(of).fill(0);
  const mine: Unit[] = [];
  const all = units().sort((a, b) => b.weight - a.weight || (a.name < b.name ? -1 : 1));
  for (const unit of all) {
    let target = 0;
    for (let i = 1; i < of; i++) if (load[i]! < load[target]!) target = i;
    load[target]! += unit.weight;
    if (target === part - 1) mine.push(unit);
  }
  describe(`every value survives the strip (#694), part ${part} of ${of}`, () => {
    for (const unit of mine) it(unit.name, unit.run);
  });
}

/** The sections and fields each document has, for the parts to share. */
export function sweepSizes(): { name: string; sections: number; cases: number }[] {
  return Object.entries(CONTEXTS).map(([name, context]) => {
    const sections = new Set<string>();
    let cases = 0;
    for (const { path, value } of targets(context)) {
      sections.add(String(path[0]));
      cases += candidates(path, value).length;
    }
    return { name, sections: sections.size, cases };
  });
}
