// Checks of a written WordprocessingML part, used by the tests of both Word
// variants: property elements in schema order (Word refuses a file whose
// `w:pPr`, `w:rPr`, `w:sectPr`, `w:tblPr` or `w:tcPr` children are out of
// order), and the text each `_ptx_` bookmark holds, read with the
// importer's conventions (see fragments.ts).

import { decodeEntities } from '../xml.js';
import { BOOKMARK_PREFIX } from '../anchors/types.js';

const ORDER: Record<string, string[]> = {
  pPr: [
    'pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs',
    'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd',
    'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment',
    'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange',
  ],
  rPr: [
    'rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof',
    'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd',
    'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath', 'rPrChange',
  ],
  sectPr: [
    'headerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType', 'pgNumType', 'cols', 'formProt',
    'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid', 'printerSettings', 'sectPrChange',
  ],
  tblPr: [
    'tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize', 'tblW', 'jc', 'tblCellSpacing', 'tblInd',
    'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook', 'tblCaption', 'tblDescription',
  ],
  tcPr: ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark'],
  tblBorders: ['top', 'left', 'start', 'bottom', 'right', 'end', 'insideH', 'insideV'],
  tblCellMar: ['top', 'left', 'start', 'bottom', 'right', 'end'],
  pBdr: ['top', 'left', 'bottom', 'right', 'between', 'bar'],
};
// Header and footer references share one slot in the sequence.
const ALIAS: Record<string, string> = { footerReference: 'headerReference' };

const TAG = /<(\/?)w:([A-Za-z]+)\b[^>]*?(\/?)>/g;

/** Out-of-order property children in a part (empty = in order). */
export function orderProblems(xml: string): string[] {
  const problems: string[] = [];
  // Stack of open w: elements; for the checked ones, the last child index.
  const stack: { name: string; last: number }[] = [];
  TAG.lastIndex = 0;
  for (let m = TAG.exec(xml); m; m = TAG.exec(xml)) {
    const [, close, name, self] = m;
    if (close) {
      stack.pop();
      continue;
    }
    const parent = stack[stack.length - 1];
    const order = parent && ORDER[parent.name];
    // `w:rPr` inside `w:pPr` is the paragraph mark's; inside a style or
    // run it is checked as itself.
    if (order) {
      const at = order.indexOf(ALIAS[name!] ?? name!);
      if (at < 0) problems.push(`<w:${parent!.name}> holds unexpected <w:${name}>`);
      else if (at < parent!.last) problems.push(`<w:${name}> after a later sibling in <w:${parent!.name}>`);
      else parent!.last = at;
    }
    if (!self) stack.push({ name: name!, last: -1 });
  }
  return [...new Set(problems)];
}

const TOKEN = /<w:rt>[\s\S]*?<\/w:rt>|<w:bookmarkStart\b[^>]*\bw:id="(\d+)"[^>]*\bw:name="([^"]*)"[^>]*\/>|<w:bookmarkEnd\b[^>]*\bw:id="(\d+)"[^>]*\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:tab\/>|<w:br\/>|<w:footnoteReference\b[^>]*\/>|<m:oMathPara>[\s\S]*?<\/m:oMathPara>|<m:oMath>[\s\S]*?<\/m:oMath>|<w:instrText\b[^>]*>[^<]*<\/w:instrText>|<\/w:p>/g;

/** Text inside each `_ptx_` bookmark of a part, by fragment id, read as
 *  the importer reads it. */
export function bookmarkTexts(xml: string): Map<string, string> {
  const open = new Map<string, string>();
  const text = new Map<string, string>();
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(xml); m; m = TOKEN.exec(xml)) {
    const tok = m[0];
    let piece = '';
    if (m[1] !== undefined) {
      if (m[2]!.startsWith(BOOKMARK_PREFIX)) {
        open.set(m[1], m[2]!.slice(BOOKMARK_PREFIX.length));
        text.set(m[2]!.slice(BOOKMARK_PREFIX.length), '');
      }
      continue;
    }
    if (m[3] !== undefined) {
      open.delete(m[3]);
      continue;
    }
    // A ruby's reading: the importer takes the base only.
    if (tok.startsWith('<w:rt>')) continue;
    if (m[4] !== undefined) piece = decodeEntities(m[4]);
    else if (tok === '<w:tab/>') piece = '\t';
    else if (tok === '<w:br/>') piece = '\n';
    // A paragraph mark inside a fragment (a stanza set a paragraph per line).
    else if (tok === '</w:p>') piece = '\u2029';
    else if (tok.startsWith('<w:footnoteReference') || tok.startsWith('<m:oMath')) piece = '\uFFFC';
    if (!piece) continue;
    for (const id of open.values()) text.set(id, text.get(id)! + piece);
  }
  return text;
}
