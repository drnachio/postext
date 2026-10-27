// The frame editor's marks on a page, the frame selection and the template
// fence a page writes to (#1276: split out of frameEditor.ts).
import { svgEl, COLORS, pageTemplate, pointerGripOf, GRIP_GAP_CSS_PX, GRIP_CSS_PX, type FrameEditorRefs } from './shared.js';
import { mmToPx, dimensionToMm, spreadGutterBand, RESIZE_HANDLES, handlePoint, type PageAreas, type Rect, type GridGeometry } from '../../../templates/frameGeometry.js';
import { templateEditorHost, templateEditor, type TemplateEditorHost } from '../../../templates/editorStore.js';
import { nextFrameName } from '../../../templates/frameChain.js';
import type { VDTFrame, VDTComposedPage, PostextConfig, VDTPage, ResolvedPageTemplate } from 'postext';
import { frameScopeOnPage } from '../../../templates/pageEdits.js';
import { selectFrame as pickFrame } from '../../../editing/editMode.js';
import { emitFrameEditorEvent } from '../../../templates/frameEvents.js';
import { showPageTemplatesSection } from '../../../templates/showSection.js';
import { segmentAtOffset } from '../../../book/compose.js';
import { templateFences } from '../../../templates/templateUsage.js';
import type { FrameAnchorPoint } from '../labelAnchorGeometry.js';
import type { FrameEditorState, FrameEditorLate } from './state.js';

/** What createFramePaint takes from the frame editor. */
export interface FramePaintDeps {
  slot: HTMLElement;
  pageIndex: number;
  refs: FrameEditorRefs;
  svg: SVGSVGElement;
  composed: () => VDTComposedPage | undefined;
  active: () => boolean;
  sheetPerCss: () => number;
  flowSize: () => { width: number; height: number; };
  flowMatrix: () => string | null;
  spreadAxis: () => "x" | "y";
  side: (c: VDTComposedPage) => 0 | 1;
  dpi: () => number;
  selectedHere: () => VDTFrame | undefined;
  geometry: () => { p: VDTPage; c: VDTComposedPage; host: TemplateEditorHost; config: PostextConfig; template: ResolvedPageTemplate; areas: PageAreas; area: Rect; grid: GridGeometry | undefined; } | null;
  paintConnector: (root: SVGGElement, k: number, lw: number) => void;
  anchorsHere: () => FrameAnchorPoint[];
  gripOnSheet: (f: VDTFrame) => { x: number; y: number; };
  frameState: FrameEditorState;
  frameLate: FrameEditorLate;
}

