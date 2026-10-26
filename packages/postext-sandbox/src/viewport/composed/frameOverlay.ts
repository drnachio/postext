/**
 * What the canvas draws over a composed page's frames (#864), in the
 * page's overlay (never in the page itself, so never in a PDF, a print or
 * an export):
 *
 * - an empty frame: a dashed outline, its name and «Write here» (a frame
 *   a chain continues into says which frame it continues instead; a page
 *   added by continuation, #859, marks none);
 * - Content mode: the frame of the slot the editor's caret is in;
 * - Design mode: every frame's outline and name, the frame picked
 *   stronger.
 */

import { resolvePageTemplate, type PageTemplateSource, type VDTDocument, type VDTFrame, type VDTPage } from 'postext';
import { SVG_NS } from '../canvas/CanvasPreview/dom.js';
import { flowBoxOnSheet, frameIsEmpty } from './frameHit.js';
import { chainHeadOf, frameAtCaret } from './frameLink.js';
import type { EditMode } from '../../editing/editMode.js';
import { designBadgesFor, drawDesignBadge, type DesignBadgeLabels } from './designBadges.js';

export interface FrameMarksOptions {
  mode: EditMode;
  /** The text the page was laid out from (its offsets), when known. */
  markdown: string | null;
  /** The editor's caret, in that text's offsets; null when the editor
   *  does not hold it. */
  caret: number | null;
  /** The frame picked in Design mode (`cp<fence>:<name>`). */
  selectedFrameId: string | null;
  writeHere: string;
  /** «Continues __frame__». */
  continues: string;
  /** Design mode: the words of the sizing badges (#868); none drawn
   *  without them. */
  badges?: DesignBadgeLabels;
  /** The reader's language, for the numbers on the badges. */
  locale?: string;
}

/** What to draw on a page, apart from the DOM (tests). */
export interface FrameMark {
  frame: VDTFrame;
  kind: 'empty' | 'active' | 'outline' | 'selected';
  /** The lines written in it (the name first). */
  text: string[];
}

export function frameMarksFor(doc: Pick<VDTDocument, 'config'>, page: VDTPage, opts: FrameMarksOptions): FrameMark[] {
  const composed = page.composed;
  if (!composed) return [];
  const template = resolvePageTemplate(doc.config as unknown as PageTemplateSource, composed.template, composed.modules ? { modules: composed.modules } : {});
  const active = opts.mode === 'content' && opts.markdown !== null && opts.caret !== null ? frameAtCaret(opts.markdown, page, opts.caret, undefined, template) : null;
  // The caret's chain: its slot's frame and the frames its text goes on in.
  const activeHead = active ? chainHeadOf(template, active.name) : null;
  const out: FrameMark[] = [];
  for (const frame of composed.frames) {
    const head = chainHeadOf(template, frame.name);
    const empty = frameIsEmpty(frame);
    if (opts.mode === 'design') {
      out.push({ frame, kind: frame.id === opts.selectedFrameId ? 'selected' : 'outline', text: [frame.name] });
      continue;
    }
    if (active && (active.id === frame.id || (head === activeHead && !empty))) {
      out.push({ frame, kind: 'active', text: empty ? [frame.name, opts.writeHere] : [] });
      continue;
    }
    // A page added by continuation (#859) holds what its fence's page sent
    // on: its other frames are not places to write. A frame that takes no
    // room (an answer space gone on with the rest, #912) is not either.
    if (empty && composed.continuationOf === undefined && !frame.collapsed) {
      out.push({ frame, kind: 'empty', text: [frame.name, head !== frame.name ? opts.continues.replace('__frame__', head) : opts.writeHere] });
    }
  }
  return out;
}

/** The size of the names written on a page's frames, sheet px. */
export function markFontPx(page: Pick<VDTPage, 'width'>): number {
  return Math.max((page.width / 600) * 9, 6);
}

/** The box an empty frame's mark takes: the frame's, at least tall enough
 *  for its name and «Write here» (a frame whose height follows its content
 *  has none while it is empty). A click there reaches the frame. */
export function emptyMarkRect(page: Pick<VDTPage, 'width'>, frame: Pick<VDTFrame, 'rect'>): VDTFrame['rect'] {
  const min = markFontPx(page) * 3.4;
  return frame.rect.height < min ? { ...frame.rect, height: min } : frame.rect;
}

const STROKE: Record<FrameMark['kind'], string> = {
  empty: '#7d8a96',
  outline: '#7d8a96',
  active: '#d9480f',
  selected: '#d9480f',
};

function groupOf(svg: SVGSVGElement): SVGGElement {
  let g = svg.querySelector<SVGGElement>('g[data-role="frames"]');
  if (!g) {
    g = document.createElementNS(SVG_NS, 'g');
    g.dataset.role = 'frames';
    // Under the selection and the caret.
    const selection = svg.querySelector('g[data-role="selection"]');
    svg.insertBefore(g, selection);
  }
  return g;
}

