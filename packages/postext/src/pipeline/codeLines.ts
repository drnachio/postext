/**
 * Code listings line by line (#624): a `code` block (a ```` ``` ```` or
 * `~~~` fence, or indented code) is set one line per source line, as
 * written. No Knuth–Plass, no hyphenation, no justification, no runt or
 * tracking levers: every character keeps its advance in the code face, a
 * run of spaces its width, and a tab goes on to the next multiple of
 * `codeStyle.tabSize` character cells (a tab segment, `\t`, so copied text
 * keeps it). A line wider than the measure is turned over, set smaller or
 * cut (`codeStyle.overflow`). Line numbers stand in a gutter before the
 * code, out of the text (the page's `lineNumbers` slot, see
 * {@link buildCodeLineNumbers}).
 *
 * The lines are built segment by segment here, not by the paragraph
 * breaker, which collapses and trims spaces. Each segment carries its face
 * (`fontString`) and, when a token kind or a highlighter gives one, its
 * colour; the segments' widths are final, from the line's box (`bbox.x`).
 */

import type { ContentBlock } from '../parse';
import type { CodeTokenKind, ResolvedCodeStyleConfig } from '../types';
import { createBoundingBox, flowRectToPage, pageIsVertical, type ResolvedConfig, type VDTBlock, type VDTDesignTextBlock, type VDTDocument, type VDTLine, type VDTLineSegment, type ContentWarning } from '../vdt';
import type { MeasuredBlock } from '../measure';
import { buildFontString } from '../measure';
import { measureTextWidth } from '../measure/canvas';
import { graphemesOf } from '../measure/graphemes';
import { lineBaselineOffset } from '../measure/vertical';
import { dimensionToPx } from '../units';
import { resolvedCodeStyle } from '../defaults/codeStyle';
import { highlightCode, type CodeToken } from '../code/highlight';

/** What a fence asks of its listing, over `codeStyle`. */
export interface CodeFenceSettings {
  lineNumbers: boolean;
  /** The first line's number. */
  start: number;
  /** Source lines (1-based, as written) the fence highlights. */
  highlight: ReadonlySet<number>;
}

/** A flag attribute: present and not `false` / `no` / `0`. */
function flagAttr(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  return v !== 'false' && v !== 'no' && v !== '0' && v !== 'off';
}

/** `highlight="3,5-7"`: the line numbers it names (1-based, from the
 *  listing's first line whatever `start` says). */
export function highlightLines(value: string | undefined): Set<number> {
  const out = new Set<number>();
  for (const part of (value ?? '').split(/[,\s]+/)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] !== undefined ? Number(m[2]) : a;
    for (let n = Math.min(a, b); n <= Math.max(a, b) && n - Math.min(a, b) < 10_000; n++) out.add(n);
  }
  return out;
}

/** The settings a fence's attributes give its listing. */
export function codeFenceSettings(block: ContentBlock, cs: ResolvedCodeStyleConfig): CodeFenceSettings {
  const attrs = block.code?.attrs ?? {};
  const start = /^\s*-?\d+\s*$/.test(attrs.start ?? '') ? Number(attrs.start) : undefined;
  const numbered = flagAttr(attrs.lineNumbers ?? attrs.linenumbers ?? attrs.numbered);
  return {
    // `start=N` numbers a listing on its own.
    lineNumbers: numbered ?? (start !== undefined ? true : cs.lineNumbers),
    start: start ?? 1,
    highlight: highlightLines(attrs.highlight),
  };
}

/** East Asian wide and full-width characters: two cells of a grid of
 *  character cells (tab stops count them so). */
const WIDE_RE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\uD840-\uD87F][\uDC00-\uDFFF]/;

/** A run of a line: text in one face and colour, or a tab of `tab` cells. */
interface Run {
  text: string;
  font: string;
  color?: string;
  bold?: true;
  italic?: true;
  tab?: number;
  width: number;
}

/** The faces of a listing at one size. */
interface Faces {
  normal: string;
  bold: string;
  italic: string;
  boldItalic: string;
}

