// Warnings on the content: cut design text, the heading hierarchy,
// unknown directives and containers, overlapping chips and anchors that
// do not resolve (#1276: split out of compute.ts).
import { type VDTDocument, collectHeadingDesignCuts, type ContentBlock, parseNumberFormat, spaceDirectiveLines, type ParseIssue, type VDTLine, type VDTBlock } from 'postext';
import type { Warning } from '../types.js';
import { lineNumberForOffset } from './layout.js';

/** Design texts the layout cut to fit their width (#628, the engine's
 *  `designTextTruncated`): one per element and page, a running head or
 *  folio once a chapter. Each names the book page it was cut on, which a
 *  click opens; one that prints a heading or a frontmatter field maps back
 *  to its source too. */
export function collectDesignTruncationWarnings(doc: VDTDocument, markdown: string): Warning[] {
  const out: Warning[] = [];
  (doc.contentWarnings ?? []).forEach((w, i) => {
    if (w.kind !== 'designTextTruncated') return;
    out.push({
      id: `design-truncated-${w.slot}-${w.elementId}-${w.pageIndex ?? 'x'}-${i}`,
      payload: {
        kind: 'designTextTruncated',
        slot: w.slot,
        elementId: w.elementId,
        text: w.text,
        mode: w.mode,
        page: (w.pageIndex ?? 0) + 1 + (doc.pageIndexOffset ?? 0),
      },
      sourceStart: w.sourceStart,
      sourceEnd: w.sourceEnd,
      line: w.sourceStart !== undefined ? lineNumberForOffset(markdown, w.sourceStart) : undefined,
    });
  });
  return out;
}

/** Heading designs taller than their page can hold (EF-91), as the engine
 *  finds them (`collectHeadingDesignCuts`): text of the design laid out
 *  past the foot of the page (an opener, painted across the page) or past
 *  the foot of the heading's column (an in-column design, which canvas and
 *  PDF clip to its column). The heading then claims the rest of its page or
 *  column, so nothing runs under it, but that part of the design is lost —
 *  a long lead on a small screen page. */
export function collectHeadingDesignCutWarnings(doc: VDTDocument, markdown: string): Warning[] {
  const pxPerMm = doc.config.page.dpi / 25.4;
  return collectHeadingDesignCuts(doc).map((cut, idx) => ({
    id: `heading-design-cut-${idx}-${cut.sourceStart ?? 'x'}`,
    payload: { kind: 'headingDesignCut', level: cut.level, page: cut.pageIndex + 1 + (doc.pageIndexOffset ?? 0), overflowMm: cut.overflowPx / pxPerMm },
    sourceStart: cut.sourceStart,
    sourceEnd: cut.sourceEnd,
    line: cut.sourceStart !== undefined ? lineNumberForOffset(markdown, cut.sourceStart) : undefined,
  }));
}

export function collectHeadingHierarchyWarnings(blocks: ContentBlock[], markdown: string): Warning[] {
  const out: Warning[] = [];
  let prev: number | null = null;
  let idx = 0;
  for (const b of blocks) {
    if (b.type !== 'heading' || !b.level) continue;
    if (prev !== null && b.level > prev + 1) {
      out.push({
        id: `h-hier-${idx++}-${b.sourceStart}`,
        payload: { kind: 'headingHierarchy', from: prev, to: b.level },
        sourceStart: b.sourceStart,
        sourceEnd: b.sourceEnd,
        line: lineNumberForOffset(markdown, b.sourceStart),
      });
    }
    prev = b.level;
  }
  return out;
}

export function collectConsecutiveHeadingsWarnings(blocks: ContentBlock[], markdown: string): Warning[] {
  const out: Warning[] = [];
  let idx = 0;
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1]!;
    const curr = blocks[i]!;
    if (prev.type === 'heading' && curr.type === 'heading') {
      out.push({
        id: `h-consec-${idx++}-${curr.sourceStart}`,
        payload: { kind: 'consecutiveHeadings' },
        sourceStart: curr.sourceStart,
        sourceEnd: curr.sourceEnd,
        line: lineNumberForOffset(markdown, curr.sourceStart),
      });
    }
  }
  return out;
}

/** Attribute validation on parsed directive blocks. Unknown `:::name` lines
 *  are the engine's `unknownDirective` (see {@link collectEngineContentWarnings}). */
