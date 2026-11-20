/**
 * How the backends paint a composed page (#855, DESIGN §4): the frames in
 * layer order with the template's decoration at layer 0, each frame's
 * blocks turned (and scaled, #858) by its matrix and clipped to its box
 * when its content overflows; on a page of a spread (#861) all of it
 * clipped to the page's share of the sheet. Shared by canvas, PDF and HTML
 * so the three agree.
 */
import { flowRectToPage, pageRectToFlow, pageToFlow, type VDTBlock, type VDTComicPage, type VDTComposedPage, type VDTDesignBlock, type VDTDesignSlot, type VDTFrame, type VDTPage } from '../vdt.js';

/** One step of a composed page's paint order. */
export type ComposedPaintItem =
  /** `facing`: the half of a frame read on the facing page of a spread
   *  (`VDTFrame.facingBlocks`, #861): painted, never read. */
  | { kind: 'frame'; frame: VDTFrame; blocks: VDTBlock[]; facing: boolean }
  /** The template's decoration at layer 0, without its blocks painted
   *  over the frames ({@link decorationUnder}). */
  | { kind: 'decoration' }
  /** The decoration's blocks painted over every frame (#1076: connectors
   *  into pictures; #1189: a module's texts, {@link decorationOver}); last
   *  in the order, present
   *  only when the decoration has such a block. */
  | { kind: 'over' };

/** Whether a decoration block is painted over the frames: a connector's
 *  path (#1076), a text (#1189), or a box, picture or path element marked
 *  `over`. */
export function paintsOverFrames(block: VDTDesignBlock): boolean {
  return (block.kind === 'path' || block.kind === 'text' || block.kind === 'box' || block.kind === 'image') && block.over === true;
}

/** The part of a composed page's decoration painted at layer 0, under
 *  the frames of layer 0 and up: the slot itself when none of its blocks
 *  is painted over them (the common case, so nothing is copied), else the
 *  slot without those blocks. */
export function decorationUnder(slot: VDTDesignSlot): VDTDesignSlot;
export function decorationUnder(slot: VDTDesignSlot | undefined): VDTDesignSlot | undefined;
export function decorationUnder(slot: VDTDesignSlot | undefined): VDTDesignSlot | undefined {
  if (!slot || !slot.blocks.some(paintsOverFrames)) return slot;
  return { ...slot, blocks: slot.blocks.filter((b) => !paintsOverFrames(b)) };
}

/** The part of a composed page's decoration painted after every frame
 *  (#1076), in slot order; undefined when there is none. */
export function decorationOver(slot: VDTDesignSlot | undefined): VDTDesignSlot | undefined {
  if (!slot || !slot.blocks.some(paintsOverFrames)) return undefined;
  return { ...slot, blocks: slot.blocks.filter(paintsOverFrames) };
}

/** Ids of the floats a composed page's frames hold: the backends paint
 *  them with their frames ({@link composedPaintOrder}), not with the
 *  page's other floats. Empty for any other page. */
export function composedFrameBlockIds(page: VDTPage): Set<string> {
  const ids = new Set<string>();
  for (const f of page.composed?.frames ?? []) for (const id of f.blockIds) ids.add(id);
  // A comic page's text panels (#885) are painted with their frames too,
  // and those of the strips it holds (#959).
  for (const f of page.comic?.frames ?? []) for (const id of f.blockIds) ids.add(id);
  const strip = (b: VDTBlock): void => {
    for (const f of b.comic?.frames ?? []) for (const id of f.blockIds) ids.add(id);
  };
  for (const col of page.columns) for (const b of col.blocks) strip(b);
  for (const b of page.floats ?? []) strip(b);
  return ids;
}

/** The frames painted under the decoration (`'below'`: layers below 0)
 *  or over it (`'above'`), for a backend that paints the decoration
 *  apart (a page painted through a flow frame, whose decoration stands on
 *  the sheet). */
export type ComposedPaintPart = 'below' | 'above';