function facesAt(cs: ResolvedCodeStyleConfig, sizePx: number): Faces {
  const w = cs.fontWeight.toString();
  const b = cs.boldFontWeight.toString();
  return {
    normal: buildFontString(cs.fontFamily, sizePx, w, 'normal'),
    bold: buildFontString(cs.fontFamily, sizePx, b, 'normal'),
    italic: buildFontString(cs.fontFamily, sizePx, w, 'italic'),
    boldItalic: buildFontString(cs.fontFamily, sizePx, b, 'italic'),
  };
}

/** How a listing's lines were fitted, for its warning. */
export interface CodeFit {
  mode: 'wrap' | 'shrink' | 'clip';
  /** Source lines too wide for the measure. */
  lines: number;
  /** The size the listing was set at, as a share of `fontSize` (below 1
   *  when shrunk). */
  scale: number;
}

export interface MeasuredCode extends MeasuredBlock {
  /** Set when a line did not fit the measure as written. */
  fit?: CodeFit;
  /** The numbers' look and the room between them and the code, when the
   *  listing is numbered. */
  numbers?: { gap: number; fontString: string; color: string };
  /** The size the listing was set at, px (the code size, or less when it
   *  was shrunk). */
  fontSizePx: number;
}

export interface CodeLinesInput {
  block: ContentBlock;
  /** The code's size and leading (the listing box's body style). */
  fontSizePx: number;
  lineHeightPx: number;
  /** The listing's colour (hex). */
  color: string;
  /** The measure, px. */
  measure: number;
  resolved: ResolvedConfig;
  /** Source offset of the markdown body inside the document. */
  bodyOffset: number;
  /** The frame runs right to left (a mirrored page): the lines keep their
   *  left-to-right order and are set from the frame's far side. */
  mirrored?: boolean;
}

