/**
 * An IDML document as a new Postext book: chapters of Markdown
 * from the stories in reading order, split at the first heading level;
 * tables as table resources and anchored pictures as figure resources whose
 * bytes come from the `Links` folder; footnotes as footnotes. The design
 * goes into the configuration: the page, its margins and columns, the
 * swatches as the palette, the paragraph styles as the body, the heading
 * levels and named paragraph styles, and the items of the main master spread (rules, boxes, pictures and the
 * text frames of the folio and running heads) as the header and footer.
 * What does not map is listed in `notes`.
 */

import { bitmapInfo } from '../../bundle/manifest/sizes.js';
import type { ColorValue, Resource } from '../../types.js';
import { linkName } from './analyze.js';
import { CAPTION_LABEL, attrValue, cleanText, collapseSpaces, fence, guardLineStart, heading, renderRuns, resourceEmbed, slugify, type Run } from './markdown.js';
import { isBold, isItalic, paraText, type Attrs, type IdmlDocument, type IdmlPara, type Inline, type PageItem } from './read.js';
import { descendants, kids, type XmlEl } from './xml.js';
import { DesignConverter } from './design.js';
import type { Chapter } from './base.js';
import { balanceMarks, escapeRegExp, lookOf, num, WEB_FORMATS } from './helpers.js';
import type { IdmlImportOptions, IdmlImportResult } from './types.js';

export type { IdmlImportOptions, IdmlImportResult, IdmlNote, IdmlNoteId } from './types.js';

/** Convert a read IDML document into a new book. */
export function idmlToPostext(doc: IdmlDocument, options: IdmlImportOptions = {}): IdmlImportResult {
  return new Converter(doc, options).run();
}


class Converter extends DesignConverter {
  run(): IdmlImportResult {
    this.text();
    const config = this.options.textOnly ? this.textConfig() : this.design();
    for (const story of this.analysis.stories) if (this.doc.stories.get(story)?.vertical) this.note('verticalText', story);
    if (this.doc.indexReferences > 0) this.note('indexMarks', undefined, this.doc.indexReferences);
    // A character style's own look (a colour, a size, small capitals) is
    // left out: its runs keep the emphasis their face gives them.
    for (const s of this.analysis.characterStyles) if (s.ownLook) this.note('characterStyles', s.name);
    for (const name of this.spots) this.note('spotSwatches', name);
    const chapters = this.chapters.map((c) => {
      const blocks = [...c.blocks];
      if (c.notes.length > 0) blocks.push(c.notes.join('\n\n'));
      return { title: c.title, markdown: `${blocks.filter((b) => b.trim()).join('\n\n')}\n` };
    });
    if (chapters.length === 0) chapters.push({ title: this.options.untitledChapter ?? 'Chapter 1', markdown: '\n' });
    return {
      chapters,
      config,
      resources: this.resources,
      files: this.files,
      notes: [...this.notes.entries()].map(([id, v]) => ({ id, count: v.count, examples: [...v.examples] })),
      analysis: this.analysis,
    };
  }

  // -------------------------------------------------------------------------
  // Text
  // -------------------------------------------------------------------------

  protected chapter(): Chapter {
    if (this.chapters.length === 0) this.newChapter();
    return this.chapters[this.chapters.length - 1]!;
  }

  protected newChapter(): void {
    this.flush();
    this.chapters.push({ title: '', blocks: [], notes: [], resources: [] });
    this.noteNo = 0;
  }

  /** Where blocks go: the open box, else the chapter. */
  protected target(): string[] {
    return this.box ? this.box.body : this.chapter().blocks;
  }

  protected flushList(): void {
    if (this.list.length > 0) this.target().push(this.list.join('\n'));
    this.list = [];
  }

  protected closeBox(): void {
    this.flushList();
    if (this.box) {
      const { type, title, body } = this.box;
      this.box = undefined;
      this.chapter().blocks.push(fence('callout', body, { type, title }));
    }
  }

  protected flush(): void {
    this.closeBox();
    this.flushList();
    if (this.pendingCaption !== undefined && this.chapters.length > 0) {
      this.chapter().blocks.push(guardLineStart(this.pendingCaption));
      this.pendingCaption = undefined;
    }
  }

