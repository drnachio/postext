// Walk a WordprocessingML part in document order and flatten it into a
// token stream: characters with their run formatting, paragraph ends,
// bookmark and comment boundaries. Tracked insertions and moves-to are
// read, deletions and moves-from are not; field codes are skipped and
// their results kept, except the results Word builds from the document
// itself (an index entry, a table of contents, an index), which read as
// nothing, along with the paragraphs that hold only them; text boxes are
// read where their drawing stands
// (`mc:Choice` only, so a text box with a VML fallback is read once).

import { attr, child, children, localName, onOff, textOf, type XmlElement } from '../xml.js';
import { fragmentIdOf, renamedFragmentIdOf } from '../anchors/bookmarks.js';
import { ommlToTex } from '../omml.js';
import { ommlHash } from '../anchors/ommlHash.js';

/** Object replacement character: an equation or a note reference. */
export const OBJECT_CHAR = '￼';
/** A paragraph break inside a fragment (a paragraph the user split). */
export const PARA_CHAR = ' ';

/** Characters the formatted writer holds an atom's room with (U+2060 in
 *  files written before #1406). */
export const isHolderChar = (ch: string | undefined): boolean => ch === '\u00a0' || ch === '\u2060';

export type Token =
  | { t: 'char'; ch: string; flags: string; href?: string; tex?: string; mathHash?: string; tracked?: boolean; holder?: true; note?: string; para: number }
  | { t: 'para'; para: number; depth: number; box: number; props?: ParaProps }
  | { t: 'bmStart'; wid: string; fid: string; para: number; depth: number; box: number; renamed?: true }
  | { t: 'bmEnd'; wid: string; para: number }
  | { t: 'del'; para: number }
  | { t: 'cStart'; cid: string }
  | { t: 'cEnd'; cid: string };

/** What a paragraph's own properties say about its role, for paragraphs
 *  the user adds outside every bookmark. */
export interface ParaProps {
  style?: string;
  /** List numbering (`w:numPr`). */
  numId?: string;
  ilvl?: number;
  /** `w:outlineLvl` (0 = heading 1). */
  outline?: number;
  /** The paragraph ends a section (`w:sectPr`): a chapter end in the
   *  semantic writer. */
  sect?: boolean;
}

function paraProps(p: XmlElement): ParaProps | undefined {
  const pPr = child(p, 'pPr');
  if (!pPr) return undefined;
  const out: ParaProps = {};
  const style = attr(child(pPr, 'pStyle'), 'val');
  if (style) out.style = style;
  const numPr = child(pPr, 'numPr');
  const numId = attr(child(numPr, 'numId'), 'val');
  if (numId && numId !== '0') {
    out.numId = numId;
    out.ilvl = Number(attr(child(numPr, 'ilvl'), 'val') ?? 0) || 0;
  }
  const outline = attr(child(pPr, 'outlineLvl'), 'val');
  if (outline !== undefined && Number(outline) < 9) out.outline = Number(outline);
  if (child(pPr, 'sectPr')) out.sect = true;
  return out;
}

interface RunCtx {
  /** Inside a contents list or an index (their content control). */
  listing?: boolean;
  href?: string;
  tracked?: boolean;
  deleted?: boolean;
}

interface WalkState {
  out: Token[];
  links: Record<string, string>;
  /** Paragraph ordinal stack (paragraphs nest through text boxes). */
  paras: number[];
  nextPara: number;
  /** Block container stack: the part's own (body, note) and each text box
   *  inside it get an ordinal, so text in a box without any bookmark
   *  (a list marker, a folio) is told apart from paragraphs the user added. */
  boxes: number[];
  nextBox: number;
  /** Complex fields: whether each open field is still in its code part,
   *  and whether its result is skipped (see `GENERATED_FIELD`). */
  fields: { code: boolean; skip: boolean; instr: string; href?: string; page?: boolean }[];
  /** A generated field was open in the paragraph being read, or began or
   *  ended in it: its paragraph mark may belong to the field result alone. */
  touched?: boolean;
  /** Ordinal of a paragraph whose mark a tracked change deleted. */
  joinNext?: number;
  /** A run marked w:noProof was seen (the mark survived the editor). */
  noProof?: boolean;
}

const curPara = (s: WalkState): number => s.paras[s.paras.length - 1] ?? -1;
const curBox = (s: WalkState): number => s.boxes[s.boxes.length - 1] ?? -1;

/** A monospaced face by its name. */
const MONO_FACE = /mono|courier|consolas|menlo|typewriter/i;

/** Paragraph styles of a contents list or an index: what Word builds from
 *  the document, never text of the source. */
const LISTING_STYLE = /^(?:TOC\d|Index\d|IndexHeading|TOCHeading|PostextTOC|PostextIndex)/i;

