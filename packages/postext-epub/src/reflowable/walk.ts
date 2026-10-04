// The resolved print documents back to a semantic book, in reading order.
//
// Pages are read as the tagged PDF reads them (postext-pdf
// `structureFlow.ts`): column by column, then the page's floats, each moved
// to where it is read — after the text block with the highest content
// index up to its own. On the way:
//   - fragments of a block split across columns or pages (continuations
//     carry the head's id plus `-cont-N`) are joined into one paragraph;
//   - consecutive list items become nested lists by `listDepth`;
//   - blocks sharing a callout's `containerId` go into one box, nested
//     boxes by `calloutPath`; other containers (`:::paragraphs`) only lend
//     their paragraphs a style class;
//   - headings take levels that never skip one;
//   - footnote paragraphs (`footnoteNote`) leave the flow and become the
//     notes of the content document that cites them;
//   - each printed page leaves a page-break marker where its text starts;
//   - a part (a divider page, or `partMarks` without one) opens a
//     document of its own and the chapter goes on in a new one.

import type { ResolvedConfig, VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from 'postext';
import { canonicalLocaleTag, dimensionToPx, primaryFontFamily } from 'postext';
import type {
  CalloutNode,
  FileModel,
  FigureNode,
  HeadingEntry,
  HeadingNode,
  InlineItem,
  ListItemNode,
  ListNode,
  MathNode,
  Node,
  NoteModel,
  ParagraphNode,
  QuoteNode,
  TableCellNode,
  TableNode,
  TocNode,
  TocRowNode,
  VerseNode,
} from './model';
import { appendLine, appendLines, fontPx, idOf, mathSvg, plainText, type InlineContext, type TextSink } from './inline';

/** Where an id landed: its content document and element id. */
export interface Loc {
  file: FileModel;
  id: string;
}

/** Everything the walk found, for the serializer and the navigation. */
export interface BookModel {
  files: FileModel[];
  headings: HeadingEntry[];
  anchors: Map<string, Loc>;
  resources: Map<string, Loc>;
  /** Printed pages by book page index, in the order their markers were
   *  set. */
  pages: Map<number, { loc: Loc; label: string }>;
  notes: Map<string, Loc>;
  /** Pictures the text places (figures, table-cell images). */
  images: Set<string>;
  /** Whether a picture has a text alternative / lacks one. */
  altText: boolean;
  missingAlt: boolean;
  maths: boolean;
  /** Whether a `:::verse` poem was read. */
  verse: boolean;
  /** First entry of a back-of-book index, of a bibliography, and the
   *  contents a `:::toc` prints. */
  index?: Loc;
  bibliography?: Loc;
  contents?: Loc;
}

/** The book language when a chapter does not set its own. */
export interface WalkOptions {
  language: string;
}

const fragmentKey = (block: VDTBlock): string => block.id.replace(/-cont-\d+$/, '');

const isTocRow = (block: VDTBlock): boolean => block.tocEntry !== undefined || block.tocPart !== undefined;

/** The source range of a block, as a key. */
const rangeKey = (block: VDTBlock): string => `${block.sourceStart ?? ''}:${block.sourceEnd ?? ''}`;

/** Whether a block links page numbers: an entry of the index. */
const hasPageLink = (block: VDTBlock): boolean => block.lines.some((l) => l.segments?.some((g) => g.pageLink !== undefined));

const lineKey = (page: number, x: number, y: number): string => `${page}|${x.toFixed(2)}|${y.toFixed(2)}`;

/** The language a chapter document is written in. */
export function docLanguage(config: ResolvedConfig, fallback: string): string {
  const h = config.bodyText.hyphenation;
  return canonicalLocaleTag(config.locale) ?? canonicalLocaleTag(h.tag) ?? canonicalLocaleTag(fallback) ?? 'en';
}

interface OpenList {
  depth: number;
  kind: VDTBlock['listKind'];
  node: ListNode;
  lastItem?: ListItemNode;
}

/** A sequence of blocks: the document, or a box. */
interface Container {
  nodes: Node[];
  lists: OpenList[];
  quote?: QuoteNode;
  toc?: TocNode;
  /** The top-level node holding the container (undefined: the file). */
  top?: Node;
}

interface Sink extends TextSink {
  top: Node;
  file: FileModel;
}

/** A poem being read, across the fragments of its block. */
interface OpenVerse {
  node: VerseNode;
  top: Node;
  /** The bayt and hemistich the last line set, and where its text goes:
   *  a hemistich wider than the measure runs on over several lines. */
  bayt?: number;
  part?: string;
  sink?: TextSink;
}

export function walkBook(docs: readonly VDTDocument[], options: WalkOptions): BookModel {
  const book: BookModel = {
    files: [],
    headings: [],
    anchors: new Map(),
    resources: new Map(),
    pages: new Map(),
    notes: new Map(),
    images: new Set(),
    altText: false,
    missingAlt: false,
    maths: false,
    verse: false,
  };
  const counters = { heading: 0, block: 0 };
  docs.forEach((doc, i) => new DocWalker(book, doc, i, options, counters).walk());
  return book;
}

class DocWalker {
  private readonly offset: number;
  private readonly lang: string;
  private readonly dir?: 'rtl';
  private readonly config: ResolvedConfig;
  private readonly bodyPx: number;
  /** Ids of the boxes (`:::callout`) of the document. */
  private readonly calloutIds = new Set<number>();
  /** Inline anchors by the line they sit on. */
  private readonly lineAnchors = new Map<string, string[]>();
  /** Source ranges of the `:::index` directives: every entry block a
   *  directive expands into carries its range, the entries with only a
   *  cross-reference (`See …`) too, which have no page link. */
  private readonly indexRanges = new Set<string>();
  private readonly partMarks: NonNullable<VDTDocument['partMarks']>;
  /** Whether the engine named the paragraph styles of the blocks
   *  (`VDTBlock.paragraphStyleId`, `VDTBlock.indexLevel`): an older
   *  document's are told from their faces (`paragraphStyleOf`). */
  private readonly styleHints: boolean;
  private file?: FileModel;
  private root!: Container;
  private readonly lastLevel = new Map<FileModel, number>();
  private lastContainer?: Container;
  private callouts = new Map<number, { node: CalloutNode; state: Container }>();
  private readonly sinks = new Map<string, Sink>();
  private readonly verses = new Map<string, OpenVerse>();
  private readonly tables = new Map<string, TableNode>();
  private readonly figures = new Set<string>();
  /** Text blocks read so far, with their content index: where floats go. */
  private readonly flow: { index: number; top: Node; file: FileModel }[] = [];
  private readonly placedAfter = new Map<Node, Node>();
  private readonly notes = new Map<string, NoteModel & { sink: TextSink }>();
  private readonly seenNotes = new Set<string>();
  private pendingPages: number[] = [];
  private floating = false;
  private partKey?: string;
  private fileCount = 0;

  constructor(
    private readonly book: BookModel,
    private readonly doc: VDTDocument,
    private readonly index: number,
    options: WalkOptions,
    private readonly counters: { heading: number; block: number },
  ) {
    this.offset = doc.pageIndexOffset ?? 0;
    this.config = doc.config;
    this.lang = docLanguage(doc.config, options.language);
    if (doc.config.direction === 'rtl') this.dir = 'rtl';
    this.bodyPx = dimensionToPx(doc.config.bodyText.fontSize, doc.config.page.dpi);
    this.partMarks = [...(doc.partMarks ?? [])].sort((a, b) => a.afterContentIndex - b.afterContentIndex);
    const frames = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].filter((b) => b.type === 'callout');
    for (const f of frames) {
      if (f.containerId !== undefined) this.calloutIds.add(f.containerId);
      for (const id of f.calloutPath ?? []) this.calloutIds.add(id);
    }
    for (const b of doc.blocks) {
      if (b.sourceStart !== undefined && hasPageLink(b)) this.indexRanges.add(rangeKey(b));
    }
    this.styleHints = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].some((b) => b.paragraphStyleId !== undefined || b.indexLevel !== undefined);
    for (const a of doc.anchors ?? []) {
      if (a.kind !== 'anchor') continue;
      const key = lineKey(a.pageIndex, a.x, a.y);
      const ids = this.lineAnchors.get(key) ?? [];
      ids.push(a.id);
      this.lineAnchors.set(key, ids);
    }
  }

  walk(): void {
    const floats: VDTBlock[][] = [];
    for (const page of this.doc.pages) {
      const bookIndex = this.offset + page.index;
      if (page.partInfo) {
        const key = `${page.partInfo.number}\u0000${page.partInfo.title}`;
        if (key !== this.partKey) this.openPart(page.partInfo.number, page.partInfo.title, bookIndex);
      } else if (this.file?.kind === 'part') {
        this.newFile('chapter');
      }
      if (!this.file) this.newFile('chapter');
      this.book.pages.set(bookIndex, { loc: { file: this.file!, id: '' }, label: page.pageLabel || String(page.pageNumberValue) });
      this.pendingPages.push(bookIndex);
      for (const col of page.columns) {
        for (const block of col.blocks) this.place(block, this.root);
      }
      // Floats: footnotes are collected now; the rest is read later, in
      // groups (a floated box with its content).
      let group: VDTBlock[] = [];
      const flush = () => {
        if (group.length > 0) floats.push(group);
        group = [];
      };
      for (const f of [...(page.floats ?? []), ...page.marginNotes]) {
        if (f.footnoteNote !== undefined) {
          this.note(f);
          continue;
        }
        if (group.length > 0 && (f.containerId === undefined || f.containerId !== group[0]!.containerId)) flush();
        group.push(f);
        if (f.containerId === undefined) flush();
      }
      flush();
    }
    for (const g of floats) this.readFloat(g);
    // Page starts with no text after them: at the end of the last file.
    this.flushPages();
    this.finishNotes();
    this.markPullQuotes();
    // Anchors no line holds: at the start of their page.
    for (const a of this.doc.anchors ?? []) {
      if (this.book.anchors.has(a.id)) continue;
      const page = this.book.pages.get(this.offset + a.pageIndex);
      if (page) this.book.anchors.set(a.id, page.loc);
    }
  }

  // --- files ---------------------------------------------------------------

  private newFile(kind: FileModel['kind']): FileModel {
    const file: FileModel = {
      href: '',
      itemId: '',
      kind,
      doc: this.index,
      nodes: [],
      notes: [],
      lang: this.lang,
      ...(this.dir ? { dir: this.dir } : {}),
    };
    this.fileCount++;
    this.book.files.push(file);
    this.file = file;
    this.root = { nodes: file.nodes, lists: [] };
    this.lastContainer = undefined;
    this.callouts = new Map();
    return file;
  }

  /** A part opener: a document of its own with the part's title. A file
   *  holding nothing but page starts becomes the opener. */
  private openPart(number: string, title: string, bookIndex: number): void {
    this.partKey = `${number}\u0000${title}`;
    const reuse = this.file && this.file.nodes.every((n) => n.k === 'marker');
    const file = reuse ? this.file! : this.newFile('part');
    file.kind = 'part';
    const id = `part-${++this.counters.heading}`;
    const label = [number, title].filter((s) => s.trim()).join(' ');
    const inl: InlineItem[] = [...this.takePages()];
    if (number.trim()) inl.push({ t: 'raw', xhtml: `<span class="pt-part-number">${escapeText(number)}</span>` }, { t: 'text', text: ' ', fmt: {} });
    inl.push({ t: 'text', text: title, fmt: {} });
    const node: HeadingNode = { k: 'h', level: 1, id, inl, cls: ['pt-part-title'] };
    file.nodes.push(node);
    file.title ??= label;
    this.lastLevel.set(file, 1);
    this.book.headings.push({ file, id, level: 0, label, page: bookIndex, listed: true });
  }

  // --- page starts ---------------------------------------------------------

  /** The page starts waiting for text, as items (none while a float is
   *  read: a float is no page's start). Registers where they landed. */
  private takePages(): InlineItem[] {
    if (this.floating || this.pendingPages.length === 0) return [];
    const out: InlineItem[] = [];
    for (const bookIndex of this.pendingPages) {
      const page = this.book.pages.get(bookIndex)!;
      page.loc = { file: this.file!, id: `page-${bookIndex + 1}` };
      out.push({ t: 'page', bookIndex });
    }
    this.pendingPages = [];
    return out;
  }

  private flushPages(): void {
    const items = this.takePages();
    if (items.length > 0) this.file!.nodes.push({ k: 'marker', inl: items });
  }

  // --- containers ----------------------------------------------------------

  private calloutState(cid: number, path: readonly number[], root: Container): Container {
    let entry = this.callouts.get(cid);
    if (!entry) {
      const node: CalloutNode = { k: 'callout', children: [] };
      root.nodes.push(node);
      entry = { node, state: { nodes: node.children, lists: [], top: root.top ?? node } };
      this.callouts.set(cid, entry);
    }
    for (const id of path) {
      let inner = this.callouts.get(id);
      if (!inner) {
        const node: CalloutNode = { k: 'callout', children: [] };
        entry.state.nodes.push(node);
        inner = { node, state: { nodes: node.children, lists: [], top: entry.state.top } };
        this.callouts.set(id, inner);
      }
      entry = inner;
    }
    return entry.state;
  }

  /** The container a block goes into, its grouping state brought in step
   *  (lists, quotation and contents close on any other block). */
  private enter(block: VDTBlock, root: Container): Container {
    const cid = block.containerId;
    const state = cid !== undefined && this.calloutIds.has(cid) ? this.calloutState(cid, block.calloutPath ?? [], root) : root;
    if (state !== this.lastContainer || block.type === 'callout') {
      state.lists = [];
      state.quote = undefined;
      state.toc = undefined;
    }
    this.lastContainer = state;
    const toc = isTocRow(block);
    if (block.type !== 'listItem' || toc) state.lists = [];
    if (block.type !== 'blockquote') state.quote = undefined;
    if (!toc) state.toc = undefined;
    return state;
  }

  private topOf(state: Container, node: Node): Node {
    return state.top ?? node;
  }

  private record(block: VDTBlock, top: Node): void {
    if (this.floating || block.contentIndex === undefined) return;
    this.flow.push({ index: block.contentIndex, top, file: this.file! });
  }

  // --- blocks --------------------------------------------------------------

  private ctx(block: Pick<VDTBlock, 'fontString'>): InlineContext {
    return {
      doc: this.index,
      lang: this.lang,
      basePx: fontPx(block.fontString),
      noteRef: (id) => {
        const key = `${this.index}:${id}`;
        if (!this.book.notes.has(key)) this.book.notes.set(key, { file: this.file!, id: idOf('fn-', id) });
        if (this.seenNotes.has(id)) return false;
        this.seenNotes.add(id);
        return true;
      },
    };
  }

  /** Items to set before a line: the anchors the line holds. */
  private anchorsAt(block: VDTBlock, line: VDTLine): InlineItem[] {
    const ids = this.lineAnchors.get(lineKey(block.pageIndex, line.bbox.x, line.bbox.y));
    if (!ids) return [];
    const out: InlineItem[] = [];
    for (const id of ids) {
      if (this.book.anchors.has(id)) continue;
      const elemId = idOf('a-', id);
      this.book.anchors.set(id, { file: this.file!, id: elemId });
      out.push({ t: 'anchor', id: elemId });
    }
    return out;
  }

  private appendBlockLines(sink: TextSink, block: VDTBlock, lines: readonly VDTLine[] = block.lines, before: InlineItem[] = []): void {
    const ctx = this.ctx(block);
    appendLines(sink, lines, ctx, (line, i) => [...(i === 0 ? before : []), ...this.anchorsAt(block, line)]);
  }

  private place(block: VDTBlock, root: Container): void {
    if (block.footnoteNote !== undefined) {
      this.note(block);
      return;
    }
    // A part set without a divider page opens with the first block after
    // its fence.
    if (!this.floating && block.contentIndex !== undefined) {
      while (this.partMarks.length > 0 && block.contentIndex > this.partMarks[0]!.afterContentIndex) {
        const mark = this.partMarks.shift()!;
        this.openPart(mark.number, mark.title, this.offset + block.pageIndex);
        this.newFile('chapter');
        root = this.root;
      }
    }
    if (block.type === 'callout') {
      this.calloutFrame(block, root);
      return;
    }
    const key = this.textKey(block);
    const verse = this.verses.get(key);
    if (verse) {
      this.enter(block, root);
      this.verseLines(verse, block);
      this.record(block, verse.top);
      return;
    }
    const sink = this.sinks.get(key);
    if (sink && block.indexLevel !== undefined && block.lines.some((l) => l.indexLevel !== undefined)) {
      // An index block's fragment that starts entries of its own.
      this.indexEntries(block, this.enter(block, root), key, sink);
      return;
    }
    if (sink) {
      this.enter(block, root);
      const pages = this.takePages();
      this.appendBlockLines(sink, block, block.lines, pages);
      this.record(block, sink.top);
      return;
    }
    if (block.type === 'resource') {
      this.resource(block, root);
      return;
    }
    if (block.type === 'mathDisplay') {
      this.math(block, root);
      return;
    }
    if (isTocRow(block)) {
      this.tocRow(block, root, key);
      return;
    }
    const hasText = block.lines.some((l) => l.text.length > 0 || (l.segments?.length ?? 0) > 0);
    if (!hasText && !(block.type === 'heading' && block.designOverlay)) return;
    switch (block.type) {
      case 'heading':
        this.heading(block, root, key);
        break;
      case 'listItem':
        this.listItem(block, root, key);
        break;
      case 'blockquote':
        this.quote(block, root, key);
        break;
      default:
        this.paragraph(block, root, key);
    }
  }

  /** The key the fragments of one text block share: the head's id (a
   *  continuation adds `-cont-N`); inside a box split across pages, where
   *  each fragment numbers its children afresh, the box and the content
   *  index. */
  private textKey(block: VDTBlock): string {
    const cid = block.containerId;
    if (cid !== undefined && this.calloutIds.has(cid) && block.contentIndex !== undefined && block.type !== 'heading' && block.type !== 'resource') {
      return `box:${cid}:${(block.calloutPath ?? []).join('.')}:${block.contentIndex}`;
    }
    return fragmentKey(block);
  }

  private newSink(key: string, inl: InlineItem[], top: Node): Sink {
    const sink: Sink = { inl, top, file: this.file! };
    this.sinks.set(key, sink);
    return sink;
  }

  private calloutFrame(block: VDTBlock, root: Container): void {
    const cid = block.containerId;
    if (cid === undefined) return;
    this.enter(block, root);
    const path = block.calloutPath ?? [];
    this.calloutState(cid, path, root);
    const own = this.callouts.get(path.length > 0 ? path[path.length - 1]! : cid)!.node;
    if (block.callout?.styleId) own.styleId = block.callout.styleId;
    if ((block.callout?.part ?? 0) === 0 && own.title === undefined) {
      const title = (block.designOverlay?.blocks ?? [])
        .flatMap((b) => (b.kind === 'text' && !b.artifact ? [b.lines.map((l) => l.text).join(' ')] : []))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (title) own.title = title;
    }
    // The box's first content block starts its lists afresh.
    this.lastContainer = undefined;
  }

  private heading(block: VDTBlock, root: Container, key: string): void {
    const state = this.enter(block, root);
    const file = this.file!;
    const last = this.lastLevel.get(file) ?? 0;
    const level = Math.max(1, Math.min(6, block.headingLevel ?? 1, last + 1));
    this.lastLevel.set(file, level);
    const anchor = block.attrs?.id;
    let id: string;
    if (anchor && !this.book.anchors.has(anchor)) {
      id = idOf('a-', anchor);
      this.book.anchors.set(anchor, { file, id });
    } else {
      id = `h-${++this.counters.heading}`;
    }
    const cls: string[] = [];
    if (block.headingStyleId) cls.push(idOf('hs-', block.headingStyleId));
    // A structural heading (its level hidden) prints nothing but is part
    // of the outline: kept for navigation, out of sight.
    if (block.hidden && block.lines.every((l) => l.bbox.height <= 0)) cls.push('pt-hidden');
    const node: HeadingNode = { k: 'h', level, id, inl: [], ...(cls.length ? { cls } : {}), ...(block.direction ? { dir: block.direction } : {}) };
    state.nodes.push(node);
    const top = this.topOf(state, node);
    const sink = this.newSink(key, node.inl, top);
    const pages = this.takePages();
    if (block.sourceTitle !== undefined) {
      // The title as written (the lines print it transformed, upper case):
      // the stylesheet transforms it again.
      const prefix = block.numberPrefix ? `${block.numberPrefix}${block.numberSeparator ?? ' '}` : '';
      node.inl.push(...pages, { t: 'text', text: prefix + block.sourceTitle, fmt: {} });
      sink.prev = block.lines[block.lines.length - 1];
    } else if (block.lines.length > 0) {
      this.appendBlockLines(sink, block, block.lines, pages);
    } else {
      const text = (block.designOverlay?.blocks ?? [])
        .flatMap((b) => (b.kind === 'text' && !b.artifact ? [b.lines.map((l) => l.text).join(' ')] : []))
        .join(' ');
      node.inl.push(...pages, { t: 'text', text, fmt: {} });
    }
    this.record(block, top);
    const label = plainText(node.inl);
    file.title ??= label;
    const style = block.headingStyleId ? this.config.headingStyles.find((s) => s.id === block.headingStyleId) : undefined;
    const navDepth = Math.max(3, ...this.config.toc.levels.map((l) => l.level));
    this.book.headings.push({
      file,
      id,
      level: block.headingLevel ?? 1,
      label,
      page: this.offset + block.pageIndex,
      listed: style?.toc !== false && (block.headingLevel ?? 1) <= navDepth,
    });
  }

  private paragraph(block: VDTBlock, root: Container, key: string): void {
    const state = this.enter(block, root);
    if (block.indexLevel !== undefined || hasPageLink(block) || (block.sourceStart !== undefined && this.indexRanges.has(rangeKey(block)))) {
      this.indexEntries(block, state, key);
      return;
    }
    if (block.lines.some((l) => l.verse !== undefined)) {
      this.verse(block, state, key);
      return;
    }
    const node: ParagraphNode = { k: 'p', inl: [], ...(block.direction ? { dir: block.direction } : {}) };
    const cls: string[] = [];
    if (block.bibEntry !== undefined) {
      cls.push('pt-bib');
      const anchor = `ref-${block.bibEntry}`;
      if (!this.book.anchors.has(anchor)) {
        node.id = idOf('a-', anchor);
        this.book.anchors.set(anchor, { file: this.file!, id: node.id });
      }
    } else {
      const style = this.paragraphStyle(block);
      if (style) cls.push(idOf('ps-', style));
    }
    if (cls.length) node.cls = cls;
    state.nodes.push(node);
    const top = this.topOf(state, node);
    const sink = this.newSink(key, node.inl, top);
    this.appendBlockLines(sink, block, block.lines, this.takePages());
    this.record(block, top);
    if (!this.floating && block.bibEntry !== undefined && !this.book.bibliography && node.id) this.book.bibliography = { file: this.file!, id: node.id };
  }

  /** The paragraph style a block is set in: the one the engine names, or
   *  (an older document) the one its face tells, outside boxes. */
  private paragraphStyle(block: VDTBlock): string | undefined {
    if (this.styleHints) return block.paragraphStyleId;
    if (block.containerId !== undefined && this.calloutIds.has(block.containerId)) return undefined;
    return paragraphStyleOf(block, this.config, this.bodyPx);
  }

  /** A `:::verse` poem (#378): its lines back to bayts. */
  private verse(block: VDTBlock, state: Container, key: string): void {
    const style = this.styleHints ? block.paragraphStyleId : undefined;
    const node: VerseNode = {
      k: 'verse',
      pre: this.takePages(),
      bayts: [],
      ...(style ? { cls: [idOf('ps-', style)] } : {}),
      ...(block.direction ? { dir: block.direction } : {}),
    };
    state.nodes.push(node);
    this.book.verse = true;
    const open: OpenVerse = { node, top: this.topOf(state, node) };
    this.verses.set(key, open);
    this.verseLines(open, block);
    this.record(block, open.top);
  }

  /**
   * The lines of a poem's fragment, bayt by bayt (`VDTLine.verse`). A
   * whole bayt's line is cut at its gap (the `labelTab` space; with an
   * ornament, the inserted mark and an empty space follow it); a
   * staggered bayt comes as a ṣadr line and an ʿajuz line; a hemistich
   * broken over lines is joined again. Page starts waiting for text open
   * the next bayt.
   */
  private verseLines(open: OpenVerse, block: VDTBlock): void {
    const ctx = this.ctx(block);
    const bayts = open.node.bayts;
    for (const line of block.lines) {
      const before = [...this.takePages(), ...this.anchorsAt(block, line)];
      const v = line.verse ?? { bayt: -1, part: 'single' as const };
      const segs = line.segments ?? [];
      if (v.part === 'bayt') {
        const gap = segs.findIndex((g) => g.kind === 'space' && g.labelTab);
        const sadr = gap >= 0 ? segs.slice(0, gap) : segs;
        const rest = gap >= 0 ? segs.slice(gap + 1) : [];
        const ornament = rest.find((g) => g.kind === 'text' && g.inserted)?.text;
        const ajuz = rest.filter((g) => !g.inserted && !(g.kind === 'space' && g.labelTab));
        while (ajuz[0]?.kind === 'space') ajuz.shift();
        const bayt = { sadr: [] as InlineItem[], ajuz: [] as InlineItem[], ...(ornament ? { ornament } : {}) };
        bayts.push(bayt);
        appendLine({ inl: bayt.sadr }, line, ctx, before, sadr);
        open.sink = { inl: bayt.ajuz };
        appendLine(open.sink, line, ctx, [], ajuz);
      } else if (open.sink && v.bayt === open.bayt && v.part === open.part) {
        appendLine(open.sink, line, ctx, before, segs);
      } else {
        let bayt = bayts[bayts.length - 1];
        if (!(v.part === 'ajuz' && bayt && v.bayt === open.bayt && open.part === 'sadr')) {
          bayt = { sadr: [], ajuz: [], ...(v.part === 'single' ? { single: true } : {}) };
          bayts.push(bayt);
        }
        open.sink = { inl: v.part === 'ajuz' ? bayt.ajuz : bayt.sadr };
        appendLine(open.sink, line, ctx, before, segs);
      }
      open.bayt = v.bayt;
      open.part = v.part;
    }
  }

  /**
   * A block of the back-of-book index: its group letter, then each entry it
   * holds (the entries with no page of their own that head a sub-entry, and
   * the sub-entry) as a paragraph of its own, classed by depth
   * (`pt-index-l1`, `pt-index-l2`…). The engine marks the first line of
   * each entry with its level (`VDTLine.indexLevel`); in an older document
   * an entry starts on a line set at its level's indent, its turnover lines
   * hanging `turnoverIndent` further in (`indexDirective.ts`). `cont` is
   * the sink of the entry a later fragment's first lines go on.
   */
  private indexEntries(block: VDTBlock, state: Container, key: string, cont?: TextSink): void {
    let lines = block.lines;
    const pages = this.takePages();
    const hinted = block.indexLevel !== undefined;
    const entries: { level: number; lines: VDTLine[] }[] = [];
    if (hinted) {
      // Lines before the first entry: the run-on of the entry `cont` holds,
      // or the group's letter.
      const first = lines.findIndex((l) => l.indexLevel !== undefined);
      const lead = first < 0 ? lines : lines.slice(0, first);
      if (lead.length > 0 && cont) {
        this.appendBlockLines(cont, block, lead, pages.splice(0));
      } else if (lead.length > 0) {
        const group: ParagraphNode = { k: 'p', inl: [], cls: ['pt-index-group'] };
        state.nodes.push(group);
        this.appendBlockLines({ inl: group.inl }, block, lead, pages.splice(0));
      }
      for (const line of first < 0 ? [] : lines.slice(first)) {
        if (line.indexLevel !== undefined) entries.push({ level: line.indexLevel, lines: [line] });
        else entries[entries.length - 1]!.lines.push(line);
      }
    } else {
      // A group letter of the index, set as the first line of its first
      // entry in a face of its own: a paragraph of its own.
      const head = lines[0]!.segments ?? [];
      const letter = lines.length > 1 && head.some((g) => g.kind === 'text') && head.every((g) => g.kind === 'space' || (g.fontString !== undefined && g.pageLink === undefined));
      if (letter) {
        const group: ParagraphNode = { k: 'p', inl: [], cls: ['pt-index-group'] };
        state.nodes.push(group);
        this.appendBlockLines({ inl: group.inl }, block, lines.slice(0, 1), pages.splice(0));
        lines = lines.slice(1);
      }
      const cfg = this.config.index;
      const dpi = this.config.page.dpi;
      const sizePx = dimensionToPx(cfg.fontSize, dpi, this.bodyPx);
      const indentPx = dimensionToPx(cfg.indent, dpi, sizePx);
      const turnoverPx = dimensionToPx(cfg.turnoverIndent, dpi, sizePx);
      let lastX = 0;
      for (const line of lines) {
        const x = line.bbox.x - block.bbox.x;
        const last = entries[entries.length - 1];
        if (last && Math.abs(x - (lastX + turnoverPx)) < 1) {
          last.lines.push(line);
        } else {
          entries.push({ level: indentPx > 0 ? Math.max(0, Math.round(x / indentPx)) : 0, lines: [line] });
          lastX = x;
        }
      }
    }
    let top: Node | undefined;
    for (const [i, entry] of entries.entries()) {
      const node: ParagraphNode = {
        k: 'p',
        inl: [],
        cls: ['pt-index-entry', ...(entry.level > 0 ? [`pt-index-l${Math.min(entry.level, 3)}`] : [])],
        ...(block.direction ? { dir: block.direction } : {}),
      };
      state.nodes.push(node);
      top = this.topOf(state, node);
      // The last entry takes the lines of the block's next fragment.
      const sink = i === entries.length - 1 ? this.newSink(key, node.inl, top) : { inl: node.inl };
      this.appendBlockLines(sink, block, entry.lines, i === 0 ? pages : []);
      if (!this.floating && !this.book.index) this.book.index = { file: this.file!, id: (node.id ??= `b-${++this.counters.block}`) };
    }
    if (top) this.record(block, top);
  }

  private quote(block: VDTBlock, root: Container, key: string): void {
    const state = this.enter(block, root);
    if (!state.quote) {
      state.quote = { k: 'quote', children: [] };
      state.nodes.push(state.quote);
    }
    const node: ParagraphNode = { k: 'p', inl: [], ...(block.direction ? { dir: block.direction } : {}) };
    state.quote.children.push(node);
    const top = this.topOf(state, state.quote);
    const sink = this.newSink(key, node.inl, top);
    this.appendBlockLines(sink, block, block.lines, this.takePages());
    this.record(block, top);
  }

  private listItem(block: VDTBlock, root: Container, key: string): void {
    const state = this.enter(block, root);
    const depth = block.listDepth ?? 1;
    const lists = state.lists;
    while (lists.length > 0 && lists[lists.length - 1]!.depth > depth) lists.pop();
    let top = lists[lists.length - 1];
    if (top && top.depth === depth && top.kind !== block.listKind) {
      lists.pop();
      top = lists[lists.length - 1];
    }
    if (!top || top.depth < depth) {
      const node: ListNode = { k: 'list', ordered: block.listKind === 'ordered', task: block.listKind === 'task', items: [] };
      (top?.lastItem?.children ?? state.nodes).push(node);
      top = { depth, kind: block.listKind, node };
      lists.push(top);
    }
    const marker = [block.prefixText, block.bulletText, block.separatorText].filter(Boolean).join('');
    const item: ListItemNode = {
      inl: [],
      children: [],
      ...(marker ? { marker } : {}),
      ...(block.strikethroughText ? { done: true } : {}),
      ...(block.direction ? { dir: block.direction } : {}),
    };
    top.node.items.push(item);
    top.lastItem = item;
    const topNode = this.topOf(state, lists[0]!.node);
    const sink = this.newSink(key, item.inl, topNode);
    this.appendBlockLines(sink, block, block.lines, this.takePages());
    this.record(block, topNode);
  }

  /** A row of a `:::toc`: its number, its title (the leader and page
   *  number dropped: the row links to the heading instead) and the
   *  subtitle lines under it. */
  private tocRow(block: VDTBlock, root: Container, key: string): void {
    const state = this.enter(block, root);
    if (!state.toc) {
      state.toc = { k: 'toc', pre: this.takePages(), rows: [] };
      state.nodes.push(state.toc);
      if (!this.floating && !this.book.contents) this.book.contents = { file: this.file!, id: `toc-${++this.counters.block}` };
    }
    const top = this.topOf(state, state.toc);
    if (block.tocPart) {
      const p = block.tocPart;
      const row: TocRowNode = {
        ...(p.number ? { number: p.number } : {}),
        inl: [{ t: 'text', text: p.title, fmt: {} }],
        subtitle: [],
        ...(p.pageIndex !== undefined ? { page: p.pageIndex } : {}),
        part: true,
        title: p.title,
      };
      state.toc.rows.push(row);
      this.record(block, top);
      return;
    }
    const lines = block.lines;
    const isLabel = (s: VDTLineSegment) => s.kind === 'space' || (s.kind === 'text' && s.fontString !== undefined);
    let labelLine = -1;
    let cut = 0;
    for (let i = 0; i < lines.length && labelLine < 0; i++) {
      const segs = lines[i]!.segments ?? [];
      const lastText = [...segs].reverse().find((s) => s.kind !== 'space');
      if (lastText?.kind === 'text' && lastText.fontString !== undefined) {
        labelLine = i;
        cut = segs.length;
        while (cut > 0 && isLabel(segs[cut - 1]!)) cut--;
      }
    }
    const ctx = this.ctx(block);
    const title: TextSink = { inl: [] };
    const subtitle: TextSink = { inl: [] };
    lines.forEach((line, i) => {
      if (labelLine >= 0 && i > labelLine) appendLine(subtitle, line, ctx);
      else appendLine(title, line, ctx, [], i === labelLine ? (line.segments ?? []).slice(0, cut) : undefined);
    });
    const row: TocRowNode = {
      ...(block.bulletText ? { number: block.bulletText } : {}),
      inl: title.inl,
      subtitle: subtitle.inl,
      ...(block.tocEntry?.pageIndex !== undefined ? { page: block.tocEntry.pageIndex } : {}),
      title: plainText(title.inl),
    };
    state.toc.rows.push(row);
    this.newSink(key, row.inl, top).prev = lines[labelLine >= 0 ? labelLine : lines.length - 1];
    this.record(block, top);
  }

  private math(block: VDTBlock, root: Container): void {
    const state = this.enter(block, root);
    const render = block.mathRender;
    const node: MathNode = {
      k: 'math',
      pre: this.takePages(),
      tex: render?.tex ?? block.tex ?? '',
      svg: '',
    };
    if (render && !render.error) {
      node.svg = mathSvg(render, fontPx(block.fontString), false);
      this.book.maths = true;
    }
    state.nodes.push(node);
    this.record(block, this.topOf(state, node));
  }

  private resource(block: VDTBlock, root: Container): void {
    const rb = block.resourceBlock;
    if (!rb) return;
    const res = rb.resource;
    const state = this.enter(block, root);
    const ctx = this.ctx({ fontString: rb.captionFontString });
    const lines = (ls: readonly VDTLine[]): InlineItem[] => {
      const sink: TextSink = { inl: [] };
      for (const l of ls) appendLine(sink, l, ctx);
      return sink.inl;
    };
    const captionAbove = this.config.captionStyle.position === 'above';
    if (rb.kind === 'table' && rb.table) {
      let node = this.tables.get(res.id);
      if (!node) {
        node = {
          k: 'table',
          id: idOf('res-', res.id),
          pre: this.takePages(),
          caption: lines(rb.captionLines),
          captionAbove,
          note: [],
          headerRows: res.table?.model.headerRowCount ?? 0,
          ...(res.table?.model.columnWidths ? { columnWidths: res.table.model.columnWidths } : {}),
          cells: new Map(),
        };
        this.tables.set(res.id, node);
        state.nodes.push(node);
        if (!this.book.resources.has(res.id)) this.book.resources.set(res.id, { file: this.file!, id: node.id });
        this.record(block, this.topOf(state, node));
      }
      if (rb.noteLines.length > 0 && node.note.length === 0) node.note = lines(rb.noteLines);
      const cellCtx = this.ctx({ fontString: rb.table.fontString });
      for (const cell of rb.table.cells) {
        const k = `${cell.row}:${cell.col}`;
        if (node.cells.has(k)) continue;
        const sink: TextSink = { inl: [] };
        for (const l of cell.lines) appendLine(sink, l, cellCtx);
        const c: TableCellNode = {
          row: cell.row,
          col: cell.col,
          colSpan: cell.colSpan,
          rowSpan: cell.rowSpan,
          header: cell.isHeader,
          align: cell.align,
          verticalAlign: cell.verticalAlign,
          inl: sink.inl,
          ...(cell.background ? { background: cell.background } : {}),
          ...(cell.alternate ? { alternate: true } : {}),
        };
        if (cell.image) {
          const alt = cell.image.altText ?? '';
          c.image = {
            fileId: cell.image.fileId,
            alt,
            ...(cell.rect.width > 0 ? { width: Math.min(1, cell.image.rect.width / cell.rect.width) } : {}),
          };
          this.book.images.add(cell.image.fileId);
          if (alt) this.book.altText = true;
          else this.book.missingAlt = true;
        }
        node.cells.set(k, c);
      }
      return;
    }
    if (this.figures.has(res.id)) return;
    this.figures.add(res.id);
    const caption = lines(rb.captionLines);
    const alt = (res.altText?.trim() || plainCaption(res.caption) || '').trim();
    const node: FigureNode = {
      k: 'figure',
      id: idOf('res-', res.id),
      pre: this.takePages(),
      ...(rb.fileId ? { fileId: rb.fileId } : {}),
      alt,
      caption,
      captionAbove,
      note: lines(rb.noteLines),
    };
    if (rb.fileId) this.book.images.add(rb.fileId);
    if (alt) this.book.altText = true;
    else this.book.missingAlt = true;
    state.nodes.push(node);
    if (!this.book.resources.has(res.id)) this.book.resources.set(res.id, { file: this.file!, id: node.id });
    this.record(block, this.topOf(state, node));
  }

  // --- floats --------------------------------------------------------------

  /** Read a float group where it belongs: after the text block with the
   *  highest content index up to its own, after the floats already read
   *  there; ahead of the document's first block when none comes before. */
  private readFloat(group: VDTBlock[]): void {
    const index = group[0]!.contentIndex;
    let anchor: (typeof this.flow)[number] | undefined;
    if (index !== undefined) {
      for (let i = this.flow.length - 1; i >= 0; i--) {
        if (this.flow[i]!.index <= index) {
          anchor = this.flow[i];
          break;
        }
      }
    }
    // The float is read in the document its anchor is in: the ids it
    // registers (a figure, an anchor in a floated box) belong there.
    const first = this.flow[0];
    const file = anchor?.file ?? first?.file ?? this.file!;
    const temp: Container = { nodes: [], lists: [] };
    const saved = { container: this.lastContainer, file: this.file };
    this.floating = true;
    this.lastContainer = undefined;
    this.file = file;
    try {
      for (const block of group) this.place(block, temp);
    } finally {
      this.floating = false;
      this.lastContainer = saved.container;
      this.file = saved.file;
    }
    if (temp.nodes.length === 0) return;
    if (!anchor) {
      const at = first ? Math.max(0, file.nodes.indexOf(first.top)) : file.nodes.length;
      file.nodes.splice(at, 0, ...temp.nodes);
      return;
    }
    const nodes = file.nodes;
    const after = nodes.indexOf(this.placedAfter.get(anchor.top) ?? anchor.top);
    nodes.splice(after >= 0 ? after + 1 : nodes.length, 0, ...temp.nodes);
    this.placedAfter.set(anchor.top, temp.nodes[temp.nodes.length - 1]!);
  }


  // --- pull quotes ---------------------------------------------------------

  /**
   * Pull quotes: a box of text alone (untitled, or titled with marks
   * alone) whose words (twenty letters or more)
   * the chapter's running text also reads (letters and digits compared,
   * case aside; an ellipsis in the box may stand for words left out) is
   * marked `'echo'`, and the
   * serializer hides it from assistive technology, so its words are read
   * once, where the text has them. A box whose style id names it a pull
   * quote (`pullquote`, `pull-quote`…) but whose words are its own stays
   * readable (`'own'`).
   */
  private markPullQuotes(): void {
    const files = this.book.files.filter((f) => f.doc === this.index);
    const text: string[] = [];
    const boxes: CalloutNode[] = [];
    const collect = (nodes: readonly Node[]): void => {
      for (const n of nodes) {
        switch (n.k) {
          case 'callout':
            boxes.push(n);
            break;
          case 'p':
          case 'h':
            text.push(plainText(n.inl));
            break;
          case 'quote':
            collect(n.children);
            break;
          case 'list': {
            const items = (list: ListNode): void => {
              for (const item of list.items) {
                text.push(plainText(item.inl));
                collect(item.children);
              }
            };
            items(n);
            break;
          }
          case 'verse':
            for (const b of n.bayts) text.push(plainText(b.sadr), plainText(b.ajuz));
            break;
          default:
            break;
        }
      }
    };
    for (const f of files) collect(f.nodes);
    if (boxes.length === 0) return;
    const body = letters(text.join(' '));
    for (const box of boxes) {
      const named = /pull[\s_-]?quote/i.test(box.styleId ?? '');
      // A title of marks alone (a hanging quotation mark) is decoration.
      const echoed = letters(box.title ?? '') === '' && box.children.length > 0 && box.children.every((c) => c.k === 'p' || c.k === 'quote') && echoes(box, body);
      if (echoed) box.pullQuote = 'echo';
      else if (named) box.pullQuote = 'own';
    }
  }

  // --- notes ---------------------------------------------------------------

  private note(block: VDTBlock): void {
    const id = block.footnoteNote!;
    let note = this.notes.get(id);
    if (!note) {
      note = { doc: this.index, id, inl: [], sink: { inl: [] }, ...(block.direction ? { dir: block.direction } : {}) };
      note.inl = note.sink.inl;
      this.notes.set(id, note);
    }
    const saved = this.floating;
    this.floating = true;
    try {
      appendLines(note.sink, block.lines, this.ctx(block));
    } finally {
      this.floating = saved;
    }
  }

  /** Each note goes to the document of its first marker (the last
   *  document when no marker was read). */
  private finishNotes(): void {
    for (const note of this.notes.values()) {
      const loc = this.book.notes.get(`${this.index}:${note.id}`);
      const file = loc?.file ?? this.file!;
      if (!loc) this.book.notes.set(`${this.index}:${note.id}`, { file, id: idOf('fn-', note.id) });
      file.notes.push({ doc: note.doc, id: note.id, inl: note.inl, ...(note.dir ? { dir: note.dir } : {}) });
    }
  }
}

