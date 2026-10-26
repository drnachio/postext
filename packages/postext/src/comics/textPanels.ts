/**
 * Text panels (`::panel{text}`, #885, DESIGN §7): a panel whose body is
 * Markdown, poured into the frame the split generated for it the way a
 * composed page pours a slot into a frame.
 *
 * The block parser reads the body as any text and sets its blocks right
 * after the comic's directive. Before layout, {@link wrapComicTextPanels}
 * puts each panel's blocks in one frameless story box (the composed pages'
 * {@link FRAME_STYLE_ID} box); the comic page's layout then sets each story
 * in its panel's frame with the composed pages' frame layout
 * (`layoutComposedPage`, one frame filling the panel's text area), so a
 * text panel has real paragraphs: selectable, searchable, read in order by
 * tagged PDF and EPUB. A strip's text frames are laid once the strip has
 * its place on the page ({@link layoutStripTextFrames}), a spread's on its
 * two pages; a comic inside a container keeps its text in the flow after
 * the comic, never lost.
 */

import type { ContentBlock } from '../parse/types.js';
import type { CalloutPaddingConfig, Dimension, ResolvedCalloutStyleConfig } from '../types.js';
import type { ContentWarning, ResolvedConfig, VDTBlock, VDTComicPage, VDTFrame, VDTPage } from '../vdt.js';
import { flowRectToPage, pageRectToFlow, pageToFlow, type BoundingBox, type VDTContourSpan } from '../vdt.js';
import { FRAME_ATTR, FRAME_STYLE_ID } from '../composed/wrap.js';
import { normalizeFrame } from '../composed/templates.js';
import type { ResolvedFrame, ResolvedPageTemplate } from '../composed/types.js';
import type { BoxExclusion, PlannedCallout } from '../pipeline/callouts/calloutLayout.js';
import type { FrameLayoutPass } from '../pipeline/callouts/frameLayout.js';
import { composedStories, layoutComposedPage, type ComposedStory, type PlannedComposedPage } from '../pipeline/composedPages/composedLayout.js';
import { resolvedDirection } from '../pipeline/config.js';
import { SPAN_EMBED_STYLE_ID } from '../pipeline/floats/spanEmbeds.js';
import { dimensionToPx } from '../units.js';
import { resolvedComics } from '../defaults/comics.js';
import { comicBoxStyle, isComicTextPanel } from './frames.js';
import { translateComicPage } from './transform.js';
import { comicPanelSources, copyComicPanelSources, setComicLayoutWarnings, comicPageLayoutWarnings } from './layoutPage.js';
import type { ComicPageSource, ComicPanelSource } from './types.js';

/** `containerAttrs` key of a text panel's story box: the panel's index in
 *  its page's source (`ComicPanelSource.index`). */
export const COMIC_PANEL_ATTR = '__comicPanel';

/** Container ids of the text panels' story boxes: past any id the parser
 *  hands out and clear of the other synthetic boxes'. */
const COMIC_TEXT_CONTAINER_BASE = 1_900_000_000;

/** The story key of a text panel (its box's `FRAME_ATTR`). */
export const comicTextStoryKey = (panelIndex: number): string => `comic:${panelIndex}`;

/** Whether text panels can be set in their frames in a document: in every
 *  one since postext 1.39 (#909). Up to 1.38 a vertical or right-to-left
 *  document set them in the flow after the comic; now the frame takes the
 *  text in the page's flow frame, mirrored or turned (set vertically on a
 *  vertical page). Kept for the callers that ask. */
export function comicTextPanelsSupported(resolved?: Pick<ResolvedConfig, 'layout'> & Parameters<typeof resolvedDirection>[0]): boolean {
  void resolved;
  return true;
}

/** Why a text panel's Markdown is set in the flow instead of its frame:
 *  never since postext 1.40 (#959: strips and spreads take their text in
 *  the frames too); `'flow'` only for a caller that passes `supported`
 *  false. Undefined when its frame takes it. Kept for the callers that
 *  ask; `source` is read no more. */
