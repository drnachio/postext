// The body of a `.docx`: runs, drawings, paragraphs, tables, blocks and notes.
import type { WordStyle, WordDocument, WordRun, WordTextRun, WordBlock, WordParagraph, WordTable, WordCell } from '../model.js';
import { ommlToTex } from '../omml.js';
import { type XmlElement, child, attr, onOff, children, localName, textOf, descendants } from '../xml.js';
import { type Relationship, runFlags, readTabs, type Files, readXml, readRels } from './parts.js';

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export interface ReadContext {
  rels: Map<string, Relationship>;
  styles: Map<string, WordStyle>;
  revisions: WordDocument['revisions'];
  /** Open complex fields (`w:fldChar`), innermost last. */
  fields: Array<{ instr: string; phase: 'code' | 'result'; href?: string }>;
}

/** XE field: `XE "Term:Sub" \b \t "See X"`. */
function parseIndexField(instr: string): WordRun | undefined {
  const m = /^\s*XE\s+"((?:[^"\\]|\\.)*)"(.*)$/i.exec(instr);
  if (!m) return undefined;
  const term = m[1]!.replace(/\\(.)/g, '$1').split(':').map((s) => s.trim()).filter(Boolean);
  if (term.length === 0) return undefined;
  const rest = m[2] ?? '';
  const see = /\\t\s+"((?:[^"\\]|\\.)*)"/.exec(rest)?.[1];
  return { type: 'index', term, main: /\\b\b/.test(rest) || undefined, see: see?.replace(/^\s*(see|véase|ver)\s+/i, '') };
}

function hyperlinkField(instr: string): string | undefined {
  const m = /^\s*HYPERLINK\s+"([^"]+)"/i.exec(instr);
  return m && !/\\l\b/.test(instr) ? m[1] : undefined;
}

function isManualRun(rPr: XmlElement | undefined): boolean {
  if (!rPr) return false;
  for (const k of ['rFonts', 'sz', 'color', 'highlight', 'u', 'caps', 'shd', 'spacing', 'strike']) {
    const el = child(rPr, k);
    if (!el) continue;
    if (k === 'u' && attr(el, 'val') === 'none') continue;
    if (k === 'rFonts' && (attr(el, 'asciiTheme') || attr(el, 'hAnsiTheme')) && !attr(el, 'ascii')) continue;
    return true;
  }
  return false;
}

function readRun(r: XmlElement, ctx: ReadContext, href: string | undefined, out: WordRun[], deleted: boolean): void {
  const rPr = child(r, 'rPr');
  const flags = runFlags(rPr);
  const charStyleId = attr(child(rPr, 'rStyle'), 'val');
  const charStyle = charStyleId ? ctx.styles.get(charStyleId)?.name ?? charStyleId : undefined;
  const hidden = onOff(child(rPr, 'vanish')) || undefined;
  const manual = isManualRun(rPr) || undefined;
  // Field state changes inside a run (`w:fldChar`), so it is read per piece.
  const inCode = (): boolean => ctx.fields.some((f) => f.phase === 'code');
  const text = (t: string): void => {
    if (!t || deleted || inCode()) return;
    const fieldHref = [...ctx.fields].reverse().find((f) => f.phase === 'result' && f.href)?.href;
    const last = out[out.length - 1];
    const run: WordTextRun = { type: 'text', text: t, ...flags, charStyle, href: href ?? fieldHref, manual, hidden };
    if (last && last.type === 'text' && sameFormat(last, run)) last.text += t;
    else out.push(run);
  };
  for (const c of children(r)) {
    const field = ctx.fields[ctx.fields.length - 1];
    switch (localName(c.name)) {
      case 't':
        text(textOf(c));
        break;
      case 'delText':
        break;
      case 'instrText':
        if (field && field.phase === 'code') field.instr += textOf(c);
        break;
      case 'fldChar': {
        const type = attr(c, 'fldCharType');
        if (type === 'begin') ctx.fields.push({ instr: '', phase: 'code' });
        else if (type === 'separate' && field) {
          field.phase = 'result';
          field.href = hyperlinkField(field.instr);
        } else if (type === 'end' && field) {
          if (field.phase === 'code') {
            // A field with no result: an index entry is the only one we keep.
            const xe = parseIndexField(field.instr);
            ctx.fields.pop();
            if (xe && !deleted) out.push(xe);
          } else ctx.fields.pop();
        }
        break;
      }
      case 'tab':
      case 'ptab':
        if (!deleted && !inCode()) out.push({ type: 'tab' });
        break;
      case 'br':
      case 'cr': {
        if (deleted || inCode()) break;
        const kind = attr(c, 'type');
        out.push({ type: 'break', kind: kind === 'page' ? 'page' : kind === 'column' ? 'column' : 'line' });
        break;
      }
      case 'noBreakHyphen':
        text('‑');
        break;
      case 'softHyphen':
        text('­');
        break;
      case 'sym': {
        const code = attr(c, 'char');
        if (code) {
          const n = parseInt(code, 16);
          // Symbol-font code points (F0xx) stand for the ASCII-range glyph.
          text(String.fromCodePoint(n >= 0xf000 && n <= 0xf0ff ? n - 0xf000 : n));
        }
        break;
      }
      case 'footnoteReference':
      case 'endnoteReference': {
        const id = attr(c, 'id');
        if (id && !deleted) out.push({ type: 'note', kind: localName(c.name) === 'footnoteReference' ? 'footnote' : 'endnote', id });
        break;
      }
      case 'drawing':
      case 'pict':
      case 'object':
        if (!deleted) readDrawing(c, out);
        break;
      case 'AlternateContent': {
        const choice = child(c, 'Choice') ?? child(c, 'Fallback');
        if (choice && !deleted) readDrawing(choice, out);
        break;
      }
      default:
        break;
    }
  }
}