/** The letters and digits of a text, lower case: what two settings of
 *  the same words share whatever their quotation marks, dashes and
 *  spacing. */
function letters(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Whether the words of a box are read in `body` (see `letters`): each run
 *  between the ellipses that mark words left out, in order. */
function echoes(box: CalloutNode, body: string): boolean {
  const words = box.children
    .flatMap((c) => (c.k === 'p' ? [c] : c.k === 'quote' ? c.children : []))
    .map((p) => plainText(p.inl))
    .join(' ');
  const runs = words.split(/\[?(?:…|\.\.\.)\]?/).map(letters).filter((r) => r.length > 0);
  // A few words can repeat the text by chance: a pull quote is a sentence.
  if (runs.reduce((n, r) => n + r.length, 0) < 20) return false;
  let at = 0;
  for (const run of runs) {
    const found = body.indexOf(run, at);
    if (found < 0) return false;
    at = found + run.length;
  }
  return true;
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A resource caption as plain text (its Markdown marks dropped). */
function plainCaption(caption: string | undefined): string {
  return (caption ?? '').replace(/[*_`~^]/g, '').replace(/:\w+\[([^\]]*)\]\{[^}]*\}/g, '$1').replace(/:\w+\{[^}]*\}/g, '').trim();
}

/** The paragraph style a block of a `:::paragraphs` container was set in,
 *  told by its type (the block keeps no style id): a block set otherwise
 *  than the body text whose family, size, slant and alignment match one
 *  style alone. */
function paragraphStyleOf(block: VDTBlock, config: ResolvedConfig, bodyPx: number): string | undefined {
  const px = fontPx(block.fontString);
  const italic = /\bitalic\b/.test(block.fontString);
  const familyOf = (f: string) => primaryFontFamily(f).replace(/^['"]|['"]$/g, '');
  const body = config.bodyText;
  const asBody = Math.abs(px - bodyPx) < 0.01 && !italic && block.textAlign === body.textAlign && block.fontString.includes(familyOf(body.fontFamily));
  if (asBody) return undefined;
  const matches = config.paragraphStyles.filter((s) => {
    const size = dimensionToPx(s.fontSize, config.page.dpi, bodyPx);
    return Math.abs(size - px) < 0.01 && s.italic === italic && s.textAlign === block.textAlign && block.fontString.includes(familyOf(s.fontFamily));
  });
  return matches.length === 1 ? matches[0]!.id : undefined;
}
