// Running heads and folios on master spreads (#1585).
//
// A book whose running text is threaded (`thread.ts`) draws its running
// heads and folios on master spreads, as an InDesign book does, rather
// than on every page: `{pageNumber}` is InDesign's current page number
// (`<?ACE 18?>`), `{chapterTitle}` a running-header variable that shows
// the last level-1 heading on the page (or the one before it), and words
// are written as they stand. An importer reads them back as the book's
// header and footer (`import/fidelity/masters.ts`).
//
// Each page names the design elements it shows (its signature). Pages
// that show the same elements apply the same master; in a facing book a
// master has a left and a right page, and the signatures seen on the two
// sides are paired by an element they share (a folio set on both sides),
// else by the spreads they stand in together. An element whose content
// InDesign cannot say (`{attr.x}`, a placeholder with no InDesign
// equivalent, formatting) stays drawn on its page.

import type { DisplayItem, DisplayPage, DisplayRect } from 'postext';
import type { VDTDocument } from 'postext/writer';
import type { VDTPage } from 'postext';
import { escapeXml } from '../xml/write.js';
import { imageXml } from './images.js';
import { attr, DOM_VERSION, num, PKG_NS, XML_HEAD, type DocumentGeometry } from './parts.js';
import { pathXml, rectXml, ruleXml } from './shapes.js';
import { textFrameXml } from './spreads.js';
import type { TextItem, Writer } from './writer.js';

/** The characters a master's text stands in for until its story is
 *  written: the page number and the running-header variable. */
const PAGE_NUMBER = '';
const RUNNING_HEAD = '';

/** The running-header variable's name. */
export const RUNNING_HEAD_VARIABLE = 'Chapter Title';

/** One element a page draws on its master: its key (where the element
 *  stands in the configuration), its display items, and the text its
 *  master writes in place of what the page shows. */
export interface MasterElement {
  key: string;
  items: DisplayItem[];
  /** The pages the element is set for (`DesignElement.pages`). */
  pages?: string;
}

/** A page's furniture: the elements its master draws and the items it
 *  keeps (an element its master cannot say). */
export interface PageFurniture {
  elements: MasterElement[];
  kept: DisplayItem[];
  /** What its `{chapterTitle}` heads show. */
  titles: string[];
}

/** The writer's state for one page, to write its elements again on a
 *  master page. */
export interface PageState {
  k: number;
  ox: number;
  oy: number;
  pageH: number;
  width: number;
  doc: VDTDocument;
  page: VDTPage;
  index: number;
  margins?: { top: number; bottom: number; inside: number; outside: number };
  columns?: { count: number; gutter: number; positions?: number[] };
}

/** A page as the masters see it. */
export interface MasterPage {
  /** Its index among the laid pages. */
  at: number;
  left: boolean;
  furniture: PageFurniture;
  state: PageState;
}

/** A document whose pages show no header or footer: the display lists of
 *  its pages without their furniture (`pageDisplayList` paints the header
 *  and the footer last, so a page's furniture is what its whole list
 *  holds past the bare one). */
export function bareDocument(doc: VDTDocument): VDTDocument {
  return { ...doc, pages: doc.pages.map((p) => (p.header || p.footer ? { ...p, header: undefined, footer: undefined } : p)) } as VDTDocument;
}

/** The element of the configuration at a JSON pointer, else by id among
 *  the header's and footer's elements. */
