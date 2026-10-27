/**
 * One page design of a book that keeps its text in heading styles (#874):
 * the elements of a style's running head split into the text that moves to
 * the Markdown (grouped into frames by geometry and look) and the
 * decoration that stays in the configuration. Pure; lengths in mm.
 */
import type { ChipStyleConfig, DesignElement, ColorValue, DesignImageElement } from '../types.js';
import { stableStringify } from '../util/stableHash.js';
import { findLabelledPictures, coversPage } from './pageDesign/pictures.js';
import { hasPlaceholder, lookOf, toMm, rectOf, contentLines, estimateLines, sideOf, escapeText, highlightColour, boldRuns, chipStyleFor } from './pageDesign/text.js';
import type { DesignInput, PlannedDesign, TextPiece, PlannedFrame } from './pageDesign/types.js';

export type { TextLook, TextPiece, PlannedPicture, PlannedFrame, DesignInput, PlannedDesign } from './pageDesign/types.js';
export { toMm, lookOf, hasPlaceholder, joinLines } from './pageDesign/text.js';
export { remapDecorationAnchors } from './pageDesign/pictures.js';

/** Split one page design. */
export function planDesign(input: DesignInput): PlannedDesign {
  const { elements, page } = input;
  const notes: string[] = [];
  const kept: PlannedDesign['kept'] = [];
  const movedIds = new Set<string>();
  const pieces: TextPiece[] = [];
  const newChipStyles = new Map<string, ChipStyleConfig>();

  for (const el of elements) {
    if (el.kind !== 'text' || typeof el.content !== 'string') continue;
    if (!input.isContent(el.content)) continue;
    if (hasPlaceholder(el.content)) {
      kept.push({ id: el.id, reason: 'placeholder' });
      continue;
    }
    const to = el.placement?.anchor?.to;
    if (to !== 'page' && to !== 'bleed') {
      kept.push({ id: el.id, reason: 'anchor' });
      continue;
    }
    const look = lookOf(el);
    const sizeMm = toMm(el.fontSize) ?? 4.2;
    const lineMm = sizeMm * look.lineHeight;
    const r = rectOf(el);
    const lines = contentLines(el.content);
    const pieceNotes: string[] = [];
    if (el.box) pieceNotes.push('box');
    if (el.stroke) pieceNotes.push('stroke');
    if (el.dropCap) pieceNotes.push('dropCap');
    if (el.paragraphIndent) pieceNotes.push('paragraphIndent');
    if (typeof el.placement?.size?.height === 'object') pieceNotes.push('height');
    const chars = (el.content.match(/[\p{L}\p{N}]/gu) ?? []).length;
    const n = estimateLines(lines, r?.w, sizeMm);
    const sure = n === lines.length;
    pieces.push({
      id: el.id,
      ...(sideOf(el) ? { side: sideOf(el) } : {}),
      ...(r ? { x: r.x, y: r.y, ...(r.w !== undefined ? { width: r.w } : {}), height: n * lineMm, heightSure: sure } : {}),
      lineMm,
      look,
      lookKey: stableStringify(look),
      element: el,
      lines,
      chars,
      notes: pieceNotes,
    });
    movedIds.add(el.id);
  }

  // Labels (#918): the short texts on a picture leave the frames for the
  // picture's anchors; the picture leaves the decoration for a frame.
  const pictures = input.labelsOnPictures ? findLabelledPictures(pieces, elements, input.labelsOnPictures) : [];
  const labelled = new Set(pictures.flatMap((pic) => pic.labels));
  const pictureIds = new Set(pictures.map((pic) => pic.element.id));
  if (labelled.size > 0) {
    for (let i = pieces.length - 1; i >= 0; i--) if (labelled.has(pieces[i]!)) pieces.splice(i, 1);
    for (const pic of pictures) {
      // Decoration painted over the picture would lie under its frame
      // (the decoration is one slot, at layer 0, like the frame). When
      // nothing of the decoration lies under the picture, the frame goes
      // one layer down, below the decoration, and the page keeps its
      // order (#957); otherwise the page may look different.
      const at = elements.indexOf(pic.element);
      const meets = (r: { x: number; y: number; w?: number; h?: number } | undefined, box: { x: number; y: number; width: number; height: number }): boolean =>
        !!r && r.w !== undefined && r.h !== undefined && r.x < box.x + box.width && r.x + r.w > box.x && r.y < box.y + box.height && r.y + r.h > box.y;
      const stays = (e: DesignElement): boolean => !movedIds.has(e.id) && e.kind !== 'text' && !pictureIds.has(e.id);
      const over = elements.slice(at + 1).filter((e) => stays(e) && meets(rectOf(e), pic));
      if (over.length > 0) {
        // What is under the picture would cover it from the layer below
        // the decoration; so would anything whose place is not known.
        const underOrUnknown = elements.slice(0, at).some((e) => {
          if (!stays(e)) return false;
          const r = rectOf(e);
          return !r || r.w === undefined || r.h === undefined || meets(r, pic);
        });
        const onLabel = over.some((e) => pic.labels.some((l) => l.x !== undefined && l.y !== undefined && l.width !== undefined && l.height !== undefined
          && meets(rectOf(e), { x: l.x, y: l.y, width: l.width, height: l.height })));
        const onPicture = pictures.some((other) => other !== pic && other.x < pic.x + pic.width && other.x + other.width > pic.x && other.y < pic.y + pic.height && other.y + other.height > pic.y);
        if (underOrUnknown || onLabel || onPicture) pic.notes.push('overPicture');
        else pic.layer = -1;
      }
      for (const l of pic.labels) l.lines = l.lines.map((line) => escapeText(line, l.element.inlineMarks === true));
    }
  }

  // Highlights: a filled box on a line of a moved text that carries a bold
  // run is that run's chip.
  const usedBoxes = new Set<string>();
  let chips = 0;
  for (const p of pieces) {
    const marks = p.element.inlineMarks === true;
    let lines = p.lines.map((l) => escapeText(l, marks));
    if (input.highlightsToChips && marks && p.x !== undefined && p.y !== undefined && p.width !== undefined && p.height !== undefined) {
      const onLine = new Map<number, ColorValue>();
      const boxes: string[] = [];
      for (const el of elements) {
        const colour = highlightColour(el);
        if (!colour || usedBoxes.has(el.id) || sideOf(el) !== p.side) continue;
        const r = rectOf(el);
        if (!r || r.w === undefined || r.h === undefined) continue;
        if (r.h > p.lineMm * 1.6) continue;
        const cy = r.y + r.h / 2;
        if (r.x < p.x - 1 || r.x + r.w > p.x + p.width + 1 || cy < p.y || cy > p.y + p.height) continue;
        const line = Math.floor((cy - p.y) / p.lineMm);
        if (line < 0 || line >= p.lines.length) continue;
        onLine.set(line, colour);
        boxes.push(el.id);
      }
      if (onLine.size > 0) {
        const { runs } = boldRuns(lines);
        const covered = new Set<number>();
        // Replace from the end so earlier offsets hold.
        const edits: { line: number; start: number; end: number; style: string }[] = [];
        for (const run of runs) {
          if (!run.some((seg) => onLine.has(seg.line))) continue;
          const text = run.map((seg) => lines[seg.line]!.slice(seg.start, seg.end)).join('');
          if (/[[\]*_]/.test(text)) continue;
          const colour = onLine.get(run.find((seg) => onLine.has(seg.line))!.line)!;
          const style = chipStyleFor(colour, input.chipStyles, newChipStyles);
          for (const seg of run) {
            edits.push({ line: seg.line, start: seg.start, end: seg.end, style });
            covered.add(seg.line);
          }
        }
        edits.sort((a, b) => b.line - a.line || b.start - a.start);
        lines = lines.slice();
        for (const e of edits) {
          const l = lines[e.line]!;
          const opens = l.slice(Math.max(0, e.start - 2), e.start) === '**';
          const closes = l.slice(e.end, e.end + 2) === '**';
          const inner = l.slice(e.start, e.end);
          const chip = inner.trim() === '' ? inner : `:chip[${inner}]{style="${e.style}"}`;
          lines[e.line] = l.slice(0, opens ? e.start - 2 : e.start) + chip + l.slice(closes ? e.end + 2 : e.end);
        }
        // A boxed line without a bold run keeps its box.
        for (const id of boxes) {
          const el = elements.find((x) => x.id === id)!;
          const r = rectOf(el)!;
          const line = Math.floor((r.y + (r.h ?? 0) / 2 - p.y!) / p.lineMm);
          if (covered.has(line)) usedBoxes.add(id);
        }
        chips += edits.length;
      }
    }
    p.lines = lines;
  }

  // Frames: pieces of one look under one another, at one spacing.
  const ordered = pieces.slice().sort((a, b) => (a.y ?? Infinity) - (b.y ?? Infinity) || (a.x ?? 0) - (b.x ?? 0));
  const frames: PlannedFrame[] = [];
  for (const p of ordered) {
    let target: PlannedFrame | undefined;
    if (input.merge && p.x !== undefined && p.y !== undefined) {
      target = frames.find((f) => {
        const last = f.pieces[f.pieces.length - 1]!;
        if (f.side !== p.side || f.lookKey !== p.lookKey || last.x === undefined || last.y === undefined || last.height === undefined) return false;
        if (Math.abs(last.x - p.x!) > 0.6) return false;
        if (Math.abs((last.width ?? 0) - (p.width ?? 0)) > 2) return false;
        // Where the last piece ends must be known, not guessed from a wrap.
        if (!last.heightSure) return false;
        const gap = p.y! - (last.y + last.height);
        if (gap < -0.35 * p.lineMm || gap > 1.6 * p.lineMm) return false;
        if (f.pieces.length > 1 && Math.abs(gap - f.gap) > 0.5) return false;
        // Nothing in between: no other text, no edge of a box.
        const top = last.y + last.height - 0.2;
        const bottom = p.y! + 0.2;
        const left = Math.min(last.x, p.x!);
        const right = Math.max(last.x + (last.width ?? 0), p.x! + (p.width ?? 0));
        const across = (x: number, w: number) => x < right && x + w > left;
        if (pieces.some((q) => q !== last && q !== p && q.y !== undefined && q.x !== undefined && q.y > top && q.y < bottom && across(q.x, q.width ?? 0))) return false;
        if (elements.some((e) => {
          if (e.kind !== 'box' && e.kind !== 'rule') return false;
          const r = rectOf(e);
          if (!r) return false;
          const edges = [r.y, r.y + (r.h ?? 0)];
          return across(r.x, r.w ?? 0) && edges.some((y) => y > top && y < bottom) && (e.kind === 'rule' || (r.h ?? 0) > p.lineMm * 1.6);
        })) return false;
        return true;
      });
    }
    if (target) {
      const last = target.pieces[target.pieces.length - 1]!;
      if (target.pieces.length === 1) target.gap = Math.max(0, Math.round((p.y! - (last.y! + last.height!)) * 10) / 10);
      target.pieces.push(p);
      target.width = Math.max(target.width ?? 0, p.width ?? 0) || undefined;
      continue;
    }
    frames.push({ ...(p.side ? { side: p.side } : {}), pieces: [p], look: p.look, lookKey: p.lookKey, gap: 0, ...(p.width !== undefined ? { width: p.width } : {}), key: '' });
  }
  const round = (v: number | undefined) => (v === undefined ? '-' : (Math.round(v * 2) / 2).toFixed(1));
  for (const pic of pictures) {
    const side = sideOf(pic.element);
    frames.push({
      ...(side ? { side } : {}),
      pieces: [],
      picture: pic,
      look: pic.labels[0]!.look,
      lookKey: 'picture',
      gap: 0,
      width: pic.width,
      key: ['picture', side ?? '', round(pic.x), round(pic.y), round(pic.width), round(pic.height), pic.layer ?? 0].join('|'),
    });
    notes.push(...pic.notes.map((n) => `${pic.element.id}:${n}`));
  }
  for (const f of frames) {
    if (f.picture) continue;
    const first = f.pieces[0]!;
    f.key = [f.side ?? '', f.lookKey, round(first.x), round(first.y), round(f.width), first.x === undefined ? stableStringify(first.element.placement) : ''].join('|');
    for (const p of f.pieces) notes.push(...p.notes.map((n) => `${p.id}:${n}`));
  }
  const movedTo = new Map<string, number>();
  frames.forEach((f, i) => {
    f.pieces.forEach((p) => movedTo.set(p.id, i));
    // Anchors to the picture or to one of its labels follow its frame.
    if (f.picture) {
      movedTo.set(f.picture.element.id, i);
      for (const l of f.picture.labels) movedTo.set(l.id, i);
    }
  });

  // What did not move: in the template's running heads when it hangs from
  // the slot's own container, else in the decoration, with the full-page
  // picture read from the page's attribute.
  const inSlot = new Set<string>();
  const byId = new Map(elements.map((e) => [e.id, e]));
  for (let changed = true; changed;) {
    changed = false;
    for (const el of elements) {
      if (inSlot.has(el.id)) continue;
      const to = el.kind === 'connector' ? undefined : el.placement?.anchor?.to;
      const slotBound = to === 'container' || to === 'outer' || to === undefined
        || (typeof to === 'string' && to.startsWith('#') && byId.has(to.slice(1)) && inSlot.has(to.slice(1)) && !movedIds.has(to.slice(1)));
      if (slotBound) {
        inSlot.add(el.id);
        changed = true;
      }
    }
  }
  let background: string | undefined;
  const decoration: DesignElement[] = [];
  const header: DesignElement[] = [];
  const footer: DesignElement[] = [];
  elements.forEach((el, i) => {
    if (movedIds.has(el.id) || usedBoxes.has(el.id) || pictureIds.has(el.id)) return;
    const copy = { ...el } as DesignElement & { reserve?: unknown };
    delete copy.reserve;
    if (inSlot.has(el.id)) {
      (input.origins[i] === 'footer' ? footer : header).push(copy);
      return;
    }
    if (el.kind === 'image' && background === undefined && coversPage(el, page)) {
      background = (el as DesignImageElement).resourceId;
      (copy as DesignImageElement).resourceId = '{attr.background}';
    }
    decoration.push(copy);
  });
  const labels = [...labelled];
  const movedChars = pieces.reduce((n, p) => n + p.chars, 0) + labels.reduce((n, p) => n + p.chars, 0);
  return {
    key: input.key, frames, decoration, header, footer, movedTo, ...(background !== undefined ? { background } : {}), kept, chips, newChipStyles, notes,
    movedChars, movedElements: pieces.length + labels.length, labelCount: labels.length,
  };
}