export function comicTextPanelFallback(source: Pick<ComicPageSource, 'kind' | 'attrs'>, supported: boolean): 'strip' | 'spread' | 'flow' | undefined {
  void source;
  return supported ? undefined : 'flow';
}

/**
 * `blocks` with the Markdown of every text panel of a comic page set in
 * its frame regrouped in a story box of its own (see the module comment).
 * Only comics outside any container and whose frame takes text
 * ({@link comicTextPanelFallback}). The same array comes back when there
 * is nothing to wrap.
 */
export function wrapComicTextPanels(blocks: readonly ContentBlock[], supported: boolean): { blocks: ContentBlock[]; wrapped: boolean } {
  let out: ContentBlock[] | undefined;
  let next = 0;
  let depth = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'containerStart') depth++;
    else if (b.type === 'containerEnd') depth = Math.max(0, depth - 1);
    const comic = b.type === 'directive' && depth === 0 ? b.comic : undefined;
    const texts = comic && comicTextPanelFallback(comic, supported) === undefined ? comic.panels.filter((p) => p.text && p.text.end > p.text.start && isComicTextPanel(p)) : [];
    if (texts.length === 0) {
      out?.push(b);
      continue;
    }
    out ??= blocks.slice(0, i);
    out.push(b);
    // The panels' blocks follow the directive, panel after panel.
    let k = i + 1;
    for (const panel of texts) {
      const range = panel.text!;
      const start = k;
      while (k < blocks.length && blocks[k]!.sourceStart >= range.start && blocks[k]!.sourceEnd <= range.end) k++;
      if (k === start) continue;
      const first = blocks[start]!;
      const last = blocks[k - 1]!;
      const id = COMIC_TEXT_CONTAINER_BASE + next++;
      out.push({
        type: 'containerStart',
        text: '',
        spans: [],
        containerName: 'callout',
        containerAttrs: { type: FRAME_STYLE_ID, placement: 'here', span: 'column', [FRAME_ATTR]: comicTextStoryKey(panel.index), [COMIC_PANEL_ATTR]: String(panel.index) },
        containerId: id,
        sourceStart: first.sourceStart,
        sourceEnd: first.sourceStart,
        sourceMap: [],
      });
      for (let j = start; j < k; j++) out.push(blocks[j]!);
      out.push({ type: 'containerEnd', text: '', spans: [], containerName: 'callout', containerId: id, sourceStart: last.sourceEnd, sourceEnd: last.sourceEnd, sourceMap: [] });
    }
    i = k - 1;
  }
  return out ? { blocks: out, wrapped: next > 0 } : { blocks: blocks as ContentBlock[], wrapped: false };
}

/** The text panels' stories of every comic page of the pass, by the index
 *  of its directive: the markers they span (the directive to the closing
 *  marker of the last story) and the stories by key
 *  ({@link comicTextStoryKey}). */
export function planComicTextPanels(blocks: readonly ContentBlock[], plans: ReadonlyMap<number, PlannedCallout>): Map<number, PlannedComposedPage> {
  const out = new Map<number, PlannedComposedPage>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'directive' || !b.comic) continue;
    let end = i;
    // A page-wide strip set where it stands is boxed (`wrapPageSpanEmbeds`):
    // its stories follow the box's closing marker.
    const prev = blocks[i - 1];
    const next = blocks[i + 1];
    if (prev?.type === 'containerStart' && prev.containerAttrs?.type === SPAN_EMBED_STYLE_ID && next?.type === 'containerEnd' && next.containerId === prev.containerId) end = i + 1;
    const lead = end;
    for (let plan = plans.get(end + 1); plan && plan.attrs[COMIC_PANEL_ATTR] !== undefined; plan = plans.get(end + 1)) end = plan.endIdx;
    if (end === lead) continue;
    const stories = composedStories(i, end + 1, plans);
    const list = [...stories.values()];
    out.set(i, {
      startIdx: i,
      endIdx: end,
      stories,
      storyAt: (idx) => list.find((s) => idx > s.startIdx && idx < s.plan.endIdx),
    });
    i = end;
  }
  return out;
}