/** The frames of a comic that hold text (`::panel{text}`, #885), with
 *  their blocks, in panel order: painted over the panels and under the
 *  lettering ({@link comicPaintsUnderText}). `comic` (on the sheet) is the
 *  page's comic page by default; pass a strip's (`pageComics`, #959) for
 *  its frames. Empty when the comic holds none. */
export function comicFramePaintOrder(page: VDTPage, comic: Pick<VDTComicPage, 'frames'> | undefined = page.comic): ComposedPaintItem[] {
  const frames = comic?.frames?.filter((f) => f.blockIds.length > 0) ?? [];
  if (frames.length === 0) return [];
  const byId = new Map<string, VDTBlock>();
  for (const b of page.floats ?? []) byId.set(b.id, b);
  // The frames stand on the sheet with their comic; their text is set in
  // the page's flow frame (#909), where the backends paint it: the frame
  // given there.
  const inFlow = (frame: VDTFrame): VDTFrame => (page.flow
    ? { ...frame, rect: pageRectToFlow(page, frame.rect), ...(frame.polygon ? { polygon: frame.polygon.map((q) => pageToFlow(page, q.x, q.y)) } : {}) }
    : frame);
  return frames.map((frame) => ({ kind: 'frame' as const, frame: inFlow(frame), blocks: frame.blockIds.map((id) => byId.get(id)).filter((b): b is VDTBlock => b !== undefined), facing: false }));
}

/** Whether a page's comic holds text panels (#885): its panels are then
 *  painted before the page's flow, the text frames after the floats, and
 *  its lettering last, so the text lies over its panel's ground and under
 *  the balloons. */
export function comicPaintsUnderText(page: VDTPage): boolean {
  return comicHoldsText(page.comic);
}

/** Whether a comic (on the sheet) holds a text frame with text in it. */
export function comicHoldsText(comic: Pick<VDTComicPage, 'frames'> | undefined): boolean {
  return comic?.frames?.some((f) => f.blockIds.length > 0) === true;
}

/** The paint order of a composed page: frames of a layer below 0, the
 *  decoration (layer 0), then the frames of layer 0 and up; frames of
 *  one layer in template order; last, when the decoration has blocks
 *  painted over the frames (#1076), the `'over'` item. Each frame comes
 *  with its blocks, in `page.floats` order (its box first). With `part`,
 *  only the frames on that side of the decoration, and neither decoration
 *  item: the caller paints the decoration on the sheet, and its `'over'`
 *  part after the frames `'above'`. */
export function composedPaintOrder(page: VDTPage, part?: ComposedPaintPart): ComposedPaintItem[] {
  if (part) {
    const all = composedPaintOrder(page).filter((item) => item.kind !== 'over');
    const at = all.findIndex((item) => item.kind === 'decoration');
    return part === 'below' ? all.slice(0, at) : all.slice(at + 1);
  }
  const composed = page.composed;
  if (!composed) return [];
  const byId = new Map<string, VDTBlock>();
  for (const b of page.floats ?? []) byId.set(b.id, b);
  const frames = composed.frames
    .map((frame, order) => ({ frame, order }))
    .sort((a, b) => a.frame.layer - b.frame.layer || a.order - b.order);
  const out: ComposedPaintItem[] = [];
  let decorated = false;
  for (const { frame } of frames) {
    if (!decorated && frame.layer >= 0) {
      out.push({ kind: 'decoration' });
      decorated = true;
    }
    if (frame.facingBlocks) {
      out.push({ kind: 'frame', frame, blocks: frame.facingBlocks, facing: true });
      continue;
    }
    const blocks: VDTBlock[] = [];
    for (const id of frame.blockIds) {
      const b = byId.get(id);
      if (b) blocks.push(b);
    }
    out.push({ kind: 'frame', frame, blocks, facing: false });
  }
  if (!decorated) out.push({ kind: 'decoration' });
  if (composed.decoration?.blocks.some(paintsOverFrames)) out.push({ kind: 'over' });
  return out;
}