/** Lay a listing out (see the module comment). */
export function measureCodeLines(input: CodeLinesInput): MeasuredCode {
  const { block, resolved } = input;
  const cs = resolvedCodeStyle(resolved);
  const info = block.code;
  if (!info || info.lines.length === 0) return { lines: [], totalHeight: 0, fontSizePx: input.fontSizePx };
  const dpi = resolved.page.dpi;
  const fence = codeFenceSettings(block, cs);
  const tokens = highlightCode(info.lines.join('\n'), info.lang, cs.highlight === 'builtin');
  const lineHeight = input.lineHeightPx;

  /** The runs of every line at one size. */
  const runsAt = (faces: Faces): Run[][] => info.lines.map((line, k) => {
    const pieces: CodeToken[] = tokens?.[k] ?? (line.length > 0 ? [{ text: line }] : []);
    const runs: Run[] = [];
    let col = 0;
    for (const piece of pieces) {
      const kind: CodeTokenKind | undefined = piece.token;
      const look = kind ? cs.tokens[kind] : undefined;
      const bold = look?.bold === true;
      const italic = look?.italic === true;
      const font = bold ? (italic ? faces.boldItalic : faces.bold) : italic ? faces.italic : faces.normal;
      const color = piece.color ?? look?.color?.hex;
      let text = '';
      const flush = () => {
        if (text.length === 0) return;
        runs.push({ text, font, ...(color ? { color } : {}), ...(bold ? { bold: true as const } : {}), ...(italic ? { italic: true as const } : {}), width: measureTextWidth(text, font) });
        text = '';
      };
      for (const ch of graphemesOf(piece.text)) {
        if (ch === '\t') {
          flush();
          const cells = cs.tabSize - (col % cs.tabSize);
          runs.push({ text: '\t', font: faces.normal, tab: cells, width: cells * measureTextWidth(' ', faces.normal) });
          col += cells;
        } else {
          text += ch;
          col += WIDE_RE.test(ch) ? 2 : 1;
        }
      }
      flush();
    }
    return runs;
  });
  const widthOf = (runs: readonly Run[]): number => runs.reduce((s, r) => s + r.width, 0);

  /** The gutter of a numbered listing at one size: the widest number and
   *  the gap after it. */
  const lastNumber = fence.start + info.lines.length - 1;
  const numberWidth = (faces: Faces): number => (fence.lineNumbers ? measureTextWidth(String(Math.max(Math.abs(fence.start), Math.abs(lastNumber))).replace(/\d/g, '0') + (fence.start < 0 ? '-' : ''), faces.normal) : 0);
  const gutterAt = (faces: Faces, sizePx: number): number => (fence.lineNumbers ? numberWidth(faces) + Math.max(0, dimensionToPx(cs.lineNumberGap, dpi, sizePx)) : 0);

  // The size the listing is set at: its own, or for `shrink` the largest
  // (down to `minFontScale`) at which its widest line fits.
  let sizePx = input.fontSizePx;
  let faces = facesAt(cs, sizePx);
  let rows = runsAt(faces);
  let gutter = gutterAt(faces, sizePx);
  const widest = Math.max(...rows.map(widthOf));
  const tooWide = rows.filter((r) => gutter + widthOf(r) > input.measure + 0.01).length;
  let scale = 1;
  if (tooWide > 0 && cs.overflow === 'shrink') {
    const fit = Math.max(cs.minFontScale, Math.min(1, input.measure / (gutter + widest)));
    scale = Math.floor(fit * 1000) / 1000;
    sizePx = input.fontSizePx * scale;
    faces = facesAt(cs, sizePx);
    rows = runsAt(faces);
    gutter = gutterAt(faces, sizePx);
  }
  const measure = Math.max(1, input.measure - gutter);
  // What still does not fit wraps (`wrap`, and `shrink` past its floor) or
  // is cut (`clip`).
  const cut = cs.overflow === 'clip';
  const cell = measureTextWidth(' ', faces.normal);
  const marker = cs.wrapMarker;
  const markerWidth = marker ? measureTextWidth(marker, faces.normal) : 0;
  const hang = Math.min(measure / 2, Math.max(cs.wrapIndent * cell, markerWidth > 0 ? markerWidth + cell / 2 : 0));

  const baselineOffset = lineBaselineOffset(lineHeight, faces.normal);
  const lines: VDTLine[] = [];
  let plainAt = 0;

  /** A run's segment. */
  const segmentOf = (run: Run, text = run.text, width = run.width): VDTLineSegment => (run.tab !== undefined
    ? { kind: 'space', text: '\t', width, labelTab: true, fontString: run.font }
    : {
        kind: 'text',
        text,
        width,
        fontString: run.font,
        ...(run.color ? { color: run.color } : {}),
        ...(run.bold ? { bold: true } : {}),
        ...(run.italic ? { italic: true } : {}),
      });
  const push = (segments: VDTLineSegment[], x: number, k: number, plainStart: number, plainEnd: number, flags: Omit<NonNullable<VDTLine['codeLine']>, 'line'>) => {
    const y = lines.length * lineHeight;
    const width = segments.reduce((s, seg) => s + seg.width, 0);
    const text = segments.filter((s) => !s.inserted && !s.leader).map((s) => s.text).join('');
    const map = block.sourceMap;
    const src = (p: number, end: boolean): number => {
      if (map.length === 0) return block.sourceStart + input.bodyOffset;
      if (end) return p > 0 ? map[Math.min(p, map.length) - 1]! + 1 + input.bodyOffset : (map[0] ?? block.sourceStart) + input.bodyOffset;
      return (p < map.length ? map[p]! : map[map.length - 1]! + 1) + input.bodyOffset;
    };
    // A blank line still spans its line end, so the editor can map it.
    const sourceStart = plainStart < map.length ? src(plainStart, false) : (info.lineStarts[k] ?? block.sourceStart) + input.bodyOffset;
    const sourceEnd = plainEnd > plainStart ? src(plainEnd, true) : sourceStart;
    const line: VDTLine = {
      text,
      bbox: createBoundingBox(x, y, width, lineHeight),
      baseline: y + baselineOffset,
      hyphenated: false,
      segments,
      isLastLine: true,
      ragged: true,
      plainStart,
      plainEnd,
      sourceStart,
      sourceEnd,
      codeLine: { line: k, ...flags },
    };
    // Set from the far side of a mirrored frame, as a left-to-right
    // quotation in a right-to-left book is: its span the measure.
    if (input.mirrored) {
      line.measure = { x: 0, width: measure };
      line.bbox.x = 0;
    }
    lines.push(line);
  };

  rows.forEach((runs, k) => {
    const n = fence.start + k;
    const flags = {
      ...(fence.lineNumbers ? { number: String(n) } : {}),
      ...(fence.highlight.has(k + 1) ? { highlight: true as const } : {}),
    };
    const lineLength = info.lines[k]!.length;
    const lineStart = plainAt;
    plainAt += lineLength + 1;
    if (widthOf(runs) <= measure + 0.01) {
      push(runs.map((r) => segmentOf(r)), gutter, k, lineStart, lineStart + lineLength, flags);
      return;
    }
    // The line's characters, each with its run and advance.
    interface Cell { run: Run; text: string; width: number; at: number }
    const cells: Cell[] = [];
    let at = lineStart;
    for (const run of runs) {
      if (run.tab !== undefined) {
        cells.push({ run, text: '\t', width: run.width, at });
        at += 1;
        continue;
      }
      for (const g of graphemesOf(run.text)) {
        cells.push({ run, text: g, width: measureTextWidth(g, run.font), at });
        at += g.length;
      }
    }
    /** Segments for cells `[a, b)`: consecutive cells of one run make one
     *  segment, measured whole. */
    const segmentsOf = (a: number, b: number): VDTLineSegment[] => {
      const out: VDTLineSegment[] = [];
      let i = a;
      while (i < b) {
        const run = cells[i]!.run;
        let j = i;
        let text = '';
        while (j < b && cells[j]!.run === run) text += cells[j++]!.text;
        out.push(run.tab !== undefined ? segmentOf(run) : segmentOf(run, text, measureTextWidth(text, run.font)));
        i = j;
      }
      return out;
    };
    if (cut) {
      let w = 0;
      let b = 0;
      while (b < cells.length && w + cells[b]!.width <= measure + 0.01) w += cells[b++]!.width;
      const end = b < cells.length ? cells[b]!.at : lineStart + lineLength;
      push(segmentsOf(0, b), gutter, k, lineStart, end, { ...flags, clipped: true });
      return;
    }
    // Turned over: break after the last space or punctuation that fits,
    // else between two characters; the continuations hang by `wrapIndent`
    // cells behind the marker.
    let a = 0;
    let first = true;
    while (a < cells.length) {
      const room = first ? measure : Math.max(cell, measure - hang);
      let w = 0;
      let b = a;
      while (b < cells.length && w + cells[b]!.width <= room + 0.01) w += cells[b++]!.width;
      if (b === a) b = a + 1; // a character wider than the room still goes
      if (b < cells.length) {
        let brk = -1;
        for (let i = b; i > a; i--) {
          if (/[\s,;.:)\]}>/\\\-=+*|&!?]/.test(cells[i - 1]!.text) && !/\s/.test(cells[i]?.text ?? '') ) {
            brk = i;
            break;
          }
        }
        if (brk > a) b = brk;
      }
      const segments = segmentsOf(a, b);
      const startAt = cells[a]!.at;
      const endAt = b < cells.length ? cells[b]!.at : lineStart + lineLength;
      const more = b < cells.length;
      if (first) {
        push(segments, gutter, k, startAt, endAt, { ...flags, ...(more ? { wrapped: true as const } : {}) });
      } else {
        // The marker in the hang, before the text: no character of it (a
        // leader: out of the copied text, an artifact in a tagged PDF).
        const lead: VDTLineSegment[] = marker
          ? [{ kind: 'text', text: marker, width: hang, inserted: true, leader: 'text', fontString: faces.normal, color: cs.lineNumberColor.hex }]
          : [{ kind: 'text', text: '', width: hang, inserted: true }];
        const { highlight } = flags;
        push([...lead, ...segments], gutter, k, startAt, endAt, { continued: true, ...(highlight ? { highlight } : {}), ...(more ? { wrapped: true as const } : {}) });
      }
      first = false;
      a = b;
    }
  });

  if (lines.length === 0) return { lines: [], totalHeight: 0, fontSizePx: sizePx };
  const fit: CodeFit | undefined = tooWide > 0 ? { mode: cs.overflow, lines: tooWide, scale } : undefined;
  return {
    lines,
    totalHeight: lines.length * lineHeight,
    fontSizePx: sizePx,
    ...(fit ? { fit } : {}),
    ...(fence.lineNumbers ? { numbers: { gap: Math.max(0, dimensionToPx(cs.lineNumberGap, dpi, sizePx)), fontString: faces.normal, color: cs.lineNumberColor.hex } } : {}),
  };
}

