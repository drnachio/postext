/**
 * The decorations of the character styles (`[some words]|id|`): an
 * underline, a highlighter band and a strike-through, as `VDTLine.marks`
 * the renderers draw as they draw the Chinese marks (`cjkMarks.ts`).
 *
 * The measurer flags the segments of a run (`VDTLineSegment.charStyle`);
 * once the document is laid out each run of a line gets its decorations,
 * where the renderers paint its segments ({@link segmentPositions}: the
 * alignment and the justified word spaces of the line included). A run is
 * the segments of one style run that follow each other along the line,
 * with the spaces between them (unless the decoration leaves spaces out);
 * a run broken over two lines is decorated on each. Lengths in em are of
 * the run's own size: the largest em of its segments.
 *
 * The band is painted behind the text (`VDTLineMark.behind`), the lines on
 * top of it.
 */

import type { ResolvedCharacterStyleConfig, ResolvedCharacterStyleLine } from '../types.js';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineMark, VDTLineSegment } from '../vdt.js';
import { segmentFont, segmentPositions } from './cjkMarks.js';
import { resourceBlocksOf } from './cjkMarks/resources.js';
import { fontEm } from '../measure/vertical.js';
import { dimensionToPx } from '../units.js';

export { bandOutline, dashedPieces, outlineToSvgPath, type OutlineCommand } from './markGeometry.js';

type BlockLike = Parameters<typeof segmentPositions>[1];

/** One stretch of a run along a line, in absolute flow x. */
interface Stretch {
  from: number;
  to: number;
  em: number;
}

/** The stretches of each style run of a line, by run id: with the spaces
 *  between its words (`bridge`) or one per word. */
function runStretches(line: VDTLine, block: BlockLike, bridge: boolean): Map<number, { style: string; stretches: Stretch[] }> {
  const out = new Map<number, { style: string; stretches: Stretch[] }>();
  const segments = line.segments ?? [];
  const { xs, widths } = segmentPositions(line, block);
  const tracking = (block.letterSpacing ?? 0) + (line.letterSpacing ?? 0);
  let open: { id: number; stretch: Stretch } | undefined;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const run = seg.charStyle;
    if (!run) {
      // A space between two words of the run: the decoration goes on when
      // the run does.
      if (open && bridge && seg.kind === 'space') {
        let j = i + 1;
        while (j < segments.length && segments[j]!.kind === 'space') j++;
        if (segments[j]?.charStyle?.id === open.id) continue;
      }
      open = undefined;
      continue;
    }
    const em = fontEm(segmentFont(seg, block));
    // The tracking after the last glyph is no ink.
    const end = xs[i]! + widths[i]! - (seg.kind === 'text' ? tracking + (seg.tracking ?? 0) : 0);
    if (open && open.id === run.id && (bridge || seg.kind !== 'space')) {
      open.stretch.to = Math.max(open.stretch.to, end);
      open.stretch.em = Math.max(open.stretch.em, em);
      continue;
    }
    if (seg.kind === 'space') {
      open = undefined;
      continue;
    }
    const stretch: Stretch = { from: xs[i]!, to: end, em };
    let entry = out.get(run.id);
    if (!entry) out.set(run.id, (entry = { style: run.style, stretches: [] }));
    entry.stretches.push(stretch);
    open = { id: run.id, stretch };
  }
  return out;
}

const px = (d: Parameters<typeof dimensionToPx>[0], dpi: number, em: number): number => dimensionToPx(d, dpi, em);

/** The mark of a decoration line (underline or strike-through) along a
 *  stretch; `y` its centre, px from the baseline (positive: down). */
function lineMark(line: ResolvedCharacterStyleLine, x: number, length: number, y: number, em: number, dpi: number): VDTLineMark {
  const thickness = Math.max(0.3, px(line.thickness, dpi, em));
  const common = {
    x,
    y,
    length,
    thickness,
    ...(line.color ? { color: line.color.hex } : {}),
    ...(line.opacity < 100 ? { opacity: line.opacity / 100 } : {}),
    charStyle: true as const,
  };
  switch (line.style) {
    case 'double': {
      const gap = thickness * 2;
      return { ...common, kind: 'double', gap };
    }
    case 'dotted': {
      // Dots one stroke wide, two strokes apart, coming out even.
      const size = thickness * 1.2;
      const pitch = size * 2;
      const count = Math.max(1, Math.round((length - size) / pitch));
      return { ...common, kind: 'dotted', size, gap: (length - size) / count };
    }
    case 'dashed':
      return { ...common, kind: 'dashed', size: thickness * 3, gap: thickness * 2 };
    case 'wavy':
      return { ...common, kind: 'wavy', amplitude: thickness * 2, wavelength: Math.max(thickness * 5, 0.25 * em) };
    default:
      return { ...common, kind: 'line' };
  }
}

/** The decorations of one line, relative to it; empty when it holds no
 *  run of a style with any. */
