// Read a `.docx` (Office Open XML) into the Word model: styles, numbering,
// body blocks, footnotes and endnotes, pictures, core properties and the
// import template a Postext export embeds. Runs in the browser and in Node.

import { strFromU8, unzipSync } from 'fflate';
import type {
  WordBlock,
  WordCell,
  WordDocument,
  WordMedia,
  WordNumbering,
  WordParagraph,
  WordRun,
  WordStyle,
  WordTable,
  WordTextRun,
} from './model';
import { ommlToTex } from './omml';
import { attr, child, children, descendants, localName, onOff, parseXml, textOf, type XmlElement } from './xml';

/** customXml item holding the template of a Postext export. */
export const TEMPLATE_XML_ROOT = 'postextWordTemplate';
export const TEMPLATE_XML_NS = 'https://postext.dev/word-template';

export class DocxReadError extends Error {}

type Files = Record<string, Uint8Array>;

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', emf: 'image/emf', wmf: 'image/wmf', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp',
};

function readText(files: Files, path: string): string | undefined {
  const bytes = files[path];
  return bytes ? strFromU8(bytes) : undefined;
}

function readXml(files: Files, path: string): XmlElement | undefined {
  const text = readText(files, path);
  if (text === undefined) return undefined;
  try {
    return parseXml(text);
  } catch {
    return undefined;
  }
}

/** Resolve a relationship target against the part that owns it. */
function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

interface Relationship { type: string; target: string; external: boolean }

