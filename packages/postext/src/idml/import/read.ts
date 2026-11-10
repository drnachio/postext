/**
 * An IDML package read into what the import needs: the
 * paragraph and character styles resolved through their `BasedOn` chains,
 * the swatches, the pages of the spreads and of the master spreads with
 * the page items on them, and the stories as paragraphs of runs, their
 * footnotes, tables and anchored objects in place. Coordinates are points,
 * InDesign's spread coordinates.
 */

import { strFromU8, unzipSync } from 'fflate';
import { descendants, isEl, kid, kids, local, parseXml, textOf, type XmlEl, type XmlNode } from './xml.js';

/** Resolved attributes and properties of a style or a run, by name. */
export type Attrs = Record<string, string>;

export interface IdmlStyle {
  /** `ParagraphStyle/…`, `CharacterStyle/…`: what ranges apply. */
  self: string;
  /** The name InDesign shows (its group path left out). */
  name: string;
  /** Its own attributes and those of the styles it is based on. */
  attrs: Attrs;
}

export interface IdmlColor {
  self: string;
  name: string;
  /** `Process`, `Spot`, `Registration`, or `Tint`. */
  model: string;
  space: string;
  value: number[];
  /** A tint's base colour and percentage. */
  base?: string;
  tint?: number;
}

/** A run of text, a variable, a footnote, a table or an anchored object. */
export type Inline =
  | { t: 'text'; text: string; a: Attrs; cs: string }
  | { t: 'pageNumber'; a: Attrs; cs: string }
  | { t: 'section'; a: Attrs; cs: string }
  | { t: 'variable'; kind: string; name: string; text: string; a: Attrs; cs: string }
  | { t: 'note'; paras: IdmlPara[] }
  | { t: 'table'; el: XmlEl; cells: Map<XmlEl, IdmlPara[]> }
  | { t: 'object'; el: XmlEl };

export interface IdmlPara {
  /** The applied paragraph style's `Self`. */
  style: string;
  /** The paragraph style resolved with the range's own overrides. */
  a: Attrs;
  items: Inline[];
}

export interface IdmlStory {
  self: string;
  paras: IdmlPara[];
  vertical: boolean;
}

export type Box = [number, number, number, number];

export interface IdmlPage {
  self: string;
  name: string;
  /** The master spread the page applies, `n` for none. */
  master: string;
  /** The page in spread coordinates: left, top, right, bottom. */
  box: Box;
  margins: { top: number; bottom: number; left: number; right: number; columns: number; gutter: number };
  /** Index among the document's pages (or the master's). */
  index: number;
}

export interface PageItem {
  kind: 'TextFrame' | 'Rectangle' | 'Polygon' | 'Oval' | 'GraphicLine';
  self: string;
  el: XmlEl;
  box: Box;
  /** A line's end points. */
  line?: [number, number, number, number];
  /** Index of the page under the item's centre. */
  page: number;
  story?: string;
  prev?: string;
  next?: string;
  /** The URI of the picture it holds. */
  link?: string;
}

export interface IdmlMaster {
  self: string;
  name: string;
  pages: IdmlPage[];
  items: PageItem[];
}

export interface IdmlDocument {
  pageWidth: number;
  pageHeight: number;
  facing: boolean;
  binding: string;
  paragraphStyles: Map<string, IdmlStyle>;
  characterStyles: Map<string, IdmlStyle>;
  colors: Map<string, IdmlColor>;
  /** Text variables by `Self`: their name and kind (`VariableType`). */
  variables: Map<string, { name: string; kind: string }>;
  pages: IdmlPage[];
  items: PageItem[];
  masters: Map<string, IdmlMaster>;
  stories: Map<string, IdmlStory>;
  /** Index topics and page references the text carried (left out). */
  indexReferences: number;
}