/** What {@link layoutComicTextFrames} reads of the pass (as a composed page
 *  does, `ComposedPageInput`). */
export interface ComicTextFramesInput {
  pass: FrameLayoutPass;
  resolved: ResolvedConfig;
  page: VDTPage;
  comic: VDTComicPage;
  plan: PlannedComposedPage;
  /** The style a frame is drawn with: its `style`, else frameless. */
  styleOf(frame: ResolvedFrame): ResolvedCalloutStyleConfig;
  dpi: number;
  emPx: number;
  bodyOffset: number;
  mirrored: boolean;
  pushGapPx: number;
  locale?: string;
  /** Only the text panels with these source indexes are laid (a spread
   *  gives each panel to one of its two pages); all when unset. */
  only?: ReadonlySet<number>;
  /** Boxes on the sheet the text keeps off (a spread's gutter), each set
   *  short where it crosses a line. */
  avoid?: readonly BoundingBox[];
}

export interface ComicTextFramesLayout {
  /** The frames' boxes and content, for `page.floats` and `doc.blocks`. */
  blocks: VDTBlock[];
  /** The stories set (by key). */
  laid: Set<string>;
}

const px = (v: number): Dimension => ({ value: v, unit: 'px' });

/** The first block of a laid story that sets text: where its text starts,
 *  which moves with the frame's vertical alignment. */
function firstTextY(blocks: readonly VDTBlock[]): number | undefined {
  for (const b of blocks) if (b.type !== 'callout' && !b.hidden && b.lines.length > 0) return b.bbox.y;
  return undefined;
}

/**
 * Set the text panels of a laid-out comic page in their frames: each text
 * frame of `comic.frames` gets the blocks its story was set in
 * (`blockIds`), its overflow and its scale; a frame its text does not fit
 * clips it (`comicPanelFrame`, reason `textOverflow`). The frame's text
 * area is the panel's box inside its border and the lettering's inset;
 * with a `box` style, the panel's box (the style's padding keeps the text
 * off its edges).
 *
 * `comic` is on the sheet of `page`: a comic page, a half of a spread, or
 * a strip moved there ({@link layoutStripTextFrames}).
 */
