// Where a page's frame editor works: the page and its template, sheet and
// flow coordinates, the selected frame's geometry, connectors and anchors
// (#1276: split out of frameEditor.ts).
import { type VDTPage, type VDTComposedPage, type VDTFrame, flowToPage } from 'postext';
import { templateEditor, templateEditorHost } from '../../../templates/editorStore.js';
import { sheetToFlow } from '../frameHit.js';
import { spreadFlowSide, spreadPageAreas, pageAreas, templateAreaRect, gridGeometry, mmToPx, dimensionToMm } from '../../../templates/frameGeometry.js';
import { pageTemplate, svgEl, COLORS, pointerGripOf, GRIP_GAP_CSS_PX, type FrameEditorRefs } from './shared.js';
import { ancestorsOf } from '../../../templates/templateEdits.js';
import { decorationElement } from '../../../templates/connectorEdits.js';
import { connectorHandles } from '../../../templates/connectorHandles.js';
import { type FrameAnchorPoint, frameAnchorsOnPage } from '../labelAnchorGeometry.js';

/** What createFrameLocate takes from the frame editor. */
export interface FrameLocateDeps {
  slot: HTMLElement;
  pageIndex: number;
  pageWidthPx: number;
  pageHeightPx: number;
  refs: FrameEditorRefs;
}