/**
 * The line numbers of the listings of `doc` (#624), in each page's
 * `lineNumbers` slot beside any the margin numbers set there (#621): each
 * right-aligned against the end of its listing's gutter, on its line's
 * baseline, an artifact out of the text (the slot's numbers are hidden
 * from assistive technology, left out of a selection, and painted under an
 * empty `/ActualText` in a tagged PDF). Vertical pages get none.
 */
export function buildCodeLineNumbers(doc: VDTDocument): void {
  for (const page of doc.pages) {
    if (pageIsVertical(page)) continue;
    const blocks: VDTDesignTextBlock[] = [];
    const visit = (block: VDTBlock) => {
      const numbers = block.type === 'code' ? block.code?.numbers : undefined;
      if (!numbers) return;
      for (const line of block.lines) {
        const label = line.codeLine?.number;
        if (label === undefined) continue;
        const w = measureTextWidth(label, numbers.fontString);
        const size = /(\d*\.?\d+)px/.exec(numbers.fontString);
        const sizePx = size ? parseFloat(size[1]!) : 12;
        // Where the line's code starts on the sheet: its box's left edge,
        // or that of the span it is set in on a mirrored page (#370).
        const span = line.measure ?? { x: line.bbox.x, width: line.bbox.width };
        const sheet = flowRectToPage(page, createBoundingBox(span.x, line.bbox.y, Math.max(0, span.width), line.bbox.height));
        const right = sheet.x - numbers.gap;
        const baseline = sheet.y + (line.baseline - line.bbox.y);
        blocks.push({
          kind: 'text',
          bbox: createBoundingBox(right - w, baseline - sizePx * 0.8, w, sizePx),
          fontString: numbers.fontString,
          color: numbers.color,
          lines: [{ text: label, xOffset: 0, baselineY: baseline, width: w }],
          clip: false,
          artifact: true,
        });
      }
    };
    for (const column of page.columns) for (const block of column.blocks) visit(block);
    for (const block of page.floats ?? []) visit(block);
    if (blocks.length === 0) continue;
    const all = [...(page.lineNumbers?.blocks ?? []), ...blocks];
    const left = Math.min(...all.map((b) => b.bbox.x));
    const top = Math.min(...all.map((b) => b.bbox.y));
    const right = Math.max(...all.map((b) => b.bbox.x + b.bbox.width));
    const bottom = Math.max(...all.map((b) => b.bbox.y + b.bbox.height));
    page.lineNumbers = { bbox: createBoundingBox(left, top, right - left, bottom - top), blocks: all };
  }
}

/** A `codeOverflow` warning for each listing (by content index) one of
 *  whose lines did not fit its measure as written (#624). */
export function codeOverflowWarnings(doc: VDTDocument): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<number>();
  for (const block of doc.blocks) {
    const fit = block.code?.fit;
    const idx = block.contentIndex;
    if (block.type !== 'code' || !fit || idx === undefined || seen.has(idx)) continue;
    seen.add(idx);
    out.push({
      kind: 'codeOverflow',
      mode: fit.mode,
      lines: fit.lines,
      ...(fit.mode === 'shrink' ? { scale: fit.scale } : {}),
      ...(block.code?.lang ? { lang: block.code.lang } : {}),
      ...(block.sourceStart !== undefined ? { sourceStart: block.sourceStart } : {}),
      ...(block.sourceEnd !== undefined ? { sourceEnd: block.sourceEnd } : {}),
      ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
    });
  }
  return out;
}

/** The plain text of a listing's lines as written (a continuation joins
 *  its line, a line feed ends each source line). */
export function codeLinesText(lines: readonly VDTLine[]): string {
  let out = '';
  lines.forEach((line, i) => {
    if (i > 0 && !line.codeLine?.continued) out += '\n';
    out += line.text;
  });
  return out;
}