export function layoutComicTextFrames(input: ComicTextFramesInput): ComicTextFramesLayout {
  const { comic, page, plan, resolved, dpi } = input;
  const blocks: VDTBlock[] = [];
  const laid = new Set<string>();
  if (!comic.frames) return { blocks, laid };
  const sources = comicPanelSources(comic);
  const insetPx = dimensionToPx(resolvedComics(resolved).lettering.inset, dpi);
  const warnings: ContentWarning[] = [];
  const fence = Number(/^cm(\d+)$/.exec(comic.id ?? '')?.[1] ?? 0);
  // The sheet's boxes to keep off, in the page's flow frame.
  const avoid: BoxExclusion[] = (input.avoid ?? []).map((r) => {
    const f = page.flow ? pageRectToFlow(page, r) : r;
    return { x: f.x, y: f.y, width: f.width, height: f.height };
  });
  comic.frames.forEach((frame, fi) => {
    const panelIndex = frame.panel ?? fi;
    const src: ComicPanelSource | undefined = sources[panelIndex];
    if (!src || !isComicTextPanel(src)) return;
    if (input.only && !input.only.has(src.index)) return;
    const key = comicTextStoryKey(src.index);
    const story: ComposedStory | undefined = plan.stories.get(key);
    if (!story) return;
    const panel = comic.panels.find((q) => q.index === panelIndex) ?? comic.panels[panelIndex];
    if (!panel) return;
    const box = comicBoxStyle(resolved, src.attrs.box);
    const edge = box ? 0 : panel.border.width + insetPx;
    const valign = src.attrs.valign?.trim().toLowerCase();
    const aligned = valign === 'middle' || valign === 'bottom';
    // A slanted cell: frameless text set from the top takes the whole cell,
    // each line set short where a slant crosses it (#909). Text set to the
    // middle or the foot follows the slant too, laid again with the slant
    // moved by the room above it (#959); a box drawn round the text keeps
    // to the widest box with straight sides inside the outline.
    const follows = !!frame.polygon && !box;
    const outline = follows ? (page.flow ? frame.polygon!.map((q) => pageToFlow(page, q.x, q.y)) : frame.polygon!) : undefined;
    const areaOf = (r: BoundingBox): BoundingBox => {
      const onSheet = { x: r.x + edge, y: r.y + edge, width: Math.max(1, r.width - 2 * edge), height: Math.max(1, r.height - 2 * edge) };
      // The comic stands on the sheet; the text is set in the page's flow
      // frame (#909), mirrored on a right-to-left page and turned on a
      // vertical one (where it is set vertically).
      return page.flow ? pageRectToFlow(page, onSheet) : onSheet;
    };
    // `shrink` (#909): the text set smaller until it fits, down to half
    // its size or the `shrink=` given; else the frames' least, 90 %.
    const minScale = shrinkScale(src.attrs.shrink);
    const padding: CalloutPaddingConfig | undefined = box ? undefined : { top: px(0), right: px(0), bottom: px(0), left: px(0) };
    const lay = (area: BoundingBox, shapes: readonly BoxExclusion[], verticalAlign: 'top' | 'middle' | 'bottom' | undefined) => {
      const resolvedFrame = normalizeFrame({
        name: frame.name,
        width: 'fill',
        height: 'fill',
        ...(box ? { style: box.id } : {}),
        ...(verticalAlign && verticalAlign !== 'top' ? { verticalAlign } : {}),
        ...(padding ? { padding } : {}),
        ...(minScale !== undefined ? { fit: { shrinkText: true, minScale } } : {}),
      });
      const template: ResolvedPageTemplate = {
        id: comic.id ?? 'comic',
        area: 'content',
        frames: [resolvedFrame],
        groups: [],
        decoration: { elements: [] },
        decorationPaths: [],
        spread: false,
        gutter: px(0),
        role: 'comic',
        chain: [comic.id ?? 'comic'],
        configPath: '',
      };
      const around = [...avoid, ...shapes];
      return layoutComposedPage({
        pass: input.pass,
        page,
        template,
        fence: { template: template.id, spread: false, attrs: {}, attrSources: {}, fenceIndex: fence, colons: 4 },
        startIdx: plan.startIdx,
        endIdx: plan.endIdx,
        stories: new Map([[frame.name, story]]),
        styleOf: input.styleOf,
        areas: { area, page: area, bleed: area },
        dpi,
        emPx: input.emPx,
        bodyOffset: input.bodyOffset,
        mirrored: input.mirrored,
        pushGapPx: input.pushGapPx,
        ...(around.length > 0 ? { frameExclusions: new Map([[frame.name, around]]) } : {}),
        ...(input.locale ? { locale: input.locale } : {}),
      });
    };
    let area: BoundingBox;
    let out: ReturnType<typeof lay>;
    const wholeCell = (): boolean => {
      area = areaOf(panel.bbox);
      if (!aligned) {
        out = lay(area, slantExclusions(outline!, area, edge), undefined);
        return true;
      }
      // The alignment depends on how many lines the slant leaves and the
      // slant on where the text stands: the room the lines have at a height
      // is the outline's there, so the slant is laid as if the text stood
      // `shift` lower, and the shift is sought where the text lands (the
      // lower the text stands, the narrower a slanted foot leaves it, the
      // taller it is: bisection). A layout is kept only when every line lies
      // inside the outline; none does: the straight box inside the cell.
      const base = slantExclusions(outline!, area, edge);
      const top = firstTextY(lay(area, base, undefined).blocks);
      if (top === undefined) {
        out = lay(area, base, valign as 'middle' | 'bottom');
        return true;
      }
      const align = valign as 'middle' | 'bottom';
      const attempt = (shift: number) => {
        const moved = outline!.map((q) => ({ x: q.x, y: q.y - shift }));
        const result = lay(area, slantExclusions(moved, area, edge), align);
        const at = firstTextY(result.blocks);
        return { result, landed: at === undefined ? shift : at - top };
      };
      let bestResult: ReturnType<typeof lay> | undefined;
      let bestGap = Infinity;
      const consider = (shift: number, t: ReturnType<typeof attempt>): void => {
        const gap = Math.abs(t.landed - shift);
        if (gap < bestGap && linesInsideOutline(t.result.blocks, outline!, edge)) {
          bestResult = t.result;
          bestGap = gap;
        }
      };
      const first = attempt(0);
      consider(0, first);
      if (first.landed > 1) {
        let lo = 0;
        let hi = area.height;
        for (let round = 0; round < 9 && bestGap > 1; round++) {
          const mid = (lo + hi) / 2;
          const t = attempt(mid);
          consider(mid, t);
          if (t.landed > mid) lo = mid;
          else hi = mid;
        }
      }
      if (!bestResult || bestGap > 3 * input.emPx) return false;
      out = bestResult;
      return true;
    };
    if (!follows || !wholeCell()) {
      const r = frame.polygon ? innerBox(frame.polygon, panel.bbox) : panel.bbox;
      area = areaOf(r);
      out = lay(area, [], aligned ? (valign as 'middle' | 'bottom') : undefined);
    }
    const set = out!.composed.frames[0];
    if (!set || !out!.laid.has(frame.name)) return;
    laid.add(key);
    // The composed pages' ids (`cp<n>:…`) as the comic's (`cm<n>:…`).
    const from = `cp${fence}:`;
    const to = `cm${fence}:`;
    const rename = (id: string): string => (id.startsWith(from) ? to + id.slice(from.length) : id);
    for (const b of out!.blocks) {
      b.id = rename(b.id);
      if (b.callout) b.callout.childIds = b.callout.childIds.map(rename);
      blocks.push(b);
    }
    comic.frames![fi] = {
      ...frame,
      blockIds: set.blockIds.map(rename),
      overflowPx: set.overflowPx,
      scale: set.scale,
      ...(set.imageScale !== undefined ? { imageScale: set.imageScale } : {}),
      ...(box ? { styleId: box.id } : {}),
    };
    if (set.overflowPx > 0.5) {
      warnings.push({
        kind: 'comicPanelFrame',
        reason: 'textOverflow',
        panel: src.index,
        overflowMm: Math.round((set.overflowPx / dpi) * 254) / 10,
        sourceStart: src.text!.start + input.bodyOffset,
        sourceEnd: src.text!.end + input.bodyOffset,
        pageIndex: page.index,
      });
    }
  });
  if (warnings.length > 0) setComicLayoutWarnings(comic, [...comicPageLayoutWarnings(comic), ...warnings]);
  return { blocks, laid };
}