export function collectDirectiveWarnings(
  markdown: string,
  blocks: ContentBlock[],
): Warning[] {
  const out: Warning[] = [];
  let idx = 0;

  for (const b of blocks) {
    if (b.type !== 'directive' || !b.directiveAttrs) continue;
    const attrs = b.directiveAttrs;
    if (b.directiveName === 'numbering') {
      // Any spelling the engine reads (`roman-lower`, `arabic`, `i`…) is fine.
      if (attrs.format !== undefined && parseNumberFormat(attrs.format) === undefined) {
        out.push({
          id: `numbering-format-${idx++}-${b.sourceStart}`,
          payload: { kind: 'numberingInvalidFormat', value: attrs.format },
          sourceStart: b.sourceStart,
          sourceEnd: b.sourceEnd,
          line: lineNumberForOffset(markdown, b.sourceStart),
        });
      }
      if (attrs.startAt !== undefined) {
        const n = Number(attrs.startAt);
        if (!Number.isInteger(n) || n < 1) {
          out.push({
            id: `numbering-startat-${idx++}-${b.sourceStart}`,
            payload: { kind: 'numberingInvalidStartAt', value: attrs.startAt },
            sourceStart: b.sourceStart,
            sourceEnd: b.sourceEnd,
            line: lineNumberForOffset(markdown, b.sourceStart),
          });
        }
      }
    } else if (b.directiveName === 'pagebreak') {
      if (
        attrs.parity !== undefined
        && attrs.parity !== 'odd'
        && attrs.parity !== 'even'
        && attrs.parity !== 'always-odd'
        && attrs.parity !== 'always-even'
      ) {
        out.push({
          id: `pagebreak-parity-${idx++}-${b.sourceStart}`,
          payload: { kind: 'pagebreakInvalidParity', value: attrs.parity },
          sourceStart: b.sourceStart,
          sourceEnd: b.sourceEnd,
          line: lineNumberForOffset(markdown, b.sourceStart),
        });
      }
    } else if (b.directiveName === 'space') {
      if (spaceDirectiveLines(attrs) === undefined) {
        out.push({
          id: `space-lines-${idx++}-${b.sourceStart}`,
          payload: { kind: 'spaceInvalidLines', value: attrs.lines ?? '' },
          sourceStart: b.sourceStart,
          sourceEnd: b.sourceEnd,
          line: lineNumberForOffset(markdown, b.sourceStart),
        });
      }
    }
  }
  return out;
}

/** Fenced containers still open at the end of the document (from the
 *  parser's issue list), pointing at the opening line. Unknown paragraph and
 *  callout style ids are the engine's (see {@link collectEngineContentWarnings}). */
export function collectContainerWarnings(markdown: string, issues: ParseIssue[]): Warning[] {
  const out: Warning[] = [];
  let idx = 0;
  for (const issue of issues) {
    if (issue.kind === 'unclosedCodeBlock') {
      // A code fence left open (#624): the rest of the text is code.
      out.push({
        id: `code-unclosed-${idx++}-${issue.sourceStart}`,
        payload: { kind: 'unclosedCodeBlock', delimiter: issue.delimiter, ...(issue.lang ? { lang: issue.lang } : {}) },
        sourceStart: issue.sourceStart,
        sourceEnd: issue.sourceEnd,
        line: lineNumberForOffset(markdown, issue.sourceStart),
      });
      continue;
    }
    if (issue.kind === 'strayFence') {
      // A closing fence after a one-line directive (#1125): dropped.
      out.push({
        id: `stray-fence-${idx++}-${issue.sourceStart}`,
        payload: { kind: 'strayFence', directive: issue.directiveName },
        sourceStart: issue.sourceStart,
        sourceEnd: issue.sourceEnd,
        line: lineNumberForOffset(markdown, issue.sourceStart),
      });
      continue;
    }
    if (issue.kind !== 'unclosedContainer') continue;
    out.push({
      id: `container-unclosed-${idx++}-${issue.sourceStart}`,
      payload: { kind: 'unclosedContainer', name: issue.containerName },
      sourceStart: issue.sourceStart,
      sourceEnd: issue.sourceEnd,
      line: lineNumberForOffset(markdown, issue.sourceStart),
    });
  }
  return out;
}