  protected text(): void {
    for (const s of this.analysis.furniture) this.note('marginFrames', paraText(this.doc.stories.get(s)!.paras[0]!).trim().slice(0, 40));
    const frames = new Map<string, PageItem[]>();
    for (const it of this.doc.items) {
      if (it.kind !== 'TextFrame' || !it.story || it.page < 0) continue;
      frames.set(it.story, [...(frames.get(it.story) ?? []), it]);
    }
    // A story threaded over pages, or a long one, is a chapter of its own
    // (as many books keep one story per chapter); a short one in a frame of its own (a sidebar) goes on in the
    // chapter.
    const isLong = (story: string) => (frames.get(story)?.length ?? 0) >= 2 || (this.doc.stories.get(story)?.paras.length ?? 0) >= 20;
    // A long story without a first-level heading takes its title from its
    // first page (an opener's band): the largest short text there.
    const titles = new Map<string, string>();
    const consumed = new Set<string>();
    for (const story of this.analysis.stories) {
      if (!isLong(story) || (this.doc.stories.get(story)?.paras ?? []).some((p) => this.role(p.style) === 'h1')) continue;
      const list = frames.get(story) ?? [];
      const head = list.find((f) => !f.prev || f.prev === 'n') ?? list[0];
      const found = head ? this.pageTitle(head.page, frames) : undefined;
      if (found) {
        titles.set(story, found.text);
        consumed.add(found.story);
      }
    }
    for (const story of this.analysis.stories) {
      if (consumed.has(story)) continue;
      const paras = this.doc.stories.get(story)?.paras ?? [];
      const long = isLong(story);
      if (long && this.chapters.length > 0 && this.chapter().blocks.length + this.chapter().notes.length > 0) this.newChapter();
      const chapter = this.chapter();
      const title = titles.get(story);
      if (title) {
        chapter.title = title;
        chapter.blocks.push(heading(1, title));
      }
      if (long) for (const f of frames.get(story) ?? []) this.pageChapter.set(f.page, this.chapters.length - 1);
      for (const p of paras) this.paragraph(p);
      this.flushList();
      this.closeBox();
    }
    this.flush();
    for (const c of this.chapters) if (!c.title) c.title = this.options.untitledChapter ?? 'Chapter 1';
    // Pictures on the pages outside the text: in the resources, to place.
    for (const it of this.doc.items) {
      if (!it.link || it.page < 0) continue;
      const before = this.resources.length;
      this.picture(it.link, it.box);
      if (this.resources.length > before) this.note('loosePictures', linkName(it.link));
    }
  }

  /** The title a page prints in a frame of its own: the longest of the
   *  short texts set larger than the body. */
  protected pageTitle(page: number, frames: Map<string, PageItem[]>): { text: string; story: string } | undefined {
    const body = this.analysis.paragraphStyles.find((s) => this.role(s.self) === 'body');
    const bodySize = lookOf(body ? this.doc.paragraphStyles.get(body.self)?.attrs ?? {} : {}).size ?? 10;
    let best: { text: string; story: string } | undefined;
    for (const [story, list] of frames) {
      if (list.length !== 1 || list[0]!.page !== page) continue;
      const paras = this.doc.stories.get(story)?.paras ?? [];
      const text = collapseSpaces(cleanText(paras.map(paraText).join(' ')));
      if (paras.length > 3 || text.length > 300 || /^\d+$/.test(text)) continue;
      const first = paras[0]?.items.find((i): i is Extract<Inline, { t: 'text' }> => i.t === 'text');
      const size = num(first?.a.PointSize) ?? lookOf(paras[0]?.a ?? {}).size ?? 0;
      if (text && size > bodySize * 1.15 && (!best || text.length > best.text.length)) best = { text, story };
    }
    if (best) this.titlePages.add(page);
    return best;
  }