function readRels(files: Files, partPath: string): Map<string, Relationship> {
  const dir = partPath.split('/').slice(0, -1).join('/');
  const name = partPath.split('/').pop()!;
  const relsPath = `${dir ? `${dir}/` : ''}_rels/${name}.rels`;
  const root = readXml(files, relsPath);
  const out = new Map<string, Relationship>();
  for (const rel of children(root, 'Relationship')) {
    const id = rel.attrs.Id;
    const target = rel.attrs.Target;
    if (!id || target === undefined) continue;
    const external = rel.attrs.TargetMode === 'External';
    out.set(id, { type: (rel.attrs.Type ?? '').split('/').pop() ?? '', target: external ? target : resolvePath(partPath, target), external });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Styles and numbering
// ---------------------------------------------------------------------------

function runFlags(rPr: XmlElement | undefined): Pick<WordStyle, 'bold' | 'italic' | 'smallCaps' | 'script'> {
  if (!rPr) return {};
  const va = attr(child(rPr, 'vertAlign'), 'val');
  return {
    bold: onOff(child(rPr, 'b')),
    italic: onOff(child(rPr, 'i')),
    smallCaps: onOff(child(rPr, 'smallCaps')),
    script: va === 'superscript' ? 'sup' : va === 'subscript' ? 'sub' : undefined,
  };
}

function readStyles(root: XmlElement | undefined): { styles: Map<string, WordStyle>; defaultParagraph: string } {
  const styles = new Map<string, WordStyle>();
  let defaultParagraph = '';
  for (const s of children(root, 'style')) {
    const id = attr(s, 'styleId');
    const type = attr(s, 'type') as WordStyle['type'] | undefined;
    if (!id || !type) continue;
    const name = attr(child(s, 'name'), 'val') ?? id;
    const pPr = child(s, 'pPr');
    const numPr = child(pPr, 'numPr');
    const outline = attr(child(pPr, 'outlineLvl'), 'val');
    const style: WordStyle = {
      id,
      name,
      type,
      basedOn: attr(child(s, 'basedOn'), 'val'),
      ...runFlags(child(s, 'rPr')),
      numId: attr(child(numPr, 'numId'), 'val'),
      ilvl: numPr ? Number(attr(child(numPr, 'ilvl'), 'val') ?? 0) : undefined,
      outlineLevel: outline !== undefined ? Number(outline) : undefined,
    };
    styles.set(id, style);
    const isDefault = s.attrs['w:default'];
    if (type === 'paragraph' && (isDefault === '1' || isDefault === 'true' || isDefault === 'on')) defaultParagraph = id;
  }
  return { styles, defaultParagraph };
}

function readNumbering(root: XmlElement | undefined): WordNumbering {
  const abstracts = new Map<string, Map<number, { format: string; start: number }>>();
  for (const a of children(root, 'abstractNum')) {
    const id = attr(a, 'abstractNumId');
    if (id === undefined) continue;
    const levels = new Map<number, { format: string; start: number }>();
    for (const lvl of children(a, 'lvl')) {
      const ilvl = Number(attr(lvl, 'ilvl') ?? 0);
      levels.set(ilvl, {
        format: attr(child(lvl, 'numFmt'), 'val') ?? 'decimal',
        start: Number(attr(child(lvl, 'start'), 'val') ?? 1),
      });
    }
    abstracts.set(id, levels);
  }
  const nums = new Map<string, { abstractId: string; starts: Map<number, number> }>();
  for (const n of children(root, 'num')) {
    const id = attr(n, 'numId');
    const abstractId = attr(child(n, 'abstractNumId'), 'val');
    if (id === undefined || abstractId === undefined) continue;
    const starts = new Map<number, number>();
    for (const o of children(n, 'lvlOverride')) {
      const start = attr(child(o, 'startOverride'), 'val');
      if (start !== undefined) starts.set(Number(attr(o, 'ilvl') ?? 0), Number(start));
    }
    nums.set(id, { abstractId, starts });
  }
  return { nums, abstracts };
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

interface ReadContext {
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

function readBlocks(container: XmlElement, ctx: ReadContext): WordBlock[] {
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

function readNotes(files: Files, path: string | undefined, ctx: ReadContext, local: 'footnote' | 'endnote'): Map<string, WordBlock[]> {
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

function readCore(files: Files): { title?: string; author?: string } {
  const root = readXml(files, 'docProps/core.xml');
  if (!root) return {};
  const title = child(root, 'title');
  const creator = child(root, 'creator');
  return {
    title: title ? textOf(title).trim() || undefined : undefined,
    author: creator ? textOf(creator).trim() || undefined : undefined,
  };
}

function readEmbeddedTemplate(files: Files): unknown {
  for (const path of Object.keys(files)) {
    if (!/^customXml\/item\d+\.xml$/.test(path)) continue;
    const text = readText(files, path);
    if (!text || !text.includes(TEMPLATE_XML_ROOT)) continue;
    try {
      const root = parseXml(text);
      if (localName(root.name) !== TEMPLATE_XML_ROOT) continue;
      return JSON.parse(textOf(root));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Read a `.docx` file's bytes. Throws {@link DocxReadError} when it is not a
 *  Word document (an old binary `.doc`, a renamed file, a broken zip). */
export function readDocx(data: ArrayBuffer | Uint8Array): WordDocument {
  let files: Files;
  try {
    files = unzipSync(data instanceof Uint8Array ? data : new Uint8Array(data));
  } catch {
    throw new DocxReadError('not a zip');
  }
  const pkgRels = readRels(files, '');
  const officeDoc = [...pkgRels.values()].find((r) => r.type === 'officeDocument');
  const docPath = officeDoc?.target ?? 'word/document.xml';
  const docRoot = readXml(files, docPath);
  const body = child(docRoot, 'body');
  if (!docRoot || !body) throw new DocxReadError('no document part');
  const rels = readRels(files, docPath);
  const partOf = (type: string): string | undefined => [...rels.values()].find((r) => r.type === type)?.target;

  const { styles, defaultParagraph } = readStyles(readXml(files, partOf('styles') ?? 'word/styles.xml'));
  const numbering = readNumbering(readXml(files, partOf('numbering') ?? 'word/numbering.xml'));
  const revisions = { insertions: 0, deletions: 0, comments: 0 };
  const ctx: ReadContext = { rels, styles, revisions, fields: [] };
  const blocks = readBlocks(body, ctx);
  const footnotes = readNotes(files, partOf('footnotes'), ctx, 'footnote');
  const endnotes = readNotes(files, partOf('endnotes'), ctx, 'endnote');

  const media = new Map<string, WordMedia>();
  const collectMedia = (relMap: Map<string, Relationship>): void => {
    for (const [id, rel] of relMap) {
      if (rel.type !== 'image' || rel.external || media.has(id)) continue;
      const bytes = files[rel.target];
      if (!bytes) continue;
      const ext = rel.target.split('.').pop()?.toLowerCase() ?? '';
      media.set(id, { path: rel.target, bytes, contentType: MEDIA_TYPES[ext] ?? 'application/octet-stream' });
    }
  };
  collectMedia(rels);

  return {
    blocks,
    styles,
    defaultParagraphStyle: defaultParagraph,
    numbering,
    footnotes,
    endnotes,
    media,
    ...readCore(files),
    embeddedTemplate: readEmbeddedTemplate(files),
    revisions,
  };
}
