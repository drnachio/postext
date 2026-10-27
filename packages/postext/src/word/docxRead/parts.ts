// The package parts of a `.docx`: files, relationships, styles, numbering
// and tab stops.
import { strFromU8 } from 'fflate';
import type { WordStyle, WordNumbering, WordTabStop } from '../model.js';
import { type XmlElement, parseXml, children, attr, child, onOff } from '../xml.js';

/** customXml item holding the template of a Postext export. */
export const TEMPLATE_XML_ROOT = 'postextWordTemplate';
export const TEMPLATE_XML_NS = 'https://postext.dev/word-template';

export class DocxReadError extends Error {}

export type Files = Record<string, Uint8Array>;

export const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', emf: 'image/emf', wmf: 'image/wmf', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp',
};

export function readText(files: Files, path: string): string | undefined {
  const bytes = files[path];
  return bytes ? strFromU8(bytes) : undefined;
}

export function readXml(files: Files, path: string): XmlElement | undefined {
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

export interface Relationship { type: string; target: string; external: boolean }

export function readRels(files: Files, partPath: string): Map<string, Relationship> {
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

export function runFlags(rPr: XmlElement | undefined): Pick<WordStyle, 'bold' | 'italic' | 'smallCaps' | 'script'> {
  if (!rPr) return {};
  const va = attr(child(rPr, 'vertAlign'), 'val');
  return {
    bold: onOff(child(rPr, 'b')),
    italic: onOff(child(rPr, 'i')),
    smallCaps: onOff(child(rPr, 'smallCaps')),
    script: va === 'superscript' ? 'sup' : va === 'subscript' ? 'sub' : undefined,
  };
}

/** A whole number attribute (`w:val` of `w:spacing` or `w:sz`). */
function intAttr(el: XmlElement | undefined, local: string): number | undefined {
  const v = attr(el, local);
  if (v === undefined || !/^-?\d{1,6}$/.test(v)) return undefined;
  return Number(v);
}

export function readStyles(root: XmlElement | undefined): { styles: Map<string, WordStyle>; defaultParagraph: string; defaultSize?: number } {
  const styles = new Map<string, WordStyle>();
  let defaultParagraph = '';
  const defaultSize = intAttr(child(child(child(child(root, 'docDefaults'), 'rPrDefault'), 'rPr'), 'sz'), 'val');
  for (const s of children(root, 'style')) {
    const id = attr(s, 'styleId');
    const type = attr(s, 'type') as WordStyle['type'] | undefined;
    if (!id || !type) continue;
    const name = attr(child(s, 'name'), 'val') ?? id;
    const pPr = child(s, 'pPr');
    const numPr = child(pPr, 'numPr');
    const outline = attr(child(pPr, 'outlineLvl'), 'val');
    const styleRPr = child(s, 'rPr');
    const spacing = intAttr(child(styleRPr, 'spacing'), 'val');
    const size = intAttr(child(styleRPr, 'sz'), 'val');
    const style: WordStyle = {
      id,
      name,
      type,
      basedOn: attr(child(s, 'basedOn'), 'val'),
      ...runFlags(child(s, 'rPr')),
      numId: attr(child(numPr, 'numId'), 'val'),
      ilvl: numPr ? Number(attr(child(numPr, 'ilvl'), 'val') ?? 0) : undefined,
      outlineLevel: outline !== undefined ? Number(outline) : undefined,
      ...(child(pPr, 'tabs') ? { tabs: readTabs(pPr) } : {}),
      ...(spacing !== undefined ? { letterSpacing: spacing } : {}),
      ...(size !== undefined ? { fontSizeHalfPoints: size } : {}),
    };
    styles.set(id, style);
    const isDefault = s.attrs['w:default'];
    if (type === 'paragraph' && (isDefault === '1' || isDefault === 'true' || isDefault === 'on')) defaultParagraph = id;
  }
  return { styles, defaultParagraph, ...(defaultSize !== undefined ? { defaultSize } : {}) };
}

export function readNumbering(root: XmlElement | undefined): WordNumbering {
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

/** The tab stops of a `w:pPr` (#622). */
export function readTabs(pPr: XmlElement | undefined): WordTabStop[] {
  const out: WordTabStop[] = [];
  for (const t of children(child(pPr, 'tabs'), 'tab')) {
    const val = attr(t, 'val');
    const pos = Number(attr(t, 'pos'));
    if (!val || !Number.isFinite(pos)) continue;
    const leader = attr(t, 'leader');
    out.push({ val, pos, ...(leader && leader !== 'none' ? { leader } : {}) });
  }
  return out;
}
