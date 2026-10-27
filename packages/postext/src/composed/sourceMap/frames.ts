// Frames, templates and their ancestors as source elements.
import type { VDTDesignSlot, VDTDocument, VDTPage, VDTFrame, VDTComposedPage, BoundingBox, VDTBlock } from '../../vdt.js';
import { resolvePageTemplate } from '../templates.js';
import { frameMatrix, frameContentRect } from '../paint.js';
import { groupElementId, composedPageElementId } from '../ids.js';
import type { SourceElement, SourceRef } from '../sourceMap.js';
import { designTextSource, headingDesignChain, enclosingBoxes, textChain } from './chains.js';
import { type Point, type FileRef, inside, ofBlock } from './text.js';

/** The slot element of a design slot, by the pointer its blocks share
 *  (`…/elements/<i>` taken off). */
export function slotElement(slot: VDTDesignSlot, id: string): SourceElement | undefined {
  const path = slot.blocks.find((b) => b.configPath !== undefined)?.configPath;
  const at = path?.lastIndexOf('/elements/') ?? -1;
  if (!path || at < 0) return undefined;
  return { level: 'slot', id, source: { kind: 'config', path: path.slice(0, at) }, rect: { ...slot.bbox } };
}

const resolvedTemplates = new WeakMap<VDTDocument, Map<string, ReturnType<typeof resolvePageTemplate>>>();

/** The template a composed page was set with, as the layout resolved it. */
function templateOf(doc: VDTDocument, page: VDTPage): ReturnType<typeof resolvePageTemplate> {
  const composed = page.composed!;
  const parity = (page.index + (doc.pageIndexOffset ?? 0)) % 2 === 0 ? 'recto' : 'verso';
  const modules = composed.modules ?? [];
  const key = `${composed.template}|${parity}|${modules.map((m) => `${m.name}\u0001${m.template}`).join('\u0000')}`;
  let cache = resolvedTemplates.get(doc);
  if (!cache) { cache = new Map(); resolvedTemplates.set(doc, cache); }
  if (!cache.has(key)) {
    cache.set(key, resolvePageTemplate({ pageTemplates: doc.config.pageTemplates, calloutStyles: doc.config.calloutStyles }, composed.template, { parity, ...(modules.length > 0 ? { modules } : {}) }));
  }
  return cache.get(key);
}

/** The frame element, its groups and the template, for a frame of `page`. */
export function frameAncestors(doc: VDTDocument, page: VDTPage, frame: VDTFrame): SourceElement[] {
  const composed = page.composed!;
  const out: SourceElement[] = [{
    level: 'frame',
    id: frame.id,
    source: { kind: 'config', path: frame.configPath },
    ...(frame.sourceStart !== undefined && frame.sourceEnd !== undefined ? { content: { start: frame.sourceStart, end: frame.sourceEnd } } : {}),
    ...(frame.sourceChapter !== undefined ? { chapter: frame.sourceChapter } : {}),
    rect: { ...frame.rect },
    ...(frame.rotate ? { rotate: frame.rotate } : {}),
  }];
  const template = templateOf(doc, page);
  for (const g of template?.groups ?? []) {
    // An instance of a repeated frame (#1061) is in its frame's grid.
    if (!g.frames.includes(frame.repeat?.frame ?? frame.name)) continue;
    out.push({ level: 'group', id: groupElementId(composed.fenceIndex, g.name), source: { kind: 'config', path: g.configPath } });
  }
  out.push(templateElement(composed));
  return out;
}

export function templateElement(composed: VDTComposedPage): SourceElement {
  return {
    level: 'template',
    id: composedPageElementId(composed.fenceIndex),
    source: { kind: 'config', path: composed.configPath },
    content: { start: composed.sourceStart, end: composed.sourceEnd },
  };
}

/** `p` in the upright frame of a turned frame. */
function intoFrame(frame: VDTFrame, p: Point): Point {
  const m = frameMatrix(frame);
  if (!m) return p;
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  const x = p.x - e;
  const y = p.y - f;
  return { x: (d * x - c * y) / det, y: (-b * x + a * y) / det };
}

