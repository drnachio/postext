// Test kit of the formatted Word export: small laid-out documents with a
// deterministic measurer, and readers of what the writer put in the
// document (text boxes per page, bookmarked text, element orders).

import { strFromU8, unzipSync } from 'fflate';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig, Resource, VDTDocument } from '../../index.js';
import { parseXml, type XmlElement, localName } from '../xml.js';
import { BOOKMARK_PREFIX } from '../anchors/types.js';

// Deterministic stub: every character is 7 px wide, bold ones 8 px.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * (/bold|700/.test(this.font) ? 8 : 7) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

export const mm = (value: number) => ({ value, unit: 'mm' as const });

export const LOREM = 'Typesetting is the composition of text by means of arranging physical type or its digital equivalents. Stored letters and other symbols are retrieved and ordered according to the language orthography for visual display. Characteristically a justified column of text is set with even spaces between words, and long compound words such as internationalization and representativeness get hyphenated at the end of lines.';

export function config(over: Partial<PostextConfig> = {}): PostextConfig {
  return {
    page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
    layout: { layoutType: 'single' },
    bodyText: { textAlign: 'justify', firstLineIndent: mm(0), hyphenation: { enabled: true } },
    headings: { balancing: { enabled: false } },
    header: { elements: [] },
    footer: { elements: [] },
    ...over,
  } as PostextConfig;
}

export function build(markdown: string, cfg: PostextConfig, resources?: Resource[]): VDTDocument {
  return buildDocument({ markdown, ...(resources ? { resources } : {}) }, cfg);
}

export function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}

export function documentXml(files: Record<string, Uint8Array>): string {
  return strFromU8(files['word/document.xml']!);
}

export function els(root: XmlElement, local: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of root.children) {
    if (typeof c === 'string') continue;
    if (localName(c.name) === local) out.push(c);
    els(c, local, out);
  }
  return out;
}

export const kids = (el: XmlElement): XmlElement[] => el.children.filter((c): c is XmlElement => typeof c !== 'string');

/** Text of paragraphs as the importer reads them: `w:t`, `w:br` → '\n',
 *  paragraphs joined by '\n'. */
export function paragraphsText(paras: XmlElement[]): string {
  const one = (el: XmlElement): string => {
    let s = '';
    for (const c of el.children) {
      if (typeof c === 'string') continue;
      const n = localName(c.name);
      if (n === 't') s += c.children.filter((x): x is string => typeof x === 'string').join('');
      else if (n === 'br') s += '\n';
      else if (n !== 'pPr' && n !== 'rPr' && n !== 'rt') s += one(c);
    }
    return s;
  };
  return paras.map(one).join('\n');
}

/** Per page (anchor paragraph): the text of each text box, in order. */
export function pageBoxTexts(docXml: string): string[][] {
  const body = els(parseXml(docXml), 'body')[0]!;
  return kids(body).filter((p) => localName(p.name) === 'p').map((p) => els(p, 'txbxContent').map((t) => paragraphsText(kids(t).filter((x) => localName(x.name) === 'p'))));
}

/** Text inside each `_ptx_` bookmark, in document order: `w:t`, `w:br`
 *  → '\n', and '\n' for a paragraph that starts while it runs on. A
 *  ruby's reading (`w:rt`) is skipped: only its base is the text. */
export function bookmarkTexts(docXml: string): Map<string, string> {
  const out = new Map<string, string>();
  const open = new Map<string, string>();
  const add = (s: string): void => {
    for (const name of open.values()) out.set(name, out.get(name)! + s);
  };
  const walk = (el: XmlElement): void => {
    for (const c of el.children) {
      if (typeof c === 'string') continue;
      const n = localName(c.name);
      if (n === 'bookmarkStart') {
        const name = c.attrs['w:name'] ?? '';
        if (name.startsWith(BOOKMARK_PREFIX)) {
          open.set(c.attrs['w:id']!, name);
          out.set(name, '');
        }
      } else if (n === 'bookmarkEnd') open.delete(c.attrs['w:id']!);
      else if (n === 't') add(c.children.filter((x): x is string => typeof x === 'string').join(''));
      else if (n === 'br') add('\n');
      else if (n === 'rt') continue;
      else {
        if (n === 'p') add('\n');
        walk(c);
      }
    }
  };
  walk({ name: 'root', attrs: {}, children: [parseXml(docXml)] });
  return out;
}

/** Child local names of `el`, in order. */
export const childNames = (el: XmlElement): string[] => kids(el).map((c) => localName(c.name));

/** True when `names` follow the order of `schema` (unknown names fail). */
export function inSchemaOrder(names: string[], schema: readonly string[]): boolean {
  let at = -1;
  for (const n of names) {
    const i = schema.indexOf(n);
    if (i < 0 || i < at) return false;
    at = i;
  }
  return true;
}

export const PPR_ORDER = ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr', 'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap', 'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid', 'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection', 'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'] as const;
export const RPR_ORDER = ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath', 'ligatures', 'numForm', 'numSpacing'] as const;
export const SECTPR_ORDER = ['headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar', 'paperSrc', 'pgBorders', 'lnNumType', 'pgNumType', 'cols', 'formProt', 'vAlign', 'noEndnote', 'titlePg', 'textDirection', 'bidi', 'rtlGutter', 'docGrid'] as const;
export const ANCHOR_ORDER = ['simplePos', 'positionH', 'positionV', 'extent', 'effectExtent', 'wrapNone', 'docPr', 'cNvGraphicFramePr', 'graphic'] as const;
export const WSP_ORDER = ['cNvPr', 'cNvSpPr', 'spPr', 'style', 'txbx', 'bodyPr'] as const;
export const TCPR_ORDER = ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark'] as const;
export const TBLPR_ORDER = ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize', 'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook'] as const;
