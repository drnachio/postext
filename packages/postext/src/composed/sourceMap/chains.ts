// The chains of elements a block, label, box or design text belongs to.
import { labelGlyphAt } from '../labels.js';
import { pathHit } from '../../design/pathBlock.js';
import type { VDTBlock, VDTFigureLabel, VDTDesignTextBlock, VDTDesignBlock, VDTComposedPage } from '../../vdt.js';
import type { SourceElement, SourceRef } from '../sourceMap.js';
import { type FileRef, ofBlock, type Point, inside, lineAt, glyphAt, lineRange } from './text.js';

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

export const blockElement = (block: VDTBlock, fileIn: FileRef): SourceElement | undefined => {
  if (block.sourceStart === undefined || block.sourceEnd === undefined) return undefined;
  const file = ofBlock(fileIn, block);
  return {
    level: block.type === 'callout' ? 'box' : 'block',
    id: block.id,
    source: { kind: 'markdown', start: block.sourceStart, end: block.sourceEnd, ...file },
    rect: { ...block.bbox },
    ...(block.tocEntry?.headingSource !== undefined ? { heading: block.tocEntry.headingSource } : {}),
  };
};

/** What a text block of the body shows at `p` (flow frame): the glyph, the
 *  line and the block, innermost first. */
export function textChain(block: VDTBlock, p: Point, fileIn: FileRef): SourceElement[] {
  const out: SourceElement[] = [];
  const file = ofBlock(fileIn, block);
  if (block.resourceBlock) {
    const resourceId = block.resourceBlock.resource.id;
    // A label laid on the picture (#860): its glyph, then the label.
    const label = block.resourceBlock.labels?.find((l) => l.rect && inside(l.rect, p));
    if (label) out.push(...labelChain(label, resourceId, block.id, p, file, block));
    out.push({ level: 'resource', id: `${block.id}:resource`, source: { kind: 'resource', resourceId }, rect: { ...block.bbox } });
  } else {
    const hit = lineAt(block, p.y);
    if (hit) {
      const glyph = glyphAt(block, hit.line, p.x);
      if (glyph) out.push({ level: 'text', id: `${block.id}@${glyph.plain}`, source: { kind: 'markdown', start: glyph.start, end: glyph.end, ...file } });
      const range = lineRange(block, hit.line);
      if (range) out.push({ level: 'line', id: `${block.id}:l${hit.index}`, source: { kind: 'markdown', ...range, ...file }, rect: { ...hit.line.bbox } });
    }
  }
  const el = blockElement(block, file);
  if (el) out.push(el);
  return out;
}

/** A figure label's glyph at `p` (its text spread over its rect) and the
 *  label itself, its source the resource at its anchor. */
export function labelChain(label: VDTFigureLabel, resourceId: string, blockId: string, p: Point, file: FileRef, block?: VDTBlock): SourceElement[] {
  const id = label.id ?? `${blockId}:label:${'anchor' in label.at ? label.at.anchor : label.sourceStart}`;
  const anchor = label.anchorRef ? label.anchorRef.slice(label.anchorRef.indexOf('#') + 1) : undefined;
  const out: SourceElement[] = [];
  const map = label.sourceMap;
  if (label.rect && map && map.length > 0) {
    // The glyph under the point on the label's lines, through its turn
    // (#860); else its text spread over its box.
    const k = block && label.layout ? labelGlyphAt(label, block, p.x, p.y) : undefined;
    const frac = label.rect.width > 0 ? Math.max(0, Math.min(0.9999, (p.x - label.rect.x) / label.rect.width)) : 0;
    const at = map[Math.min(map.length - 1, k ?? Math.floor(frac * map.length))]!;
    out.push({ level: 'text', id: `${id}@${at}`, source: { kind: 'markdown', start: at, end: at + 1, ...file } });
  }
  out.push({
    level: 'label',
    id,
    source: { kind: 'resource', resourceId, ...(anchor !== undefined ? { anchor } : {}) },
    content: { start: label.sourceStart, end: label.sourceEnd },
    ...(label.rect ? { rect: { ...label.rect } } : {}),
  });
  return out;
}

/** The boxes enclosing `block` among `boxes` (innermost first). */
export function enclosingBoxes(block: VDTBlock, boxes: readonly VDTBlock[], file: FileRef): SourceElement[] {
  const out: SourceElement[] = [];
  let id = block.id;
  for (let guard = 0; guard < 32; guard++) {
    const parent = boxes.find((b) => b.callout?.childIds.includes(id));
    if (!parent) break;
    const el = blockElement(parent, file);
    if (el) out.push({ ...el, level: 'box' });
    id = parent.id;
  }
  return out;
}