export const ITEM_TAGS = new Set(['TextFrame', 'Rectangle', 'Polygon', 'Oval', 'GraphicLine', 'Group', 'Button', 'MultiStateObject', 'TextBox']);

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function matrix(s: string | undefined): Matrix {
  const v = (s ?? '').trim().split(/\s+/).map(Number);
  return v.length === 6 && v.every(Number.isFinite) ? (v as Matrix) : IDENTITY;
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function compose(o: Matrix, i: Matrix): Matrix {
  return [o[0] * i[0] + o[2] * i[1], o[1] * i[0] + o[3] * i[1], o[0] * i[2] + o[2] * i[3], o[1] * i[2] + o[3] * i[3], o[0] * i[4] + o[2] * i[5] + o[4], o[1] * i[4] + o[3] * i[5] + o[5]];
}

/** The anchors of an item's path, in the coordinates `m` maps to. */
function pathPoints(el: XmlEl, m: Matrix): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const geo = kid(kid(el, 'Properties'), 'PathGeometry');
  if (geo) {
    for (const pp of descendants(geo, 'PathPointType')) {
      const [x, y] = (pp.attrs.Anchor ?? '').split(/\s+/).map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) out.push(apply(m, x!, y!));
    }
  }
  return out;
}

function bbox(points: Array<[number, number]>): Box | undefined {
  if (points.length === 0) return undefined;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** The simple `<Properties>` children of an element, by name. */
function props(el: XmlEl): Attrs {
  const out: Attrs = {};
  for (const p of kids(kid(el, 'Properties'))) {
    if (kids(p).length === 0) out[local(p.name)] = textOf(p).trim();
  }
  return out;
}

const NOT_INHERITED = new Set(['Self', 'Name', 'BasedOn', 'NextStyle', 'Imported', 'KeyboardShortcut', 'PreviewColor', 'StyleUniqueId', 'IncludeClass', 'ExtendedKeyboardShortcut', 'EmitCss', 'SplitDocument']);

/** `Name` as InDesign shows it: `$ID/` left out. */
export const displayName = (name: string): string => name.replace(/^\$ID\//, '');

function readStyles(root: XmlEl, tag: 'ParagraphStyle' | 'CharacterStyle'): Map<string, IdmlStyle> {
  const raw = new Map<string, Attrs>();
  for (const e of descendants(root, tag)) {
    const own: Attrs = { ...e.attrs, ...props(e) };
    raw.set(e.attrs.Self ?? '', own);
  }
  const prefix = `${tag}/`;
  const ref = (s: string | undefined) => (!s ? '' : s.startsWith(prefix) ? s : `${prefix}${s}`);
  const resolved = new Map<string, Attrs>();
  const resolve = (self: string, seen: Set<string>): Attrs => {
    const done = resolved.get(self);
    if (done) return done;
    const own = raw.get(self);
    if (!own || seen.has(self)) return {};
    seen.add(self);
    const base = ref(own.BasedOn);
    const out: Attrs = base && base !== self ? { ...resolve(base, seen) } : {};
    for (const [k, v] of Object.entries(own)) if (!NOT_INHERITED.has(k)) out[k] = v;
    resolved.set(self, out);
    return out;
  };
  const styles = new Map<string, IdmlStyle>();
  for (const [self, own] of raw) {
    styles.set(self, { self, name: displayName(own.Name ?? self.slice(prefix.length)), attrs: resolve(self, new Set()) });
  }
  return styles;
}

function readColors(root: XmlEl | undefined): Map<string, IdmlColor> {
  const out = new Map<string, IdmlColor>();
  if (!root) return out;
  for (const c of descendants(root, 'Color')) {
    const self = c.attrs.Self ?? '';
    out.set(self, { self, name: displayName(c.attrs.Name ?? self), model: c.attrs.Model ?? 'Process', space: c.attrs.Space ?? 'CMYK', value: (c.attrs.ColorValue ?? '').split(/\s+/).filter(Boolean).map(Number) });
  }
  for (const t of descendants(root, 'Tint')) {
    const self = t.attrs.Self ?? '';
    out.set(self, { self, name: displayName(t.attrs.Name ?? ''), model: 'Tint', space: '', value: [], base: t.attrs.BaseColor, tint: Number(t.attrs.TintValue ?? 100) });
  }
  return out;
}

function readPage(pg: XmlEl, m: Matrix, index: number): IdmlPage {
  const pm = compose(m, matrix(pg.attrs.ItemTransform));
  const gb = (pg.attrs.GeometricBounds ?? '0 0 0 0').split(/\s+/).map(Number);
  const [x0, y0] = apply(pm, gb[1] ?? 0, gb[0] ?? 0);
  const [x1, y1] = apply(pm, gb[3] ?? 0, gb[2] ?? 0);
  const mp = kid(pg, 'MarginPreference')?.attrs ?? {};
  return {
    self: pg.attrs.Self ?? '',
    name: pg.attrs.Name ?? String(index + 1),
    master: pg.attrs.AppliedMaster ?? 'n',
    box: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
    margins: { top: Number(mp.Top ?? 0), bottom: Number(mp.Bottom ?? 0), left: Number(mp.Left ?? 0), right: Number(mp.Right ?? 0), columns: Number(mp.ColumnCount ?? 1), gutter: Number(mp.ColumnGutter ?? 12) },
    index,
  };
}

/** The page items of a spread, groups opened, each on the page under its
 *  centre. */
function readItems(spread: XmlEl, pages: IdmlPage[], firstPage: number): PageItem[] {
  const out: PageItem[] = [];
  const here = pages.slice(firstPage);
  const walk = (el: XmlEl, m: Matrix) => {
    for (const ch of kids(el)) {
      const tag = local(ch.name);
      if (!ITEM_TAGS.has(tag)) continue;
      const im = compose(m, matrix(ch.attrs.ItemTransform));
      if (tag === 'Group' || tag === 'Button' || tag === 'MultiStateObject') {
        walk(ch, im);
        continue;
      }
      const pts = pathPoints(ch, im);
      const box = bbox(pts);
      if (!box) continue;
      const cx = (box[0] + box[2]) / 2;
      const page = here.length > 0 ? here.reduce((best, p) => (Math.abs((p.box[0] + p.box[2]) / 2 - cx) < Math.abs((best.box[0] + best.box[2]) / 2 - cx) ? p : best)).index : -1;
      const link = descendants(ch, 'Link')[0]?.attrs.LinkResourceURI;
      const kind = (tag === 'TextBox' ? 'TextFrame' : tag) as PageItem['kind'];
      out.push({
        kind,
        self: ch.attrs.Self ?? '',
        el: ch,
        box,
        page,
        ...(kind === 'GraphicLine' && pts.length >= 2 ? { line: [pts[0]![0], pts[0]![1], pts[pts.length - 1]![0], pts[pts.length - 1]![1]] as [number, number, number, number] } : {}),
        ...(ch.attrs.ParentStory ? { story: ch.attrs.ParentStory, prev: ch.attrs.PreviousTextFrame, next: ch.attrs.NextTextFrame } : {}),
        ...(link ? { link } : {}),
      });
    }
  };
  walk(spread, matrix(spread.attrs.ItemTransform));
  return out;
}

const BOLD = /bold|semibold|demi|black|heavy|negrita|fett|gras|grassetto|extrabold|ultra/i;
const ITALIC = /italic|oblique|kursiv|cursiva|corsivo|slanted/i;

export const isBold = (a: Attrs): boolean => BOLD.test(a.FontStyle ?? '');
export const isItalic = (a: Attrs): boolean => ITALIC.test(a.FontStyle ?? '');

/** The CSS weight a face's style name says. */
export function weightOf(fontStyle: string | undefined): number {
  const s = (fontStyle ?? '').toLowerCase();
  if (/thin|hairline/.test(s)) return 100;
  if (/extra ?light|ultra ?light/.test(s)) return 200;
  if (/light/.test(s)) return 300;
  if (/medium/.test(s)) return 500;
  if (/semi ?bold|demi/.test(s)) return 600;
  if (/extra ?bold|ultra ?bold/.test(s)) return 800;
  if (/black|heavy/.test(s)) return 900;
  if (/bold|negrita|fett|gras|grassetto/.test(s)) return 700;
  return 400;
}

/** Read an `.idml` package. */
export function readIdml(bytes: Uint8Array): IdmlDocument {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes);
  } catch {
    throw new Error('IDML import: not an IDML package (not a ZIP)');
  }
  const part = (name: string): XmlEl | undefined => (zip[name] ? parseXml(strFromU8(zip[name]!)) : undefined);
  const designmap = part('designmap.xml');
  if (!designmap) throw new Error('IDML import: not an IDML package (no designmap.xml)');

  const styles = part('Resources/Styles.xml');
  const paragraphStyles = styles ? readStyles(styles, 'ParagraphStyle') : new Map<string, IdmlStyle>();
  const characterStyles = styles ? readStyles(styles, 'CharacterStyle') : new Map<string, IdmlStyle>();
  const colors = readColors(part('Resources/Graphic.xml'));

  const prefs = part('Resources/Preferences.xml');
  const dp = prefs ? descendants(prefs, 'DocumentPreference')[0]?.attrs ?? {} : {};
  const variables = new Map<string, { name: string; kind: string }>();
  for (const v of descendants(designmap, 'TextVariable')) variables.set(v.attrs.Self ?? '', { name: displayName(v.attrs.Name ?? ''), kind: v.attrs.VariableType ?? '' });

  const src = (tag: string) => descendants(designmap, tag).map((e) => e.attrs.src ?? '').filter((s) => zip[s]);
  const masters = new Map<string, IdmlMaster>();
  for (const file of src('MasterSpread')) {
    const ms = descendants(part(file)!, 'MasterSpread')[0];
    if (!ms) continue;
    const m = matrix(ms.attrs.ItemTransform);
    const pages = kids(ms, 'Page').map((pg, i) => readPage(pg, m, i));
    const items = readItems(ms, pages, 0);
    masters.set(ms.attrs.Self ?? file, { self: ms.attrs.Self ?? file, name: displayName(ms.attrs.Name ?? ''), pages, items });
  }
  const pages: IdmlPage[] = [];
  const items: PageItem[] = [];
  for (const file of src('Spread')) {
    const sp = descendants(part(file)!, 'Spread')[0];
    if (!sp) continue;
    const m = matrix(sp.attrs.ItemTransform);
    const first = pages.length;
    for (const pg of kids(sp, 'Page')) pages.push(readPage(pg, m, pages.length));
    items.push(...readItems(sp, pages, first));
  }

  const counter = { indexReferences: 0 };
  const stories = new Map<string, IdmlStory>();
  const storyFiles = src('Story');
  const files = storyFiles.length > 0 ? storyFiles : Object.keys(zip).filter((n) => n.startsWith('Stories/') && n.endsWith('.xml')).sort();
  for (const file of files) {
    const st = descendants(part(file)!, 'Story')[0];
    if (!st) continue;
    const self = st.attrs.Self ?? file;
    const reader = new StoryReader(paragraphStyles, characterStyles, variables, counter);
    stories.set(self, { self, paras: reader.read(st), vertical: kid(st, 'StoryPreference')?.attrs.StoryOrientation === 'Vertical' });
  }

  return {
    pageWidth: Number(dp.PageWidth ?? 0) || (pages[0] ? pages[0].box[2] - pages[0].box[0] : 612),
    pageHeight: Number(dp.PageHeight ?? 0) || (pages[0] ? pages[0].box[3] - pages[0].box[1] : 792),
    facing: dp.FacingPages !== 'false',
    binding: dp.PageBinding ?? 'LeftToRight',
    paragraphStyles,
    characterStyles,
    colors,
    variables,
    pages,
    items,
    masters,
    stories,
    indexReferences: counter.indexReferences,
  };
}

