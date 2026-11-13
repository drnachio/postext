// WordprocessingML building blocks of the semantic writer (#1390): units,
// colours, and paragraph/run property builders that always write their
// children in the schema's order (CT_PPr, CT_RPr, CT_SectPr), since Word
// refuses a file whose property elements are out of order.

import type { ColorValue, Dimension } from '../../types.js';
import { dimensionToPx } from '../../units.js';
import { escapeAttr, escapeXml } from '../xml.js';

/** Converts config lengths at the book's dpi. */
export interface Units {
  dpi: number;
  /** Base font size (px) for `em` lengths. */
  basePx: number;
}

export function px(u: Units, d: Dimension | undefined, basePx = u.basePx): number {
  if (!d) return 0;
  try {
    return dimensionToPx(d, u.dpi, basePx);
  } catch {
    return 0;
  }
}

export const twips = (u: Units, d: Dimension | undefined, basePx?: number): number => Math.round((px(u, d, basePx) * 1440) / u.dpi);
export const halfPoints = (u: Units, d: Dimension | undefined, basePx?: number): number => Math.max(2, Math.round((px(u, d, basePx) * 144) / u.dpi));
export const eighths = (u: Units, d: Dimension | undefined, basePx?: number): number => Math.max(2, Math.min(96, Math.round((px(u, d, basePx) * 576) / u.dpi)));
export const emu = (u: Units, pxValue: number): number => Math.round((pxValue * 914400) / u.dpi);

/** `RRGGBB` for a colour, or undefined. */
export function hex(c: ColorValue | string | undefined): string | undefined {
  const raw = typeof c === 'string' ? c : c?.hex;
  if (!raw) return undefined;
  let h = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3,4}$/i.test(h)) h = h.slice(0, 3).split('').map((x) => x + x).join('');
  if (/^[0-9a-f]{8}$/i.test(h)) h = h.slice(0, 6);
  return /^[0-9a-f]{6}$/i.test(h) ? h.toUpperCase() : undefined;
}

