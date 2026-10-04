// The semantic model to EPUB 3 XHTML content documents: one per chapter
// (or part opener), with its footnotes after the text.

import type {
  FileModel,
  InlineItem,
  LinkTarget,
  ListNode,
  Node,
  TableCellNode,
  TableNode,
  TocNode,
} from './model';
import { bridgeLinks, formatKey, idOf, linkKey, wrapFormat, xmlAttr, xmlText } from './inline';
import type { BookModel, Loc } from './walk';

/** What a content document needs from the rest of the book. */
export interface SerializeContext {
  book: BookModel;
  /** The book's title (`<title>` of a document without heading). */
  bookTitle: string;
  /** Href of a picture relative to the package document, or undefined. */
  imageHref(fileId: string): string | undefined;
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

function locHref(loc: Loc, from: FileModel): string {
  return loc.file === from ? `#${loc.id}` : `${relativeHref(from.href, loc.file.href)}#${loc.id}`;
}

class Writer {
  private svgCount = 0;

  constructor(
    private readonly ctx: SerializeContext,
    private readonly file: FileModel,
  ) {}

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

  inline(items: InlineItem[]): string {
    const inl = bridgeLinks([...items]);
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
        return `<p${node.id ? ` id="${node.id}"` : ''}${this.classAttr(node.cls)}${this.dirAttr(node.dir)}>${this.inline(node.inl)}</p>`;
      case 'h':
        return `<h${node.level} id="${node.id}"${this.classAttr(node.cls)}${this.dirAttr(node.dir)}>${this.inline(node.inl)}</h${node.level}>`;
      case 'quote':
        return `<blockquote>\n${this.nodes(node.children)}\n</blockquote>`;
      case 'list':
        return this.list(node);
      case 'callout': {
        const title = node.title ? `<p class="pt-callout-title">${xmlText(node.title)}</p>\n` : '';
        return `<aside${this.classAttr(['pt-callout', node.styleId && idOf('pt-callout-', node.styleId)])}>\n${title}${this.nodes(node.children)}\n</aside>`;
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
      case 'toc':
        return this.toc(node);
      case 'marker':
        return `<div class="pt-marker">${this.inline(node.inl)}</div>`;
    }
  }

  private list(node: ListNode): string {
    const tag = node.ordered ? 'ol' : 'ul';
    const items = node.items.map((item) => {
      const marker = item.marker ? `<span class="pt-lbl">${xmlText(item.marker)}</span> ` : '';
      const body = this.inline(item.done ? item.inl.map((i) => (i.t === 'text' ? { ...i, fmt: { ...i.fmt, done: true } } : i)) : item.inl);
      const nested = item.children.length > 0 ? `\n${this.nodes(item.children)}\n` : '';
      return `<li${this.dirAttr(item.dir)}>${marker}${body}${nested}</li>`;
    });
    return `<${tag}${this.classAttr([node.task && 'pt-tasks'])}>\n${items.join('\n')}\n</${tag}>`;
  }

  private caption(inl: InlineItem[]): string {
    return this.inline(inl);
  }

  private figure(node: Extract<Node, { k: 'figure' }>): string {
    const href = node.fileId ? this.ctx.imageHref(node.fileId) : undefined;
    const body = href
      ? `<img src="${xmlAttr(relativeHref(this.file.href, href))}" alt="${xmlAttr(node.alt)}"/>`
      : `<div class="pt-missing" role="img" aria-label="${xmlAttr(node.alt || '?')}">${xmlText(node.alt)}</div>`;
    const pre = this.inline(node.pre);
    const note = node.note.length > 0 ? this.inline(node.note) : '';
    // A figcaption is the figure's first or last child: page starts go
    // before the picture, a note under the caption goes inside it (or after
    // the picture when there is no caption), a space apart, so a reader
    // without the style sheet, or reading the text aloud, does not run the
    // caption's last word into the note's first.
    if (node.caption.length === 0) {
      return `<figure id="${node.id}">${pre}${body}${note ? `\n<p class="pt-note">${note}</p>` : ''}</figure>`;
    }
    if (node.captionAbove) {
      return `<figure id="${node.id}"><figcaption>${pre}${this.caption(node.caption)}</figcaption>\n${body}${note ? `\n<p class="pt-note">${note}</p>` : ''}</figure>`;
    }
    const caption = `<figcaption>${this.caption(node.caption)}${note ? ` <span class="pt-note">${note}</span>` : ''}</figcaption>`;
    return `<figure id="${node.id}">${pre}${body}\n${caption}</figure>`;
  }

  private cell(cell: TableCellNode, scope: string): string {
    const tag = cell.header ? 'th' : 'td';
    const attrs = [
      cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : '',
      cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : '',
      cell.header && scope ? ` scope="${scope}"` : '',
    ].join('');
    const style = [
      cell.align && cell.align !== 'left' ? `text-align:${cell.align}` : '',
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
    const row = (r: number, inHead: boolean) =>
      `<tr>${rows.get(r)!.sort((a, b) => a.col - b.col).map((c) => this.cell(c, inHead ? 'col' : c.col === 0 ? 'row' : '')).join('')}</tr>`;
    const widths = node.columnWidths && node.columnWidths.every((w) => w > 0) ? node.columnWidths : undefined;
    const total = widths?.reduce((a, b) => a + b, 0) ?? 0;
    const cols = widths ? `<colgroup>${widths.map((w) => `<col style="width:${Math.round((w / total) * 1000) / 10}%"/>`).join('')}</colgroup>\n` : '';
    const caption = node.caption.length > 0 ? `<caption${node.captionAbove ? '' : ' class="pt-caption-below"'}>${this.caption(node.caption)}</caption>\n` : '';
    const thead = head.length > 0 ? `<thead>\n${head.map((r) => row(r, true)).join('\n')}\n</thead>\n` : '';
    const tbody = body.length > 0 ? `<tbody>\n${body.map((r) => row(r, false)).join('\n')}\n</tbody>\n` : '';
    const note = node.note.length > 0 ? `\n<p class="pt-note">${this.inline(node.note)}</p>` : '';
    const pre = this.inline(node.pre);
    return `<div class="pt-table">${pre}<table id="${node.id}">\n${caption}${cols}${thead}${tbody}</table>${note}</div>`;
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
      return `<aside epub:type="footnote" role="doc-footnote" id="${id}" class="pt-footnote"><p>${this.inline(note.inl)}${backLink}</p></aside>`;
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
<link rel="stylesheet" type="text/css" href="${xmlAttr(relativeHref(file.href, ctx.stylesheet))}"/>
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