const NO_CHARACTER_STYLE = /\[No character style\]$/;

/** A story's text as paragraphs: `Br` ends one, a range of a new paragraph
 *  style starts one. */
export class StoryReader {
  constructor(
    private readonly ps: Map<string, IdmlStyle>,
    private readonly cs: Map<string, IdmlStyle>,
    private readonly variables: Map<string, { name: string; kind: string }>,
    private readonly counter: { indexReferences: number },
  ) {}

  read(root: XmlEl): IdmlPara[] {
    const paras: IdmlPara[] = [];
    let style = '';
    let pa: Attrs = {};
    let cur: IdmlPara = { style, a: pa, items: [] };
    const close = () => {
      paras.push(cur);
      cur = { style, a: pa, items: [] };
    };
    const walk = (el: XmlEl, ca: Attrs, cstyle: string) => {
      for (const node of el.children) this.node(node, ca, cstyle, { close, cur: () => cur, walk });
    };
    const visit = (el: XmlEl, ca: Attrs, cstyle: string): void => {
      const tag = local(el.name);
      if (tag === 'ParagraphStyleRange') {
        style = el.attrs.AppliedParagraphStyle ?? style;
        pa = { ...(this.ps.get(style)?.attrs ?? {}), ...own(el) };
        if (cur.items.length > 0) close();
        else cur = { style, a: pa, items: [] };
        for (const ch of kids(el)) visit(ch, pa, '');
        return;
      }
      if (tag === 'CharacterStyleRange') {
        const applied = el.attrs.AppliedCharacterStyle ?? '';
        const named = applied && !NO_CHARACTER_STYLE.test(applied) ? applied : '';
        const a = { ...(Object.keys(ca).length > 0 ? ca : pa), ...(named ? this.cs.get(named)?.attrs ?? {} : {}), ...own(el) };
        walk(el, a, named || cstyle);
        return;
      }
      // Structure and hyperlinks wrap ranges: read through them.
      for (const ch of kids(el)) visit(ch, ca, cstyle);
    };
    this.visitRef = visit;
    for (const ch of kids(root)) visit(ch, {}, '');
    if (cur.items.length > 0) paras.push(cur);
    while (paras.length > 0 && paras[paras.length - 1]!.items.length === 0) paras.pop();
    return paras;
  }

