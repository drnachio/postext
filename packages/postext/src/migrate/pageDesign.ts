/**
 * One page design of a book that keeps its text in heading styles (#874):
 * the elements of a style's running head split into the text that moves to
 * the Markdown (grouped into frames by geometry and look) and the
 * decoration that stays in the configuration. Pure; lengths in mm.
 */
import type {
  ChipStyleConfig,
  ColorValue,
  DesignElement,
  DesignImageElement,
  DesignTextElement,
  Dimension,
  PlacedDesignElement,
} from '../types.js';
import type { PageSide } from '../composed/types.js';
import { stripPlaceholders } from '../pipeline/pages/placeholders.js';
import { stableStringify } from '../util/stableHash.js';

/** The look of a design text a paragraph style has to reproduce. */
export interface TextLook {
  fontFamily?: string;
  fontSize: Dimension;
  fontWeight: number;
  italic: boolean;
  color?: ColorValue;
  align: 'left' | 'center' | 'right' | 'justify' | 'start' | 'end';
  /** Leading as a multiple of the size. */
  lineHeight: number;
  uppercase: boolean;
  hyphenate: boolean;
  direction?: 'ltr' | 'rtl';
  writingMode?: 'vertical-rl';
  /** Tracking in ems of the text's size (#907); absent when none. */
  letterSpacing?: Dimension;
}

/** A text element that moves to the Markdown. */
export interface TextPiece {
  id: string;
  side?: PageSide;
  /** Top-left on the trim, mm; only for elements anchored to the page's
   *  top-left (the others keep their placement and are never merged). */
  x?: number;
  y?: number;
  width?: number;
  /** Estimated height (lines × leading). */
  height?: number;
  /** The height is the text's own lines (no line was guessed to wrap). */
  heightSure?: boolean;
  lineMm: number;
  look: TextLook;
  lookKey: string;
  element: DesignTextElement;
  /** The text as Markdown lines (inline marks kept, chips for highlights). */
  lines: string[];
  chars: number;
  notes: string[];
}

/** A picture of the design that carries labels (#918): it leaves the
 *  decoration for a picture frame at its box, its labels for the
 *  resource's anchors and `::label` lines. */
export interface PlannedPicture {
  element: DesignImageElement;
  /** Its box on the trim, mm. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The short texts on it, in their order in the design. */
  labels: TextPiece[];
  /** The frame's layer when it is not the default 0: -1 puts it below the
   *  decoration, for a design that paints decoration over the picture and
   *  none under it (#957). */
  layer?: number;
  /** Where the page may look different: `overPicture` (decoration painted
   *  over the picture lies under its frame, with decoration under the
   *  picture too, or over a label, so the frame cannot go below it). */
  notes: string[];
}

/** A frame the migration writes: one or more pieces of one look, under one
 *  another at an even spacing; or a picture with its labels (`picture`,
 *  no pieces). */
export interface PlannedFrame {
  side?: PageSide;
  pieces: TextPiece[];
  picture?: PlannedPicture;
  look: TextLook;
  lookKey: string;
  /** mm between pieces (paragraph spacing). */
  gap: number;
  width?: number;
  /** Assigned when templates are built. */
  name?: string;
  /** Geometry key for template sharing. */
  key: string;
}

export interface DesignInput {
  key: string;
  elements: DesignElement[];
  /** The slot each element comes from (same order as `elements`). */
  origins: ('header' | 'footer')[];
  page: { width: number; height: number };
  isContent: (content: string) => boolean;
  /** Existing chip styles, matched by background colour for highlights. */
  chipStyles: readonly ChipStyleConfig[];
  highlightsToChips: boolean;
  merge: boolean;
  /** Short texts on a picture become its labels (#918): one line, at most
   *  four words, set no larger than `maxSizeMm`, inside the picture's
   *  box. Unset: they are frames like the rest. */
  labelsOnPictures?: {
    maxSizeMm: number;
    /** The picture's own width and height (any unit, for its aspect), or
     *  undefined when the resource is not known: such a picture keeps its
     *  texts as frames. */
    pictureSize: (resourceId: string) => { width: number; height: number } | null | undefined;
  };
}