/** A design text block's glyph under `p`: its per-character map when it
 *  has one (lines laid from its bbox's left, their `xOffset`), else its
 *  whole range. */
export function designTextSource(b: VDTDesignTextBlock, p: Point): { start: number; end: number } | undefined {
  if (b.sourceStart === undefined || b.sourceEnd === undefined) return undefined;
  const map = b.sourceMap;
  const text = b.sourceText;
  if (!map || !text || map.length !== text.length || b.lines.length === 0) return { start: b.sourceStart, end: b.sourceEnd };
  // The printed lines are the source text cut at its line breaks / wraps.
  let best = 0;
  let bestDy = Infinity;
  const lineH = b.bbox.height / Math.max(1, b.lines.length);
  b.lines.forEach((l, i) => {
    const mid = l.baselineY - lineH * 0.35;
    const dy = Math.abs(p.y - mid);
    if (dy < bestDy) { bestDy = dy; best = i; }
  });
  let at = 0;
  for (let i = 0; i < best; i++) {
    const t = b.lines[i]!.text;
    const found = text.indexOf(t, at);
    at = found >= 0 ? found + t.length : at + t.length;
    while (at < text.length && /\s/.test(text[at]!)) at++;
  }
  const line = b.lines[best]!;
  const lineStart = text.indexOf(line.text, at) >= 0 ? text.indexOf(line.text, at) : at;
  const x0 = b.bbox.x + line.xOffset;
  const frac = line.width > 0 ? Math.max(0, Math.min(0.9999, (p.x - x0) / line.width)) : 0;
  const k = Math.min(text.length - 1, lineStart + Math.floor(frac * Math.max(1, line.text.length)));
  const s = map[Math.max(0, k)]!;
  return { start: s, end: s + 1 };
}

/** What a heading's own design shows at `p` (#906): the glyph of the
 *  title it prints (`{titleText}`, or an attribute), then the heading. The
 *  heading's lines are not painted: its design is what the page shows. */
export function headingDesignChain(block: VDTBlock, p: Point, fileIn: FileRef): SourceElement[] | undefined {
  const file = ofBlock(fileIn, block);
  const overlay = block.designOverlay;
  if (block.type !== 'heading' || !overlay || block.hidden) return undefined;
  for (let i = overlay.blocks.length - 1; i >= 0; i--) {
    const b = overlay.blocks[i]!;
    if (b.kind !== 'text' || !inside(b.bbox, p)) continue;
    const src = designTextSource(b, p);
    if (!src) continue;
    const source: SourceRef = b.attr !== undefined ? { kind: 'attr', name: b.attr, ...src, ...file } : { kind: 'markdown', ...src, ...file };
    const el = blockElement(block, file);
    return [{ level: 'text', id: `${block.id}:${b.attr ?? 'title'}@${src.start}`, source }, ...(el ? [el] : [])];
  }
  return undefined;
}

/** The chain of a design block at `p` (`idOf` names its element),
 *  innermost first, or undefined when `p` misses it. */
export function designChain(
  b: VDTDesignBlock,
  index: number,
  p: Point,
  idOf: (element: string) => string,
  composed: VDTComposedPage | undefined,
  file: FileRef,
): SourceElement[] | undefined {
  if (!inside(b.bbox, p)) return undefined;
  // A vector shape (#1055) answers on its ink only, not across its box.
  if (b.kind === 'path' && !pathHit(b, p)) return undefined;
  const out: SourceElement[] = [];
  const elementId = idOf(b.elementId ?? `#${index}`);
  if (b.kind === 'text') {
    const src = designTextSource(b, p);
    if (src) {
      out.push(b.attr !== undefined
        ? { level: 'text', id: `${elementId}@${src.start}`, source: { kind: 'attr', name: b.attr, ...src, ...file } }
        : { level: 'text', id: `${elementId}@${src.start}`, source: { kind: 'markdown', ...src, ...file } });
    }
  } else if (b.kind === 'image' && b.attr !== undefined && composed?.attrSources[b.attr]) {
    const a = composed.attrSources[b.attr]!;
    out.push({ level: 'attr', id: `${elementId}:attr`, source: { kind: 'attr', name: b.attr, start: a.sourceStart, end: a.sourceEnd, ...file } });
  }
  if (b.kind === 'image' && b.attr !== undefined && composed?.attrs[b.attr]) {
    out.push({ level: 'resource', id: `${elementId}:resource`, source: { kind: 'resource', resourceId: composed.attrs[b.attr]! } });
  }
  if (b.configPath !== undefined) out.push({ level: 'design', id: elementId, source: { kind: 'config', path: b.configPath }, rect: { ...b.bbox } });
  return out.length > 0 ? out : undefined;
}