  private visitRef: (el: XmlEl, ca: Attrs, cstyle: string) => void = () => undefined;

  private node(node: XmlNode, a: Attrs, cs: string, ctx: { close: () => void; cur: () => IdmlPara; walk: (el: XmlEl, a: Attrs, cs: string) => void }): void {
    const items = () => ctx.cur().items;
    if (typeof node === 'string') return;
    if (!isEl(node)) return;
    const tag = local(node.name);
    switch (tag) {
      case 'Content':
        for (const c of node.children) {
          if (typeof c === 'string') {
            const parts = c.split('\u2029');
            parts.forEach((p, i) => {
              if (i > 0) ctx.close();
              if (p) items().push({ t: 'text', text: p, a, cs });
            });
          } else if (!isEl(c)) {
            const code = /^ACE\s+(\d+)/.exec(c.pi)?.[1];
            if (code === '18') items().push({ t: 'pageNumber', a, cs });
            else if (code === '19') items().push({ t: 'section', a, cs });
            else if (code === '8' || code === '7') items().push({ t: 'text', text: '\t', a, cs });
          }
        }
        return;
      case 'Br':
        ctx.close();
        return;
      case 'Table':
        items().push({ t: 'table', el: node, cells: new Map(kids(node, 'Cell').map((c) => [c, this.sub(c)])) });
        return;
      case 'Footnote':
        items().push({ t: 'note', paras: this.sub(node) });
        return;
      case 'TextVariableInstance': {
        const v = this.variables.get(node.attrs.AssociatedTextVariable ?? '');
        items().push({ t: 'variable', kind: v?.kind ?? '', name: v?.name ?? node.attrs.Name ?? '', text: node.attrs.ResultText ?? '', a, cs });
        return;
      }
      case 'PageReference':
        this.counter.indexReferences++;
        return;
      case 'Properties':
      case 'Note':
      case 'HiddenText':
        return;
      case 'Change':
        // Tracked changes: the text as it would stand accepted.
        if (node.attrs.ChangeType === 'DeletedText') return;
        ctx.walk(node, a, cs);
        return;
      default:
        if (ITEM_TAGS.has(tag)) {
          items().push({ t: 'object', el: node });
          return;
        }
        if (tag === 'CharacterStyleRange' || tag === 'ParagraphStyleRange') {
          this.visitRef(node, a, cs);
          return;
        }
        ctx.walk(node, a, cs);
    }
  }

  /** The paragraphs of a footnote or a table cell. */
  sub(el: XmlEl): IdmlPara[] {
    return new StoryReader(this.ps, this.cs, this.variables, this.counter).read(el);
  }
}

/** An element's own attributes and simple properties (the style it
 *  applies left out). */
function own(el: XmlEl): Attrs {
  const out: Attrs = {};
  for (const [k, v] of Object.entries(el.attrs)) if (k !== 'AppliedParagraphStyle' && k !== 'AppliedCharacterStyle' && k !== 'Self') out[k] = v;
  return { ...out, ...props(el) };
}

/** Text of the paragraphs, for samples and plain strings. */
export function paraText(p: IdmlPara): string {
  return p.items.map((i) => (i.t === 'text' ? i.text : i.t === 'variable' ? i.text : '')).join('');
}