function sameFormat(a: WordTextRun, b: WordTextRun): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.smallCaps === b.smallCaps && a.script === b.script
    && a.charStyle === b.charStyle && a.href === b.href && a.manual === b.manual && a.hidden === b.hidden;
}

function readDrawing(el: XmlElement, out: WordRun[]): void {
  const blips = [...descendants(el, 'blip'), ...descendants(el, 'imagedata')];
  const docPr = descendants(el, 'docPr')[0];
  const extent = descendants(el, 'extent')[0];
  for (const b of blips) {
    const rId = b.attrs['r:embed'] ?? b.attrs['r:id'] ?? attr(b, 'embed');
    if (!rId) continue;
    out.push({
      type: 'image',
      rId,
      name: docPr?.attrs.name,
      alt: docPr?.attrs.descr || docPr?.attrs.title || undefined,
      widthEmu: extent ? Number(extent.attrs.cx) : undefined,
      heightEmu: extent ? Number(extent.attrs.cy) : undefined,
    });
    break;
  }
}

/** The `w:txbxContent` of a run's drawings, the VML fallback copy of a
 *  DrawingML box left out. */
function textBoxContents(el: XmlElement, out: XmlElement[] = []): XmlElement[] {
  for (const c of children(el)) {
    const name = localName(c.name);
    if (name === 'AlternateContent') {
      const branch = child(c, 'Choice') ?? child(c, 'Fallback');
      if (branch) textBoxContents(branch, out);
    } else if (name === 'txbxContent') out.push(c);
    else textBoxContents(c, out);
  }
  return out;
}

function readParagraphContent(el: XmlElement, ctx: ReadContext, out: WordRun[], href: string | undefined, deleted: boolean, boxes: WordBlock[]): void {
  for (const c of children(el)) {
    const name = localName(c.name);
    switch (name) {
      case 'r':
        readRun(c, ctx, href, out, deleted);
        // A text box's paragraphs follow the one it is anchored in.
        if (!deleted) for (const box of textBoxContents(c)) boxes.push(...readBlocks(box, ctx));
        break;
      case 'hyperlink': {
        const rId = c.attrs['r:id'];
        const rel = rId ? ctx.rels.get(rId) : undefined;
        readParagraphContent(c, ctx, out, rel?.external ? rel.target : href, deleted, boxes);
        break;
      }
      case 'ins':
      case 'moveTo':
        ctx.revisions.insertions++;
        readParagraphContent(c, ctx, out, href, deleted, boxes);
        break;
      case 'del':
      case 'moveFrom':
        ctx.revisions.deletions++;
        readParagraphContent(c, ctx, out, href, true, boxes);
        break;
      case 'smartTag':
      case 'customXml':
      case 'sdt':
      case 'sdtContent':
      case 'fldSimple': {
        if (name === 'fldSimple') {
          const instr = attr(c, 'instr') ?? '';
          const xe = parseIndexField(instr);
          if (xe) {
            if (!deleted) out.push(xe);
            break;
          }
          readParagraphContent(c, ctx, out, hyperlinkField(instr) ?? href, deleted, boxes);
          break;
        }
        readParagraphContent(name === 'sdt' ? child(c, 'sdtContent') ?? c : c, ctx, out, href, deleted, boxes);
        break;
      }
      case 'oMathPara':
        for (const m of children(c, 'oMath')) if (!deleted) out.push({ type: 'math', tex: ommlToTex(m), display: true });
        break;
      case 'oMath':
        if (!deleted) out.push({ type: 'math', tex: ommlToTex(c), display: false });
        break;
      case 'commentRangeStart':
        ctx.revisions.comments++;
        break;
      default:
        break;
    }
  }
}