export interface PlannedDesign {
  key: string;
  frames: PlannedFrame[];
  /** Elements that stay, in their order (anchors to moved text remapped
   *  once frames have names: see {@link remapDecorationAnchors}). */
  decoration: DesignElement[];
  /** Element id → index of the frame its text went to. */
  movedTo: Map<string, number>;
  /** Elements that stay in the template's own running heads: anchored
   *  to the slot's container (or the outer margin), or to such an element. */
  header: DesignElement[];
  footer: DesignElement[];
  /** The full-page picture, replaced by `{attr.background}`. */
  background?: string;
  /** Text elements left in the decoration, and why. */
  kept: { id: string; reason: 'placeholder' | 'anchor' }[];
  /** Highlight boxes turned into chips. */
  chips: number;
  /** Chip styles this design needs that the book lacks, by id. */
  newChipStyles: Map<string, ChipStyleConfig>;
  notes: string[];
  movedChars: number;
  movedElements: number;
  /** Texts that became picture labels (among `movedElements`). */
  labelCount: number;
}

const MM_PER: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 };

/** A length in mm; `em` against `emMm`. */
export function toMm(d: Dimension | undefined, emMm = 0): number | undefined {
  if (!d || typeof d !== 'object' || typeof d.value !== 'number') return undefined;
  if (d.unit === 'em' || d.unit === 'rem') return d.value * emMm;
  const f = MM_PER[d.unit];
  return f === undefined ? undefined : d.value * f;
}

function lineHeightOf(el: DesignTextElement): number {
  const lh = el.lineHeight;
  if (typeof lh === 'number') return lh > 0 ? lh : 1.2;
  if (lh && typeof lh === 'object') {
    if (lh.unit === 'em' || lh.unit === 'rem') return lh.value > 0 ? lh.value : 1.2;
    const size = toMm(el.fontSize) ?? 0;
    const abs = toMm(lh);
    if (abs && size > 0) return abs / size;
  }
  return 1.2;
}

/** A design text's look. */
export function lookOf(el: DesignTextElement): TextLook {
  return {
    ...(el.fontFamily ? { fontFamily: el.fontFamily } : {}),
    fontSize: el.fontSize,
    fontWeight: el.fontWeight ?? 400,
    italic: el.italic === true,
    ...(el.color ? { color: el.color } : {}),
    align: (el.align ?? 'center') as TextLook['align'],
    lineHeight: Math.round(lineHeightOf(el) * 100) / 100,
    uppercase: el.textTransform === 'uppercase',
    hyphenate: el.hyphenate === true,
    ...(el.direction === 'rtl' || el.direction === 'ltr' ? { direction: el.direction } : {}),
    ...(el.writingMode === 'vertical-rl' ? { writingMode: 'vertical-rl' as const } : {}),
    ...trackingOf(el),
  };
}

/** A design text's tracking as ems of its size, the unit a paragraph
 *  style reads it in (#907): `{ letterSpacing }`, or nothing when it sets
 *  none. */
function trackingOf(el: DesignTextElement): { letterSpacing?: Dimension } {
  const ls = el.letterSpacing;
  if (!ls || typeof ls !== 'object' || typeof ls.value !== 'number' || ls.value === 0) return {};
  if (ls.unit === 'em') return { letterSpacing: { value: ls.value, unit: 'em' } };
  const sizeMm = toMm(el.fontSize);
  const mm = toMm(ls, sizeMm ?? 0);
  if (!sizeMm || mm === undefined || mm === 0) return {};
  return { letterSpacing: { value: Math.round((mm / sizeMm) * 10000) / 10000, unit: 'em' } };
}

/** Whether a design text holds a placeholder (`{pageNumber}`, `{attr.x}`). */
export function hasPlaceholder(content: string): boolean {
  const plain = content.replace(/\{\{/g, '{').replace(/\}\}/g, '}').replace(/\\n/g, '\n');
  return stripPlaceholders(content) !== plain;
}

const sideOf = (el: { parity?: string }): PageSide | undefined =>
  el.parity === 'odd' ? 'recto' : el.parity === 'even' ? 'verso' : undefined;

const isTopLeftPage = (el: { placement?: PlacedDesignElement['placement'] }): boolean =>
  el.placement?.anchor?.to === 'page' && (el.placement.anchor.edge ?? 'top-left') === 'top-left';

function rectOf(el: DesignElement): { x: number; y: number; w?: number; h?: number } | undefined {
  if (el.kind === 'connector' || !isTopLeftPage(el)) return undefined;
  const p = el.placement;
  const w = typeof p.size?.width === 'object' && 'value' in p.size.width ? toMm(p.size.width) : undefined;
  const h = typeof p.size?.height === 'object' && 'value' in p.size.height ? toMm(p.size.height) : undefined;
  return { x: toMm(p.offset?.x) ?? 0, y: toMm(p.offset?.y) ?? 0, ...(w !== undefined ? { w } : {}), ...(h !== undefined ? { h } : {}) };
}

