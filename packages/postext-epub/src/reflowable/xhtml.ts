// The semantic model to EPUB 3 XHTML content documents: one per chapter
// (or part opener), with its footnotes after the text.

import { bidiClassOf, comicPanelSvg, isHlsMimeType, mediaFragment, type VDTResourceVideo } from 'postext';
import type {
  ComicNode,
  FileModel,
  InlineItem,
  LinkTarget,
  ListNode,
  Node,
  TableCellNode,
  TableNode,
  TocNode,
  StanzaNode,
  CodeNode,
  TabItem,
  VerseNode,
  WrapFloat,
} from './model';
import { bridgeLinks, formatKey, idOf, linkKey, wrapFormat, xmlAttr, xmlText } from './inline';

/** Style id of a code listing's box (`postext` `CODE_BOX_STYLE_ID`). */
const CODE_BOX_STYLE = '__postext-code';
/** Style ids of the frameless boxes of `:::columns` groups in the running
 *  text (`postext` `FLOW_COLUMNS_STYLE_ID`, #634). */
const FLOW_COLUMNS_STYLES: ReadonlySet<string> = new Set(['__postext-flow-columns', '__postext-flow-columns-page']);
import type { BookModel, Loc } from './walk';

/** What a content document needs from the rest of the book. */
export interface SerializeContext {
  book: BookModel;
  /** The book's title (`<title>` of a document without heading). */
  bookTitle: string;
  /** Href of a picture relative to the package document, or undefined. */
  imageHref(fileId: string): string | undefined;
  /** The href of a self-hosted video's file (#454), when the book carries it. */
  videoHref?(fileId: string): string | undefined;
  /** Href of the stylesheet relative to the package document. */
  stylesheet: string;
  /** Accessible name of a note's link back to its marker. */
  backLabel(lang: string): string;
}

/** `to` (relative to the package document) seen from `from`'s folder. */
export function relativeHref(from: string, to: string): string {
  const a = from.split('/').slice(0, -1);
  const b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('/');
}

/** Cell alignments of a right-to-left book as logical values. */
const CELL_ALIGN_RTL: Readonly<Record<string, string>> = { right: 'end' };

function locHref(loc: Loc, from: FileModel): string {
  return loc.file === from ? `#${loc.id}` : `${relativeHref(from.href, loc.file.href)}#${loc.id}`;
}

/** The level the first strong letter of `text` asks for over a paragraph
 *  at level `base`: the lowest odd level from `base` for a right-to-left
 *  letter (UAX #9 classes R, AL), the lowest even one for a left-to-right
 *  letter (L); undefined when it has none (spaces, digits, punctuation). */
function strongLevel(text: string, base: number): number | undefined {
  for (const ch of text) {
    const cls = bidiClassOf(ch.codePointAt(0)!);
    if (cls === 'L') return base % 2 === 0 ? base : base + 1;
    if (cls === 'R' || cls === 'AL') return base % 2 === 1 ? base : base + 1;
  }
  return undefined;
}

/** Whether `items` hold a letter of either direction. */
function hasStrong(items: readonly InlineItem[]): boolean {
  return items.some((i) => i.t === 'raw' || (i.t === 'text' && strongLevel(i.text, 0) !== undefined));
}

/**
 * The embedding level of every item of a paragraph whose own level is
 * `base` (0 left to right, 1 right to left), or undefined when none rises
 * above it (every left-to-right paragraph of a left-to-right book, every
 * Arabic one with no Latin or digit run). The levels are the engine's
 * (`InlineItem.lvl`), as it resolved the paragraph with the author's
 * isolates (`:ltr[…]`, `:rtl[…]`). An item without one — a line with no
 * right-to-left run, a heading set from its source title, the space
 * that joins two lines — takes the level its first strong letter asks
 * for, and a neutral one (a space, a page start, an anchor, digits) the
 * lower of its neighbours' when both rise above `base`, else `base`: as
 * UAX #9 resolves a neutral between two runs of one direction (N1).
 */