/** A box in a frame's blocks' own coordinates on the page, upright: a
 *  frame whose text the reflow ladder scaled (#858) lays its blocks out
 *  `1 / scale` as large from its top-left; the box is scaled back, the
 *  turn (`rotate`) left to the element's `rotate`. */
export function uprightRect(frame: Pick<VDTFrame, 'rect' | 'scale'> | undefined, r: BoundingBox): BoundingBox {
  const s = frame?.scale;
  if (!frame || s === undefined || !(s > 0) || Math.abs(s - 1) < 1e-9) return { ...r };
  const o = frame.rect;
  return { x: o.x + (r.x - o.x) * s, y: o.y + (r.y - o.y) * s, width: r.width * s, height: r.height * s };
}

/** The elements of a frame's chain with their boxes upright on the page
 *  (`uprightRect`); the frame, its groups and the template keep theirs. */
function uprightChain(frame: VDTFrame, chain: SourceElement[]): SourceElement[] {
  if (frame.scale === undefined || Math.abs(frame.scale - 1) < 1e-9) return chain;
  return chain.map((e) => (e.rect && e.level !== 'frame' && e.level !== 'group' && e.level !== 'template' ? { ...e, rect: uprightRect(frame, e.rect) } : e));
}

/** What a frame shows at `p` (page px), innermost first. */
export function frameChain(doc: VDTDocument, page: VDTPage, frame: VDTFrame, blocks: readonly VDTBlock[], pagePoint: Point, file: FileRef, facing = false): SourceElement[] | undefined {
  const raw = frameChainOf(doc, page, frame, blocks, pagePoint, file);
  const chain = raw && uprightChain(frame, raw);
  // The half of a spread frame read on the facing page (#861): the ids of
  // the blocks it copies, flagged.
  return chain && facing ? chain.map((e) => (e.level === 'frame' || e.level === 'group' || e.level === 'template' ? e : { ...e, id: unfacing(e.id), facing: true as const })) : chain;
}

/** The id of the block a facing copy (`…-facing`) shows. */
export const unfacing = (id: string): string => id.replace(/-facing(?=$|[:@])/, '');

function frameChainOf(doc: VDTDocument, page: VDTPage, frame: VDTFrame, blocks: readonly VDTBlock[], pagePoint: Point, file: FileRef): SourceElement[] | undefined {
  const p = intoFrame(frame, pagePoint);
  const box = blocks.find((b) => b.type === 'callout' && (b.id === frame.blockIds[0] || frame.blockIds.length === 0)) ;
  const boxId = box?.id;
  // The tab and title of the frame's box (above its top edge, for a tab).
  const overlay = box?.designOverlay;
  if (overlay) {
    for (let i = overlay.blocks.length - 1; i >= 0; i--) {
      const b = overlay.blocks[i]!;
      if (b.kind !== 'text' || !inside(b.bbox, p)) continue;
      const src = designTextSource(b, p);
      if (!src) continue;
      const own = box ? ofBlock(file, box) : file;
      const source: SourceRef = b.attr !== undefined ? { kind: 'attr', name: b.attr, ...src, ...own } : { kind: 'markdown', ...src, ...own };
      return [{ level: 'text', id: `${frame.id}:${b.attr ?? 'title'}@${src.start}`, source }, ...frameAncestors(doc, page, frame)];
    }
  }
  const boxes = blocks.filter((b) => b.type === 'callout');
  // The title a heading's design prints in the frame (#906), a tab above
  // the heading included.
  for (const b of blocks) {
    const chain = headingDesignChain(b, p, file);
    if (chain) return [...chain, ...enclosingBoxes(b, boxes, file).filter((e) => e.id !== boxId), ...frameAncestors(doc, page, frame)];
  }
  // `p` is in the blocks' own coordinates: a scaled frame's are larger.
  if (!inside(frameContentRect(frame), p)) return undefined;
  // Content: the leaf block under `p` (text, a picture), then its boxes.
  for (const b of blocks) {
    if (b.type === 'callout' || b.hidden) continue;
    if (!inside(b.bbox, p)) continue;
    const chain = textChain(b, p, file);
    const nested = enclosingBoxes(b, boxes, file).filter((e) => e.id !== boxId);
    return [...chain, ...nested, ...frameAncestors(doc, page, frame)];
  }
  return frameAncestors(doc, page, frame);
}