/** The lines of a design text: a newline, or the two characters `\n`,
 *  starts one; runs of them count once. */
function contentLines(content: string): string[] {
  return content.replace(/\{\{/g, '{').replace(/\}\}/g, '}').replace(/\\n/g, '\n').split(/\n+/).map((l) => l.trim());
}

/** Bold runs (`**…**`) of the lines, with the lines they cover. */
interface BoldRun { line: number; start: number; end: number }
function boldRuns(lines: readonly string[]): { runs: BoldRun[][]; } {
  // Per bold run, its piece on each line it crosses.
  const runs: BoldRun[][] = [];
  let open: BoldRun[] | null = null;
  lines.forEach((text, line) => {
    let from = 0;
    if (open) open.push({ line, start: 0, end: text.length });
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '*' && text[i + 1] === '*') {
        if (!open) {
          open = [];
          from = i + 2;
          open.push({ line, start: from, end: text.length });
        } else {
          const last = open[open.length - 1]!;
          if (last.line === line) last.end = i;
          runs.push(open);
          open = null;
        }
        i++;
      }
    }
  });
  return { runs };
}

/** Characters with a meaning in Postext Markdown escaped, so the text
 *  prints as the design printed it. With `marks`, the inline marks of the
 *  design (`**`, `*`, `_`, `^`, `~`) stay marks. */
function escapeText(text: string, marks: boolean): string {
  // One pass over the characters. A backslash before a character that gets
  // escaped is doubled (`\\*` prints a backslash and an escaped asterisk);
  // any other prints as it is. With inline marks a backslash before a
  // marker is the design's own escape (`\*`) and stays, and the markers
  // are left alone.
  const escaped = marks ? '$`' : '*_^~$`';
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '\\') {
      const next = text[i + 1];
      const doubles = next !== undefined && (escaped.includes(next) || (!marks && next === '\\'));
      out += doubles ? '\\\\' : ch;
      continue;
    }
    out += escaped.includes(ch) ? `\\${ch}` : ch;
  }
  return out;
}

/** A line that the block parser would read as a list item, a heading, a
 *  quotation or a fence. */
const BLOCK_START = /^([-*+][ \t]|\d+[.)][ \t]|#{1,6}[ \t]|>|:::|\||`{3}|~{3}|\[\^)/;

/** The Markdown of a frame's paragraph: the lines joined by forced breaks
 *  (a backslash at the end of the line; ` \\ ` on the same line when the
 *  next one would start a block). */
export function joinLines(lines: readonly string[]): string {
  let out = '';
  lines.forEach((l, i) => {
    if (i === 0) {
      out = BLOCK_START.test(l) ? `\u200B${l}` : l;
      return;
    }
    out += BLOCK_START.test(l) ? ` \\\\ ${l}` : `\\\n${l}`;
  });
  return out;
}

const hexOf = (c: ColorValue | undefined): string | undefined => {
  const h = (c as { hex?: unknown } | undefined)?.hex;
  return typeof h === 'string' ? h.toLowerCase() : undefined;
};

/** A box that only fills a colour: a highlight under words. */
function highlightColour(el: DesignElement): ColorValue | undefined {
  if (el.kind !== 'box') return undefined;
  const st = el.style ?? {};
  if (!st.backgroundColor) return undefined;
  if (st.borderColor && (toMm(st.borderWidth) ?? 0) > 0) return undefined;
  return st.backgroundColor;
}

/** The chip style a highlight of colour `c` becomes: the book's own, else a
 *  new one (bold, no padding, as the boxes were drawn). */
function chipStyleFor(c: ColorValue, existing: readonly ChipStyleConfig[], fresh: Map<string, ChipStyleConfig>): string {
  const hex = hexOf(c);
  const own = existing.find((s) => s.backgroundEnabled !== false && hexOf(s.background) === hex);
  if (own) return own.id;
  const id = `highlight-${(hex ?? 'colour').replace('#', '')}`;
  if (!fresh.has(id)) {
    fresh.set(id, {
      id,
      name: `Highlight ${hex ?? ''}`.trim(),
      backgroundEnabled: true,
      background: c,
      borderWidth: { value: 0, unit: 'pt' },
      borderRadius: { value: 0, unit: 'em' },
      paddingX: { value: 0, unit: 'em' },
      paddingY: { value: 0.04, unit: 'em' },
      bold: true,
    } as ChipStyleConfig);
  }
  return id;
}

/** The pieces' estimated height: their lines, wrapped at the width at about
 *  half an em a character. */