/** Content controls that hold only what the writer generates. */
const LISTING_TAG = /^ptx:(?:toc|index)$/;

/** Run flags in a fixed order: b i c p s k. */
function runFlags(rPr: XmlElement | undefined): string {
  if (!rPr) return '';
  const style = (attr(child(rPr, 'rStyle'), 'val') ?? '').toLowerCase();
  const on = (name: string, styleHint: RegExp): boolean => {
    const v = onOff(child(rPr, name));
    return v ?? styleHint.test(style);
  };
  let f = '';
  if (on('b', /strong|bold/)) f += 'b';
  if (on('i', /emphasis|italic/)) f += 'i';
  if (on('smallCaps', /smallcaps/)) f += 'c';
  // A character style named for it counts too (a writer that sets the
  // raise and size itself, for exact placement, marks the run that way).
  const va = attr(child(rPr, 'vertAlign'), 'val');
  if (va === 'superscript' || (va === undefined && /superscript/.test(style))) f += 'p';
  else if (va === 'subscript' || (va === undefined && /subscript/.test(style))) f += 's';
  // Code by its character style, or, in a file whose editor keeps no
  // character styles (Google Docs sets the style's look on the run), by
  // the monospaced face set on the run itself.
  if (/code|verbatim/.test(style) || (!style && MONO_FACE.test(attr(child(rPr, 'rFonts'), 'ascii') ?? ''))) f += 'k';
  return f;
}

/** Fields whose result Word builds from the document rather than from
 *  text the source holds: an index entry (no result at all), a table of
 *  contents and an index. Their results, and every field nested in them
 *  (a PAGEREF, a HYPERLINK), read as nothing. */
const GENERATED_FIELD = /^\s*(?:XE|TOC|INDEX)\b/i;

/** A page reference: Word's page number, which no source character holds.
 *  The field reads as one object whatever its result (the semantic writer
 *  logs a `:ref` that prints a page so, #1444). */
const PAGE_FIELD = /^\s*PAGEREF\b/i;

/** Whether characters at this point are dropped: inside a field code, or
 *  anywhere inside the result of a generated field. */
function fieldHidden(s: WalkState): boolean {
  if (s.fields[s.fields.length - 1]?.code) return true;
  return s.fields.some((f) => f.skip);
}

/** `HYPERLINK "url"` (external, no `\\l` bookmark switch): the link. */
function hyperlinkOf(instr: string): string | undefined {
  const m = /^\s*HYPERLINK\s+"([^"]+)"/i.exec(instr);
  return m && !/\\l\b/.test(instr) ? m[1] : undefined;
}

/** The link of the innermost HYPERLINK field whose result is being read. */
function fieldHref(s: WalkState): string | undefined {
  for (let k = s.fields.length - 1; k >= 0; k--) if (s.fields[k]!.href) return s.fields[k]!.href;
  return undefined;
}

function emit(s: WalkState, ch: string, flags: string, ctx: RunCtx, tex?: string, mathHash?: string): void {
  if (ctx.deleted) return;
  if (fieldHidden(s)) return;
  const tok: Token = { t: 'char', ch, flags, para: curPara(s) };
  const href = ctx.href ?? fieldHref(s);
  if (href) tok.href = href;
  if (tex !== undefined) tok.tex = tex;
  if (mathHash !== undefined) tok.mathHash = mathHash;
  if (ctx.tracked) tok.tracked = true;
  s.out.push(tok);
}