export function bidiLevels(items: readonly InlineItem[], base: number): number[] | undefined {
  const known: (number | undefined)[] = items.map((item) => {
    const lvl = item.t === 'text' || item.t === 'raw' ? item.lvl : undefined;
    // Below the paragraph's level: a segment the engine gave no level of
    // its own (a verse gap, an inserted mark).
    if (lvl !== undefined && lvl >= base) return lvl;
    return item.t === 'text' ? strongLevel(item.text, base) : undefined;
  });
  if (!known.some((l) => l !== undefined && l > base)) return undefined;
  // The nearest known level after each item.
  const after = new Array<number | undefined>(items.length);
  for (let i = items.length - 1, next: number | undefined; i >= 0; i--) {
    after[i] = next;
    if (known[i] !== undefined) next = known[i];
  }
  const out = new Array<number>(items.length);
  let prev: number | undefined;
  for (let i = 0; i < items.length; i++) {
    const own = known[i];
    if (own !== undefined) {
      out[i] = prev = own;
      continue;
    }
    const next = after[i];
    out[i] = prev !== undefined && next !== undefined ? Math.max(base, Math.min(prev, next)) : base;
  }
  return out;
}

class Writer {
  private svgCount = 0;
  private comicCount = 0;
  /** The direction the inline content written now is set in: the
   *  document's, or a block's that differs from it. */
  private dir: 'ltr' | 'rtl';

  constructor(
    private readonly ctx: SerializeContext,
    private readonly file: FileModel,
  ) {
    this.dir = file.dir ?? 'ltr';
  }

  /** `write()` with the inline content in `dir` (when given). */
  private within<T>(dir: 'ltr' | 'rtl' | undefined, write: () => T): T {
    if (!dir || dir === this.dir) return write();
    const saved = this.dir;
    this.dir = dir;
    try {
      return write();
    } finally {
      this.dir = saved;
    }
  }

  private target(link: LinkTarget): string | undefined {
    const { book } = this.ctx;
    let loc: Loc | undefined;
    switch (link.kind) {
      case 'url':
        return link.href;
      case 'anchor':
        loc = book.anchors.get(link.id);
        break;
      case 'resource':
        loc = book.resources.get(link.id);
        break;
      case 'note':
        loc = book.notes.get(`${link.doc}:${link.id}`);
        break;
      case 'page':
        loc = book.pages.get(link.bookIndex)?.loc;
        break;
    }
    return loc && loc.id ? locHref(loc, this.file) : undefined;
  }

  private openLink(link: LinkTarget): string | undefined {
    const href = this.target(link);
    if (href === undefined) return undefined;
    const h = xmlAttr(href);
    switch (link.kind) {
      case 'url':
        return `<a href="${h}">`;
      case 'note':
        return `<a epub:type="noteref" role="doc-noteref" class="pt-noteref" href="${h}"${link.first ? ` id="${idOf('fnref-', link.id)}"` : ''}>`;
      case 'page':
        return `<a class="pt-pageref" href="${h}">`;
      default:
        return `<a class="pt-ref" href="${h}">`;
    }
  }