/** A chip's box on the page, as the renderers draw it. */
interface ChipBox {
  styleId: string;
  line: VDTLine;
  block: VDTBlock;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The chips of one line where the renderers draw them: the segments laid
 *  end to end from the line's start, with the word spaces of a justified
 *  line widened (and a centred or right-aligned line shifted) the way the
 *  canvas, HTML and PDF backends set them. */
function chipBoxesOf(block: VDTBlock, line: VDTLine): ChipBox[] {
  const segments = line.segments ?? [];
  if (!segments.some((s) => s.chip)) return [];
  const effectiveWidth = block.bbox.width - (line.bbox.x - block.bbox.x);
  let natural = 0;
  let words = 0;
  let spaces = 0;
  for (const seg of segments) {
    natural += seg.width;
    if (seg.kind === 'space') spaces++;
    else words += seg.width;
  }
  let x = line.bbox.x;
  let spaceWidth: number | undefined;
  // A line holding a tab stop is set as measured (#622).
  if (block.textAlign === 'justify' && spaces > 0 && !line.tabbed && ((!line.isLastLine && !line.ragged) || natural > effectiveWidth)) {
    spaceWidth = (effectiveWidth - words) / spaces;
  } else if (block.textAlign === 'center' || block.textAlign === 'right') {
    const slack = Math.max(0, effectiveWidth - natural);
    x += block.textAlign === 'center' ? slack / 2 : slack;
  }
  const out: ChipBox[] = [];
  for (const seg of segments) {
    if (seg.chip) {
      const left = x + seg.chip.marginLeft;
      out.push({
        styleId: seg.chip.styleId,
        line,
        block,
        left,
        right: left + seg.chip.boxWidth,
        top: line.baseline - seg.chip.ascent,
        bottom: line.baseline + seg.chip.descent,
      });
    }
    x += seg.kind === 'space' && spaceWidth !== undefined ? spaceWidth : seg.width;
  }
  return out;
}

/** Chips whose boxes run into a chip on another line: the vertical padding
 *  paints outside the line box by design, so a chip taller than the line
 *  pitch is fine until a chip on the line above or below stands in its
 *  way (EF-118). One warning per style, at its first such chip, with the
 *  largest overlap. Unknown chip styles are the engine's (see {@link
 *  collectEngineContentWarnings}). */
export function collectChipOverlapWarnings(markdown: string, doc: VDTDocument | null): Warning[] {
  const out: Warning[] = [];
  if (!doc) return out;
  const ptPerPx = 72 / doc.config.page.dpi;
  const found = new Map<string, { box: ChipBox; overlapPx: number }>();
  const note = (box: ChipBox, overlapPx: number): void => {
    const seen = found.get(box.styleId);
    if (!seen) found.set(box.styleId, { box, overlapPx });
    else if (overlapPx > seen.overlapPx) seen.overlapPx = overlapPx;
  };
  for (const page of doc.pages) {
    const blocks = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? []), ...(page.marginNotes ?? [])];
    const boxes = blocks.flatMap((block) => (block.hidden ? [] : block.lines.flatMap((line) => chipBoxesOf(block, line))));
    boxes.sort((a, b) => a.top - b.top);
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i]!;
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j]!;
        if (b.top >= a.bottom - 0.01) break;
        if (a.line === b.line) continue;
        const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        if (across <= 0.01) continue;
        const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlap <= 0.01) continue;
        note(a, overlap);
        note(b, overlap);
      }
    }
  }
  for (const [styleId, { box, overlapPx }] of found) {
    const src = box.line.sourceStart ?? box.block.sourceStart;
    out.push({
      id: `chip-overlap-${styleId}`,
      payload: { kind: 'chipOverlap', style: styleId, overlapPt: overlapPx * ptPerPx },
      sourceStart: src,
      sourceEnd: box.line.sourceEnd ?? box.block.sourceEnd,
      line: src !== undefined ? lineNumberForOffset(markdown, src) : undefined,
    });
  }
  return out;
}

/** The elements placed by an anchor (a connector, #1056, is not). */
function placedOf<T extends { kind: string }>(elements: readonly T[]): Exclude<T, { kind: 'connector' }>[] {
  return elements.filter((e): e is Exclude<T, { kind: 'connector' }> => e.kind !== 'connector');
}

export function detectAnchorIssues(
  all: ReadonlyArray<{ id: string; kind: string; placement?: { anchor: { to: string } } }>,
): { cyclic: string[]; dangling: Array<{ id: string; target: string }> } {
  const elements = placedOf(all).filter((e): e is typeof e & { placement: { anchor: { to: string } } } => e.placement !== undefined);
  const ids = new Set(elements.map((e) => e.id));
  const edges = new Map<string, string | null>();
  const dangling: Array<{ id: string; target: string }> = [];
  for (const el of elements) {
    const to = el.placement.anchor.to;
    if (to === 'container') {
      edges.set(el.id, null);
    } else if (to.startsWith('#')) {
      const tgt = to.slice(1);
      if (!ids.has(tgt)) {
        dangling.push({ id: el.id, target: tgt });
        edges.set(el.id, null);
      } else {
        edges.set(el.id, tgt);
      }
    } else {
      edges.set(el.id, null);
    }
  }
  const cyclic = new Set<string>();
  for (const start of ids) {
    const visited = new Set<string>();
    let cur: string | undefined = start;
    while (cur) {
      if (visited.has(cur)) {
        cyclic.add(start);
        break;
      }
      visited.add(cur);
      const nxt = edges.get(cur);
      cur = nxt ?? undefined;
    }
  }
  return { cyclic: [...cyclic], dangling };
}