function walkRun(s: WalkState, r: XmlElement, ctx: RunCtx): void {
  const rPr = child(r, 'rPr');
  const flags = runFlags(rPr);
  // The formatted writer marks an atom's holder run w:noProof.
  const held = rPr !== undefined && onOff(child(rPr, 'noProof')) === true;
  if (held) s.noProof = true;
  for (const c of children(r)) {
    const name = localName(c.name);
    switch (name) {
      case 't':
        for (const ch of textOf(c)) {
          for (let i = 0; i < ch.length; i++) {
            const n = s.out.length;
            emit(s, ch[i]!, flags, ctx);
            const tok = s.out[n];
            if (held && tok?.t === 'char' && isHolderChar(tok.ch)) tok.holder = true;
          }
        }
        break;
      case 'tab':
      case 'ptab':
        emit(s, '\t', flags, ctx);
        break;
      case 'br': {
        // A page or column break has no Markdown spelling: not an edit.
        const type = attr(c, 'type');
        if (type !== 'page' && type !== 'column') emit(s, '\n', flags, ctx);
        break;
      }
      case 'cr':
        emit(s, '\n', flags, ctx);
        break;
      case 'noBreakHyphen':
        emit(s, '‑', flags, ctx);
        break;
      case 'sym': {
        const code = parseInt(attr(c, 'char') ?? '', 16);
        if (Number.isFinite(code)) emit(s, String.fromCharCode(code), flags, ctx);
        break;
      }
      case 'footnoteReference':
      case 'endnoteReference': {
        const n = s.out.length;
        emit(s, OBJECT_CHAR, flags, ctx);
        // Which note it calls: one typed in the editor has no fragment,
        // and is read by this (see `ReadDocx.newNotes`).
        const tok = s.out[n];
        const id = attr(c, 'id');
        if (tok?.t === 'char' && id) tok.note = `${name === 'footnoteReference' ? 'f' : 'e'}${id}`;
        break;
      }
      case 'fldChar': {
        const type = attr(c, 'fldCharType');
        if (type === 'begin') s.fields.push({ code: true, skip: false, instr: '' });
        else if (type === 'separate') {
          const f = s.fields[s.fields.length - 1];
          if (f) {
            f.code = false;
            if (PAGE_FIELD.test(f.instr)) {
              emit(s, OBJECT_CHAR, flags, ctx);
              f.page = true;
            }
            f.skip = f.page === true || GENERATED_FIELD.test(f.instr);
            if (f.skip) s.touched = true;
            const href = hyperlinkOf(f.instr);
            if (href) f.href = href;
          }
        } else if (type === 'end') {
          // A generated field with no separator (an XE, an un-updated TOC)
          // still marks its paragraph.
          const f = s.fields.pop();
          if (f && GENERATED_FIELD.test(f.instr)) s.touched = true;
          // A page reference never updated has no result: the object here.
          else if (f && !f.page && PAGE_FIELD.test(f.instr)) emit(s, OBJECT_CHAR, flags, ctx);
        }
        break;
      }
      case 'instrText': {
        const f = s.fields[s.fields.length - 1];
        if (f && !ctx.deleted) f.instr += textOf(c);
        break;
      }
      case 'drawing':
      case 'pict':
      case 'AlternateContent':
        walkObject(s, c, ctx);
        break;
      case 'ruby': {
        // The base is the text; the reading (w:rt) comes from the source.
        const base = child(c, 'rubyBase');
        if (base) for (const br of children(base)) if (localName(br.name) === 'r') walkRun(s, br, ctx);
        break;
      }
      // softHyphen, delText, lastRenderedPageBreak, footnoteRef, rPr …
      default:
        break;
    }
  }
}

/** Find the text boxes inside a drawing (or VML picture) and read them. */
function walkObject(s: WalkState, el: XmlElement, ctx: RunCtx): void {
  const name = localName(el.name);
  if (name === 'txbxContent') {
    s.boxes.push(s.nextBox++);
    walkBlocks(s, el, { tracked: ctx.tracked, deleted: ctx.deleted });
    s.boxes.pop();
    return;
  }
  if (name === 'AlternateContent') {
    const choice = child(el, 'Choice');
    if (choice) walkObject(s, choice, ctx);
    return;
  }
  for (const c of children(el)) walkObject(s, c, ctx);
}

/** Inline content of a paragraph (runs and their wrappers). */
function walkInline(s: WalkState, el: XmlElement, ctx: RunCtx): void {
  for (const c of children(el)) {
    const name = localName(c.name);
    switch (name) {
      case 'r':
        walkRun(s, c, ctx);
        break;
      case 'hyperlink': {
        const rid = attr(c, 'id');
        const href = rid ? s.links[rid] : undefined;
        walkInline(s, c, { ...ctx, href: href ?? ctx.href });
        break;
      }
      case 'ins':
      case 'moveTo':
        walkInline(s, c, { ...ctx, tracked: true });
        break;
      case 'del':
      case 'moveFrom':
        if (!ctx.deleted) s.out.push({ t: 'del', para: curPara(s) });
        walkInline(s, c, { ...ctx, deleted: true });
        break;
      case 'fldSimple':
        if (GENERATED_FIELD.test(attr(c, 'instr') ?? '')) {
          s.touched = true;
          break;
        }
        if (PAGE_FIELD.test(attr(c, 'instr') ?? '')) {
          emit(s, OBJECT_CHAR, '', ctx);
          break;
        }
        walkInline(s, c, { ...ctx, href: hyperlinkOf(attr(c, 'instr') ?? '') ?? ctx.href });
        break;
      case 'sdt':
        walkInline(s, child(c, 'sdtContent') ?? c, ctx);
        break;
      case 'smartTag':
      case 'customXml':
      case 'dir':
      case 'bdo':
        walkInline(s, c, ctx);
        break;
      case 'oMathPara':
        walkInline(s, c, ctx);
        break;
      case 'oMath':
        emit(s, OBJECT_CHAR, '', ctx, ommlToTex(c), ommlHash(c));
        break;
      case 'bookmarkStart': {
        const bookmark = attr(c, 'name') ?? '';
        const renamed = renamedFragmentIdOf(bookmark);
        const fid = renamed ?? fragmentIdOf(bookmark);
        if (fid !== undefined) s.out.push({ t: 'bmStart', wid: attr(c, 'id') ?? '', fid, para: curPara(s), depth: s.paras.length, box: curBox(s), ...(renamed !== undefined ? { renamed: true as const } : {}) });
        break;
      }
      case 'bookmarkEnd':
        s.out.push({ t: 'bmEnd', wid: attr(c, 'id') ?? '', para: curPara(s) });
        break;
      case 'commentRangeStart':
        s.out.push({ t: 'cStart', cid: attr(c, 'id') ?? '' });
        break;
      case 'commentRangeEnd':
        s.out.push({ t: 'cEnd', cid: attr(c, 'id') ?? '' });
        break;
      case 'AlternateContent':
        walkObject(s, c, ctx);
        break;
      default:
        break;
    }
  }
}