  protected paragraph(p: IdmlPara): void {
    const role = this.role(p.style);
    if (role === 'h1' && this.chapter().blocks.length + this.chapter().notes.length > 0) this.newChapter();
    if (role === 'skip') return;
    // Tables and pictures anchored in the paragraph come first: they sit
    // where the paragraph starts.
    for (const item of p.items) {
      if (item.t === 'table') this.embed(this.table(item.el, item.cells));
      else if (item.t === 'object') this.object(item.el);
    }
    const plain = collapseSpaces(cleanText(paraText(p)));
    if (!plain) return;
    const level = /^h([1-6])$/.exec(role)?.[1];
    if (level) {
      this.closeBox();
      this.flushList();
      if (level === '1' && !this.chapter().title) this.chapter().title = plain;
      this.chapter().blocks.push(heading(Number(level), plain));
      return;
    }
    const text = this.inline(p);
    switch (role) {
      case 'caption':
        this.caption(p);
        return;
      case 'box-title': {
        this.closeBox();
        // A `Box title <id>` style titles a box of `Box <id>`.
        const body = p.style.replace(/\/Box title /, '/Box ');
        this.box = { type: this.idFor(this.doc.paragraphStyles.has(body) ? body : p.style, 'box'), title: plain, body: [] };
        return;
      }
      case 'box': {
        const type = this.idFor(p.style, 'box');
        // A box a title opened takes the style of its text.
        if (this.box && this.box.body.length === 0) this.box.type = type;
        if (this.box && this.box.type !== type) this.closeBox();
        this.flushList();
        this.box ??= { type, body: [] };
        this.box.body.push(guardLineStart(text));
        return;
      }
      case 'list':
      case 'ordered': {
        const item = text.replace(/^\s*(?:[•·▪◦○■□–—-]|\\\*|\d{1,3}[.)]|[a-z][.)])\s+/u, '');
        const n = this.list.length + 1;
        this.list.push(`${role === 'ordered' ? `${n}.` : '-'} ${item}`);
        return;
      }
    }
    if (this.box) this.closeBox();
    this.flushList();
    if (role === 'quote') {
      this.target().push(`> ${text}`);
      return;
    }
    if (role === 'style') {
      const id = this.idFor(p.style, 'p');
      const blocks = this.target();
      const open = `:::paragraphs{style="${id}"}`;
      const last = blocks[blocks.length - 1];
      if (last?.startsWith(`${open}\n`)) blocks[blocks.length - 1] = `${last.slice(0, -'\n:::'.length)}\n\n${guardLineStart(text)}\n:::`;
      else blocks.push(fence('paragraphs', [guardLineStart(text)], { style: id }));
      return;
    }
    this.target().push(guardLineStart(text));
  }

  /** A paragraph's runs as Postext inline markup, footnotes as `[^n]`
   *  with their text at the end of the chapter. */
  protected inline(p: IdmlPara, notes = true): string {
    type Piece = { run: Run; style?: string };
    const pieces: Piece[] = [];
    const base = p.a;
    for (const item of p.items) {
      if (item.t === 'note') {
        if (!notes) continue;
        const n = ++this.noteNo;
        // The note's number is InDesign's (a marker, not text).
        const body = item.paras.map((q) => this.inline(q, false)).filter(Boolean).join(' ');
        this.chapter().notes.push(`[^${n}]: ${body.trim()}`);
        pieces.push({ run: { text: `[^${n}]`, raw: true } });
        continue;
      }
      if (item.t !== 'text' && item.t !== 'variable') continue;
      const text = (item.t === 'text' ? item.text : item.text).replace(/[\u2028\t\n\r]/g, ' ');
      if (!text) continue;
      pieces.push(this.piece(text, item.a, item.cs, base));
    }
    const runs = pieces.map((x) => x.run);
    return renderRuns(runs);
  }

  protected piece(text: string, a: Attrs, cs: string, base: Attrs): { run: Run } {
    const role = this.charRole(cs);
    const sup = /Superscript/.test(a.Position ?? '');
    const sub = /Subscript/.test(a.Position ?? '');
    switch (role) {
      case 'italic':
        return { run: { text, italic: true } };
      case 'bold':
        return { run: { text, bold: true } };
      case 'boldItalic':
        return { run: { text, bold: true, italic: true } };
      case 'sup':
        return { run: { text, sup: true } };
      case 'sub':
        return { run: { text, sub: true } };
      case 'plain':
        return { run: { text } };
      default:
        return { run: { text, bold: isBold(a) && !isBold(base), italic: isItalic(a) && !isItalic(base), sup, sub } };
    }
  }

  protected embed(id: string | undefined): void {
    if (!id) return;
    this.flushList();
    this.target().push(resourceEmbed(id));
    if (this.pendingCaption !== undefined) {
      const res = this.resources.find((r) => r.id === id);
      if (res && !res.caption) this.setCaption(res, this.pendingCaption);
      this.pendingCaption = undefined;
    }
  }

  protected setCaption(res: Resource, text: string): void {
    // The label is the resource type's to print: it goes, with the marks
    // it was set in (`**Table 1.1**. A table` → `A table`).
    const plain = text.replace(/\\(.)/g, '$1').replace(/[*]/g, '');
    const m = CAPTION_LABEL.exec(plain);
    let caption = text;
    if (m) {
      const core = `${escapeRegExp(m[1]!)}\\s*${escapeRegExp(m[2]!)}`;
      caption = text.replace(new RegExp(`^(\\*{1,3})?\\s*${core}\\s*(\\*{1,3})?\\s*[.:\\-–—]?\\s*(\\*{1,3})?\\s*`, 'i'), '');
    }
    res.caption = balanceMarks(caption.trim());
    if (!(res as { altText?: string }).altText) (res as { altText?: string }).altText = attrValue(caption.replace(/[*_]/g, ''));
  }

  /** A caption goes to the table or picture just before it, else to the
   *  next one. */
  protected caption(p: IdmlPara): void {
    const text = this.inline(p);
    const last = this.chapter().resources[this.chapter().resources.length - 1];
    const blocks = this.target();
    const lastBlock = blocks[blocks.length - 1];
    if (last && lastBlock === resourceEmbed(last.id)) {
      if (!last.caption) {
        this.setCaption(last, text);
        return;
      }
      // A second caption paragraph is the note under it (abbreviations,
      // sources).
      const r = last as Resource & { note?: string };
      if (!r.note) {
        r.note = text;
        return;
      }
    }
    if (this.pendingCaption !== undefined) blocks.push(guardLineStart(this.pendingCaption));
    this.pendingCaption = undefined;
    // A caption above its table or picture starts with its label; any other
    // stays a paragraph.
    if (CAPTION_LABEL.test(text.replace(/\\(.)/g, '$1').replace(/\*/g, ''))) this.pendingCaption = text;
    else blocks.push(guardLineStart(text));
  }

  /** An anchored object: a picture as a figure, a text frame's story after
   *  the paragraph, a group read through. */
  protected object(el: XmlEl): void {
    const link = descendants(el, 'Link')[0]?.attrs.LinkResourceURI;
    if (link) {
      for (const l of descendants(el, 'Link')) {
        const uri = l.attrs.LinkResourceURI;
        if (uri) this.embed(this.picture(uri));
      }
      return;
    }
    const frames = el.name === 'TextFrame' ? [el] : descendants(el, 'TextFrame');
    if (frames.length > 0) {
      for (const f of frames) {
        const story = this.doc.stories.get(f.attrs.ParentStory ?? '');
        if (!story) continue;
        this.note('anchoredFrames', paraText(story.paras[0] ?? { style: '', a: {}, items: [] }).trim().slice(0, 40));
        for (const q of story.paras) this.paragraph(q);
      }
      return;
    }
    this.note('otherObjects', el.name);
  }

  /** A figure resource for a linked picture, its bytes from the links (a
   *  screen version of a TIFF, PSD, EPS or PDF original when the folder
   *  has one with its name). */
  protected picture(uri: string, frame?: [number, number, number, number]): string | undefined {
    const name = linkName(uri);
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
    let file = name;
    let bytes = this.links.get(name.toLowerCase());
    let fext = ext;
    if (!bytes) {
      this.note('missingLinks', name);
      return this.stub(stem);
    }
    if (!WEB_FORMATS[ext] && ext !== 'svg') {
      const alt = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].map((e) => [e, this.links.get(`${stem}.${e}`.toLowerCase())] as const).find(([, b]) => b);
      if (!alt) {
        this.note('unsupportedPictures', name);
        return this.stub(stem);
      }
      [fext, bytes] = [alt[0], alt[1]!];
      file = `${stem}.${fext}`;
    }
    const id = this.slugs.slug(stem, 'fig');
    let fileId = this.fileOf.get(file.toLowerCase());
    const web = WEB_FORMATS[fext];
    if (!fileId) {
      fileId = `idml-${this.files.size + 1}-${slugify(stem, 6, 40)}.${fext}`;
      this.files.set(fileId, { bytes, mime: web?.mime ?? 'image/svg+xml' });
      this.fileOf.set(file.toLowerCase(), fileId);
    }
    const base = { id, typeId: 'figure', caption: '', createdAt: this.now, updatedAt: this.now } as const;
    let res: Resource;
    if (web) {
      const info = bitmapInfo(bytes);
      const width = info?.width ?? Math.round(((frame ? frame[2] - frame[0] : 300) / 72) * 300);
      const height = info?.height ?? Math.round(((frame ? frame[3] - frame[1] : 200) / 72) * 300);
      res = { ...base, kind: 'bitmap', bitmap: { fileId, format: web.format, width, height } } as unknown as Resource;
    } else {
      const svg = new TextDecoder().decode(bytes.subarray(0, 4096));
      const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
      res = { ...base, kind: 'svg', svg: { fileId, ...(vb ? { width: Number(vb[1]), height: Number(vb[2]) } : {}) } } as unknown as Resource;
    }
    this.resources.push(res);
    this.chapters[this.chapters.length - 1]?.resources.push(res);
    return id;
  }

  /** A picture whose file did not come: its place is kept (the warnings
   *  panel names the missing resource). */
  protected stub(stem: string): string {
    return this.slugs.slug(stem, 'fig');
  }

  /** A table resource from an InDesign table. */
  protected table(tbl: XmlEl, cells: Map<XmlEl, IdmlPara[]>): string {
    const columns = kids(tbl, 'Column');
    const rowsEl = kids(tbl, 'Row');
    const ncols = columns.length || Number(tbl.attrs.ColumnCount ?? 0);
    const nrows = rowsEl.length || Number(tbl.attrs.BodyRowCount ?? 0) + Number(tbl.attrs.HeaderRowCount ?? 0) + Number(tbl.attrs.FooterRowCount ?? 0);
    const header = Number(tbl.attrs.HeaderRowCount ?? 0);
    type Cell = { content: string; isHeader?: boolean; colSpan?: number; rowSpan?: number; background?: ColorValue; hiddenBy?: { row: number; col: number } };
    const grid: Array<Array<Cell | undefined>> = Array.from({ length: nrows }, () => Array.from({ length: ncols }, () => undefined));
    for (const cell of kids(tbl, 'Cell')) {
      const [c, r] = (cell.attrs.Name ?? '0:0').split(':').map(Number) as [number, number];
      const cs = Number(cell.attrs.ColumnSpan ?? 1);
      const rs = Number(cell.attrs.RowSpan ?? 1);
      const paras = cells.get(cell) ?? [];
      const content = paras.map((q) => this.inline(q, false)).filter(Boolean).join('\n');
      const entry: Cell = { content };
      if (r < header) entry.isHeader = true;
      if (cs > 1) entry.colSpan = cs;
      if (rs > 1) entry.rowSpan = rs;
      const fill = cell.attrs.FillColor;
      if (fill && !/None|Paper/.test(fill)) {
        const color = this.color(fill);
        if (color) entry.background = color;
      }
      if (r < nrows && c < ncols && !grid[r]![c]?.hiddenBy) {
        grid[r]![c] = entry;
        for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) if ((dr || dc) && r + dr < nrows && c + dc < ncols) grid[r + dr]![c + dc] = { content: '', hiddenBy: { row: r, col: c } };
      }
    }
    const widths = columns.map((c) => Number(c.attrs.SingleColumnWidth ?? 0));
    const total = widths.reduce((a, b) => a + b, 0);
    const model = {
      rows: grid.map((row) => row.map((x) => x ?? { content: '' })),
      ...(header ? { headerRowCount: header } : {}),
      ...(widths.length > 0 && widths.every((w) => w > 0) ? { columnWidths: widths.map((w) => Math.round((w / total) * 10000) / 10000) } : {}),
    };
    const first = grid[0]?.find((c) => c?.content)?.content ?? '';
    const id = this.slugs.slug(first.replace(/[*_\\[\]|^~]/g, '') || `table ${this.resources.length + 1}`, 'table');
    const res = { id, typeId: 'table', kind: 'table', caption: '', table: { model }, createdAt: this.now, updatedAt: this.now } as unknown as Resource;
    this.resources.push(res);
    this.chapter().resources.push(res);
    return id;
  }

}