function elementAt(doc: VDTDocument, path: string | undefined, id: string | undefined): Record<string, unknown> | undefined {
  if (path) {
    let at: unknown = doc.config;
    for (const seg of path.split('/').filter(Boolean)) {
      if (at === null || typeof at !== 'object') {
        at = undefined;
        break;
      }
      at = (at as Record<string, unknown>)[seg.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    if (at && typeof at === 'object' && (!id || (at as { id?: unknown }).id === id)) return at as Record<string, unknown>;
  }
  if (!id) return undefined;
  const c = doc.config as unknown as { header?: { elements?: { id?: string }[] }; footer?: { elements?: { id?: string }[] } };
  return [...(c.header?.elements ?? []), ...(c.footer?.elements ?? [])].find((e) => e.id === id) as Record<string, unknown> | undefined;
}

/** A text element's content as a master writes it, or undefined when
 *  InDesign cannot say it: placeholders other than the page number and
 *  the chapter title, formatting, more than one line. */
export function masterText(content: string): string | undefined {
  const text = content.replace(/\{pageNumber\}/g, PAGE_NUMBER).replace(/\{chapterTitle\}/g, RUNNING_HEAD);
  if (/[{}*_\\[\]`\n]/.test(text) || !text.trim()) return undefined;
  return text;
}

const inside = (r: DisplayRect, x: number, y: number): boolean => x >= r.x - 0.5 && x <= r.x + r.width + 0.5 && y >= r.y - 0.5 && y <= r.y + r.height + 0.5;

function centre(it: DisplayItem): { x: number; y: number } {
  const r = it.kind === 'text' || it.kind === 'path' ? it.bbox : it.kind === 'rule' ? { x: Math.min(it.x1, it.x2), y: Math.min(it.y1, it.y2), width: Math.abs(it.x2 - it.x1), height: Math.abs(it.y2 - it.y1) } : it.rect;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** The furniture of a page: `items` are what its display list holds past
 *  the bare page's, its header's and footer's items in their order. */
export function pageFurniture(doc: VDTDocument, page: VDTPage, items: readonly DisplayItem[]): PageFurniture {
  const blocks = [...(page.header?.blocks ?? []), ...(page.footer?.blocks ?? [])];
  const byBlock = new Map<number, DisplayItem[]>();
  const kept: DisplayItem[] = [];
  for (const it of items) {
    const c = centre(it);
    const at = blocks.findIndex((b) => inside(b.bbox, c.x, c.y));
    if (at < 0) kept.push(it);
    else byBlock.set(at, [...(byBlock.get(at) ?? []), it]);
  }
  const elements: MasterElement[] = [];
  const titles: string[] = [];
  blocks.forEach((b, n) => {
    const own = byBlock.get(n);
    if (!own) return;
    const key = b.configPath ?? b.elementId;
    if (!key) {
      kept.push(...own);
      return;
    }
    const el = elementAt(doc, b.configPath, b.elementId);
    const pages = typeof el?.pages === 'string' ? { pages: el.pages } : {};
    if (b.kind !== 'text') {
      elements.push({ key, items: own, ...pages });
      return;
    }
    const text = typeof el?.content === 'string' ? masterText(el.content) : undefined;
    const texts = own.filter((t): t is TextItem => t.kind === 'text');
    if (!text || texts.length !== 1) {
      kept.push(...own);
      return;
    }
    if (text === RUNNING_HEAD) titles.push(texts[0]!.lines.map((l) => l.text).join(' '));
    elements.push({ key, items: own.map((t) => (t.kind === 'text' ? asMasterText(t, text, el?.align) : t)), ...pages });
  });
  return { elements, kept, titles };
}

/** A title's words as the running heads and the headings both have them:
 *  letters and figures only, lower-cased (a head cut short ends in "…"). */
export const titleKey = (text: string): string => text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}…]+/gu, '');

/** A text item whose words are a chapter title the running heads show
 *  (whole, or the start of it where a head was cut short). */
export function isChapterTitle(w: Writer, item: TextItem): boolean {
  if (!w.chapterTitles?.size) return false;
  const own = titleKey(item.lines.map((l) => (l.addedHyphen ? l.text.replace(/-$/, '') : l.text)).join(''));
  if (!own) return false;
  for (const t of w.chapterTitles) {
    if (t === own) return true;
    if (t.endsWith('…') && t.length > 4 && own.startsWith(t.slice(0, -1))) return true;
  }
  return false;
}

/** A text item of a running head set as its master writes it: one line,
 *  the element's content in the look of its first run. */
function asMasterText(t: TextItem, text: string, align: unknown): TextItem {
  const line = t.lines[0]!;
  const run = line.runs[0]!;
  const width = line.runs.reduce((a, r) => a + r.width, 0);
  // (A design line is placed by its offset: the element says its alignment.)
  const own = align === 'center' || align === 'right' || align === 'left' ? align : line.align;
  return { ...t, lines: [{ ...line, ...(own ? { align: own } : {}), text, map: new Array<number>(text.length).fill(-1), runs: [{ ...run, text, width, textStart: 0 }] }] };
}

/** The signature of a page: the keys of the elements its master draws. */
const signature = (f: PageFurniture): string => [...new Set(f.elements.map((e) => e.key))].sort().join('\u0000');

/** A master: its id, its name's prefix, and the page that stands for
 *  each of its sides. */
interface Master {
  self: string;
  prefix: string;
  left?: MasterPage;
  right?: MasterPage;
  /** The signatures of its sides. */
  sigs: { left?: string; right?: string };
}

/** The masters of the book: each page's master by its index among the
 *  laid pages, and the master spreads' XML. */
export function planMasters(w: Writer, pages: readonly MasterPage[], facing: boolean, geometry: DocumentGeometry): { byPage: Map<number, string>; spreads: { id: string; xml: string }[] } {
  const byPage = new Map<number, string>();
  const masters: Master[] = [];
  const shown = pages.filter((p) => p.furniture.elements.length);
  if (!shown.length) return { byPage, spreads: [] };
  const sigOf = new Map(shown.map((p) => [p, signature(p.furniture)] as const));
  const count = new Map<string, number>();
  for (const s of sigOf.values()) count.set(s, (count.get(s) ?? 0) + 1);
  const keys = (s: string): string[] => s.split('\u0000');
  const share = (a: string, b: string): boolean => keys(a).some((k) => keys(b).includes(k));
  const prefix = (n: number): string => String.fromCharCode(65 + (n % 26)) + (n >= 26 ? String(Math.floor(n / 26)) : '');
  const add = (): Master => {
    const m: Master = { self: w.next(), prefix: prefix(masters.length), sigs: {} };
    masters.push(m);
    return m;
  };
  if (!facing) {
    const of = new Map<string, Master>();
    for (const p of shown) {
      const s = sigOf.get(p)!;
      let m = of.get(s);
      if (!m) {
        m = add();
        m.right = p;
        m.sigs.right = s;
        of.set(s, m);
      }
      byPage.set(p.at, m.self);
    }
  } else {
    // The signatures seen on each side, most used first.
    const order = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)!);
    const first = (s: string, left: boolean): MasterPage | undefined => shown.find((p) => p.left === left && sigOf.get(p) === s);
    for (const s of order) {
      for (const left of [true, false]) {
        const page = first(s, left);
        if (!page) continue;
        const side = left ? 'left' : 'right';
        const other = left ? 'right' : 'left';
        const m = masters.find((x) => x.sigs[side] === undefined && x.sigs[other] !== undefined && share(x.sigs[other]!, s)) ?? add();
        m.sigs[side] = s;
        m[side] = page;
      }
    }
    // A master with one side, paired with one with the other side that
    // stands beside it in the book's spreads most often, when their
    // elements are set for the same pages (a body page's heads are not
    // an opener's folio).
    const roles = (p: MasterPage | undefined): string => [...new Set(p?.furniture.elements.map((e) => e.pages ?? 'all') ?? [])].sort().join(' ');
    const together = new Map<string, number>();
    for (let n = 0; n + 1 < pages.length; n++) {
      const a = pages[n]!;
      const b = pages[n + 1]!;
      if (!a.left || b.left) continue;
      const la = sigOf.get(a);
      const rb = sigOf.get(b);
      if (la && rb) together.set(`${la}\u0001${rb}`, (together.get(`${la}\u0001${rb}`) ?? 0) + 1);
    }
    for (const m of [...masters]) {
      if (!masters.includes(m) || m.sigs.right !== undefined || m.sigs.left === undefined) continue;
      let best: Master | undefined;
      let most = 0;
      for (const o of masters) {
        if (o.sigs.left !== undefined || o.sigs.right === undefined || roles(o.right) !== roles(m.left)) continue;
        const n = together.get(`${m.sigs.left}\u0001${o.sigs.right}`) ?? 0;
        if (n > most) {
          most = n;
          best = o;
        }
      }
      if (!best) continue;
      m.right = best.right;
      m.sigs.right = best.sigs.right;
      masters.splice(masters.indexOf(best), 1);
    }
    masters.forEach((m, n) => (m.prefix = prefix(n)));
    for (const p of shown) {
      const s = sigOf.get(p)!;
      const m = masters.find((x) => (p.left ? x.sigs.left : x.sigs.right) === s);
      if (m) byPage.set(p.at, m.self);
    }
  }
  const spreads = masters.map((m) => ({ id: m.self, xml: masterXml(w, m, facing, geometry) }));
  return { byPage, spreads };
}

/** The items a master page draws, in its spread's frame. */
function masterItemsXml(w: Writer, p: MasterPage, left: boolean): string {
  const s = p.state;
  const saved = { k: w.k, ox: w.ox, oy: w.oy, pageH: w.pageH, px: w.px, doc: w.doc, page: w.page, threaded: w.threaded, callouts: w.callouts, opts: w.opts };
  // A master's text is set by InDesign on every page it shows on: its
  // line is not kept, its paragraph takes the element's alignment.
  Object.assign(w, { k: s.k, ox: s.ox, oy: s.oy, pageH: s.pageH, px: left ? -s.width : 0, doc: s.doc, page: s.page, threaded: false, callouts: undefined, opts: { ...w.opts, lineBreaks: 'reflow' } });
  const out: string[] = [];
  const from = w.stories.length;
  for (const e of p.furniture.elements) {
    for (const it of e.items) {
      if (it.kind === 'text') out.push(textFrameXml(w, [it], undefined));
      else if (it.kind === 'rect') out.push(rectXml(w, it));
      else if (it.kind === 'rule') out.push(ruleXml(w, it));
      else if (it.kind === 'path') out.push(pathXml(w, it));
      else if (it.kind === 'image') out.push(imageXml(w, it, s.index));
    }
  }
  for (const story of w.stories.slice(from)) story.xml = masterStoryXml(w, story.xml);
  Object.assign(w, saved);
  return out.join('');
}

function masterXml(w: Writer, m: Master, facing: boolean, g: DocumentGeometry): string {
  const sides: { left: boolean; page?: MasterPage }[] = facing ? [{ left: true, page: m.left }, { left: false, page: m.right }] : [{ left: false, page: m.right }];
  const pageXml = (side: { left: boolean; page?: MasterPage }, i: number): string => {
    const s = side.page?.state;
    const width = s?.width ?? g.width;
    const height = s ? s.pageH : g.height;
    const mg = s?.margins ?? { top: 0, bottom: 0, inside: 0, outside: 0 };
    const text = Math.max(0, width - mg.inside - mg.outside);
    const count = s?.columns?.count ?? 1;
    const gutter = s?.columns?.gutter ?? 12;
    const each = Math.max(0, (text - gutter * (count - 1)) / count);
    const positions = s?.columns?.positions?.map((x) => num(x)).join(' ') ?? Array.from({ length: count }, (_, c) => `${num(c * (each + gutter))} ${num(c * (each + gutter) + each)}`).join(' ');
    return (
      `<Page${attr('Self', `${m.self}p${i}`)}${attr('Name', m.prefix)} AppliedMaster="n"${attr('GeometricBounds', `0 0 ${num(height)} ${num(width)}`)}${attr('ItemTransform', `1 0 0 1 ${num(side.left ? -width : 0)} ${num(-height / 2)}`)} MasterPageTransform="1 0 0 1 0 0">` +
      `<MarginPreference${attr('ColumnCount', count)}${attr('ColumnGutter', gutter)}${attr('Top', mg.top)}${attr('Bottom', mg.bottom)}${attr('Left', mg.inside)}${attr('Right', mg.outside)} ColumnDirection="Horizontal"${attr('ColumnsPositions', positions)}/>` +
      '</Page>'
    );
  };
  const items = sides.map((side) => (side.page ? masterItemsXml(w, side.page, side.left) : '')).join('');
  // A master whose elements are all set for chapter openers is named so
  // (an importer tells the opener pages by it), one of body pages too.
  const roles = new Set(sides.flatMap((side) => side.page?.furniture.elements.map((e) => e.pages ?? 'all') ?? []));
  const base = roles.size === 1 && roles.has('opener') ? 'Opener' : roles.size === 1 && roles.has('body') ? 'Body' : 'Master';
  return (
    `${XML_HEAD}<idPkg:MasterSpread xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
    `<MasterSpread${attr('Self', m.self)} ItemTransform="1 0 0 1 0 0"${attr('Name', `${m.prefix}-${base}`)}${attr('NamePrefix', m.prefix)}${attr('BaseName', base)} ShowMasterItems="true"${attr('PageCount', sides.length)} OverriddenPageItemProps="" PrimaryTextFrame="n">` +
    sides.map(pageXml).join('') +
    items +
    '</MasterSpread></idPkg:MasterSpread>'
  );
}

/** A master story's text with the page number and the running head in
 *  place of the characters that stood for them. */
export function masterStoryXml(w: Writer, xml: string): string {
  if (!xml.includes(PAGE_NUMBER) && !xml.includes(RUNNING_HEAD)) return xml;
  const variable = (): string => `</Content><TextVariableInstance${attr('Self', w.next())}${attr('Name', RUNNING_HEAD_VARIABLE)} ResultText="${escapeXml(RUNNING_HEAD_VARIABLE)}"${attr('AssociatedTextVariable', `dTextVariablen${RUNNING_HEAD_VARIABLE}`)}/><Content>`;
  return xml.split(PAGE_NUMBER).join('<?ACE 18?>').split(RUNNING_HEAD).map((part, i) => (i ? variable() + part : part)).join('').replace(/<Content><\/Content>/g, '');
}

/** The running-header variable, matching the style chapter titles are
 *  set in: the last title on the page, else the one before it. */
export function runningHeadVariableXml(w: Writer): string {
  // The style most chapter titles are set in (`story.ts`).
  const counted = [...(w.titleStyles ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0];
  const applied = counted ?? 'ParagraphStyle/$ID/NormalParagraphStyle';
  return `<TextVariable${attr('Self', `dTextVariablen${RUNNING_HEAD_VARIABLE}`)}${attr('Name', RUNNING_HEAD_VARIABLE)} VariableType="MatchParagraphStyleType"><MatchParagraphStylePreference${attr('AppliedParagraphStyle', applied)} SearchStrategy="LastOnPage" ChangeCase="None" DeleteEndPunctuation="false" TextBefore="" TextAfter=""/></TextVariable>`;
}

/** The page's display list for the page items: the whole list's items
 *  up to its furniture (the same items the thread took), and the
 *  furniture its master cannot draw. */
export const withoutFurniture = (whole: DisplayPage, bare: DisplayPage, f: PageFurniture): DisplayPage => ({ ...whole, items: [...whole.items.slice(0, bare.items.length), ...f.kept] });