/** Whether every line of the text blocks lies inside a convex outline,
 *  `edge` in from it (the lines of a text laid in a slanted cell). */
function linesInsideOutline(blocks: readonly VDTBlock[], outline: readonly { x: number; y: number }[], edge: number): boolean {
  for (const b of blocks) {
    if (b.type === 'callout' || b.hidden) continue;
    for (const l of b.lines) {
      const span = l.measure ?? { x: l.bbox.x, width: l.bbox.width };
      // A line the room cannot take at all: the text did not settle.
      if (span.width < 1) return false;
      for (const y of [l.bbox.y + 0.5, l.bbox.y + l.bbox.height - 0.5]) {
        const c = crossing(outline, 'y', y);
        if (!c) return false;
        if (span.x < c[0] + edge - 1 || span.x + span.width > c[1] - edge + 1) return false;
      }
    }
  }
  return true;
}

/**
 * The text panels of a strip (`:::strip`, #959), laid once the strip's block
 * has its place on the page: the strip's comic stands relative to its block
 * (`VDTBlock.comic`), so it is moved onto the sheet where the block sits
 * ({@link flowRectToPage}), its text set there in the page's flow frame, and
 * what the frames came to (blocks, overflow, scale, warnings) written back
 * on the block's comic, which keeps moving with the block. `input.comic` is
 * ignored; `block` is the strip.
 */