export function createFramePaint(deps: FramePaintDeps) {
  const {
    slot, pageIndex, refs, svg, composed, active, sheetPerCss, flowSize, flowMatrix, spreadAxis,
    side, dpi, selectedHere, geometry, paintConnector, anchorsHere, gripOnSheet, frameState,
    frameLate
  } = deps;
  const paint = (): void => {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!active()) {
      if (svg.parentNode) svg.remove();
      frameLate.closeQuestion();
      return;
    }
    if (svg.parentNode !== slot) slot.appendChild(svg);
    const root = svgEl('g', {});
    const turned = flowMatrix();
    if (turned) root.setAttribute('transform', turned);
    svg.appendChild(root);
    const { width: flowW, height: flowH } = flowSize();
    const g = geometry();
    const c = composed()!;
    const k = sheetPerCss();
    const lw = 1 * k;
    if (g) {
      // The margins and the template's area.
      const content = g.areas.content;
      root.appendChild(svgEl('rect', { x: content.x, y: content.y, width: content.width, height: content.height, fill: 'none', stroke: COLORS.margin, 'stroke-width': lw, 'stroke-dasharray': `${4 * k} ${3 * k}` }));
      if (g.area !== content) root.appendChild(svgEl('rect', { x: g.area.x, y: g.area.y, width: g.area.width, height: g.area.height, fill: 'none', stroke: COLORS.area, 'stroke-width': lw }));
      if (g.grid) {
        for (const col of g.grid.cols) {
          for (const row of g.grid.rows) root.appendChild(svgEl('rect', { x: col.start, y: row.start, width: col.end - col.start, height: row.end - row.start, fill: COLORS.grid, stroke: COLORS.area, 'stroke-width': lw * 0.6 }));
        }
      }
      // The spine of a spread page: its gutter band on the inner edge.
      if (c.spread && g.template.spread) {
        const gutterPx = mmToPx(dimensionToMm(g.template.gutter), dpi()) / 2;
        const band = spreadGutterBand({ width: flowW, height: flowH }, refs.docRef.current?.trimOffset ?? 0, side(c), gutterPx, 2 * k, spreadAxis());
        root.appendChild(svgEl('rect', { ...band, fill: COLORS.gutter }));
      }
    }
    const selected = selectedHere();
    const byName = new Map(c.frames.map((f) => [f.name, f]));
    // Every frame's outline and name are the Design mode overlay's (#864,
    // `frameOverlay.ts`); these marks add the chains, the handles and the drag.
    // Chains: an arrow from each frame to the one its content goes on in.
    const host = templateEditorHost();
    const template = host ? pageTemplate(host.getState().config, c) : undefined;
    for (const f of c.frames) {
      const resolved = template?.frames.find((rf) => rf.name === f.name);
      const toName = resolved ? nextFrameName(resolved) : undefined;
      const to = toName ? byName.get(toName) : undefined;
      if (!to) continue;
      const x1 = f.rect.x + f.rect.width - 12 * k;
      const y1 = f.rect.y + f.rect.height;
      const x2 = to.rect.x + 12 * k;
      const y2 = to.rect.y;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const a = 7 * k;
      root.appendChild(svgEl('line', { x1, y1, x2, y2, stroke: COLORS.chain, 'stroke-width': 1.5 * lw }));
      root.appendChild(svgEl('polygon', {
        points: `${x2},${y2} ${x2 - a * Math.cos(angle - 0.45)},${y2 - a * Math.sin(angle - 0.45)} ${x2 - a * Math.cos(angle + 0.45)},${y2 - a * Math.sin(angle + 0.45)}`,
        fill: COLORS.chain,
      }));
    }
    if (selected && !selected.rotate && !frameState.drag?.started && !frameState.pending) {
      const s = 6 * k;
      for (const h of RESIZE_HANDLES) {
        const p = handlePoint(selected.rect, h);
        root.appendChild(svgEl('rect', { x: p.x - s / 2, y: p.y - s / 2, width: s, height: s, fill: '#ffffff', stroke: COLORS.frame, 'stroke-width': lw }));
      }
    }
    paintConnector(root, k, lw);
    // The pointer grip of the selected frame, and the pointer being drawn
    // with the anchors it may end at (#1064).
    if (selected && !selected.rotate && !frameState.pending && !(frameState.drag?.started && frameState.drag.kind !== 'pointer')) {
      const grip = pointerGripOf(selected.rect, GRIP_GAP_CSS_PX * k);
      root.appendChild(svgEl('line', { x1: selected.rect.x + selected.rect.width, y1: grip.y, x2: grip.x, y2: grip.y, stroke: COLORS.pointer, 'stroke-width': lw }));
      root.appendChild(svgEl('circle', { cx: grip.x, cy: grip.y, r: GRIP_CSS_PX * k, fill: COLORS.pointer, stroke: '#ffffff', 'stroke-width': lw }));
    }
    if (frameState.drag?.kind === 'pointer' && frameState.drag.started && frameState.drag.sheet && frameState.drag.frame) {
      const from = gripOnSheet(frameState.drag.frame);
      for (const a of anchorsHere()) {
        if (a.frame === frameState.drag.frame.name) continue;
        const on = frameState.drag.target?.frame === a.frame && frameState.drag.target.anchorId === a.anchorId;
        svg.appendChild(svgEl('circle', { cx: a.point.x, cy: a.point.y, r: (on ? 7 : 4.5) * k, fill: on ? COLORS.pointer : 'rgba(255,255,255,0.85)', stroke: COLORS.pointer, 'stroke-width': 1.5 * lw }));
      }
      const end = frameState.drag.target?.point ?? frameState.drag.sheet;
      svg.appendChild(svgEl('line', { x1: from.x, y1: from.y, x2: end.x, y2: end.y, stroke: COLORS.pointer, 'stroke-width': 1.5 * lw, 'stroke-dasharray': frameState.drag.target ? '' : `${4 * k} ${3 * k}` }));
      if (frameState.drag.target) {
        const tag = svgEl('text', { x: end.x + 9 * k, y: end.y - 7 * k, 'font-size': 11 * k, fill: COLORS.pointer, 'font-family': 'system-ui, sans-serif', 'paint-order': 'stroke', stroke: '#ffffff', 'stroke-width': 3 * k });
        tag.textContent = `${frameState.drag.target.frame} · ${frameState.drag.target.anchorId}`;
        svg.appendChild(tag);
      }
    }
    const ghost = frameState.drag?.started && frameState.drag.kind !== 'pointer' ? frameState.drag.rect : frameState.pending;
    if (ghost) {
      root.appendChild(svgEl('rect', { x: ghost.x, y: ghost.y, width: ghost.width, height: ghost.height, fill: COLORS.ghost, stroke: COLORS.frame, 'stroke-width': 1.5 * lw }));
      if (frameState.drag?.guideX !== undefined) root.appendChild(svgEl('line', { x1: frameState.drag.guideX, y1: 0, x2: frameState.drag.guideX, y2: flowH, stroke: COLORS.guide, 'stroke-width': lw }));
      if (frameState.drag?.guideY !== undefined) root.appendChild(svgEl('line', { x1: 0, y1: frameState.drag.guideY, x2: flowW, y2: frameState.drag.guideY, stroke: COLORS.guide, 'stroke-width': lw }));
    }
  };

  const selectFrame = (f: VDTFrame): void => {
    const c = composed();
    const host = templateEditorHost();
    if (!c || !host) return;
    const { templateId, scope } = frameScopeOnPage(host.getState().config.pageTemplates ?? [], c, f);
    templateEditor.select({ templateId, scope, frame: f.name, group: null, pageIndex });
    // The Design mode's pick (#864): its overlay draws the frame stronger.
    pickFrame({ pageIndex, frameId: f.id, name: f.name, template: c.template, configPath: f.configPath });
    emitFrameEditorEvent({ type: 'select', pageIndex, templateId, frame: f.name, frameId: f.id });
    // The frame's properties, in the Design panel.
    if (host.getState().activePanel !== 'config') refs.dispatchRef.current({ type: 'SET_PANEL', payload: 'config' });
    showPageTemplatesSection(f.name);
  };

  /** The book's chapter holding this page's fence, and the fence's start
   *  in it. */
  const fenceOfPage = (c: VDTComposedPage): { chapterId: string; markdown: string; fenceStart: number } | null => {
    const host = templateEditorHost();
    const book = refs.pageSourceRef?.current ? refs.pageSourceRef.current(pageIndex) : refs.sourceRef.current;
    if (!host || !book || book.segments.length === 0) return null;
    const seg = segmentAtOffset(book, c.sourceStart);
    const chapter = host.getState().chapters.find((ch) => ch.id === seg.chapterId);
    if (!chapter) return null;
    const local = c.sourceStart - seg.start;
    const fences = templateFences(chapter.markdown);
    const fence = fences.find((f) => f.fenceStart === local) ?? fences[c.fenceIndex];
    return fence ? { chapterId: chapter.id, markdown: chapter.markdown, fenceStart: fence.fenceStart } : null;
  };

  const writeTemplates = (templates: PostextConfig['pageTemplates']): void => {
    // A drop is one step of the history (#899), never joined to the next.
    refs.dispatchRef.current({ type: 'UPDATE_CONFIG', payload: { pageTemplates: templates && templates.length > 0 ? templates : undefined }, history: { merge: false } });
  };
  return {
    paint, selectFrame, fenceOfPage, writeTemplates
  };
}
