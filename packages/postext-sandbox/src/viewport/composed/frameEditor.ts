/**
 * The page-template editor on the canvas (#863). In Design mode a
 * composed page shows its template: the margins, the template's area and
 * grid, the gutter of a spread, every frame's outline with its name, and
 * an arrow for each chain (`next`). On such a page the pointer is the
 * editor's:
 *
 * - a press on a frame selects it (the Design panel opens it); dragging
 *   moves it, dragging one of the selected frame's eight handles resizes
 *   it;
 * - a drag on the page off every frame draws a new frame;
 * - the box snaps to the margins, the template grid and the other frames
 *   (Alt held: no snapping); Escape cancels;
 * - the round grip beside the selected frame's side draws a pointer
 *   (#1064): dragged onto an anchor of the picture another frame holds, it
 *   writes a connector from the frame to that anchor into the template's
 *   decoration (`setPointer`), or keeps the one already there. The frame's
 *   properties list the pointers for the keyboard.
 *
 * On release the box is written back into the template in millimetres
 * (`frameBoxPatch`). When other pages use the template too, a question on
 * the page asks whether to change the template (every page) or to make a
 * variant for this page alone (a template that extends it, which the
 * page's fence then names). A rotated frame moves but does not resize on
 * the page; the properties panel sizes it.
 *
 * Every other page, and every page outside Design mode, keeps the text
 * interaction: the listeners run in the capture phase and only take the
 * events they handle.
 */

import { type VDTPage, type VDTComposedPage, type VDTFrame, flowToPage, type PostextConfig } from 'postext';
import { segmentAtOffset } from '../../book/compose.js';
import { applyViewerEdit } from '../../editor/viewerEdits.js';
import { type Rect, spreadFlowSide, spreadPageAreas, pageAreas, templateAreaRect, gridGeometry, mmToPx, dimensionToMm, spreadGutterBand, RESIZE_HANDLES, handlePoint, frameFromRect, frameBoxPatch, type Handle, handleAt, rectBetween, dragRect, snapLines, snapRect } from '../../templates/frameGeometry.js';
import { templateEditor, templateEditorHost } from '../../templates/editorStore.js';
import { showPageTemplatesSection } from '../../templates/showSection.js';
import { emitFrameEditorEvent } from '../../templates/frameEvents.js';
import { ancestorsOf, uniqueName, namesInUse, addFrame } from '../../templates/templateEdits.js';
import { decorationElement, pickConnectorFrame, updateDecorationElement } from '../../templates/connectorEdits.js';
import { connectorHandles } from '../../templates/connectorHandles.js';
import { frameScopeOnPage, changeTemplateFrame, templateDisplayName, changeFrameForPage } from '../../templates/pageEdits.js';
import { templateFences, countTemplatePages, fenceTemplateChange } from '../../templates/templateUsage.js';
import { nextFrameName } from '../../templates/frameChain.js';
import { sheetToFlow, flowBoxOnSheet, frameHitAt } from './frameHit.js';
import { setPointer } from '../../templates/pointerEdits.js';
import { type FrameAnchorPoint, frameAnchorsOnPage, frameAnchorAt } from './labelAnchorGeometry.js';
import { selectFrame as pickFrame } from '../../editing/editMode.js';
import { type Instance, type FrameEditorRefs, svgEl, type Drag, pageTemplate, COLORS, pointerGripOf, GRIP_GAP_CSS_PX, GRIP_CSS_PX, MIN_DRAW_CSS_PX, dragKind, HANDLE_CSS_PX, DRAG_START_CSS_PX, ANCHOR_DROP_CSS_PX, SNAP_CSS_PX } from './frameEditor/shared.js';

export { pointerGripOf } from './frameEditor/shared.js';
export type { FrameEditorRefs } from './frameEditor/shared.js';

const live = new Set<Instance>();
let subscribed = false;

/** Bring every page's template marks up to date (after a relayout, or a
 *  change of the editor's state). */