export function layoutStripTextFrames(input: Omit<ComicTextFramesInput, 'comic'> & { block: Pick<VDTBlock, 'bbox' | 'comic'> }): ComicTextFramesLayout {
  const own = input.block.comic;
  if (!own?.frames) return { blocks: [], laid: new Set() };
  const at = flowRectToPage(input.page, input.block.bbox);
  const onSheet = translateComicPage(own, at.x, at.y);
  copyComicPanelSources(own, onSheet);
  const out = layoutComicTextFrames({ ...input, comic: onSheet });
  if (out.laid.size === 0) return out;
  // The frames' results are position-free: they go back to the block's
  // comic as they are.
  own.frames = own.frames.map((f, i) => {
    const laidFrame: VDTFrame | undefined = onSheet.frames?.[i];
    if (!laidFrame || laidFrame.blockIds.length === 0) return f;
    return {
      ...f,
      blockIds: [...laidFrame.blockIds],
      overflowPx: laidFrame.overflowPx,
      scale: laidFrame.scale,
      ...(laidFrame.imageScale !== undefined ? { imageScale: laidFrame.imageScale } : {}),
      ...(laidFrame.styleId !== undefined ? { styleId: laidFrame.styleId } : {}),
    };
  });
  const added = comicPageLayoutWarnings(onSheet);
  if (added.length > 0) setComicLayoutWarnings(own, [...comicPageLayoutWarnings(own), ...added]);
  return out;
}

/** The least scale a text panel's `shrink` attribute lets its text take
 *  (#909): `shrink` alone, 0.5; `shrink=0.7` (or `70%`), that, kept
 *  between 0.25 and 1; undefined without it (or `shrink=false`). */
export function shrinkScale(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'false' || v === 'no') return undefined;
  if (v === '' || v === 'true' || v === 'shrink') return 0.5;
  const pct = v.endsWith('%');
  const n = Number(pct ? v.slice(0, -1) : v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0.25, pct ? n / 100 : n));
}

/** The shapes a frameless text set in a slanted cell keeps off (#909):
 *  for each band of `area` (2 px tall) what lies outside the cell's
 *  outline, `edge` in from it, on the left and on the right, as two
 *  contours (page coordinates of the outline's frame). */
export function slantExclusions(poly: readonly { x: number; y: number }[], area: { x: number; y: number; width: number; height: number }, edge: number): BoxExclusion[] {
  const step = 2;
  const left: VDTContourSpan[] = [];
  const right: VDTContourSpan[] = [];
  const x0 = area.x;
  const x1 = area.x + area.width;
  for (let y = area.y; y < area.y + area.height; y += step) {
    const h = Math.min(step, area.y + area.height - y);
    // The room the band has, `edge` off the outline above and below it too.
    let lo = -Infinity;
    let hi = Infinity;
    for (const at of [y - edge, y, y + h / 2, y + h, y + h + edge]) {
      const c = crossing(poly, 'y', at);
      if (!c) continue;
      lo = Math.max(lo, c[0] + edge);
      hi = Math.min(hi, c[1] - edge);
    }
    // A band the outline does not reach (text laid as if it stood lower,
    // past the cell's foot): no room at all.
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      left.push({ y, height: h, left: x0, right: x1 });
      continue;
    }
    if (lo > x0 + 0.5) left.push({ y, height: h, left: x0, right: Math.min(x1, lo) });
    if (hi < x1 - 0.5) right.push({ y, height: h, left: Math.max(x0, hi), right: x1 });
  }
  const shape = (spans: VDTContourSpan[]): BoxExclusion | undefined => {
    if (spans.length === 0) return undefined;
    const bx0 = Math.min(...spans.map((s) => s.left));
    const bx1 = Math.max(...spans.map((s) => s.right));
    const by0 = spans[0]!.y;
    const by1 = spans[spans.length - 1]!.y + spans[spans.length - 1]!.height;
    return { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0, contour: { spans, margin: 0 } };
  };
  return [shape(left), shape(right)].filter((e): e is BoxExclusion => e !== undefined);
}