/** The items of a paint order (`composedPaintOrder`) in reading order
 *  (#862): the decoration first, then the frames by the Markdown order of
 *  their content (the lowest content index of their blocks; a frame with
 *  no content keeps its place after those that have some). The pieces of
 *  one story (`next`) follow each other, as their content does. What the
 *  HTML writes in this order and paints by `z-index`; the tagged PDF reads
 *  the same order (`readFloat`'s `readAt`). */
export function composedReadingOrder(paint: readonly ComposedPaintItem[]): ComposedPaintItem[] {
  const byId = new Map<string, VDTFrame>();
  for (const item of paint) if (item.kind === 'frame') byId.set(item.frame.id, item.frame);
  /** How many frames a chain passes through before this one: a piece of a
   *  paragraph cut at a frame's foot has the head's content index. */
  const depth = (frame: VDTFrame): number => {
    let n = 0;
    for (let f = frame.continuedFrom ? byId.get(frame.continuedFrom) : undefined; f && n < byId.size; f = f.continuedFrom ? byId.get(f.continuedFrom) : undefined) n++;
    return n;
  };
  const firstIndex = (item: ComposedPaintItem): number => {
    if (item.kind === 'decoration' || item.kind === 'over') return -Infinity;
    let min = Infinity;
    for (const b of item.blocks) if (b.contentIndex !== undefined && b.contentIndex < min) min = b.contentIndex;
    return min + depth(item.frame) / 1000;
  };
  return paint
    .map((item, order) => ({ item, order, at: firstIndex(item) }))
    .sort((a, b) => (a.at === b.at ? a.order - b.order : a.at - b.at))
    .map((e) => e.item);
}

/** On a page of a spread (#861): the box the page's frames and decoration
 *  are painted clipped to (`VDTComposedPage.sheetClip`), so what crosses
 *  the spine shows its own half on each page; undefined on any other
 *  page. */
export function composedSheetClip(page: Pick<VDTPage, 'composed'>): { x: number; y: number; width: number; height: number } | undefined {
  return page.composed?.sheetClip;
}

/** {@link composedSheetClip} on the sheet, for what a page paints there
 *  rather than through its flow frame (the decoration of a vertical or
 *  right-to-left page): the clip, in the page's flow coordinates, mapped
 *  to the page (#926). The same box on any other page. */
export function composedSheetClipOnSheet(page: Pick<VDTPage, 'composed' | 'flow'>): { x: number; y: number; width: number; height: number } | undefined {
  const clip = page.composed?.sheetClip;
  return clip ? flowRectToPage(page, clip) : undefined;
}

type Affine = [number, number, number, number, number, number];

/** `m` then `n` (canvas `transform` order): the matrix of applying `n`
 *  first, then `m`. */
