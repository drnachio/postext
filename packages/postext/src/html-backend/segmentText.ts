// One segment of a line as markup: plain and marked words, maths and score
// systems, ref and link runs, ruby, the element ids links point to, and
// the copy text a line ends with (#1276: split out of html-backend.ts).
import type { VDTDocument, VDTLineSegment, VDTLine, VDTBlock, ResolvedResourceBlock } from '../vdt.js';
import { shapingTagOf } from '../hyphenation/locale.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { graphemeCount } from '../measure/graphemes.js';
import { withMeasureLanguage, measureTextWidth } from '../measure/canvas.js';
import { type SetLine, lineWordSegmentsInOrder, cellsOf } from '../paint/wordPieces.js';
import { rubyGroupOf, RUBY_OPEN } from './htmlAnnotations.js';
import { shapedText } from './render.js';
import { type SegmentCjk, type SegmentBox, PLAIN_BOX, inkScaleDecl, CELLS_DECL, cjkTextDecl, DASH_FEATURES_DECL, cjkFeaturesDecl, TRACKED_LIGATURES_DECL, ligaturesDecl, CJK_TEXT_DECL, CJK_FEATURES_DECL } from './styles.js';
import { esc, wordsHtml } from './textRuns.js';

/**
 * The resources this document anchors in its HTML (`id="pt-res-<id>"`):
 * those whose embed (a first slice, for a split table) is on one of its
 * pages. A host that renders a book's chapters one by one onto a single page
 * passes the union over the chapters as `RenderHtmlOptions.refTargets`:
 *
 * ```ts
 * const docs = buildBundle(bundle);
 * const refTargets = new Set(docs.flatMap((d) => [...anchoredResourceIds(d)]));
 * const html = docs.map((d) => renderToHtml(d, { refTargets })).join('');
 * ```
 */
export function anchoredResourceIds(doc: VDTDocument): Set<string> {
  const ids = new Set<string>();
  // Anchors (#264) under a key no resource id takes the same way.
  for (const a of doc.anchors ?? []) ids.add(`${ANCHOR_KEY}${a.id}`);
  for (const page of doc.pages) {
    for (const block of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
      const rb = block.resourceBlock;
      if (rb?.resource.id && !rb.slice?.continued) ids.add(rb.resource.id);
      // A numbered strip with an id (#590).
      if (block.stripCaption?.id) ids.add(block.stripCaption.id);
    }
  }
  return ids;
}

/** Whether a `:ref` segment links anywhere in the document being rendered. */
export function refLinks(resourceId: string, targets: ReadonlySet<string> | undefined): boolean {
  return !targets || targets.has(resourceId);
}

/** Element id for a resource embed's in-document anchor. `:ref` segments link
 *  to it with `#<id>` so references navigate in standalone HTML output. */
export function resourceAnchorId(resourceId: string): string {
  return `pt-res-${resourceId}`;
}

/** The link key of a `:ref` segment: its resource id, or `a:<id>` for a
 *  reference to an anchor (`refAnchor`, #264) — the form
 *  {@link anchoredResourceIds} lists anchors in. */
export function refKey(seg: Pick<VDTLineSegment, 'refResourceId' | 'refAnchor'>): string {
  return seg.refAnchor ? `${ANCHOR_KEY}${seg.refResourceId}` : seg.refResourceId!;
}

const ANCHOR_KEY = 'a:';

/** Element id of an anchor (a heading's `{#id}`, an inline anchor, a
 *  container, #264). */
export function anchorElementId(id: string): string {
  return `pt-a-${id}`;
}

/** Element id of a footnote's note: where its markers link to (#264). */
export function footnoteElementId(id: string): string {
  return `pt-fn-${id}`;
}

/** Element id of a book page (`VDTDocument.pageIndexOffset` counted in):
 *  where a contents row or an index page number links to (#264). */
export function pageElementId(bookIndex: number): string {
  return `pt-p-${bookIndex}`;
}

/** A link inside the document (`#sec-intro`, a citation's `#ref-key`)
 *  goes to the anchor of that id (#264, #269); any other link as written. */
function internalHref(href: string): string {
  return href.startsWith('#') && href.length > 1 && !href.startsWith('#pt-') ? `#${encodeURIComponent(anchorElementId(decodeURIComponent(href.slice(1))))}` : href;
}