/** Take the frame marks off a page overlay. */
export function clearFrameMarks(svg: SVGSVGElement): void {
  const g = svg.querySelector<SVGGElement>('g[data-role="frames"]');
  if (g) while (g.firstChild) g.removeChild(g.firstChild);
}

/** Draw the frame marks of `pageIndex` into its overlay. */
export function drawFrameMarks(svg: SVGSVGElement, doc: VDTDocument, pageIndex: number, opts: FrameMarksOptions): void {
  const page = doc.pages[pageIndex];
  const existing = svg.querySelector<SVGGElement>('g[data-role="frames"]');
  if (!page?.composed) {
    if (existing) clearFrameMarks(svg);
    return;
  }
  const g = groupOf(svg);
  clearFrameMarks(svg);
  const unit = page.width / 600;
  const fs = markFontPx(page);
  const placedBadges: { x: number; y: number; w: number }[] = [];
  const badges = opts.mode === 'design' && opts.badges ? new Map(designBadgesFor(doc, page, opts.badges, opts.locale).map((b) => [b.frame.id, b])) : null;
  for (const mark of frameMarksFor(doc, page, opts)) {
    // An empty frame whose height follows its content has none: its mark
    // keeps room for its name and «Write here» (the page is not changed).
    // Drawn where the sheet shows the frame, which a right-to-left or
    // vertical page lays in its flow frame (#929); the words stay upright.
    const { rect, rotate } = flowBoxOnSheet(page, mark.text.length > 1 ? emptyMarkRect(page, mark.frame) : mark.frame.rect, mark.frame.rotate);
    const item = document.createElementNS(SVG_NS, 'g');
    item.dataset.frameId = mark.frame.id;
    item.dataset.mark = mark.kind;
    if (rotate) item.setAttribute('transform', `rotate(${rotate} ${rect.x + rect.width / 2} ${rect.y + rect.height / 2})`);
    const box = document.createElementNS(SVG_NS, 'rect');
    box.setAttribute('x', String(rect.x));
    box.setAttribute('y', String(rect.y));
    box.setAttribute('width', String(Math.max(1, rect.width)));
    box.setAttribute('height', String(Math.max(1, rect.height)));
    const strong = mark.kind === 'active' || mark.kind === 'selected';
    box.setAttribute('fill', mark.kind === 'empty' ? 'rgba(125, 138, 150, 0.06)' : strong ? 'rgba(217, 72, 15, 0.05)' : 'none');
    box.setAttribute('stroke', STROKE[mark.kind]);
    box.setAttribute('stroke-width', String(unit * (strong ? 2.2 : 1)));
    if (mark.kind === 'empty' || mark.kind === 'outline') box.setAttribute('stroke-dasharray', `${unit * 5} ${unit * 4}`);
    item.appendChild(box);
    const [name, line] = mark.text;
    if (name && rect.height > fs * 1.4) {
      // A ground under the name, so it reads over the frame's own text.
      const ground = document.createElementNS(SVG_NS, 'rect');
      ground.setAttribute('x', String(rect.x + fs * 0.25));
      ground.setAttribute('y', String(rect.y + fs * 0.25));
      ground.setAttribute('width', String(Math.min(rect.width - fs * 0.5, fs * (0.6 * name.length + 0.5))));
      ground.setAttribute('height', String(fs * 1.4));
      ground.setAttribute('fill', '#ffffff');
      ground.setAttribute('fill-opacity', '0.85');
      item.appendChild(ground);
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(rect.x + fs * 0.5));
      t.setAttribute('y', String(rect.y + fs * 1.3));
      t.setAttribute('font-size', String(fs));
      t.setAttribute('font-family', 'system-ui, sans-serif');
      t.setAttribute('fill', STROKE[mark.kind]);
      t.textContent = name;
      item.appendChild(t);
    }
    if (line && rect.height > fs * 3) {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(rect.x + rect.width / 2));
      t.setAttribute('y', String(rect.y + rect.height / 2 + fs * 0.45));
      t.setAttribute('font-size', String(fs * 1.25));
      t.setAttribute('font-family', 'system-ui, sans-serif');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', '#5b6670');
      t.textContent = line;
      item.appendChild(t);
    }
    g.appendChild(item);
    // After the item is in the overlay: the badge measures its words.
    const badge = badges?.get(mark.frame.id);
    if (badge) {
      // On the sheet's box; a vertical page's size lines would run across
      // the flow's, so they are left out there.
      const vertical = page.flow?.writingMode === 'vertical-rl';
      const { min, max, ...rest } = badge;
      const onSheet = page.flow ? { ...rest, ...(vertical ? {} : { ...(min ? { min } : {}), ...(max ? { max } : {}) }), frame: { ...badge.frame, rect } } : badge;
      drawDesignBadge(item, onSheet, fs, unit, placedBadges);
    }
  }
}
