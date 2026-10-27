// The commit of a frame drag and the cursor over the frame editor's grips
// (#1276: split out of frameEditor.ts).
import { type Drag, MIN_DRAW_CSS_PX, dragKind, type FrameEditorRefs } from './shared.js';
import { setPointer } from '../../../templates/pointerEdits.js';
import { uniqueName, namesInUse, addFrame } from '../../../templates/templateEdits.js';
import { emitFrameEditorEvent } from '../../../templates/frameEvents.js';
import { frameFromRect, frameBoxPatch, type Handle, type PageAreas, type Rect, type GridGeometry } from '../../../templates/frameGeometry.js';
import { templateEditor, templateEditorHost, type TemplateEditorHost } from '../../../templates/editorStore.js';
import { selectFrame as pickFrame } from '../../../editing/editMode.js';
import { showPageTemplatesSection } from '../../../templates/showSection.js';
import { countTemplatePages, fenceTemplateChange } from '../../../templates/templateUsage.js';
import { changeTemplateFrame, templateDisplayName, changeFrameForPage } from '../../../templates/pageEdits.js';
import { applyViewerEdit } from '../../../editor/viewerEdits.js';
import type { VDTPage, VDTComposedPage, PostextConfig, VDTFrame, ResolvedPageTemplate } from 'postext';

/** What createFrameCommit takes from the frame editor. */
export interface FrameCommitDeps {
  pageIndex: number;
  refs: FrameEditorRefs;
  page: () => VDTPage | undefined;
  sheetPerCss: () => number;
  dpi: () => number;
  geometry: () => { p: VDTPage; c: VDTComposedPage; host: TemplateEditorHost; config: PostextConfig; template: ResolvedPageTemplate; areas: PageAreas; area: Rect; grid: GridGeometry | undefined; } | null;
  fenceOfPage: (c: VDTComposedPage) => { chapterId: string; markdown: string; fenceStart: number; } | null;
  writeTemplates: (templates: PostextConfig["pageTemplates"]) => void;
  ask: (frame: VDTFrame, to: Rect, pages: number, apply: (where: "template" | "page") => void) => void;
}

export function createFrameCommit(deps: FrameCommitDeps) {
  const {
    pageIndex, refs, page, sheetPerCss, dpi, geometry, fenceOfPage, writeTemplates, ask
  } = deps;
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
  return {
    commit, cursorFor
  };
}