const multiply = (m: Affine, n: Affine): Affine => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** The text scale of a frame, 1 when it has none (#858). */
const scaleOf = (frame: Partial<Pick<VDTFrame, 'scale'>>): number => {
  const s = frame.scale;
  return s !== undefined && Number.isFinite(s) && s > 0 && Math.abs(s - 1) > 1e-9 ? s : 1;
};

/** The affine matrix `[a, b, c, d, e, f]` (canvas `transform` order,
 *  y down) that puts a frame's blocks on the sheet (in the page's flow frame, #929): scaled by the frame's
 *  text `scale` about the top-left of its box (#858; the blocks are laid
 *  out `1 / scale` as large), then turned `rotate` degrees clockwise about
 *  the centre of its box. Undefined for an upright frame at full size. */
export function frameMatrix(frame: Pick<VDTFrame, 'rect' | 'rotate'> & Partial<Pick<VDTFrame, 'scale' | 'unmirrorX'>>): Affine | undefined {
  const s = scaleOf(frame);
  const unmirrorX = frame.unmirrorX;
  if (unmirrorX !== undefined) {
    // A frame of a right-to-left page painted through the mirrored flow,
    // as it stands on a left-to-right sheet (#960): the matrix of the
    // frame's box mirrored to where the sheet shows it, preceded by the
    // move of the content there and followed by the page's mirror, which
    // turns the whole back into a plain placement.
    const r = frame.rect;
    const shown = { x: unmirrorX - (r.x + r.width), y: r.y, width: r.width, height: r.height };
    const there = frameMatrix({ rect: shown, rotate: frame.rotate, scale: s });
    const move: Affine = [1, 0, 0, 1, shown.x - r.x, 0];
    const mirror: Affine = [-1, 0, 0, 1, unmirrorX, 0];
    return multiply(mirror, there ? multiply(there, move) : move);
  }
  const scaled: Affine | undefined = s === 1 ? undefined : [s, 0, 0, s, frame.rect.x * (1 - s), frame.rect.y * (1 - s)];
  const deg = frame.rotate % 360;
  if (!Number.isFinite(deg) || Math.abs(deg) < 1e-9) return scaled;
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = frame.rect.x + frame.rect.width / 2;
  const cy = frame.rect.y + frame.rect.height / 2;
  const turn: Affine = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
  return scaled ? multiply(turn, scaled) : turn;
}

/** The quarter turn a frame set in its own writing mode (#944) adds to its
 *  `rotate`: 90 for a vertical frame on a horizontal page, −90 for a
 *  horizontal one on a vertical page; 0 for any other frame. */
export function frameModeTurn(frame: Pick<VDTFrame, 'writingMode'>): number {
  return frame.writingMode === 'vertical-rl' ? 90 : frame.writingMode === 'horizontal-tb' ? -90 : 0;
}

/** A box turned a quarter turn about its centre: its width and height
 *  swapped. */
export function quarterTurnedRect(r: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
  return { x: r.x + r.width / 2 - r.height / 2, y: r.y + r.height / 2 - r.width / 2, width: r.height, height: r.width };
}

/** The box the page gives a frame, before the frame's own `rotate`: its
 *  `rect`, or, for a frame set in its own writing mode (#944), `rect`
 *  turned back a quarter turn. */
export function framePageRect(frame: Pick<VDTFrame, 'rect' | 'writingMode'>): { x: number; y: number; width: number; height: number } {
  return frame.writingMode ? quarterTurnedRect(frame.rect) : { ...frame.rect };
}

/** A frame's box in its blocks' own coordinates: `rect` itself, or, for a
 *  frame whose text the reflow ladder scaled (#858), the larger box its
 *  content was laid out in. Backends clip to it under {@link frameMatrix}. */
export function frameContentRect(frame: Pick<VDTFrame, 'rect'> & Partial<Pick<VDTFrame, 'scale'>>): { x: number; y: number; width: number; height: number } {
  const s = scaleOf(frame);
  const r = frame.rect;
  return s === 1 ? { ...r } : { x: r.x, y: r.y, width: r.width / s, height: r.height / s };
}

/** Whether a frame's content is clipped to its box: some of it runs past
 *  the frame's foot. */
export function frameClips(frame: Pick<VDTFrame, 'overflowPx'>): boolean {
  return frame.overflowPx > 0.5;
}

/** The axis-aligned box a frame covers on the page once turned. */
export function frameBounds(frame: Pick<VDTFrame, 'rect' | 'rotate'> & Partial<Pick<VDTFrame, 'scale'>>): { x: number; y: number; width: number; height: number } {
  const m = frameMatrix(frame);
  const r = frameContentRect(frame);
  if (!m) return { ...r };
  const pts = [[r.x, r.y], [r.x + r.width, r.y], [r.x, r.y + r.height], [r.x + r.width, r.y + r.height]].map(([x, y]) => [
    m[0] * x! + m[2] * y! + m[4],
    m[1] * x! + m[3] * y! + m[5],
  ]);
  const xs = pts.map((p) => p[0]!);
  const ys = pts.map((p) => p[1]!);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** The frame of `composed` holding block `id`, if any. */
export function frameOfBlock(composed: VDTComposedPage | undefined, id: string): VDTFrame | undefined {
  return composed?.frames.find((f) => f.blockIds.includes(id));
}