function readParagraph(p: XmlElement, ctx: ReadContext): WordParagraph[] {
  const pPr = child(p, 'pPr');
  const styleId = attr(child(pPr, 'pStyle'), 'val') ?? '';
  const numPr = child(pPr, 'numPr');
  let list: WordParagraph['list'];
  const numId = attr(child(numPr, 'numId'), 'val');
  if (numId !== undefined) {
    if (numId !== '0') list = { numId, ilvl: Number(attr(child(numPr, 'ilvl'), 'val') ?? 0) };
  } else {
    // Numbering inherited from the style chain (`List Bullet`).
    let s = styleId ? ctx.styles.get(styleId) : undefined;
    for (let guard = 0; s && guard < 12; guard++) {
      if (s.numId !== undefined) {
        if (s.numId !== '0') list = { numId: s.numId, ilvl: s.ilvl ?? 0 };
        break;
      }
      s = s.basedOn ? ctx.styles.get(s.basedOn) : undefined;
    }
  }
  const manualLayout = !!pPr && ['jc', 'ind', 'spacing'].some((k) => child(pPr, k) !== undefined) || undefined;
  const runs: WordRun[] = [];
  const boxes: WordBlock[] = [];
  readParagraphContent(p, ctx, runs, undefined, false, boxes);
  const para: WordParagraph = {
    type: 'paragraph',
    styleId,
    runs,
    ...(list ? { list } : {}),
    ...(onOff(child(pPr, 'pageBreakBefore')) ? { pageBreakBefore: true } : {}),
    ...(manualLayout ? { manualLayout } : {}),
    ...(child(pPr, 'tabs') ? { tabs: readTabs(pPr) } : {}),
    ...(boxes.length ? { textBoxes: boxes } : {}),
  };
  // A paragraph whose mark is a tracked deletion merges into the next one;
  // the text is what matters here, so it stays a paragraph of its own.
  return [para];
}

function readTable(tbl: XmlElement, ctx: ReadContext): WordTable {
  const rows: WordCell[][] = [];
  let headerRows = 0;
  let headerRun = true;
  for (const tr of children(tbl, 'tr')) {
    const trPr = child(tr, 'trPr');
    const isHeader = onOff(child(trPr, 'tblHeader')) === true;
    if (isHeader && headerRun) headerRows++;
    else headerRun = false;
    const row: WordCell[] = [];
    for (const tc of children(tr, 'tc')) {
      const tcPr = child(tc, 'tcPr');
      const span = Number(attr(child(tcPr, 'gridSpan'), 'val') ?? 1);
      const vm = child(tcPr, 'vMerge');
      const vMerge = vm ? (attr(vm, 'val') === 'restart' ? 'restart' : 'continue') : undefined;
      const fill = attr(child(tcPr, 'shd'), 'fill');
      row.push({
        blocks: readBlocks(tc, ctx),
        colSpan: Number.isFinite(span) && span > 1 ? span : 1,
        ...(vMerge ? { vMerge } : {}),
        ...(fill && fill !== 'auto' && /^[0-9a-fA-F]{6}$/.test(fill) && fill.toLowerCase() !== 'ffffff' ? { shading: `#${fill.toLowerCase()}` } : {}),
      });
    }
    rows.push(row);
  }
  const widths = children(child(tbl, 'tblGrid'), 'gridCol').map((g) => Number(attr(g, 'w') ?? 0));
  return { type: 'table', rows, headerRows, ...(widths.length && widths.every((w) => w > 0) ? { widths } : {}) };
}

export function readBlocks(container: XmlElement, ctx: ReadContext): WordBlock[] {
  const out: WordBlock[] = [];
  const visit = (el: XmlElement, deleted = false): void => {
    for (const c of children(el)) {
      switch (localName(c.name)) {
        case 'p':
          if (!deleted) out.push(...readParagraph(c, ctx));
          break;
        case 'tbl':
          if (!deleted) out.push(readTable(c, ctx));
          break;
        case 'sdt':
          visit(child(c, 'sdtContent') ?? c, deleted);
          break;
        case 'customXml':
        case 'sdtContent':
          visit(c, deleted);
          break;
        case 'ins':
        case 'moveTo':
          visit(c, deleted);
          break;
        case 'del':
        case 'moveFrom':
          visit(c, true);
          break;
        case 'AlternateContent':
          visit(child(c, 'Choice') ?? child(c, 'Fallback') ?? c, deleted);
          break;
        default:
          break;
      }
    }
  };
  visit(container);
  return out;
}

export function readNotes(files: Files, path: string | undefined, ctx: ReadContext, local: 'footnote' | 'endnote'): Map<string, WordBlock[]> {
  const out = new Map<string, WordBlock[]>();
  if (!path) return out;
  const root = readXml(files, path);
  if (!root) return out;
  const rels = readRels(files, path);
  const noteCtx: ReadContext = { ...ctx, rels, fields: [] };
  for (const n of children(root, local)) {
    const id = attr(n, 'id');
    const type = attr(n, 'type');
    if (!id || (type && type !== 'normal')) continue;
    const blocks = readBlocks(n, noteCtx);
    // The note's own number (`w:footnoteRef`) is no text.
    out.set(id, blocks);
  }
  return out;
}