function walkParagraph(s: WalkState, p: XmlElement, ctx: RunCtx): void {
  // After a paragraph whose mark was deleted (tracked), this one continues it.
  const ord = s.joinNext ?? s.nextPara++;
  s.joinNext = undefined;
  s.paras.push(ord);
  // A paragraph that opens inside a generated field's result, or holds
  // one, and adds no character of its own belongs to that result: its
  // mark is no paragraph of the text (one holding a fragment's bookmark
  // is, even when empty).
  const outerTouched = s.touched;
  s.touched = s.fields.some((f) => f.skip);
  const before = s.out.length;
  walkInline(s, p, ctx);
  let own = false;
  for (let k = before; k < s.out.length && !own; k++) own = s.out[k]!.t !== 'cStart' && s.out[k]!.t !== 'cEnd';
  let generatedOnly = s.touched === true && !own;
  // A line of a contents list or an index that an editor turned into
  // plain text (the field gone, the style or the content control left):
  // still the writer's, unless it holds a fragment of its own.
  if (!generatedOnly && (ctx.listing || LISTING_STYLE.test(attr(child(child(p, 'pPr'), 'pStyle'), 'val') ?? ''))) {
    let marked = false;
    for (let k = before; k < s.out.length && !marked; k++) marked = s.out[k]!.t === 'bmStart' || s.out[k]!.t === 'bmEnd';
    if (!marked) {
      s.out.length = before;
      generatedOnly = true;
    }
  }
  s.touched = outerTouched;
  const depth = s.paras.length;
  s.paras.pop();
  if (generatedOnly) return;
  if (child(child(child(p, 'pPr'), 'rPr'), 'del') !== undefined) s.joinNext = ord;
  else if (!ctx.deleted) {
    const props = paraProps(p);
    s.out.push({ t: 'para', para: ord, depth, box: curBox(s), ...(props ? { props } : {}) });
  }
}

/** Block content: paragraphs, tables, content controls. */
function walkBlocks(s: WalkState, el: XmlElement, ctx: RunCtx): void {
  for (const c of children(el)) {
    const name = localName(c.name);
    if (name === 'p') {
      walkParagraph(s, c, ctx);
    } else if (name === 'tbl') {
      for (const tr of children(c, 'tr')) for (const tc of children(tr, 'tc')) walkBlocks(s, tc, ctx);
    } else if (name === 'sdt') {
      const listing = LISTING_TAG.test(attr(child(child(c, 'sdtPr'), 'tag'), 'val') ?? '');
      walkBlocks(s, child(c, 'sdtContent') ?? c, listing ? { ...ctx, listing } : ctx);
    } else if (name === 'customXml' || name === 'ins' || name === 'moveTo') {
      walkBlocks(s, c, name === 'customXml' ? ctx : { ...ctx, tracked: true });
    } else if (name === 'del' || name === 'moveFrom') {
      walkBlocks(s, c, { ...ctx, deleted: true });
    } else if (name === 'AlternateContent') {
      const choice = child(c, 'Choice');
      if (choice) walkBlocks(s, choice, ctx);
    } else {
      // Bookmarks and comment ranges between paragraphs.
      walkInline(s, { name: 'w:wrap', attrs: {}, children: [c] }, ctx);
    }
  }
}

/** The token stream of a part's block container (`w:body`, a note). */
export function walkPart(container: XmlElement, links: Record<string, string>, out: Token[] = [], start = 0, boxStart = 0): { tokens: Token[]; nextPara: number; nextBox: number; noProof: boolean } {
  const s: WalkState = { out, links, paras: [], nextPara: start, boxes: [boxStart], nextBox: boxStart + 1, fields: [] };
  walkBlocks(s, container, {});
  return { tokens: out, nextPara: s.nextPara, nextBox: s.nextBox, noProof: s.noProof === true };
}