/** Where a horizontal (`axis: 'y'`, at height `at`) or vertical line
 *  crosses a convex polygon: the interval it lies in, or undefined. */
function crossing(poly: readonly { x: number; y: number }[], axis: 'x' | 'y', at: number): [number, number] | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const [a0, a1, b0, b1] = axis === 'y' ? [a.y, a.x, b.y, b.x] : [a.x, a.y, b.x, b.y];
    if ((a0 - at) * (b0 - at) > 0 || a0 === b0) {
      if (a0 === at) { lo = Math.min(lo, a1); hi = Math.max(hi, a1); }
      continue;
    }
    const v = a1 + ((at - a0) / (b0 - a0)) * (b1 - a1);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return lo <= hi ? [lo, hi] : undefined;
}

/** The box with straight sides inside a convex polygon (a cell cut by
 *  slanted lines), so that text keeps off the slants: the larger of the box
 *  that keeps the whole height and the width every row of it shares (then
 *  the height every column of that width shares), and the box that keeps
 *  the whole width first. Falls back to `box` when both are degenerate. */
export function innerBox(poly: readonly { x: number; y: number }[], box: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
  const N = 16;
  /** The interval every line across `axis` shares, sampled over [a, b]. */
  const shared = (axis: 'x' | 'y', a: number, b: number, lo: number, hi: number): [number, number] => {
    for (let i = 0; i <= N && hi > lo; i++) {
      const c = crossing(poly, axis, a + 0.001 + ((b - a - 0.002) * i) / N);
      if (!c) continue;
      lo = Math.max(lo, c[0]);
      hi = Math.min(hi, c[1]);
    }
    return [lo, hi];
  };
  const X0 = box.x;
  const X1 = box.x + box.width;
  const Y0 = box.y;
  const Y1 = box.y + box.height;
  // Rows first: the width all rows share, then the height its columns share.
  const [ax0, ax1] = shared('y', Y0, Y1, X0, X1);
  const [ay0, ay1] = ax1 - ax0 > 1 ? shared('x', ax0, ax1, Y0, Y1) : [0, 0];
  // Columns first.
  const [by0, by1] = shared('x', X0, X1, Y0, Y1);
  const [bx0, bx1] = by1 - by0 > 1 ? shared('y', by0, by1, X0, X1) : [0, 0];
  const area = (w: number, h: number) => (w > 1 && h > 1 ? w * h : 0);
  const a = area(ax1 - ax0, ay1 - ay0);
  const b = area(bx1 - bx0, by1 - by0);
  if (a === 0 && b === 0) return { ...box };
  return a >= b ? { x: ax0, y: ay0, width: ax1 - ax0, height: ay1 - ay0 } : { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0 };
}

/** The source warnings of a comic's frames (#885): a `box` that names no
 *  callout style, and text panels whose Markdown is set in the flow
 *  ({@link comicTextPanelFallback}). Offsets as in `source`. */
export function comicFrameSourceWarnings(source: ComicPageSource, calloutStyles: ReadonlySet<string>, supported: boolean): ContentWarning[] {
  const out: ContentWarning[] = [];
  const fallback = comicTextPanelFallback(source, supported);
  for (const panel of source.panels) {
    const box = panel.attrs.box?.trim();
    if (box && !calloutStyles.has(box)) {
      const r = panel.attrSources.box ?? { start: panel.lineStart, end: panel.lineEnd };
      out.push({ kind: 'comicPanelFrame', reason: 'unknownBox', panel: panel.index, style: box, sourceStart: r.start, sourceEnd: r.end });
    }
    if (fallback && isComicTextPanel(panel) && panel.text && panel.text.end > panel.text.start) {
      out.push({ kind: 'comicPanelFrame', reason: fallback, panel: panel.index, sourceStart: panel.lineStart, sourceEnd: panel.lineEnd });
    }
  }
  return out;
}