export function characterStyleLineMarks(line: VDTLine, block: BlockLike, styles: readonly ResolvedCharacterStyleConfig[], dpi: number): VDTLineMark[] {
  const segments = line.segments;
  if (!segments || !segments.some((s) => s.charStyle)) return [];
  const byId = new Map(styles.map((s) => [s.id, s]));
  const x0 = line.bbox.x;
  const behind: VDTLineMark[] = [];
  const over: VDTLineMark[] = [];
  const decorate = (bridge: boolean, each: (style: ResolvedCharacterStyleConfig, s: Stretch, runId: number) => void): void => {
    for (const [runId, { style: id, stretches }] of runStretches(line, block, bridge)) {
      const style = byId.get(id);
      if (!style) continue;
      for (const s of stretches) if (s.to > s.from) each(style, s, runId);
    }
  };
  const wants = (pick: (s: ResolvedCharacterStyleConfig) => boolean, skip: (s: ResolvedCharacterStyleConfig) => boolean): [boolean, boolean] => {
    let bridged = false;
    let split = false;
    for (const seg of segments) {
      const style = seg.charStyle ? byId.get(seg.charStyle.style) : undefined;
      if (!style || !pick(style)) continue;
      if (skip(style)) split = true;
      else bridged = true;
    }
    return [bridged, split];
  };

  // The highlighter band, behind the text.
  const [bandBridged, bandSplit] = wants((s) => s.highlight.enabled, (s) => s.highlight.skipSpaces);
  for (const bridge of [true, false]) {
    if (bridge ? !bandBridged : !bandSplit) continue;
    decorate(bridge, (style, s, runId) => {
      const h = style.highlight;
      if (!h.enabled || h.skipSpaces === bridge) return;
      const top = px(h.top, dpi, s.em);
      const bottom = px(h.bottom, dpi, s.em);
      const height = top - bottom;
      if (height <= 0) return;
      const overhang = px(h.overhang, dpi, s.em);
      behind.push({
        kind: 'band',
        x: s.from - overhang - x0,
        y: -top,
        length: s.to - s.from + 2 * overhang,
        height,
        thickness: 0,
        ...(h.radius ? { size: Math.max(0, Math.min(height / 2, px(h.radius, dpi, s.em))) } : {}),
        ...(h.rough > 0 ? { rough: h.rough / 100, seed: runId * 7919 + Math.round(s.from) } : {}),
        color: h.color.hex,
        ...(h.opacity < 100 ? { opacity: h.opacity / 100 } : {}),
        behind: true,
        charStyle: true,
      });
    });
  }

  // The underline and the strike-through, over it.
  for (const which of ['underline', 'strike'] as const) {
    const [bridged, split] = wants((s) => s[which].enabled, (s) => s[which].skipSpaces);
    for (const bridge of [true, false]) {
      if (bridge ? !bridged : !split) continue;
      decorate(bridge, (style, s) => {
        const l = style[which];
        if (!l.enabled || l.skipSpaces === bridge) return;
        const offset = px(l.offset, dpi, s.em);
        over.push(lineMark(l, s.from - x0, s.to - s.from, which === 'underline' ? offset : -offset, s.em, dpi));
      });
    }
  }
  return [...behind, ...over];
}

/** The texts of a resource block (each table cell, the caption, the note),
 *  with the fonts they are painted from. Their lines carry their alignment,
 *  so they are read flush from their start. */
function resourceTexts(block: VDTBlock): { lines: VDTLine[]; like: BlockLike }[] {
  const rb = block.resourceBlock;
  if (!rb) return [];
  const out: { lines: VDTLine[]; like: BlockLike }[] = [];
  const add = (lines: VDTLine[], fonts: { fontString: string; boldFontString: string; italicFontString: string; boldItalicFontString: string }): void => {
    const first = lines[0];
    if (first) out.push({ lines, like: { bbox: first.bbox, textAlign: 'left', ...fonts } });
  };
  const t = rb.table;
  if (t) {
    for (const cell of t.cells) {
      add(cell.lines, cell.isHeader
        ? { fontString: t.headerFontString, boldFontString: t.headerBoldFontString, italicFontString: t.headerItalicFontString, boldItalicFontString: t.headerBoldItalicFontString }
        : { fontString: t.fontString, boldFontString: t.boldFontString, italicFontString: t.italicFontString, boldItalicFontString: t.boldItalicFontString });
    }
  }
  add(rb.captionLines, { fontString: rb.captionFontString, boldFontString: rb.captionBoldFontString, italicFontString: rb.captionItalicFontString, boldItalicFontString: rb.captionBoldItalicFontString });
  add(rb.noteLines, { fontString: rb.noteFontString, boldFontString: rb.noteBoldFontString, italicFontString: rb.noteItalicFontString, boldItalicFontString: rb.noteBoldItalicFontString });
  return out;
}

/** Set the decorations of every character style run of the document on
 *  its lines (see the module comment). A line's earlier decorations (a
 *  line object shared with a cached measure) are replaced, not added to. */
export function decorateCharacterStyles(doc: VDTDocument): void {
  const styles = doc.config?.characterStyles;
  if (!styles || styles.length === 0) return;
  const dpi = doc.config.page.dpi;
  const decorate = (lines: readonly VDTLine[], like: BlockLike): void => {
    for (const line of lines) {
      if (!line.segments?.some((s: VDTLineSegment) => s.charStyle)) continue;
      const marks = characterStyleLineMarks(line, like, styles, dpi);
      const kept = (line.marks ?? []).filter((m) => !m.charStyle);
      const next = [...marks.filter((m) => m.behind), ...kept, ...marks.filter((m) => !m.behind)];
      if (next.length > 0) line.marks = next;
      else delete line.marks;
    }
  };
  for (const block of doc.blocks) {
    if (block.type === 'resource' || block.designOverlay || block.hidden) continue;
    decorate(block.lines, block);
  }
  for (const block of resourceBlocksOf(doc)) for (const text of resourceTexts(block)) decorate(text.lines, text.like);
}