function estimateLines(lines: readonly string[], widthMm: number | undefined, sizeMm: number): number {
  if (!widthMm || widthMm <= 0) return Math.max(1, lines.length);
  const perLine = Math.max(1, Math.floor(widthMm / (sizeMm * 0.5)));
  return lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.replace(/\*\*|[*_^~]/g, '').length / perLine)), 0);
}

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

/** Whether the brackets of a line pair up (escaped characters aside). */
function bracketsPair(line: string): boolean {
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '\\') i++;
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth < 0) return false;
  }
  return depth === 0;
}

/** Words of a design text as a reader counts them (marks aside). */
const wordCount = (line: string): number => line.replace(/\*\*|[*_^~]/g, '').trim().split(/\s+/).filter(Boolean).length;

/** The pictures of a design that carry labels (#918), with them: a text of
 *  one line and at most four words, set no larger than `maxSizeMm`,
 *  horizontal, whose box (known: placed from the page's top-left with a
 *  width) lies inside a picture's box on the same side. A text over
 *  several pictures belongs to the one painted last. */
function findLabelledPictures(
  pieces: readonly TextPiece[],
  elements: readonly DesignElement[],
  opts: NonNullable<DesignInput['labelsOnPictures']>,
): PlannedPicture[] {
  const maxSizeMm = opts.maxSizeMm;
  const candidates: PlannedPicture[] = [];
  for (const el of elements) {
    if (el.kind !== 'image') continue;
    const id = (el as DesignImageElement).resourceId;
    if (typeof id !== 'string' || id === '' || id.includes('{')) continue;
    const r = rectOf(el);
    if (!r || r.w === undefined || r.h === undefined || r.w <= 0 || r.h <= 0) continue;
    const size = opts.pictureSize(id);
    if (!size) continue;
    // The design draws the picture whole inside its box, centred: the
    // frame takes the part it covers, where the figure draws it.
    const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : r.w / r.h;
    const w = Math.min(r.w, r.h * aspect);
    const h = w / aspect;
    candidates.push({ element: el as DesignImageElement, x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, width: w, height: h, labels: [], notes: [] });
  }
  if (candidates.length === 0) return [];
  const TOL = 0.5;
  for (const p of pieces) {
    if (p.x === undefined || p.y === undefined || p.width === undefined || p.height === undefined || !p.heightSure) continue;
    if (p.lines.length !== 1 || wordCount(p.lines[0]!) > 4 || wordCount(p.lines[0]!) === 0) continue;
    // `::label[…]` reads to its matching bracket and knows no escaped one:
    // a text whose brackets do not pair stays a frame.
    if (!bracketsPair(p.lines[0]!)) continue;
    if (p.look.writingMode || p.element.box || (p.element.stroke && p.element.stroke.hollow)) continue;
    const size = toMm(p.element.fontSize) ?? Infinity;
    if (size > maxSizeMm + 1e-6) continue;
    let host: PlannedPicture | undefined;
    for (const pic of candidates) {
      const side = sideOf(pic.element);
      if (side && p.side && side !== p.side) continue;
      if (side && !p.side) continue;
      if (p.x < pic.x - TOL || p.y < pic.y - TOL || p.x + p.width > pic.x + pic.width + TOL || p.y + p.height > pic.y + pic.height + TOL) continue;
      host = pic;
    }
    host?.labels.push(p);
  }
  return candidates.filter((pic) => pic.labels.length > 0);
}

/** An image that covers (nearly) the whole page: the page's art. */
function coversPage(el: DesignElement, page: { width: number; height: number }): boolean {
  const r = rectOf(el);
  if (!r || r.w === undefined || r.h === undefined || page.width <= 0 || page.height <= 0) return false;
  if (typeof (el as DesignImageElement).resourceId !== 'string' || (el as DesignImageElement).resourceId.includes('{')) return false;
  return r.w * r.h >= 0.8 * page.width * page.height;
}

/** Decoration anchors that named a text now in a frame name the frame. */
export function remapDecorationAnchors(decoration: DesignElement[], movedTo: Map<string, number>, frames: readonly PlannedFrame[]): DesignElement[] {
  return decoration.map((el) => {
    if (el.kind === 'connector') return el;
    const to = el.placement?.anchor?.to;
    if (typeof to !== 'string' || !to.startsWith('#')) return el;
    const i = movedTo.get(to.slice(1));
    const name = i !== undefined ? frames[i]?.name : undefined;
    if (!name) return el;
    return { ...el, placement: { ...el.placement, anchor: { ...el.placement.anchor, to: `#${name}` } } } as DesignElement;
  });
}