export function createFrameLocate(deps: FrameLocateDeps) {
  const {
    slot, pageIndex, pageWidthPx, pageHeightPx, refs
  } = deps;
  const page = (): VDTPage | undefined => refs.docRef.current?.pages[pageIndex];
  const composed = (): VDTComposedPage | undefined => page()?.composed;
  const active = (): boolean => templateEditor.getSnapshot().designMode && !!composed();
  const sheetPerCss = (): number => {
    const w = slot.getBoundingClientRect().width;
    return w > 0 ? pageWidthPx / w : 1;
  };
  // The template is laid in the page's flow frame, mirrored on a
  // right-to-left page and turned on a vertical one (#929): the pointer
  // is read there, and the marks are drawn through the flow's matrix.
  const locate = (ev: MouseEvent): { x: number; y: number } | null => {
    const r = slot.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return sheetToFlow(page(), (ev.clientX - r.left) * (pageWidthPx / r.width), (ev.clientY - r.top) * (pageHeightPx / r.height));
  };
  /** The flow frame's size: a vertical page's is the sheet turned. */
  const flowSize = (): { width: number; height: number } =>
    page()?.flow?.writingMode === 'vertical-rl' ? { width: pageHeightPx, height: pageWidthPx } : { width: pageWidthPx, height: pageHeightPx };
  const flowMatrix = (): string | null => {
    const flow = page()?.flow;
    if (!flow) return null;
    const m = flow.writingMode === 'vertical-rl'
      ? [0, 1, -1, 0, flow.rotation.originX, flow.rotation.originY]
      : [-1, 0, 0, 1, flow.mirror.originX, 0];
    return `matrix(${m.join(' ')})`;
  };
  /** The axis a spread's pages follow each other along in the flow frame. */
  const spreadAxis = (): 'x' | 'y' => (page()?.flow?.writingMode === 'vertical-rl' ? 'y' : 'x');
  /** Which half of its sheet a spread page is in the flow frame (#961): on
   *  a mirrored or turned flow the first page is the right one. */
  const side = (c: VDTComposedPage): 0 | 1 => spreadFlowSide(c.spread === 'right' ? 'right' : 'left', !!page()?.flow);
  const dpi = (): number => refs.docRef.current?.config.page.dpi ?? 96;

  const selectedHere = (): VDTFrame | undefined => {
    const sel = templateEditor.getSnapshot().selection;
    const c = composed();
    if (!sel?.frame || !c) return undefined;
    if (sel.pageIndex !== null && sel.pageIndex !== pageIndex && sel.templateId !== c.template) return undefined;
    if (sel.pageIndex === null && sel.templateId !== c.template) return undefined;
    return c.frames.find((f) => f.name === sel.frame);
  };

  /** The page's areas and the template's geometry, for snapping and the
   *  write-back. */
  const geometry = () => {
    const p = page();
    const c = composed();
    const host = templateEditorHost();
    const doc = refs.docRef.current;
    if (!p || !c || !host || !doc) return null;
    const config = host.getState().config;
    const template = pageTemplate(config, c);
    if (!template) return null;
    // A page of a spread (#861): the template's area is the sheet of two
    // pages, which this page shows one half of.
    const facing = c.spread && c.facingPage !== undefined ? doc.pages[c.facingPage] : undefined;
    const sized = { ...flowSize(), contentArea: p.contentArea };
    const areas = facing ? spreadPageAreas(sized, facing, doc.trimOffset, side(c), spreadAxis()) : pageAreas(sized, doc.trimOffset);
    const area = templateAreaRect(template.area, areas);
    const grid = template.grid ? gridGeometry(template.grid, area, dpi()) : undefined;
    return { p, c, host, config, template, areas, area, grid };
  };

  /** The connector the Design panel edits, when it belongs to this page's
   *  template (or one it extends), with its element as the scope holds it. */
  const focusedConnector = () => {
    const focus = templateEditor.getSnapshot().connector;
    const c = composed();
    const host = templateEditorHost();
    if (!focus || !c || !host) return null;
    const templates = host.getState().config.pageTemplates ?? [];
    if (c.template !== focus.templateId && !ancestorsOf(templates, c.template).includes(focus.templateId)) return null;
    const el = decorationElement(templates, focus.templateId, focus.scope, focus.elementId);
    return el?.kind === 'connector' ? { focus, el, templates } : null;
  };

  /** The focused connector's ends as handles (#1063): a dot at its start,
   *  a ring at each end it goes to, and while it is picked the frames it
   *  joins outlined. */
  const paintConnector = (root: SVGGElement, k: number, lw: number): void => {
    const found = focusedConnector();
    const c = composed();
    if (!found || !c) return;
    const g = geometry();
    const frames = new Map(c.frames.map((f) => [f.name, f.rect]));
    // An end at a picture's anchor (#1064) is drawn at the anchor's point,
    // read on the sheet and taken into the flow frame the marks are drawn in.
    const anchors = anchorsHere();
    const anchorPoint = (frame: string, anchor: string) => {
      const a = anchors.find((p) => p.frame === frame && p.anchorId === anchor);
      return a ? sheetToFlow(page(), a.point.x, a.point.y) : undefined;
    };
    const handles = connectorHandles(found.el, { frames, anchorPoint, ...(g ? { groups: g.template.groups } : {}) }, (end) => (end.gap ? mmToPx(dimensionToMm(end.gap), dpi()) : 0));
    if (found.focus.phase) {
      for (const h of handles) {
        const r = frames.get(h.name);
        if (r) root.appendChild(svgEl('rect', { x: r.x, y: r.y, width: r.width, height: r.height, fill: 'none', stroke: COLORS.connector, 'stroke-width': 2 * lw, 'stroke-dasharray': h.end === 'from' ? 'none' : `${4 * k} ${3 * k}` }));
      }
    }
    const radius = 5 * k;
    for (const h of handles) {
      const dot = svgEl('circle', { cx: h.x, cy: h.y, r: radius, fill: h.end === 'from' ? COLORS.connector : '#ffffff', stroke: COLORS.connector, 'stroke-width': 1.5 * lw });
      dot.dataset.connectorEnd = String(h.end);
      root.appendChild(dot);
    }
  };

  /** The anchors of the pictures in this page's frames, on the sheet. */
  const anchorsHere = (): FrameAnchorPoint[] => {
    const doc = refs.docRef.current;
    if (!doc) return [];
    const resources = templateEditorHost()?.getState().resources ?? [];
    return frameAnchorsOnPage(doc, pageIndex, (id) => resources.find((r) => r.id === id)?.anchors);
  };
  /** A frame's pointer grip on the sheet. */
  const gripOnSheet = (f: VDTFrame): { x: number; y: number } => {
    const grip = pointerGripOf(f.rect, GRIP_GAP_CSS_PX * sheetPerCss());
    const p = page();
    return p?.flow ? flowToPage(p, grip.x, grip.y) : grip;
  };
  const sheetAt = (ev: MouseEvent): { x: number; y: number } | null => {
    const r = slot.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    return { x: (ev.clientX - r.left) * (pageWidthPx / r.width), y: (ev.clientY - r.top) * (pageHeightPx / r.height) };
  };
  return {
    page, composed, active, sheetPerCss, locate, flowSize, flowMatrix, spreadAxis, side, dpi,
    selectedHere, geometry, focusedConnector, paintConnector, anchorsHere, gripOnSheet, sheetAt
  };
}