export function refAnchorHref(key: string): string {
  if (key.startsWith(ANCHOR_KEY)) return `#${encodeURIComponent(anchorElementId(key.slice(ANCHOR_KEY.length)))}`;
  return `#${encodeURIComponent(resourceAnchorId(key))}`;
}

/**
 * The segments a line set word by word is written from (#770): the line's
 * own, the pieces of a word joined into one box where the word was
 * measured whole and the hyphen of a line end in a box of its own where
 * it was measured apart (`lineWordSegments`, the rule the canvas and the
 * PDF apply). The browser sets each box's text as one run, so a joined
 * word has the glyphs the layout measured: the `ffi` of `of|fice`, the
 * dot of a Catalan `l·l`. Asked of the engine's measurer, in the language
 * the text is shaped in ({@link shapedText}, a segment's own where it
 * names one), at the line's `tracking`; `fontOf` gives a segment's font
 * string. With them the order they advance in on a line that carries one
 * (`VDTLine.order`): the pieces of a left-to-right word are joined there
 * too, and the order is the one of the segments that result. The line's
 * own segments and order where that language is not known.
 */
export function wordSegmentsOf(line: VDTLine, tracking: number, fontOf: (seg: VDTLineSegment) => string): SetLine {
  const shaped = shapedText;
  if (!shaped) return { segments: line.segments, order: line.order };
  const set = lineWordSegmentsInOrder(line, false, (seg, text) =>
    withMeasureLanguage(seg.lang !== undefined ? shapingTagOf(seg.lang) : shaped.lang, () => measureTextWidth(text, fontOf(seg)))
    + (tracking === 0 ? 0 : tracking * graphemeCount(text)));
  // Nothing joined: the line's order as it is, whatever it counts.
  return set.segments === line.segments ? { segments: line.segments, order: line.order } : set;
}

export function pickSegmentColor(
  seg: VDTLineSegment,
  block: VDTBlock,
): string {
  if (seg.color) return seg.color;
  if (seg.refResourceId !== undefined && block.refColor) return block.refColor;
  const bold = !!seg.bold;
  const italic = !!seg.italic;
  if (bold && block.boldColor) return block.boldColor;
  if (italic && block.italicColor) return block.italicColor;
  return block.color;
}

export function renderMathSegmentSvg(seg: VDTLineSegment, xPx: number, line: VDTLine, block: VDTBlock): string {
  return mathSegmentSvg(seg, xPx, line, block.color);
}

/** A score system (#1172): its plain SVG, scaled to the segment's width,
 *  with its foot on the line's baseline. Labelled for assistive technology
 *  on the first system with the score's alt text; the systems after it are
 *  hidden from it. */