/** The first family of a CSS font stack, unquoted. */
export function firstFamily(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const first = stack.split(',')[0]!.trim().replace(/^["']|["']$/g, '').trim();
  return first || undefined;
}

export interface RunProps {
  style?: string;
  font?: string;
  /** `false`: `font` names no East Asian face, so each reader sets Han,
   *  kana and hangul in its own (the plain design's Arial has none). */
  eastAsia?: false;
  b?: boolean;
  i?: boolean;
  caps?: boolean;
  smallCaps?: boolean;
  strike?: boolean;
  vanish?: boolean;
  color?: string;
  /** Character spacing in twips. */
  spacing?: number;
  /** Size in half-points. */
  sz?: number;
  highlight?: string;
  /** Underline: single, or a dotted or dashed line. */
  /** `true` a single underline, or a Word underline kind (`dotted`, `wave`, `double`…). */
  u?: boolean | string;
  /** The underline's colour (`RRGGBB`). */
  uColor?: string;
  /** A line round the run's characters. */
  bdr?: Border;
  shd?: string;
  vertAlign?: 'superscript' | 'subscript';
  rtl?: boolean;
  lang?: string;
}

/** `w:rPr` (CT_RPr order). Empty string when nothing is set. */
export function rPr(p: RunProps): string {
  let x = '';
  if (p.style) x += `<w:rStyle w:val="${escapeAttr(p.style)}"/>`;
  if (p.font) {
    const f = escapeAttr(p.font);
    x += `<w:rFonts w:ascii="${f}" w:hAnsi="${f}"${p.eastAsia === false ? '' : ` w:eastAsia="${f}"`} w:cs="${f}"/>`;
  }
  if (p.b !== undefined) x += p.b ? '<w:b/><w:bCs/>' : '<w:b w:val="0"/><w:bCs w:val="0"/>';
  if (p.i !== undefined) x += p.i ? '<w:i/><w:iCs/>' : '<w:i w:val="0"/><w:iCs w:val="0"/>';
  if (p.caps) x += '<w:caps/>';
  if (p.smallCaps) x += '<w:smallCaps/>';
  if (p.strike) x += '<w:strike/>';
  if (p.vanish) x += '<w:vanish/>';
  if (p.color) x += `<w:color w:val="${p.color}"/>`;
  if (p.spacing) x += `<w:spacing w:val="${Math.round(p.spacing)}"/>`;
  if (p.sz) x += `<w:sz w:val="${p.sz}"/><w:szCs w:val="${p.sz}"/>`;
  if (p.highlight) x += `<w:highlight w:val="${p.highlight}"/>`;
  if (p.u) x += `<w:u w:val="${p.u === true ? 'single' : escapeAttr(p.u)}"${p.uColor ? ` w:color="${p.uColor}"` : ''}/>`;
  if (p.bdr) x += `<w:bdr w:val="single" w:sz="${p.bdr.sz}" w:space="${p.bdr.space ?? 0}" w:color="${p.bdr.color}"/>`;
  if (p.shd) x += `<w:shd w:val="clear" w:color="auto" w:fill="${p.shd}"/>`;
  if (p.vertAlign) x += `<w:vertAlign w:val="${p.vertAlign}"/>`;
  if (p.rtl) x += '<w:rtl/>';
  if (p.lang) x += `<w:lang w:val="${escapeAttr(p.lang)}"/>`;
  return x ? `<w:rPr>${x}</w:rPr>` : '';
}

export interface Border {
  color: string;
  /** Eighths of a point. */
  sz: number;
  /** Space in points. */
  space?: number;
}

export interface ParaProps {
  style?: string;
  keepNext?: boolean;
  keepLines?: boolean;
  /** `false` cancels a style's page break. */
  pageBreakBefore?: boolean;
  numPr?: { numId: number; ilvl: number };
  border?: { top?: Border; left?: Border; bottom?: Border; right?: Border };
  shd?: string;
  /** Tab stops: alignment (`left`/`right` read as start/end in a bidi
   *  paragraph) and position in twips from the start margin. */
  tabs?: { val: 'left' | 'right' | 'center'; pos: number; leader?: 'dot' }[];
  /** Keep Word and LibreOffice from hyphenating the paragraph; `false`
   *  hyphenates one whose style keeps it whole (#1550). */
  suppressAutoHyphens?: boolean;
  /** Twips. */
  before?: number;
  after?: number;
  line?: { twips: number; rule: 'auto' | 'exact' | 'atLeast' };
  ind?: { left?: number; right?: number; firstLine?: number; hanging?: number };
  contextualSpacing?: boolean;
  jc?: 'left' | 'center' | 'right' | 'both' | 'start' | 'end';
  outlineLvl?: number;
  /** `false` writes an explicit left-to-right paragraph (code in an RTL
   *  book). */
  bidi?: boolean;
  /** `w:rPr` of the paragraph mark (already serialized). */
  markRPr?: string;
  sectPr?: string;
}

function borderXml(side: string, b: Border | undefined): string {
  return b ? `<w:${side} w:val="single" w:sz="${b.sz}" w:space="${b.space ?? 4}" w:color="${b.color}"/>` : '';
}

/** `w:pPr` (CT_PPr order). Empty string when nothing is set. */
export function pPr(p: ParaProps): string {
  let x = '';
  if (p.style) x += `<w:pStyle w:val="${escapeAttr(p.style)}"/>`;
  if (p.keepNext) x += '<w:keepNext/>';
  if (p.keepLines) x += '<w:keepLines/>';
  if (p.pageBreakBefore !== undefined) x += p.pageBreakBefore ? '<w:pageBreakBefore/>' : '<w:pageBreakBefore w:val="0"/>';
  if (p.numPr) x += `<w:numPr><w:ilvl w:val="${p.numPr.ilvl}"/><w:numId w:val="${p.numPr.numId}"/></w:numPr>`;
  if (p.border) {
    const b = p.border;
    const inner = borderXml('top', b.top) + borderXml('left', b.left) + borderXml('bottom', b.bottom) + borderXml('right', b.right);
    if (inner) x += `<w:pBdr>${inner}</w:pBdr>`;
  }
  if (p.shd) x += `<w:shd w:val="clear" w:color="auto" w:fill="${p.shd}"/>`;
  if (p.tabs?.length) x += `<w:tabs>${p.tabs.map((t) => `<w:tab w:val="${t.val}"${t.leader ? ` w:leader="${t.leader}"` : ''} w:pos="${Math.max(0, Math.round(t.pos))}"/>`).join('')}</w:tabs>`;
  if (p.suppressAutoHyphens !== undefined) x += p.suppressAutoHyphens ? '<w:suppressAutoHyphens/>' : '<w:suppressAutoHyphens w:val="0"/>';
  if (p.bidi !== undefined) x += p.bidi ? '<w:bidi/>' : '<w:bidi w:val="0"/>';
  if (p.before !== undefined || p.after !== undefined || p.line) {
    let s = '';
    if (p.before !== undefined) s += ` w:before="${Math.max(0, Math.round(p.before))}"`;
    if (p.after !== undefined) s += ` w:after="${Math.max(0, Math.round(p.after))}"`;
    if (p.line) s += ` w:line="${Math.max(1, Math.round(p.line.twips))}" w:lineRule="${p.line.rule}"`;
    x += `<w:spacing${s}/>`;
  }
  if (p.ind) {
    const { left, right, firstLine, hanging } = p.ind;
    let s = '';
    // A 0 is written too: it cancels an inherited indent (Normal's first
    // line). `w:firstLine`/`w:hanging` are unsigned: a negative first-line
    // indent is a hanging one.
    if (left !== undefined) s += ` w:left="${Math.round(left)}"`;
    if (right !== undefined) s += ` w:right="${Math.round(right)}"`;
    if (hanging) s += ` w:hanging="${Math.abs(Math.round(hanging))}"`;
    else if (firstLine !== undefined) s += Math.round(firstLine) < 0 ? ` w:hanging="${-Math.round(firstLine)}"` : ` w:firstLine="${Math.round(firstLine)}"`;
    if (s) x += `<w:ind${s}/>`;
  }
  if (p.contextualSpacing !== undefined) x += p.contextualSpacing ? '<w:contextualSpacing/>' : '<w:contextualSpacing w:val="0"/>';
  if (p.jc) x += `<w:jc w:val="${p.jc}"/>`;
  if (p.outlineLvl !== undefined) x += `<w:outlineLvl w:val="${p.outlineLvl}"/>`;
  if (p.markRPr) x += p.markRPr;
  if (p.sectPr) x += p.sectPr;
  return x ? `<w:pPr>${x}</w:pPr>` : '';
}

/** Characters a `w:t` cannot carry as themselves: those XML 1.0 forbids,
 *  lone surrogates (they would make the part invalid UTF-8) and carriage
 *  returns (a parser reads them back as line feeds). The writer leaves
 *  them out of both the runs and the fragment, so the two still agree. */
export const UNWRITABLE = /[\u0000-\u0008\u000b-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

export const writable = (s: string): string => s.replace(UNWRITABLE, '');

/** Runs for plain text: tabs as `w:tab`, line feeds as `w:br`. */
export function textRuns(text: string, props: string): string {
  let out = '';
  for (const piece of writable(text).split(/(\t|\n)/)) {
    if (piece === '') continue;
    if (piece === '\t') out += `<w:r>${props}<w:tab/></w:r>`;
    else if (piece === '\n') out += `<w:r>${props}<w:br/></w:r>`;
    else out += `<w:r>${props}<w:t xml:space="preserve">${escapeXml(piece)}</w:t></w:r>`;
  }
  return out;
}

export function paragraph(props: ParaProps, content: string): string {
  return `<w:p>${pPr(props)}${content}</w:p>`;
}

/** A complex field (`begin`/`instr`/`separate`/result/`end`). */
export function fieldRuns(instr: string, result = '', props = ''): string {
  const res = result ? `<w:r>${props}<w:fldChar w:fldCharType="separate"/></w:r>${textRuns(result, props)}` : '';
  return (
    `<w:r>${props}<w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r>${props}<w:instrText xml:space="preserve"> ${escapeXml(instr)} </w:instrText></w:r>` +
    res +
    `<w:r>${props}<w:fldChar w:fldCharType="end"/></w:r>`
  );
}

/** LibreOffice (26.8) refuses to load a document whose block content
 *  control opens with a paragraph holding a footnote or endnote
 *  reference; marked as a document part the same control loads (#1444). */
const DOC_PART = '<w:docPartObj><w:docPartGallery w:val="Postext"/></w:docPartObj>';

function notedFirstParagraph(content: string): boolean {
  const end = content.indexOf('</w:p>');
  const first = end < 0 ? content : content.slice(0, end);
  return first.includes('<w:footnoteReference') || first.includes('<w:endnoteReference');
}

/** A content control around block content. `alias` is a short label; the
 *  tag carries the kind (Word keeps both, LibreOffice 7.5+ too). */
export function blockSdt(id: number, tag: string, alias: string | undefined, content: string): string {
  const aliasXml = alias ? `<w:alias w:val="${escapeAttr(writable(alias).slice(0, 255))}"/>` : '';
  return (
    `<w:sdt><w:sdtPr>${aliasXml}<w:tag w:val="${escapeAttr(writable(tag).slice(0, 64))}"/><w:id w:val="${id}"/>` +
    `<w15:appearance w15:val="hidden"/>${notedFirstParagraph(content) ? DOC_PART : ''}</w:sdtPr>` +
    `<w:sdtContent>${content}</w:sdtContent></w:sdt>`
  );
}

/** Word bookmark names: a letter first, then letters, digits and
 *  underscores, at most 40 characters. */
export function wordBookmarkName(id: string): string | undefined {
  const clean = id.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40);
  return /^[A-Za-z]/.test(clean) ? clean : undefined;
}