  /** An SVG with ids of its own: formulas reuse MathJax's glyph ids
   *  (`MJX-…`), and a content document may hold each id once. */
  private uniqueIds(markup: string): string {
    if (!markup.includes('<svg') || !/\sid="/.test(markup)) return markup;
    const suffix = `-s${++this.svgCount}`;
    const ids = new Set([...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));
    return markup
      .replace(/(\sid=")([^"]+)"/g, (_, a: string, id: string) => `${a}${id}${suffix}"`)
      .replace(/((?:xlink:)?href="#)([^"]+)"/g, (whole, a: string, id: string) => (ids.has(id) ? `${a}${id}${suffix}"` : whole))
      .replace(/url\(#([^)]+)\)/g, (whole, id: string) => (ids.has(id) ? `url(#${id}${suffix})` : whole));
  }

  private pageMark(bookIndex: number): string {
    const page = this.ctx.book.pages.get(bookIndex);
    if (!page) return '';
    return `<span epub:type="pagebreak" role="doc-pagebreak" id="page-${bookIndex + 1}" aria-label="${xmlAttr(page.label)}"></span>`;
  }

  /** Inline items as markup. Runs set in the other direction than their
   *  paragraph (a Latin name in Arabic text, an Arabic quotation in
   *  English) are bidi isolates, `<span dir>`, nested as
   *  deep as their levels go, so a reading system orders them as the
   *  printed line did whatever its neighbours (#402). Runs with no letter
   *  in them (digits, punctuation) resolve the same without one and are
   *  left bare. */
  inline(items: InlineItem[]): string {
    if (items.some((i) => i.t === 'tab')) return this.tabbed(items);
    const base = this.dir === 'rtl' ? 1 : 0;
    const levels = bidiLevels(items, base);
    return levels ? this.nested(items, levels, base) : this.flat(items);
  }

  /**
   * Items holding tabs at their stops (#622). A reflowed page cannot keep
   * the stops: each line of the text that holds a tab (lines end at the
   * author's breaks, `<br/>`) is written as a flex row of the parts
   * between its tabs. An end, centre or decimal stop, or one with a
   * leader, is a filler that pushes the next part to the row's end, its
   * leader a dotted or solid border; a start stop keeps the part before it
   * at least as wide as in print, and the part after it takes the rest of
   * the row and wraps there.
   */
  private tabbed(items: InlineItem[]): string {
    const lines: InlineItem[][] = [[]];
    for (const item of items) {
      if (item.t === 'raw' && item.xhtml === '<br/>') lines.push([]);
      else lines[lines.length - 1]!.push(item);
    }
    let out = '';
    let prevRow = false;
    lines.forEach((line, k) => {
      const row = line.some((i) => i.t === 'tab');
      if (k > 0 && !row && !prevRow) out += '<br/>';
      prevRow = row;
      if (!row) {
        out += this.inline(line);
        return;
      }
      const parts: InlineItem[][] = [[]];
      const tabs: TabItem[] = [];
      for (const item of line) {
        if (item.t === 'tab') {
          tabs.push(item);
          parts.push([]);
        } else {
          parts[parts.length - 1]!.push(item);
        }
      }
      out += '<span class="pt-tab-row">';
      parts.forEach((part, j) => {
        const tab = tabs[j];
        const min = tab && !tab.fill && tab.minEm !== undefined ? ` style="min-width:${Math.max(0, Math.round((tab.minEm - 0.5) * 100) / 100)}em"` : '';
        const rest = j > 0 && !tabs[j - 1]!.fill ? ' pt-tab-rest' : '';
        out += `<span class="pt-tab-part${rest}"${min}>${this.inline(part)}</span>`;
        if (tab) {
          const leader = tab.leader ? ` pt-leader-${tab.leader === 'rule' ? 'rule' : 'dots'}` : '';
          out += `<span class="${tab.fill ? 'pt-tab-fill' : 'pt-tab-gap'}${leader}" aria-hidden="true"></span>`;
        }
      });
      out += '</span>';
    });
    return out;
  }

  private nested(items: InlineItem[], levels: readonly number[], base: number): string {
    // A run above `base` with no letter in it (the digits of `١٤٤٥` or of
    // a caption label) reads the same without an isolate: it stays with
    // its neighbours, whose formats and links then make one element.
    const lv = [...levels];
    for (let i = 0; i < lv.length;) {
      let j = i + 1;
      if (lv[i]! > base) {
        while (j < lv.length && lv[j]! > base) j++;
        if (!hasStrong(items.slice(i, j))) lv.fill(base, i, j);
      }
      i = j;
    }
    let out = '';
    let i = 0;
    while (i < items.length) {
      const above = lv[i]! > base;
      let j = i + 1;
      while (j < items.length && lv[j]! > base === above) j++;
      const run = items.slice(i, j);
      out += above
        ? `<span dir="${base % 2 === 0 ? 'rtl' : 'ltr'}">${this.nested(run, lv.slice(i, j), base + 1)}</span>`
        : this.flat(run);
      i = j;
    }
    return out;
  }

  private flat(items: InlineItem[]): string {
    // A tab never reaches here (see `tabbed`): one that did reads as a space.
    const inl = bridgeLinks(items.map((it): InlineItem => (it.t === 'tab' ? { t: 'text', text: ' ', fmt: {} } : it))) as Exclude<InlineItem, TabItem>[];
    let out = '';
    let i = 0;
    while (i < inl.length) {
      const item = inl[i]!;
      if (item.t === 'page') {
        out += this.pageMark(item.bookIndex);
        i++;
        continue;
      }
      if (item.t === 'anchor') {
        out += `<span id="${xmlAttr(item.id)}"></span>`;
        i++;
        continue;
      }
      // A run of items sharing one link.
      const key = linkKey(item.link);
      let j = i;
      let body = '';
      while (j < inl.length) {
        const it = inl[j]!;
        if (it.t === 'page' || it.t === 'anchor' || linkKey(it.link) !== key) break;
        if (it.t === 'raw') {
          body += this.uniqueIds(it.xhtml);
          j++;
          continue;
        }
        // Consecutive runs in one format are one element.
        let text = it.text;
        const fk = formatKey(it.fmt);
        let k = j + 1;
        while (k < inl.length) {
          const nx = inl[k]!;
          if (nx.t !== 'text' || linkKey(nx.link) !== key || formatKey(nx.fmt) !== fk) break;
          text += nx.text;
          k++;
        }
        body += wrapFormat(xmlText(text), it.fmt);
        j = k;
      }
      const open = item.link ? this.openLink(item.link) : undefined;
      out += open ? `${open}${body}</a>` : body;
      i = j;
    }
    return out;
  }

  private dirAttr(dir: 'ltr' | 'rtl' | undefined): string {
    return dir ? ` dir="${dir}"` : '';
  }

  private classAttr(cls: readonly (string | false | undefined)[] | undefined): string {
    const list = (cls ?? []).filter(Boolean);
    return list.length > 0 ? ` class="${list.join(' ')}"` : '';
  }

  nodes(nodes: readonly Node[]): string {
    return nodes.map((n) => this.node(n)).join('\n');
  }

  private node(node: Node): string {
    switch (node.k) {
      case 'p':
        return `<p${node.id ? ` id="${node.id}"` : ''}${this.classAttr(node.cls)}${this.dirAttr(node.dir)}>${this.within(node.dir, () => this.inline(node.inl))}</p>`;
      case 'h':
        return `<h${node.level} id="${node.id}"${this.classAttr(node.cls)}${this.dirAttr(node.dir)}>${this.within(node.dir, () => this.inline(node.inl))}</h${node.level}>`;
      case 'quote':
        return `<blockquote>\n${this.nodes(node.children)}\n</blockquote>`;
      case 'list':
        return this.list(node);
      case 'callout': {
        // A code listing's box (#624): a plain block, its title over the
        // listing.
        if (node.styleId === CODE_BOX_STYLE) {
          const heading = node.title ? `<p class="pt-code-title">${xmlText(node.title)}</p>\n` : '';
          return `<div class="pt-code-box">\n${heading}${this.nodes(node.children)}\n</div>`;
        }
        // A `:::columns` group of the running text (#634): its blocks in
        // reading order, one column on a reflowable page.
        if (node.styleId && FLOW_COLUMNS_STYLES.has(node.styleId)) {
          return `<div class="pt-columns">\n${this.nodes(node.children)}\n</div>`;
        }
        const title = node.title ? `<p class="pt-callout-title">${xmlText(node.title)}</p>\n` : '';
        // A pull quote keeps its box on the page; one that repeats the
        // text is hidden from assistive technology (`doc-pullquote`, a
        // presentational role), so its words are read once.
        const pull = node.pullQuote
          ? ` epub:type="pullquote"${node.pullQuote === 'echo' ? ' role="doc-pullquote" aria-hidden="true"' : ''}`
          : '';
        const wrap = this.wrapAttrs(node.wrap);
        return `<aside${this.classAttr(['pt-callout', node.styleId && idOf('pt-callout-', node.styleId), node.pullQuote && 'pt-pullquote', wrap.cls])}${wrap.style}${pull}>\n${title}${this.nodes(node.children)}\n</aside>`;
      }
      case 'figure':
        return this.figure(node);
      case 'table':
        return this.table(node);
      case 'math': {
        const pre = this.inline(node.pre);
        if (!node.svg) return `${pre ? `<div>${pre}</div>\n` : ''}<p class="pt-math-display"><code>${xmlText(node.tex)}</code></p>`;
        return `<div class="pt-math-display" role="math" aria-label="${xmlAttr(node.tex)}">${pre}${this.uniqueIds(node.svg)}</div>`;
      }
      case 'verse':
        return this.verse(node);
      case 'stanza':
        return this.stanza(node);
      case 'code':
        return this.code(node);
      case 'toc':
        return this.toc(node);
      case 'marker':
        return `<div class="pt-marker">${this.inline(node.inl)}</div>`;
      case 'comic':
        return this.comic(node);
    }
  }

  /**
   * A comic page (#565): each panel a figure with its picture — an SVG
   * whose view box is the panel, so it shows the part of the picture the
   * page prints, clipped to the panel's outline, with its border and
   * pop-out — named by its text alternative, then its lettering in reading
   * order: `<b>Speaker</b>: words`, captions as narration, sound effects
   * in italics. A panel's picture is as wide as the text at most.
   */
  private comic(node: ComicNode): string {
    const pre = this.inline(node.pre);
    const panels = node.panels.map((p) => {
      const parts: string[] = [];
      if (p.panel.art) {
        const svg = comicPanelSvg(p.panel, {
          href: (art) => {
            const href = this.ctx.imageHref(art.fileId);
            return href ? relativeHref(this.file.href, href) : undefined;
          },
          clipId: `comic-clip-${++this.comicCount}`,
          ...(p.panel.altText ? { label: p.panel.altText } : {}),
          standalone: {},
        });
        parts.push(`<figure class="pt-comic-panel"${p.id ? ` id="${p.id}"` : ''}>${svg}</figure>`);
      } else if (p.id) {
        parts.push(`<span id="${p.id}"></span>`);
      }
      for (const line of p.lines) {
        if (line.kind === 'sfx') parts.push(`<p class="pt-comic-sfx"><i>${xmlText(line.text)}</i></p>`);
        else if (line.kind === 'caption') parts.push(`<p class="pt-comic-caption">${xmlText(line.text)}</p>`);
        else parts.push(`<p class="pt-comic-line">${line.speaker ? `<b>${xmlText(line.speaker)}</b>: ` : ''}${xmlText(line.text)}</p>`);
      }
      return parts.join('\n');
    });
    const section = `<section class="pt-comic"${this.dirAttr(node.dir)}>${node.caption ? '' : pre}\n${panels.join('\n')}\n</section>`;
    if (!node.caption) return section;
    // A strip with a caption (#590): the strip and its caption are one
    // figure; the caption is its first or last child.
    const figcaption = `<figcaption>${this.caption(node.caption.inl)}</figcaption>`;
    const id = node.caption.id ? ` id="${node.caption.id}"` : '';
    return node.caption.above
      ? `<figure class="pt-comic-strip"${id}><figcaption>${pre}${this.caption(node.caption.inl)}</figcaption>\n${section}</figure>`
      : `<figure class="pt-comic-strip"${id}>${pre}${section}\n${figcaption}</figure>`;
  }

  /**
   * A `:::verse` poem (#378): one element per bayt, its ṣadr and its ʿajuz
   * as two cells of a grid (the style sheet's `.pt-bayt`): the ṣadr on the
   * start side, the ʿajuz on the end side, the rhymes aligned down the end
   * edge, as the printed poem sets them; a lone hemistich across both,
   * centred. The two halves are a space apart in the text, so a reading
   * system without grids, or a voice, reads the bayt as one line. The gap's
   * ornament is decoration (`aria-hidden`).
   */
  private verse(node: VerseNode): string {
    const pre = this.inline(node.pre);
    const bayts = this.within(node.dir, () => node.bayts.map((b) => {
      if (b.single) return `<p class="pt-bayt pt-bayt-single"><span class="pt-sadr">${this.inline(b.sadr)}</span></p>`;
      const ornament = b.ornament ? ` <span class="pt-verse-ornament" aria-hidden="true">${xmlText(b.ornament)}</span>` : '';
      return `<p class="pt-bayt"><span class="pt-sadr">${this.inline(b.sadr)}</span>${ornament} <span class="pt-ajuz">${this.inline(b.ajuz)}</span></p>`;
    }));
    return `<div${this.classAttr(['pt-verse', ...(node.cls ?? [])])}${this.dirAttr(node.dir)}>${pre}\n${bayts.join('\n')}\n</div>`;
  }

  /**
   * A stanza of a poem set line by line (#620): one element, each line of
   * verse a block-level span that hangs its turnovers (`padding-inline-
   * start` the line's indent plus the hang, `text-indent` the hang back),
   * so the reading system turns an overlong line over as the print does.
   */
  private stanza(node: StanzaNode): string {
    const pre = this.inline(node.pre);
    const hang = round2(node.hangEm);
    const lines = this.within(node.dir, () => node.lines.map((l) => {
      const style = `padding-inline-start: ${round2(l.indentEm + node.hangEm)}em; text-indent: -${hang}em`;
      const num = l.num !== undefined ? `<span class="pt-line-number" aria-hidden="true">${xmlText(l.num)}</span>` : '';
      return `<span class="pt-verse-line" style="${style}">${num}${this.inline(l.inl)}</span>`;
    }));
    return `<div${this.classAttr(['pt-stanza', ...(node.cls ?? [])])}${this.dirAttr(node.dir)}>${pre}\n${lines.join('\n')}\n</div>`;
  }

  /** A code listing (#624): `<pre><code>` as written, one source line a
   *  line, its tokens in their colours, the lines a fence highlights
   *  marked; the numbers, padded to one width, hidden from assistive
   *  technology. Read left to right in any book. */
  private code(node: CodeNode): string {
    const pre = this.inline(node.pre);
    const width = Math.max(0, ...node.lines.map((l) => l.num?.length ?? 0));
    const body = node.lines.map((l) => {
      const num = l.num !== undefined ? `<span class="pt-code-num" aria-hidden="true">${xmlText(l.num.padStart(width))}</span>` : '';
      const runs = l.runs.map((r) => {
        const decl = [r.color && `color:${r.color}`, r.bold && 'font-weight:bold', r.italic && 'font-style:italic'].filter(Boolean).join(';');
        return decl ? `<span style="${xmlAttr(decl)}">${xmlText(r.text)}</span>` : xmlText(r.text);
      }).join('');
      return num + (l.highlight ? `<mark class="pt-code-hl">${runs}</mark>` : runs);
    }).join('\n');
    const lang = node.lang ? ` class="language-${xmlAttr(node.lang.replace(/[^\w+#.-]/g, ''))}"` : '';
    return `${pre ? `<div>${pre}</div>\n` : ''}<pre class="pt-code" dir="ltr"><code${lang}>${body}</code></pre>`;
  }

  private list(node: ListNode): string {
    const tag = node.ordered ? 'ol' : 'ul';
    const items = node.items.map((item) => {
      const marker = item.marker ? `<span class="pt-lbl">${xmlText(item.marker)}</span> ` : '';
      const body = this.within(item.dir, () => this.inline(item.done ? item.inl.map((i) => (i.t === 'text' ? { ...i, fmt: { ...i.fmt, done: true } } : i)) : item.inl));
      const nested = item.children.length > 0 ? `\n${this.nodes(item.children)}\n` : '';
      return `<li${this.dirAttr(item.dir)}>${marker}${body}${nested}</li>`;
    });
    return `<${tag}${this.classAttr([node.task && 'pt-tasks'])}>\n${items.join('\n')}\n</${tag}>`;
  }

  private caption(inl: InlineItem[]): string {
    return this.inline(inl);
  }

  /** A video (#454): a self-hosted file in the reader's own player; a
   *  YouTube or Vimeo one, or an HLS stream, as its poster, linked to the
   *  video unless `videoStyle.linkPoster` is off (an EPUB may not embed a
   *  web page's player: EPUBCheck RSC-006, nor play an HLS playlist). */
  private videoBody(video: VDTResourceVideo, posterSrc: string | undefined, alt: string): string {
    const label = alt || 'Video';
    if (video.source === 'file') {
      const own = video.fileId ? this.ctx.videoHref?.(video.fileId) : undefined;
      // An HLS stream is no media type an EPUB may play (#476): its poster
      // is printed, linked to it.
      const src = own ? relativeHref(this.file.href, own) : isHlsMimeType(video.mimeType) ? undefined : video.link;
      if (src) {
        const p = video.player;
        const attrs = [
          p.controls && ' controls="controls"',
          p.autoplay && ' autoplay="autoplay"',
          (p.autoplay || p.muted) && ' muted="muted"',
          p.loop && ' loop="loop"',
          ' playsinline="playsinline"',
          // Plays alongside the others (#507, see `withVideoScript`).
          !p.exclusive && ' data-pt-alongside="data-pt-alongside"',
          ` preload="${p.preload}"`,
          posterSrc && ` poster="${xmlAttr(posterSrc)}"`,
        ].filter(Boolean).join('');
        const range = mediaFragment(video);
        const fallback = video.link ? `<a href="${xmlAttr(video.link)}">${xmlText(label)}</a>` : xmlText(label);
        return `<video src="${xmlAttr(src + range)}"${attrs} aria-label="${xmlAttr(label)}">${fallback}</video>`;
      }
    }
    const picture = posterSrc
      ? `<img src="${xmlAttr(posterSrc)}" alt="${xmlAttr(label)}"/>`
      : `<span class="pt-missing" role="img" aria-label="${xmlAttr(label)}">${xmlText(label)}</span>`;
    return video.linkPoster && video.link ? `<a class="pt-video-link" href="${xmlAttr(video.link)}">${picture}</a>` : picture;
  }

  /** The class and style of a figure or a box text wrapped round in
   *  print (#627): floated to its side, its share of the text wide, the
   *  gap on the text's side. */
  private wrapAttrs(wrap: WrapFloat | undefined): { cls: string; style: string } {
    if (!wrap) return { cls: '', style: '' };
    const margin = wrap.side === 'left' ? `margin-right:${wrap.gap}%` : `margin-left:${wrap.gap}%`;
    return { cls: `pt-wrap pt-wrap-${wrap.side}`, style: ` style="width:${wrap.width}%;${margin}"` };
  }

  private figure(node: Extract<Node, { k: 'figure' }>): string {
    const href = node.fileId ? this.ctx.imageHref(node.fileId) : undefined;
    const body = node.video
      ? this.videoBody(node.video, href ? relativeHref(this.file.href, href) : undefined, node.alt)
      : href
        ? `<img src="${xmlAttr(relativeHref(this.file.href, href))}" alt="${xmlAttr(node.alt)}"/>`
        : `<div class="pt-missing" role="img" aria-label="${xmlAttr(node.alt || '?')}">${xmlText(node.alt)}</div>`;
    const pre = this.inline(node.pre);
    const note = node.note.length > 0 ? this.inline(node.note) : '';
    // A figcaption is the figure's first or last child: page starts go
    // before the picture, a note under the caption goes inside it (or after
    // the picture when there is no caption), a space apart, so a reader
    // without the style sheet, or reading the text aloud, does not run the
    // caption's last word into the note's first.
    const wrap = this.wrapAttrs(node.wrap);
    const open = `<figure id="${node.id}"${wrap.cls ? ` class="${wrap.cls}"` : ''}${wrap.style}>`;
    if (node.caption.length === 0) {
      return `${open}${pre}${body}${note ? `\n<p class="pt-note">${note}</p>` : ''}</figure>`;
    }
    if (node.captionAbove) {
      return `${open}<figcaption>${pre}${this.caption(node.caption)}</figcaption>\n${body}${note ? `\n<p class="pt-note">${note}</p>` : ''}</figure>`;
    }
    const caption = `<figcaption>${this.caption(node.caption)}${note ? ` <span class="pt-note">${note}</span>` : ''}</figcaption>`;
    return `${open}${pre}${body}\n${caption}</figure>`;
  }

  private cell(cell: TableCellNode, scope: string): string {
    const tag = cell.header ? 'th' : 'td';
    const attrs = [
      cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '',
      cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '',
      cell.header && scope ? ` scope="${scope}"` : '',
    ].join('');
    // In a right-to-left book a cell's `left` and `right` are its text's
    // start and end (#371).
    const align = this.dir === 'rtl' ? CELL_ALIGN_RTL[cell.align] ?? cell.align : cell.align;
    const style = [
      cell.align && cell.align !== 'left' ? `text-align:${align}` : '',
      cell.verticalAlign && cell.verticalAlign !== 'top' ? `vertical-align:${cell.verticalAlign === 'middle' ? 'middle' : cell.verticalAlign}` : '',
      cell.background ? `background-color:${cell.background}` : '',
    ].filter(Boolean).join(';');
    let content = '';
    if (cell.image) {
      const href = this.ctx.imageHref(cell.image.fileId);
      const width = cell.image.width !== undefined && cell.image.width < 1 ? ` style="width:${Math.round(cell.image.width * 100)}%"` : '';
      content += href
        ? `<img src="${xmlAttr(relativeHref(this.file.href, href))}" alt="${xmlAttr(cell.image.alt)}"${width}/>`
        : `<span class="pt-missing" role="img" aria-label="${xmlAttr(cell.image.alt || '?')}"></span>`;
      if (cell.inl.length > 0) content += '<br/>';
    }
    content += this.inline(cell.inl);
    return `<${tag}${attrs}${this.classAttr([cell.alternate && 'pt-alt'])}${style ? ` style="${style}"` : ''}>${content}</${tag}>`;
  }

  private table(node: TableNode): string {
    const rows = new Map<number, TableCellNode[]>();
    for (const cell of node.cells.values()) {
      const list = rows.get(cell.row) ?? [];
      list.push(cell);
      rows.set(cell.row, list);
    }
    const order = [...rows.keys()].sort((a, b) => a - b);
    const head = order.filter((r) => r < node.headerRows && rows.get(r)!.every((c) => c.header));
    const body = order.filter((r) => !head.includes(r));
    // A body row heads a group when its only cell runs across every column
    // (in a table of several) or all its cells are header cells: with
    // booktabs group rules it is ruled above (#625).
    const colCount = Math.max(0, ...[...node.cells.values()].map((c) => c.col + c.colSpan));
    const heads = (r: number) => {
      const cells = rows.get(r)!;
      return (cells.length === 1 && cells[0]!.colSpan >= colCount && colCount > 1) || cells.every((c) => c.header);
    };
    const row = (r: number, inHead: boolean) =>
      `<tr${this.classAttr([!inHead && node.groupRules && heads(r) && 'pt-group'])}>${rows.get(r)!.sort((a, b) => a.col - b.col).map((c) => this.cell(c, inHead ? 'col' : c.col === 0 ? 'row' : '')).join('')}</tr>`;
    const widths = node.columnWidths && node.columnWidths.every((w) => w > 0) ? node.columnWidths : undefined;
    const total = widths?.reduce((a, b) => a + b, 0) ?? 0;
    const cols = widths ? `<colgroup>${widths.map((w) => `<col style="width:${Math.round((w / total) * 1000) / 10}%"/>`).join('')}</colgroup>\n` : '';
    const caption = node.caption.length > 0 ? `<caption${node.captionAbove ? '' : ' class="pt-caption-below"'}>${this.caption(node.caption)}</caption>\n` : '';
    const thead = head.length > 0 ? `<thead>\n${head.map((r) => row(r, true)).join('\n')}\n</thead>\n` : '';
    const tbody = body.length > 0 ? `<tbody>\n${body.map((r) => row(r, false)).join('\n')}\n</tbody>\n` : '';
    const note = node.note.length > 0 ? `\n<p class="pt-note">${this.inline(node.note)}</p>` : '';
    const pre = this.inline(node.pre);
    return `<div class="pt-table">${pre}<table id="${node.id}"${this.classAttr([node.styleClass])}>\n${caption}${cols}${thead}${tbody}</table>${note}</div>`;
  }

  private toc(node: TocNode): string {
    const { book } = this.ctx;
    const contents = book.contents && book.contents.file === this.file ? book.contents.id : undefined;
    const rows = node.rows.map((row) => {
      const loc = this.tocTarget(row.page, row.title, row.part === true);
      const number = row.number ? `<span class="pt-lbl">${xmlText(row.number)}</span> ` : '';
      const title = this.inline(row.inl);
      const link = loc ? `<a href="${xmlAttr(locHref(loc, this.file))}">${title}</a>` : title;
      const sub = row.subtitle.length > 0 ? `<br/><span class="pt-toc-subtitle">${this.inline(row.subtitle)}</span>` : '';
      return `<li${this.classAttr([row.part && 'pt-toc-part'])}>${number}${link}${sub}</li>`;
    });
    const pre = this.inline(node.pre);
    return `<nav${contents ? ` id="${contents}"` : ''} class="pt-toc" role="doc-toc">${pre}\n<ol>\n${rows.join('\n')}\n</ol>\n</nav>`;
  }

  /** The heading a contents row lists: on its page, the one whose title
   *  the row's text matches (else the page's first), else the page. */
  private tocTarget(page: number | undefined, title: string, part: boolean): Loc | undefined {
    if (page === undefined) return undefined;
    const { book } = this.ctx;
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const t = norm(title);
    const onPage = book.headings.filter((h) => h.page === page && (part ? h.level === 0 : true));
    const hit = onPage.find((h) => t && (norm(h.label).endsWith(t) || norm(h.label).includes(t))) ?? onPage[0];
    if (hit) return { file: hit.file, id: hit.id };
    const p = book.pages.get(page);
    return p && p.loc.id ? p.loc : undefined;
  }

  notes(): string {
    if (this.file.notes.length === 0) return '';
    const back = this.ctx.backLabel(this.file.lang);
    const asides = this.file.notes.map((note) => {
      const id = idOf('fn-', note.id);
      const ref = this.ctx.book.notes.get(`${note.doc}:${note.id}`);
      const backLink = ref && ref.file === this.file
        ? ` <a href="#${idOf('fnref-', note.id)}" role="doc-backlink" aria-label="${xmlAttr(back)}">↩︎</a>`
        : '';
      return `<aside epub:type="footnote" role="doc-footnote" id="${id}" class="pt-footnote"><p${this.dirAttr(note.dir)}>${this.within(note.dir, () => this.inline(note.inl))}${backLink}</p></aside>`;
    });
    return `<section class="pt-footnotes">\n${asides.join('\n')}\n</section>`;
  }
}

/** A content document. */
export function writeContentDocument(file: FileModel, ctx: SerializeContext): string {
  const w = new Writer(ctx, file);
  const body = w.nodes(file.nodes);
  const notes = w.notes();
  const lang = xmlAttr(file.lang);
  const dir = file.dir ? ` dir="${file.dir}"` : '';
  const title = xmlText(file.title || ctx.bookTitle);
  const type = file.kind === 'part' ? 'part' : 'chapter';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}"${dir}>
<head>
<meta charset="UTF-8"/>
<title>${title}</title>
${[ctx.stylesheet, ...(file.stylesheets ?? [])].map((href) => `<link rel="stylesheet" type="text/css" href="${xmlAttr(relativeHref(file.href, href))}"/>`).join('\n')}
</head>
<body>
<section epub:type="${type}" role="doc-${type}" class="pt-${type}">
${body}
</section>
${notes}
</body>
</html>
`;
}

/** A length in ems for a style attribute: at most three decimals. */
function round2(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}