export function syncFrameEditors(): void {
  for (const e of [...live]) {
    if (!e.slot.isConnected) live.delete(e);
    else e.paint();
  }
}

export function attachFrameEditor(slot: HTMLElement, pageIndex: number, pageWidthPx: number, pageHeightPx: number, refs: FrameEditorRefs): void {
  const svg = svgEl('svg', { viewBox: `0 0 ${pageWidthPx} ${pageHeightPx}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
  svg.dataset.role = 'templateMarks';
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '6', overflow: 'visible' } satisfies Partial<CSSStyleDeclaration>);
  let question: HTMLElement | null = null;
  let drag: Drag | null = null;
  /** The drop waiting for the template-or-variant answer. */
  let pending: Rect | null = null;
  let handledPress = false;

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

  const paint = (): void => {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!active()) {
      if (svg.parentNode) svg.remove();
      closeQuestion();
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
    if (selected && !selected.rotate && !drag?.started && !pending) {
      const s = 6 * k;
      for (const h of RESIZE_HANDLES) {
        const p = handlePoint(selected.rect, h);
        root.appendChild(svgEl('rect', { x: p.x - s / 2, y: p.y - s / 2, width: s, height: s, fill: '#ffffff', stroke: COLORS.frame, 'stroke-width': lw }));
      }
    }
    paintConnector(root, k, lw);
    // The pointer grip of the selected frame, and the pointer being drawn
    // with the anchors it may end at (#1064).
    if (selected && !selected.rotate && !pending && !(drag?.started && drag.kind !== 'pointer')) {
      const grip = pointerGripOf(selected.rect, GRIP_GAP_CSS_PX * k);
      root.appendChild(svgEl('line', { x1: selected.rect.x + selected.rect.width, y1: grip.y, x2: grip.x, y2: grip.y, stroke: COLORS.pointer, 'stroke-width': lw }));
      root.appendChild(svgEl('circle', { cx: grip.x, cy: grip.y, r: GRIP_CSS_PX * k, fill: COLORS.pointer, stroke: '#ffffff', 'stroke-width': lw }));
    }
    if (drag?.kind === 'pointer' && drag.started && drag.sheet && drag.frame) {
      const from = gripOnSheet(drag.frame);
      for (const a of anchorsHere()) {
        if (a.frame === drag.frame.name) continue;
        const on = drag.target?.frame === a.frame && drag.target.anchorId === a.anchorId;
        svg.appendChild(svgEl('circle', { cx: a.point.x, cy: a.point.y, r: (on ? 7 : 4.5) * k, fill: on ? COLORS.pointer : 'rgba(255,255,255,0.85)', stroke: COLORS.pointer, 'stroke-width': 1.5 * lw }));
      }
      const end = drag.target?.point ?? drag.sheet;
      svg.appendChild(svgEl('line', { x1: from.x, y1: from.y, x2: end.x, y2: end.y, stroke: COLORS.pointer, 'stroke-width': 1.5 * lw, 'stroke-dasharray': drag.target ? '' : `${4 * k} ${3 * k}` }));
      if (drag.target) {
        const tag = svgEl('text', { x: end.x + 9 * k, y: end.y - 7 * k, 'font-size': 11 * k, fill: COLORS.pointer, 'font-family': 'system-ui, sans-serif', 'paint-order': 'stroke', stroke: '#ffffff', 'stroke-width': 3 * k });
        tag.textContent = `${drag.target.frame} · ${drag.target.anchorId}`;
        svg.appendChild(tag);
      }
    }
    const ghost = drag?.started && drag.kind !== 'pointer' ? drag.rect : pending;
    if (ghost) {
      root.appendChild(svgEl('rect', { x: ghost.x, y: ghost.y, width: ghost.width, height: ghost.height, fill: COLORS.ghost, stroke: COLORS.frame, 'stroke-width': 1.5 * lw }));
      if (drag?.guideX !== undefined) root.appendChild(svgEl('line', { x1: drag.guideX, y1: 0, x2: drag.guideX, y2: flowH, stroke: COLORS.guide, 'stroke-width': lw }));
      if (drag?.guideY !== undefined) root.appendChild(svgEl('line', { x1: 0, y1: drag.guideY, x2: flowW, y2: drag.guideY, stroke: COLORS.guide, 'stroke-width': lw }));
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

  const closeQuestion = (): void => {
    question?.remove();
    question = null;
    if (pending) {
      pending = null;
      paint();
    }
  };

  /** Ask where a frame dropped at `to` is written, when other pages use
   *  the template. */
  const ask = (frame: VDTFrame, to: Rect, pages: number, apply: (where: 'template' | 'page') => void): void => {
    const labels = refs.labelsRef?.current;
    if (!labels) {
      apply('template');
      return;
    }
    pending = to;
    paint();
    question?.remove();
    const box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', labels.pageTemplatesMoveQuestion.replace('__frame__', frame.name));
    Object.assign(box.style, {
      position: 'absolute', zIndex: '7', maxWidth: '18rem', padding: '0.5rem', borderRadius: '0.5rem',
      background: 'var(--background, #fff)', color: 'var(--foreground, #111)', border: '1px solid var(--rule, #ccc)',
      boxShadow: '0 4px 16px rgba(0,0,0,0.18)', font: '12px/1.35 system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: '0.35rem',
    } satisfies Partial<CSSStyleDeclaration>);
    const shown = flowBoxOnSheet(page(), to).rect;
    const left = Math.min(Math.max(0, shown.x / pageWidthPx), 0.6) * 100;
    const top = Math.min(Math.max(0, (shown.y + shown.height) / pageHeightPx), 0.8) * 100;
    box.style.left = `${left}%`;
    box.style.top = `${top}%`;
    const text = document.createElement('p');
    text.style.margin = '0';
    text.textContent = labels.pageTemplatesMoveQuestion.replace('__frame__', frame.name);
    box.appendChild(text);
    const button = (label: string, onClick: () => void, primary = false): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      Object.assign(b.style, {
        minHeight: '2rem', padding: '0.25rem 0.6rem', borderRadius: '0.375rem', cursor: 'pointer', textAlign: 'start',
        border: `1px solid ${primary ? 'var(--brand, #2f6fd6)' : 'var(--pt-control-border, #bbb)'}`,
        background: 'var(--surface, #f6f6f6)', color: primary ? 'var(--brand, #2f6fd6)' : 'inherit', font: 'inherit',
      } satisfies Partial<CSSStyleDeclaration>);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      box.appendChild(b);
      return b;
    };
    const first = button(labels.pageTemplatesMoveChangeTemplate.replace('__count__', String(pages)), () => {
      closeQuestion();
      apply('template');
    }, true);
    button(labels.pageTemplatesMoveThisPage, () => {
      closeQuestion();
      apply('page');
    });
    button(labels.pageTemplatesMoveCancel, () => closeQuestion());
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeQuestion();
      }
    });
    box.addEventListener('pointerdown', (e) => e.stopPropagation(), true);
    slot.appendChild(box);
    question = box;
    first.focus({ preventScroll: true });
  };

  const commit = (d: Drag): void => {
    const g = geometry();
    if (!g) return;
    const templates = g.config.pageTemplates ?? [];
    if (d.kind === 'pointer') {
      // A pointer dropped on an anchor of another frame's picture: written
      // into the page's template (every page it lays draws it).
      const target = d.target;
      if (!target || !d.frame) return;
      const out = setPointer(templates, g.c.template, { from: d.frame.name, toFrame: target.frame, anchor: target.anchorId });
      if (out) writeTemplates(out.templates);
      return;
    }
    if (d.kind === 'draw') {
      const min = MIN_DRAW_CSS_PX * sheetPerCss();
      if (d.rect.width < min || d.rect.height < min) return;
      const name = uniqueName(namesInUse(templates, g.c.template), 'frame');
      emitFrameEditorEvent({ type: 'drop', pageIndex, kind: 'draw', handle: d.handle, frame: name, rect: { ...d.rect } });
      writeTemplates(addFrame(templates, g.c.template, 'base', frameFromRect(name, d.rect, g.area, dpi())));
      templateEditor.select({ templateId: g.c.template, scope: 'base', frame: name, group: null, pageIndex });
      const at = templates.findIndex((t) => t.id === g.c.template);
      const count = (templates[at]?.frames ?? []).filter((fr) => fr.name !== name).length;
      pickFrame({ pageIndex, frameId: `cp${g.c.fenceIndex}:${name}`, name, template: g.c.template, configPath: `/pageTemplates/${at}/frames/${count}` });
      showPageTemplatesSection(name);
      return;
    }
    const f = d.frame!;
    const resolved = g.template.frames.find((rf) => rf.name === f.name);
    if (!resolved) return;
    const patch = frameBoxPatch({ resolved, from: f.rect, to: d.rect, area: g.area, dpi: dpi(), ...(g.grid ? { grid: g.grid } : {}) });
    emitFrameEditorEvent({ type: 'drop', pageIndex, kind: dragKind(d), handle: d.handle, frame: f.name, rect: { ...d.rect }, patch });
    if (Object.keys(patch).length === 0) return;
    const state = g.host.getState();
    const spreadIds = new Set(templates.filter((t) => t.spread).map((t) => t.id));
    const pages = countTemplatePages(state.chapters, spreadIds).get(g.c.template) ?? 1;
    const apply = (where: 'template' | 'page'): void => {
      const now = templateEditorHost()?.getState().config.pageTemplates ?? templates;
      if (where === 'template') {
        writeTemplates(changeTemplateFrame(now, g.c, f, patch));
        return;
      }
      const fence = fenceOfPage(g.c);
      const labels = refs.labelsRef?.current;
      const label = labels ? labels.pageTemplatesVariantName.replace('__template__', templateDisplayName(now, g.c.template)).replace('__page__', String(pageIndex + 1 + (refs.docRef.current?.pageIndexOffset ?? 0))) : `${g.c.template} ${pageIndex + 1}`;
      const out = changeFrameForPage(now, g.c, f, patch, label);
      writeTemplates(out.templates);
      if (fence) {
        const change = fenceTemplateChange(fence.markdown, fence.fenceStart, out.id);
        if (change) applyViewerEdit(refs.dispatchRef.current, fence.chapterId, [change], fence.markdown.length);
      }
      templateEditor.select({ templateId: out.id, scope: 'base', frame: f.name, group: null, pageIndex });
    };
    if (pages > 1) ask(f, d.rect, pages, apply);
    else apply('template');
  };

  const cursorFor = (handle: Handle | null, onFrame: boolean): string => {
    if (!handle) return onFrame ? 'move' : 'crosshair';
    // A mirrored or turned flow shows a handle's diagonal the other way
    // round on the sheet, and a turned one its sides across.
    const flow = page()?.flow;
    const across = flow?.writingMode === 'vertical-rl';
    const diagonal = (nesw: boolean): string => ((nesw !== !!flow) ? 'nesw-resize' : 'nwse-resize');
    switch (handle) {
      case 'move': return 'move';
      case 'n':
      case 's':
        return across ? 'ew-resize' : 'ns-resize';
      case 'e':
      case 'w':
        return across ? 'ns-resize' : 'ew-resize';
      case 'ne':
      case 'sw':
        return diagonal(true);
      default:
        return diagonal(false);
    }
  };

  slot.addEventListener('pointerdown', (ev) => {
    handledPress = false;
    if (!active() || ev.button !== 0 || ev.pointerType === 'touch') return;
    if ((ev.target as Element | null)?.closest?.('[role="dialog"]')) return;
    const at = locate(ev);
    if (!at) return;
    closeQuestion();
    const picking = focusedConnector();
    if (picking?.focus.phase) {
      // Picking a connector's ends (#1063): a frame is an end, not a drag.
      ev.preventDefault();
      ev.stopImmediatePropagation();
      handledPress = true;
      const hit = frameHitAt(page(), at.x, at.y);
      if (hit) {
        const out = pickConnectorFrame(picking.el, picking.focus.phase, hit.name, ev.shiftKey);
        if (out.element !== picking.el) writeTemplates(updateDecorationElement(picking.templates, picking.focus.templateId, picking.focus.scope, picking.focus.elementId, () => out.element));
        templateEditor.focusConnector({ ...picking.focus, phase: out.phase });
        emitFrameEditorEvent({ type: 'select', pageIndex, templateId: picking.focus.templateId, frame: hit.name, frameId: hit.id });
      }
      paint();
      return;
    }
    const tol = HANDLE_CSS_PX * sheetPerCss();
    const selected = selectedHere();
    if (selected && !selected.rotate) {
      const grip = pointerGripOf(selected.rect, GRIP_GAP_CSS_PX * sheetPerCss());
      if (Math.hypot(at.x - grip.x, at.y - grip.y) <= Math.max(tol, GRIP_CSS_PX * sheetPerCss() * 1.5)) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        handledPress = true;
        try { slot.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
        window.addEventListener('keydown', onEscape, true);
        drag = { pointerId: ev.pointerId, kind: 'pointer', handle: 'move', frame: selected, startX: at.x, startY: at.y, startClientX: ev.clientX, startClientY: ev.clientY, started: false, rect: { ...selected.rect }, sheet: sheetAt(ev) ?? undefined, target: null };
        paint();
        return;
      }
    }
    const onSelected = selected && !selected.rotate ? handleAt(selected.rect, at.x, at.y, tol) : null;
    const hit = onSelected ? selected! : frameHitAt(page(), at.x, at.y);
    ev.preventDefault();
    ev.stopImmediatePropagation();
    handledPress = true;
    try { slot.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
    window.addEventListener('keydown', onEscape, true);
    if (hit) {
      selectFrame(hit);
      drag = { pointerId: ev.pointerId, kind: 'frame', handle: onSelected ?? 'move', frame: hit, startX: at.x, startY: at.y, startClientX: ev.clientX, startClientY: ev.clientY, started: false, rect: { ...hit.rect } };
    } else {
      drag = { pointerId: ev.pointerId, kind: 'draw', handle: 'se', startX: at.x, startY: at.y, startClientX: ev.clientX, startClientY: ev.clientY, started: false, rect: { x: at.x, y: at.y, width: 0, height: 0 } };
    }
    paint();
  }, true);

  slot.addEventListener('pointermove', (ev) => {
    if (drag && ev.pointerId === drag.pointerId) {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      const at = locate(ev);
      if (!at) return;
      if (!drag.started) {
        const dx = ev.clientX - drag.startClientX;
        const dy = ev.clientY - drag.startClientY;
        if (dx * dx + dy * dy < DRAG_START_CSS_PX * DRAG_START_CSS_PX) return;
        drag.started = true;
        if (drag.kind !== 'pointer') emitFrameEditorEvent({ type: 'dragStart', pageIndex, kind: dragKind(drag), handle: drag.handle, ...(drag.frame ? { frame: drag.frame.name } : {}), rect: { ...drag.rect } });
      }
      if (drag.kind === 'pointer') {
        const sheet = sheetAt(ev);
        if (!sheet) return;
        drag.sheet = sheet;
        drag.target = frameAnchorAt(anchorsHere(), sheet.x, sheet.y, ANCHOR_DROP_CSS_PX * sheetPerCss(), drag.frame?.name);
        paint();
        return;
      }
      const g = geometry();
      const raw = drag.kind === 'draw'
        ? rectBetween({ x: drag.startX, y: drag.startY }, at)
        : dragRect(drag.frame!.rect, drag.handle, at.x - drag.startX, at.y - drag.startY, 4 * sheetPerCss());
      if (g && !ev.altKey) {
        const others = g.c.frames.filter((f) => f.name !== drag!.frame?.name).map((f) => f.rect);
        const lines = snapLines(g.areas, g.area, g.grid, others);
        const handle: Handle = drag.kind === 'draw' ? (at.x >= drag.startX ? (at.y >= drag.startY ? 'se' : 'ne') : (at.y >= drag.startY ? 'sw' : 'nw')) : drag.handle;
        const snapped = snapRect(raw, handle, lines, SNAP_CSS_PX * sheetPerCss());
        drag.rect = snapped.rect;
        drag.guideX = snapped.guideX;
        drag.guideY = snapped.guideY;
      } else {
        drag.rect = raw;
        drag.guideX = undefined;
        drag.guideY = undefined;
      }
      emitFrameEditorEvent({ type: 'drag', pageIndex, kind: dragKind(drag), handle: drag.handle, ...(drag.frame ? { frame: drag.frame.name } : {}), rect: { ...drag.rect } });
      paint();
      return;
    }
    if (!active()) return;
    const at = locate(ev);
    if (!at) return;
    ev.stopImmediatePropagation();
    if (focusedConnector()?.focus.phase) {
      slot.style.cursor = frameHitAt(page(), at.x, at.y) ? 'pointer' : 'default';
      return;
    }
    const selected = selectedHere();
    const handle = selected && !selected.rotate ? handleAt(selected.rect, at.x, at.y, HANDLE_CSS_PX * sheetPerCss()) : null;
    const grip = selected && !selected.rotate ? pointerGripOf(selected.rect, GRIP_GAP_CSS_PX * sheetPerCss()) : null;
    if (grip && Math.hypot(at.x - grip.x, at.y - grip.y) <= GRIP_CSS_PX * sheetPerCss() * 1.5) {
      slot.style.cursor = 'crosshair';
      return;
    }
    slot.style.cursor = cursorFor(handle, !!frameHitAt(page(), at.x, at.y));
  }, true);

  /** Escape while dragging: the drag is dropped, nothing is written. */
  const onEscape = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' || !drag) return;
    ev.stopPropagation();
    ev.preventDefault();
    const pointerId = drag.pointerId;
    if (drag.kind !== 'pointer') emitFrameEditorEvent({ type: 'cancel', pageIndex, ...(drag.frame ? { frame: drag.frame.name } : {}) });
    drag = null;
    window.removeEventListener('keydown', onEscape, true);
    try { slot.releasePointerCapture(pointerId); } catch { /* not captured */ }
    paint();
  };

  const end = (ev: PointerEvent): void => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    ev.stopImmediatePropagation();
    const d = drag;
    drag = null;
    window.removeEventListener('keydown', onEscape, true);
    try { slot.releasePointerCapture(ev.pointerId); } catch { /* not captured */ }
    if (ev.type === 'pointerup' && d.started) commit(d);
    else if (d.started && d.kind !== 'pointer') emitFrameEditorEvent({ type: 'cancel', pageIndex, ...(d.frame ? { frame: d.frame.name } : {}) });
    paint();
  };
  slot.addEventListener('pointerup', end, true);
  slot.addEventListener('pointercancel', end, true);
  // A press the editor took is not a click on the text.
  for (const type of ['click', 'mousedown', 'mouseup'] as const) {
    slot.addEventListener(type, (ev) => {
      if (!handledPress && !(drag && type === 'mousedown')) return;
      if (type === 'click') handledPress = false;
      ev.stopImmediatePropagation();
      ev.preventDefault();
    }, true);
  }

  const instance: Instance = { slot, paint };
  live.add(instance);
  if (!subscribed) {
    subscribed = true;
    templateEditor.subscribe(syncFrameEditors);
    // Escape ends the picking of a connector's ends (#1063).
    window.addEventListener('keydown', (ev) => {
      const focus = templateEditor.getSnapshot().connector;
      if (ev.key !== 'Escape' || !focus?.phase) return;
      templateEditor.focusConnector({ ...focus, phase: null });
    }, true);
  }
  paint();
}