export function scoreSegmentSvg(seg: VDTLineSegment, xPx: number, line: VDTLine, block: VDTBlock): string {
  const system = seg.scoreSystem;
  const k = system && system.widthPx > 0 ? seg.width / system.widthPx : 1;
  const height = (system?.heightPx ?? 0) * k;
  const top = line.baseline - line.bbox.y - height;
  if (!system || !system.svg) {
    return `<span style="position:absolute;left:${xPx.toFixed(3)}px;top:${top.toFixed(3)}px;width:${seg.width.toFixed(3)}px;height:${height.toFixed(3)}px;background:rgba(160,160,160,0.15);"></span>`;
  }
  const label = block.score?.alt ? ` role="img" aria-label="${esc(block.score.alt)}"` : ' aria-hidden="true"';
  const svg = system.svg.replace(/<svg\b([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${seg.width.toFixed(3)}" height="${height.toFixed(3)}"${label} style="color:${block.color};direction:ltr;"`);
  return `<span style="position:absolute;left:${xPx.toFixed(3)}px;top:${top.toFixed(3)}px;display:inline-block;line-height:0;">${svg}</span>`;
}

/** A score resource's body (#1172): its systems' SVG stacked down the
 *  body, scaled to its width, named for assistive technology by the
 *  score's alt text (else its caption). */
export function renderScoreBodyHtml(rb: ResolvedResourceBlock, bx: number, by: number, bw: number, bh: number): string {
  const score = rb.score;
  if (!score || score.systems.length === 0) {
    return `<div aria-hidden="true" style="position:absolute;left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px;background:rgba(160,160,160,0.15);"></div>`;
  }
  const k = score.systems[0]!.width > 0 ? bw / score.systems[0]!.width : 1;
  const name = score.alt || rb.captionLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim() || `${rb.captionPrefix} ${rb.number}`.trim();
  const inner = score.systems.map((s) => {
    const w = s.width * k;
    const h = s.height * k;
    const svg = s.system.svg.replace(/<svg\b([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${w.toFixed(3)}" height="${h.toFixed(3)}" aria-hidden="true"`);
    return `<div style="position:absolute;left:0;top:${(s.y * k).toFixed(3)}px;line-height:0;">${svg}</div>`;
  }).join('');
  return `<div role="img" aria-label="${esc(name)}" style="position:absolute;left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px;color:${score.color};direction:ltr;">${inner}</div>`;
}

/** An inline formula of a line, in `color` (a body line's block colour, a
 *  caption's, a note's or a cell's text colour, #541). */
export function mathSegmentSvg(seg: VDTLineSegment, xPx: number, line: VDTLine, color: string): string {
  const render = seg.mathRender;
  if (!render) return '';
  // Position the SVG with top = (line.baseline - block.bbox.y - ascent).
  // line.bbox.y is absolute; we need top relative to the line's wrapper top.
  const topOffset = line.baseline - line.bbox.y - render.ascentPx;
  // Use the pre-serialised self-contained SVG. Replace any currentColor fills
  // with the block colour so the SVG is independent of CSS inheritance.
  const svg = render.svg
    .replace(/<svg\b[^>]*>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${render.viewBox.minX} ${render.viewBox.minY} ${render.viewBox.width} ${render.viewBox.height}" width="${render.widthPx}" height="${render.heightPx}" style="color:${color};">`);
  return `<span style="position:absolute;left:${xPx.toFixed(3)}px;top:${topOffset.toFixed(3)}px;display:inline-block;line-height:0;">${svg}</span>`;
}

/** One text segment of a line, absolutely positioned at `x` / `top` inside
 *  the line box. The wrapper inherits the line's font, so its line box —
 *  and the baseline the text sits on — is the block face's; a segment set
 *  in another face (a bold `:ref`, a superscript, an italic run whose
 *  family differs) goes in an inner inline box with `line-height: 0`,
 *  which aligns on that baseline without growing or shifting the line
 *  box. A face with other vertical metrics would otherwise float its own
 *  baseline higher or lower than the surrounding text. */
export function renderTextSegment(
  seg: VDTLineSegment,
  x: number,
  top: string,
  fontDecl: string,
  colorDecl: string,
  color: string,
  /** The tracking the line box already carries (block + line); a segment's
   *  own (a justified CJK line) is added to it. */
  tracking = 0,
  /** Whether the browser's punctuation spacing is off for the segment
   *  (see {@link CJK_TEXT_DECL}): set by its line (`'line'`) or on its own
   *  box (`'own'`); a box in another face repeats the features either way. */
  cjk: SegmentCjk = false,
  /** Its direction where it differs from its line's (see {@link segmentBox}). */
  box: SegmentBox = PLAIN_BOX,
): string {
  const spacingDecl = seg.tracking !== undefined ? `letter-spacing:${tracking + seg.tracking}px;` : '';
  // A compressed CJK mark is painted before its box (`inkOffset`).
  const left = seg.inkOffset !== undefined ? x + seg.inkOffset : x;
  const scaleDecl = seg.inkScale !== undefined ? inkScaleDecl(seg.inkScale) : '';
  // The cells of a line of the composer, each where it was measured.
  const cellsDecl = cjk === 'line' && cellsOf(seg.text) ? CELLS_DECL : '';
  const pos = `position:absolute;left:${left.toFixed(3)}px;top:${top};white-space:pre;${spacingDecl}${cjk === 'own' ? cjkTextDecl(tracking !== 0) : ''}${scaleDecl}${fontDecl ? '' : cellsDecl}${box.decl}`;
  // Text set with emphasis dots is emphasis (#193); the dots are the
  // line's marks.
  const text = seg.cjkMarks?.dots ? `<em style="font-style:inherit;">${esc(seg.text)}</em>` : box.html ?? wordsHtml(seg.text, box.tracked);
  // A run in another face of a tracked line asks for its ligatures again
  // after its `font` (#703), with the CJK features when it takes those.
  const featuresDecl = !fontDecl ? '' : (scaleDecl ? DASH_FEATURES_DECL
    : cjk ? cjkFeaturesDecl(tracking !== 0)
    : tracking !== 0 && !fontDecl.includes(TRACKED_LIGATURES_DECL) ? ligaturesDecl() : '') + cellsDecl;
  if (seg.refResourceId !== undefined) {
    // Anchors carry an explicit color so the UA link blue never leaks in.
    const inner = `<a href="${refAnchorHref(refKey(seg))}" style="text-decoration:none;${fontDecl}${featuresDecl}${fontDecl ? 'line-height:0;' : ''}color:${color};">${text}</a>`;
    return `<span${box.attrs} style="${pos}">${inner}</span>`;
  }
  if (fontDecl) {
    return `<span${box.attrs} style="${pos}"><span style="${fontDecl}${featuresDecl}line-height:0;${colorDecl}">${text}</span></span>`;
  }
  return `<span${box.attrs} style="${pos}${colorDecl}">${text}</span>`;
}

/**
 * {@link renderTextSegment} for a segment of a line set word by word (not
 * `VDTLine.cjkComposed`), which carries none of the composer's fields
 * (`tracking`, `inkOffset`, `inkScale`): the markup every such segment had
 * before the CJK features. One that holds CJK text (`cjk`) or carries
 * Chinese marks goes to {@link renderMarkedWordSegment}: the browser's
 * punctuation spacing off on its own box (see {@link CJK_TEXT_DECL}), its
 * text in `<em>` when it is set with emphasis dots.
 */
export function renderWordTextSegment(
  seg: VDTLineSegment,
  x: number,
  top: string,
  fontDecl: string,
  colorDecl: string,
  color: string,
  cjk: boolean,
  /** Its direction, tracking and styled runs (see {@link segmentBox}). */
  box: SegmentBox = PLAIN_BOX,
): string {
  if (cjk || seg.cjkMarks) return renderMarkedWordSegment(seg, x, top, fontDecl, colorDecl, color, cjk, box);
  const pos = `position:absolute;left:${x.toFixed(3)}px;top:${top};white-space:pre;${box.decl}`;
  const text = box.html ?? wordsHtml(seg.text, box.tracked);
  if (seg.refResourceId !== undefined) {
    // Anchors carry an explicit color so the UA link blue never leaks in.
    const inner = `<a href="${refAnchorHref(refKey(seg))}" style="text-decoration:none;${fontDecl}${fontDecl ? 'line-height:0;' : ''}color:${color};">${text}</a>`;
    return `<span${box.attrs} style="${pos}">${inner}</span>`;
  }
  if (fontDecl) {
    return `<span${box.attrs} style="${pos}"><span style="${fontDecl}line-height:0;${colorDecl}">${text}</span></span>`;
  }
  return `<span${box.attrs} style="${pos}${colorDecl}">${text}</span>`;
}

/** {@link renderWordTextSegment} for a segment that holds CJK text (`cjk`)
 *  or carries Chinese marks. */
function renderMarkedWordSegment(
  seg: VDTLineSegment,
  x: number,
  top: string,
  fontDecl: string,
  colorDecl: string,
  color: string,
  cjk: boolean,
  box: SegmentBox = PLAIN_BOX,
): string {
  const pos = `position:absolute;left:${x.toFixed(3)}px;top:${top};white-space:pre;${cjk ? CJK_TEXT_DECL : ''}${box.decl}`;
  // Text set with emphasis dots is emphasis (#193); the dots are the
  // line's marks.
  const text = seg.cjkMarks?.dots ? `<em style="font-style:inherit;">${esc(seg.text)}</em>` : box.html ?? wordsHtml(seg.text, box.tracked);
  const featuresDecl = fontDecl && cjk ? CJK_FEATURES_DECL : '';
  if (seg.refResourceId !== undefined) {
    // Anchors carry an explicit color so the UA link blue never leaks in.
    const inner = `<a href="${refAnchorHref(refKey(seg))}" style="text-decoration:none;${fontDecl}${featuresDecl}${fontDecl ? 'line-height:0;' : ''}color:${color};">${text}</a>`;
    return `<span${box.attrs} style="${pos}">${inner}</span>`;
  }
  if (fontDecl) {
    return `<span${box.attrs} style="${pos}"><span style="${fontDecl}${featuresDecl}line-height:0;${colorDecl}">${text}</span></span>`;
  }
  return `<span${box.attrs} style="${pos}${colorDecl}">${text}</span>`;
}

/** A `:ref` painted as several runs (a label in small capitals: one run per
 *  case; a label of words, #702: one per word and per space) from
 *  `segs[start]` on. Every run is placed as measured, and all of them sit
 *  in one anchor, so the reference stays one link on its line. `paint`
 *  renders one run, as plain text, at its x; a space inside the label is
 *  copy text that advances by `layout.gap` (the line's justified space),
 *  and `layout.at` gives each segment's x on a line whose segments are
 *  reordered. Returns the markup, the index past the last run and the x
 *  after it. */
export function renderRefRuns(
  segs: readonly VDTLineSegment[],
  start: number,
  x: number,
  color: string,
  paint: (seg: VDTLineSegment, x: number) => string,
  linked = true,
  layout?: { gap?: (space: VDTLineSegment) => number; at?: readonly number[] },
): { html: string; end: number; x: number } {
  const runs: string[] = [];
  let i = start;
  do {
    const seg = segs[i]!;
    if (layout?.at) x = layout.at[i]!;
    if (seg.kind === 'space') {
      const gap = layout?.gap ? layout.gap(seg) : seg.width;
      runs.push(copyTextHtml(seg.text, x, gap - seg.width));
      x += gap;
    } else {
      runs.push(paint(seg, x));
      x += seg.width;
    }
    i++;
  } while (segs[i]?.refContinues);
  if (!linked) return { html: runs.join(''), end: i, x };
  const href = refAnchorHref(refKey(segs[start]!));
  return { html: `<a href="${href}" style="text-decoration:none;color:${color};">${runs.join('')}</a>`, end: i, x };
}

/** Wraps each run of segments of one link (`VDTLineSegment.href`) in an
 *  `<a>`: `at` returns the markup to emit before a segment with that link
 *  (closing the previous anchor, opening its own), `space` the markup to
 *  emit before a word space, `end` the markup that closes the line. The segments stay absolutely positioned inside it; the
 *  anchor takes the text colour, so a link reads as the surrounding text. */
export function linkRuns(): { at: (href: string | undefined) => string; space: (next: string | undefined) => string; end: () => string } {
  let open: string | undefined;
  const end = (): string => {
    const close = open !== undefined ? '</a>' : '';
    open = undefined;
    return close;
  };
  return {
    at(href) {
      if (href === open) return '';
      const close = open !== undefined ? '</a>' : '';
      open = href;
      return close + (href !== undefined
        ? `<a href="${esc(href)}" rel="noopener noreferrer" style="color:inherit;text-decoration:none;">`
        : '');
    },
    /** Before a word space: closes the open anchor unless the word after
     *  the space (`next`) is part of the same link, so a link's text never
     *  ends on a space (#403). */
    space: (next) => (next === open ? '' : end()),
    end,
  };
}

/**
 * The `<ruby>` elements of a line (#428, see {@link RUBY_OPEN}): `open`
 * returns the markup before a ruby base (the `<ruby>`, unless the base
 * goes on in the one already open), `after` the markup after its reading
 * (`</ruby>`, unless the base names its annotation: the next base may go
 * on in it), `before` the markup to emit before any segment (closing a
 * `<ruby>` the segment does not go on in), `end` the markup that closes
 * the line. The bases of one annotation (`rubyGroupOf`) share a `<ruby>`
 * while they follow each other with the same link, so the element never
 * straddles an `<a>` of {@link linkRuns}.
 */
export function rubyRuns(): { open: (seg: VDTLineSegment) => string; after: (seg: VDTLineSegment) => string; before: (seg: VDTLineSegment) => string; end: () => string } {
  let open: { group: string | undefined; href: string | undefined } | undefined;
  const end = (): string => {
    const close = open !== undefined ? '</ruby>' : '';
    open = undefined;
    return close;
  };
  const continues = (seg: VDTLineSegment): boolean =>
    open?.group !== undefined && seg.kind === 'text' && seg.ruby !== undefined && !seg.warichu && !seg.chip
    && seg.refResourceId === undefined && rubyGroupOf(seg.ruby) === open.group && segmentHref(seg) === open.href;
  return {
    before: (seg) => (continues(seg) ? '' : end()),
    open(seg) {
      if (open !== undefined) return '';
      open = { group: seg.ruby ? rubyGroupOf(seg.ruby) : undefined, href: segmentHref(seg) };
      return RUBY_OPEN;
    },
    after: (seg) => (open?.group === undefined || seg.refResourceId !== undefined ? end() : ''),
    end,
  };
}

/** A segment's link, unless it is a `:ref` (which links to its resource):
 *  a Markdown link's URL, a footnote marker's note, an index page number's
 *  page (#264). */
export function segmentHref(seg: VDTLineSegment): string | undefined {
  if (seg.refResourceId !== undefined) return undefined;
  if (seg.href !== undefined) return internalHref(seg.href);
  if (seg.footnoteId !== undefined) return `#${encodeURIComponent(footnoteElementId(seg.footnoteId))}`;
  if (seg.pageLink !== undefined) return `#${pageElementId(seg.pageLink)}`;
  return undefined;
}

/**
 * A word space of a line, or what separates it from the next, as text a
 * selection copies (#403). Every word sits in its own absolutely positioned
 * box, so without these the browser copies a line's words run together. The
 * box is placed where the space falls (`x`) and paints nothing: the layout
 * is unchanged. A space stretched by justification takes the stretch as
 * `word-spacing`, so a selection's highlight spans the gap the reader sees.
 * The markup is in logical order like the words', so a right-to-left line
 * copies as written. Empty `text` (a gap the composer added, see
 * `VDTLineSegment.autospace`) emits nothing.
 */
export function copyTextHtml(text: string, x: number, stretch = 0): string {
  if (!text) return '';
  const spacing = Math.abs(stretch) >= 0.0005 ? `word-spacing:${stretch.toFixed(3)}px;` : '';
  return `<span style="position:absolute;left:${x.toFixed(3)}px;top:0;white-space:pre;${spacing}">${esc(text)}</span>`;
}

/** {@link copyTextHtml} for what follows a line (see {@link lineEndText}):
 *  transparent, so a selection's highlight never runs past the line's end.
 *  The text still copies; clipped (`overflow:hidden` on a box of no width)
 *  it would not, Chrome leaves clipped text out of a selection's string. */
export const LINE_END_DECL = 'opacity:0;';
export function lineEndHtml(text: string, x: number): string {
  if (!text) return '';
  return `<span style="position:absolute;left:${x.toFixed(3)}px;top:0;${LINE_END_DECL}white-space:pre;">${esc(text)}</span>`;
}

/**
 * What a copy puts between a line and the one after it in the same block
 * (`next`), or after a block's last line (#403): nothing after a line that
 * ends inside a word or on a hyphen or dash (`VDTLine.hyphenated`); a
 * space before the turnover of a line of verse, a blank line after a
 * stanza (#620); a newline after a line of verse, after a line that ends
 * at a forced line break (`VDTLine.hardBreak`, #620) and after the last line
 * of a paragraph (or of a heading, a caption, a cell); between two lines of a block, a space
 * where the break consumed one — the plain text skips a character between
 * them (`plainEnd` / `plainStart`) — and nothing where it did not (between
 * two ideographs). Lines without those offsets, and a block's last line
 * whose paragraph goes on in the next column or page (`isLastLine:
 * false`), take a space unless the break has a CJK character on either
 * side.
 */
export function lineEndText(line: VDTLine, next: VDTLine | undefined): string {
  if (line.hyphenated) return '';
  // A line of verse in the line layout (#620): a space before its
  // turnover, a newline after it, a blank line after a stanza.
  if (line.verseLine) return next?.verseLine?.turnover ? ' ' : line.verseLine.stanzaEnd ? '\n\n' : '\n';
  // A line of a code listing (#624): nothing before its continuation (a
  // wrapped line reads whole), a newline after each source line.
  if (line.codeLine) return next?.codeLine?.continued ? '' : '\n';
  // A forced line break the author typed (#620).
  if (line.verse || line.hardBreak || (!next && line.isLastLine !== false)) return '\n';
  if (next && line.plainEnd !== undefined && next.plainStart !== undefined) return next.plainStart > line.plainEnd ? ' ' : '';
  return cjkAt(Array.from(line.text.trimEnd()).pop()) || cjkAt(next && Array.from(next.text.trimStart())[0]) ? '' : ' ';
}

/** Whether `char` is CJK; no CJK character sits below U+1100, so a Latin
 *  page never gets as far as the test. */
function cjkAt(char: string | undefined): boolean {
  return char !== undefined && char.codePointAt(0)! >= 0x1100 && hasCJK(char);
}
