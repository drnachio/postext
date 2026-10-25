// How the book is shown: the viewer tab and its settings, the side panel,
// the guides drawn on the pages, and the page on screen.

import { applyHtmlViewerOverrides, resolveDebugConfig, resolveLayoutConfig } from 'postext';
import type { PostextConfig } from 'postext';
import { requestSettingsGroup, requestSettingsSwitches, settingsChangedOnly } from '../../context/settingsNavigation.js';
import { printPreviewOn, setPrintPreview } from '../../print/printPreviewToggle.js';
import { EDIT_MODES, editModeNow, selectedFrameNow, setEditMode, type EditMode } from '../../editing/editMode.js';
import { breadcrumb, breadcrumbText, selectedElement } from '../../selection/pageSelection.js';
import { pageSelectionNow } from '../../selection/selectionStore.js';
import type { SandboxLabels } from '../../types/labels.js';
import { SETTINGS_GROUPS, isSettingsGroupId } from '../../sidebar/sections/registry.js';
import { loadSettingsHelpMode, saveSettingsGroup, saveSettingsHelpMode } from '../../storage/persistence.js';
import { VIEWPORT_TABS, readViewHash, viewHashFragment } from '../../storage/viewHash.js';
import type { PanelId, ViewportTab } from '../../types/index.js';
import { folioSupported } from '../../viewport/folioSupport.js';
import { FIT_MARKS_MODES, fitMarksViewOf, setFitMarksChoice, type FitMarksMode } from '../../viewport/composed/fitMarksView.js';
import { viewerControls, type ViewerContentsEntry, type ViewerControls, type ViewerSettings } from '../../viewport/viewerControls.js';
import { SETTLE_TIMEOUT_MS, chapterOf, dispatchAndWait, layOutChapter, pageIndexOf, whenSettled, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { findAnchor } from '../pagePoint.js';
import { pagesOfOffset } from '../pageText.js';
import { MAX_STATUS_ENTRIES, compactStatus, whenViewerIdle } from '../viewerStatus.js';

const PANELS: readonly PanelId[] = ['projects', 'chapters', 'markdown', 'resources', 'fonts', 'config', 'warnings'];

/** The viewer settings each tab takes. */
const VIEWER_SETTINGS: Record<keyof ViewerSettings, readonly ViewportTab[]> = {
  zoom: ['canvas'],
  fit: ['canvas'],
  pages: ['canvas'],
  fontScale: ['html', 'epub'],
  columns: ['html'],
  interaction: ['folio'],
  toolbarPinned: ['canvas', 'pdf', 'folio', 'html', 'epub'],
  scormPick: ['scorm'],
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The controls of `tab` once it is on screen (a tab's code may load on
 *  first use). */
export async function controlsOf(tab: ViewportTab, timeoutMs = 8000): Promise<ViewerControls> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const controls = viewerControls(tab);
    if (controls) return controls;
    if (Date.now() >= deadline) throw new ToolError(`The ${tab} viewer did not come up in time; call again.`);
    await sleep(50);
  }
}

/** The guides the configuration draws on the pages, as switches. */
function guidesOf(config: PostextConfig): Record<string, unknown> {
  const debug = resolveDebugConfig(config.debug);
  return {
    baselineGrid: config.page?.baselineGrid?.enabled ?? false,
    characterGrid: config.cjk?.grid?.show ?? false,
    looseLines: debug.looseLineHighlight.enabled,
    looseLineThreshold: debug.looseLineHighlight.threshold,
    pageNegative: debug.pageNegative.enabled,
    cursorSync: debug.cursorSync.enabled,
    selectionSync: debug.selectionSync.enabled,
  };
}

/** The chapter (its position in the book, from 0) and the page number the
 *  reader is at: what the address carries — a viewer showing the whole
 *  book scrolls through chapters without changing the one being edited —
 *  or the chapter on screen. */
export function screenPosition(host: SandboxToolHost): { chapterIndex: number; page: number | null } {
  const s = host.store.getSnapshot();
  const hash = readViewHash();
  const active = s.chapters.findIndex((c) => c.id === s.activeChapterId);
  const chapterIndex = hash.chapter !== null && hash.chapter >= 0 && hash.chapter < s.chapters.length ? hash.chapter : active;
  return { chapterIndex, page: hash.page };
}

/** The element picked on a page (#865) and its path, when one is. */
function pageSelectionState(labels: SandboxLabels): Record<string, unknown> {
  const now = pageSelectionNow();
  if (!now) return {};
  const el = selectedElement(now.selection);
  return {
    pageSelection: {
      path: breadcrumbText(breadcrumb(now.doc, now.selection), labels),
      level: el.level,
      id: el.id,
      page: now.doc.pages[now.selection.pageIndex]?.pageLabel ?? null,
      origin: now.selection.origin,
    },
  };
}

/** How the book is shown right now. */
export function viewState(host: SandboxToolHost): Record<string, unknown> {
  const s = host.store.getSnapshot();
  const at = screenPosition(host);
  const status = viewerControls(s.activeViewport)?.status();
  return {
    viewer: s.activeViewport,
    mode: editModeNow(),
    ...(selectedFrameNow() ? { frame: selectedFrameNow() } : {}),
    ...pageSelectionState(s.labels),
    panel: s.activePanel ?? 'none',
    ...(s.activeResourceId ? { resource: s.activeResourceId } : {}),
    settingsHelp: loadSettingsHelpMode(),
    settingsChangedOnly: settingsChangedOnly(),
    sidebarWidth: s.sidebarPercent,
    scope: s.activeViewport === 'pdf' ? s.pdfScope : s.canvasScope,
    epubLayout: s.epubLayout,
    scormLayout: s.scormLayout,
    scormVersion: s.scormVersion,
    chapter: at.chapterIndex + 1,
    ...(at.page !== null ? { page: at.page } : {}),
    printPreview: printPreviewOn(),
    fitMarks: fitMarksViewOf(s.config.debug),
    largeTargets: host.largeTargets.get(),
    guides: guidesOf(s.config),
    ...(status ? { [s.activeViewport]: compactStatus(status) } : {}),
  };
}

/** The entry of an EPUB's table of contents an agent names: by its title
 *  (exactly, then whatever the case, then the one title that holds the
 *  words) or by its address in the file. */
export function contentsEntry(entries: readonly ViewerContentsEntry[], wanted: string): ViewerContentsEntry {
  const name = wanted.trim();
  const lower = name.toLowerCase();
  const exact = entries.find((e) => e.title === name || e.href === name) ?? entries.find((e) => e.title.trim().toLowerCase() === lower);
  if (exact) return exact;
  const holding = entries.filter((e) => e.title.toLowerCase().includes(lower));
  if (holding.length === 1) return holding[0]!;
  const listed = (holding.length > 1 ? holding : entries).slice(0, MAX_STATUS_ENTRIES).map((e) => JSON.stringify(e.title)).join(', ');
  if (holding.length > 1) throw new ToolError(`${holding.length} entries of the contents hold ${JSON.stringify(wanted)}: ${listed}. Give the whole title, or the entry's href.`);
  throw new ToolError(entries.length === 0
    ? 'This EPUB has no table of contents; go by position (a document of its reading order) or step.'
    : `No entry of the contents is titled ${JSON.stringify(wanted)}. The entries: ${listed}${entries.length > MAX_STATUS_ENTRIES ? `, and ${entries.length - MAX_STATUS_ENTRIES} more` : ''}.`);
}

export function viewTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const setView: WebMcpTool = {
    name: 'sandbox_set_view',
    title: 'Sandbox: change how the book is shown',
    description: 'Change what the reader sees of the Sandbox, any number of settings at once: the viewer tab (canvas, pdf, folio, html, epub, scorm), the Content or Design mode, the side panel and the resource open in it, the Design panel\'s group, explanations and changed-only filter, whether a viewer shows the chapter or the whole book, the EPUB rendition, the content, version and chapters and sections of the SCORM package, the Canvas magnification, fit and facing pages, the type size and columns of the HTML and EPUB readers, the Folio pointer mode, view and magnifying glass, the print preview, the fit marks drawn over composed pages, pinned toolbars, large touch targets, and the guides drawn on the pages (baseline grid, character grid, loose-line highlight, pages in negative). Answers with the view as it stands afterwards, the status of the viewer on screen included (its page, what it is writing, an EPUB\'s contents and warnings, the videos of its pages). sandbox_go_to_page turns the pages; sandbox_run_viewer presses a viewer\'s buttons (regenerate, print, download, play a video).',
    inputSchema: {
      type: 'object',
      properties: {
        viewer: { type: 'string', enum: VIEWPORT_TABS, description: 'The viewer tab to show.' },
        mode: { type: 'string', enum: EDIT_MODES, description: 'content: the text is edited (the editor, the frames of composed pages on the page); design: page templates and styles are edited and the text is read only. The person switches with Alt+Shift+M.' },
        panel: { type: 'string', enum: [...PANELS, 'none'], description: 'The side panel to open (projects = Books, markdown = Text, config = Design, warnings = Checks), or none to close it.' },
        sidebarWidth: { type: 'number', minimum: 5, maximum: 80, description: 'Width of the side panel, as a percentage of the window.' },
        settingsGroup: { type: 'string', enum: SETTINGS_GROUPS.map((g) => g.id), description: 'Open the Design panel on this group of settings.' },
        settingsHelp: { type: 'boolean', description: 'Design panel: show the explanation under each setting. Kept for the next time the panel opens.' },
        settingsChangedOnly: { type: 'boolean', description: 'Design panel: list only the settings the book changed. Turning it on opens the panel; the filter goes when the panel closes.' },
        resource: { type: ['string', 'null'], description: 'Open the Resources panel on the resource with this id; null closes the resource that is open and goes back to the list.' },
        scope: { type: 'string', enum: ['chapter', 'book'], description: 'What the viewer lays out: the chapter on screen or the whole book. Applies to the PDF when that is the viewer, to Canvas, Folio and HTML otherwise.' },
        epubLayout: { type: 'string', enum: ['reflowable', 'fixed'], description: 'The EPUB rendition: text that reflows, or the printed pages kept.' },
        scormLayout: { type: 'string', enum: ['fixed', 'reflowable'], description: 'The SCORM package\'s content: the printed pages, or text that reflows.' },
        scormVersion: { type: 'string', enum: ['1.2', '2004'], description: 'The SCORM data model of the package: 1.2 (every LMS) or 2004 4th edition.' },
        scormPick: { type: 'array', items: { type: 'string' }, description: 'SCORM: the ids of the tree nodes (chapters and headings, the status\'s contents[].href) the package takes, each one whole; every other node is left out. A chapter or section ticked whole is one SCO.' },
        zoom: { type: 'number', minimum: 0.25, maximum: 4, description: 'Canvas: magnification (1 = 100%). Turns the fit off unless fit is given too.' },
        fit: { type: 'string', enum: ['width', 'height', 'none'], description: 'Canvas: fit the page to the width or height of the viewer.' },
        pages: { type: 'string', enum: ['single', 'spread'], description: 'Canvas: one page per row, or facing pages.' },
        fontScale: { type: 'number', minimum: 0.6, maximum: 2.5, description: 'HTML and reflowable EPUB: the reader\'s type size (1 = as designed).' },
        columns: { type: 'string', enum: ['single', 'multi'], description: 'HTML: one scrolling column, or columns paged sideways.' },
        interaction: { type: 'string', enum: ['hand', 'orbit', 'select', 'magnify'], description: 'Folio: what the pointer does on the 3D book.' },
        folioView: { type: 'string', enum: ['reset', 'save'], description: 'Folio: ease the camera back to the configured view, or keep the view on screen as the book\'s. The viewer has no way to set the camera to a given angle: to look from one, set folio.tilt and folio.yaw with sandbox_set_config, then reset. The status gives the view on screen.' },
        magnification: { type: ['number', 'null'], minimum: 1.5, maximum: 10, description: 'Folio: hold the magnifying glass over the middle of the open spread, magnifying this many times; null puts it away. The glass belongs to the magnify pointer mode, which the viewer is switched to.' },
        toolbarPinned: { type: 'boolean', description: 'Keep the viewer\'s floating toolbar on screen.' },
        printPreview: { type: 'boolean', description: 'Canvas and Folio: the soft proof of the output profile with trim, bleed and safe-zone guides.' },
        fitMarks: { type: 'string', enum: [...FIT_MARKS_MODES, 'book'], description: 'Canvas: the marks of how composed frames fit — all (scaled text and pictures too), problems (frames that do not fit, unknown looks) or none. Kept as the reader\'s choice in this browser, over the book\'s debug.fitMarks (problems unless the book sets another); book forgets the choice and follows the book again. Never drawn in the PDF, HTML, EPUB or Folio.' },
        largeTargets: { type: 'boolean', description: 'Controls at least 44 px, for touch.' },
        guides: {
          type: 'object',
          description: 'Guides drawn on the pages; they are settings of the book (debug.*, page.baselineGrid, cjk.grid).',
          properties: {
            baselineGrid: { type: 'boolean' },
            characterGrid: { type: 'boolean', description: 'The CJK character grid.' },
            looseLines: { type: 'boolean', description: 'Highlight justified lines with wide word spaces.' },
            looseLineThreshold: { type: 'number', minimum: 1, maximum: 5, description: 'How wide the spaces are, as a multiple of the normal space, before a line is highlighted.' },
            pageNegative: { type: 'boolean', description: 'Pages light on dark.' },
            cursorSync: { type: 'boolean', description: 'Show the editor\'s caret on the page.' },
            selectionSync: { type: 'boolean', description: 'Show the editor\'s selection on the page.' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    execute: async (args) => {
      let s = store.getSnapshot();
      const viewer = (args.viewer as ViewportTab | undefined) ?? s.activeViewport;
      if (args.viewer === 'folio' && !folioSupported()) throw new ToolError('This browser cannot show the Folio (it needs WebGL 2). The canvas shows the same pages flat.');
      for (const [name, tabs] of Object.entries(VIEWER_SETTINGS) as [keyof ViewerSettings, readonly ViewportTab[]][]) {
        if (args[name] !== undefined && !tabs.includes(viewer)) {
          throw new ToolError(`${name} is a setting of the ${tabs.join(' and ')} viewer${tabs.length > 1 ? 's' : ''}, and the viewer is ${viewer}. Set "viewer" in the same call to switch.`);
        }
      }
      if (args.folioView !== undefined && viewer !== 'folio') throw new ToolError(`folioView is for the folio viewer, and the viewer is ${viewer}.`);
      if (args.magnification !== undefined && viewer !== 'folio') throw new ToolError(`magnification is the Folio's magnifying glass, and the viewer is ${viewer}. Set "viewer" to folio in the same call; the Canvas magnifies with zoom.`);
      if (typeof args.magnification === 'number' && args.interaction !== undefined && args.interaction !== 'magnify') {
        throw new ToolError(`The magnifying glass is held in the magnify pointer mode: leave interaction out, or set it to magnify, not ${args.interaction}.`);
      }
      if (args.settingsGroup !== undefined && !isSettingsGroupId(args.settingsGroup)) throw new ToolError('Unknown settings group.');
      if (typeof args.resource === 'string' && !s.resources.some((r) => r.id === args.resource)) {
        throw new ToolError(`No resource with id ${JSON.stringify(args.resource)}. The ids: ${s.resources.map((r) => r.id).join(', ') || 'none'}.`);
      }
      if (args.settingsChangedOnly === true && (typeof args.resource === 'string' || (args.panel !== undefined && args.panel !== 'config'))) {
        throw new ToolError('settingsChangedOnly is a filter of the Design panel, which it opens: leave panel and resource out, or set panel to config.');
      }
      const notes: string[] = [];

      if (args.viewer !== undefined && args.viewer !== s.activeViewport) s = await dispatchAndWait(host, { type: 'SET_VIEWPORT', payload: viewer });
      if (args.mode !== undefined) setEditMode(args.mode as EditMode);
      if (args.scope !== undefined) {
        const scope = args.scope as 'chapter' | 'book';
        s = await dispatchAndWait(host, { type: viewer === 'pdf' ? 'SET_PDF_SCOPE' : 'SET_CANVAS_SCOPE', payload: scope });
        if ((viewer === 'pdf' ? s.pdfScope : s.canvasScope) !== scope) throw new ToolError(`The whole book cannot be shown as one document here (${s.chapters.length} chapters); the scope stays "${viewer === 'pdf' ? s.pdfScope : s.canvasScope}".`);
      }
      if (args.epubLayout !== undefined) s = await dispatchAndWait(host, { type: 'SET_EPUB_LAYOUT', payload: args.epubLayout as 'fixed' | 'reflowable' });
      if (args.scormLayout !== undefined) s = await dispatchAndWait(host, { type: 'SET_SCORM_LAYOUT', payload: args.scormLayout as 'fixed' | 'reflowable' });
      if (args.scormVersion !== undefined) s = await dispatchAndWait(host, { type: 'SET_SCORM_VERSION', payload: args.scormVersion as '1.2' | '2004' });
      if (args.sidebarWidth !== undefined) s = await dispatchAndWait(host, { type: 'SET_SIDEBAR_PERCENT', payload: args.sidebarWidth as number });

      if (args.settingsGroup !== undefined) {
        // An open panel takes the request; a closed one opens on the group
        // stored for it.
        if (!requestSettingsGroup(args.settingsGroup)) saveSettingsGroup(args.settingsGroup);
        if (s.activePanel !== 'config') s = await dispatchAndWait(host, { type: 'SET_PANEL', payload: 'config' });
      } else if (typeof args.resource === 'string') {
        s = await dispatchAndWait(host, [{ type: 'SET_PANEL', payload: 'resources' }, { type: 'SET_ACTIVE_RESOURCE', payload: args.resource }]);
      } else if (args.panel !== undefined) {
        s = await dispatchAndWait(host, { type: 'SET_PANEL', payload: args.panel === 'none' ? null : (args.panel as PanelId) });
      }
      // The Resources panel's back button: the list again, whatever panel
      // is open.
      if (args.resource === null && s.activeResourceId !== null) s = await dispatchAndWait(host, { type: 'SET_ACTIVE_RESOURCE', payload: null });

      // An open Design panel takes its switches; a closed one reads the
      // stored explanations switch when it opens.
      if (args.settingsHelp !== undefined && !requestSettingsSwitches({ help: args.settingsHelp as boolean })) saveSettingsHelpMode(args.settingsHelp as boolean);
      if (args.settingsChangedOnly === true) {
        if (s.activePanel !== 'config') s = await dispatchAndWait(host, { type: 'SET_PANEL', payload: 'config' });
        // The panel takes the request once it is mounted.
        let taken = false;
        for (let tries = 0; tries < 30 && !taken; tries++) {
          taken = requestSettingsSwitches({ changedOnly: true });
          if (!taken) await sleep(50);
        }
        if (!taken) notes.push('The Design panel did not come up in time to take the changed-only filter; call again.');
      } else if (args.settingsChangedOnly === false) {
        requestSettingsSwitches({ changedOnly: false });
      }

      if (args.printPreview !== undefined) setPrintPreview(args.printPreview as boolean);
      if (args.fitMarks !== undefined) setFitMarksChoice(args.fitMarks === 'book' ? null : (args.fitMarks as FitMarksMode));
      if (args.largeTargets !== undefined) host.largeTargets.set(args.largeTargets as boolean);

      const settings: ViewerSettings = {};
      for (const name of Object.keys(VIEWER_SETTINGS) as (keyof ViewerSettings)[]) {
        if (args[name] !== undefined) (settings as Record<string, unknown>)[name] = args[name];
      }
      // A change of size or of what is drawn lays the viewer's pages out
      // again: the reader stays on the page they were on.
      const samePages = args.viewer === undefined && args.scope === undefined && (viewer === 'canvas' || viewer === 'html');
      const resized = settings.zoom !== undefined || settings.fit !== undefined || settings.pages !== undefined || settings.fontScale !== undefined || settings.columns !== undefined;
      const keepPage = samePages && (resized || args.guides !== undefined) ? viewerControls(viewer)?.status().pageIndex : undefined;
      if (Object.keys(settings).length > 0 || args.folioView !== undefined || args.magnification !== undefined) {
        const controls = await controlsOf(viewer);
        if (Object.keys(settings).length > 0) controls.set(settings);
        if (args.folioView === 'reset') controls.resetView?.();
        if (args.folioView === 'save') controls.saveView?.();
        if (args.magnification !== undefined) {
          const zoom = args.magnification as number | null;
          if (!controls.setMagnification) throw new ToolError(`The ${viewer} viewer has no magnifying glass.`);
          const before = controls.status().interaction;
          controls.setMagnification(zoom);
          if (zoom !== null) {
            // The 3D book may still be loading: the glass comes up once it is there.
            let held = false;
            for (let tries = 0; tries < 20 && !held; tries++) {
              await sleep(100);
              held = controls.status().magnification !== null && controls.status().magnification !== undefined;
              if (!held) controls.setMagnification(zoom);
            }
            if (!held) notes.push('The magnifying glass did not come up: the book is still loading, or it is not shown in 3D here.');
            else if (before !== 'magnify' && args.interaction === undefined) notes.push(`The pointer mode went from ${before ?? 'hand'} to magnify, which the glass belongs to.`);
          }
        }
        if (settings.columns === 'single' && viewer === 'html') {
          const vertical = resolveLayoutConfig(applyHtmlViewerOverrides(store.getSnapshot().config).layout).writingMode === 'vertical-rl';
          if (vertical) notes.push('This book is set vertically, which the HTML viewer only shows in columns paged sideways: it keeps columns, and will show one column for the next horizontal book.');
        }
      }

      const guides = args.guides as Record<string, unknown> | undefined;
      if (guides && Object.keys(guides).length > 0) {
        const { config } = store.getSnapshot();
        const patch: Partial<PostextConfig> = {};
        if (guides.baselineGrid !== undefined) {
          patch.page = { ...config.page, baselineGrid: { ...config.page?.baselineGrid, enabled: guides.baselineGrid as boolean } };
        }
        if (guides.characterGrid !== undefined) {
          patch.cjk = { ...config.cjk, grid: { ...config.cjk?.grid, show: guides.characterGrid as boolean } };
        }
        const debug = { ...config.debug };
        let debugChanged = false;
        const flag = (key: 'looseLineHighlight' | 'pageNegative' | 'cursorSync' | 'selectionSync', value: unknown) => {
          if (value === undefined) return;
          (debug as Record<string, unknown>)[key] = { ...(debug[key] as object | undefined), enabled: value };
          debugChanged = true;
        };
        flag('looseLineHighlight', guides.looseLines);
        flag('pageNegative', guides.pageNegative);
        flag('cursorSync', guides.cursorSync);
        flag('selectionSync', guides.selectionSync);
        if (guides.looseLineThreshold !== undefined) {
          debug.looseLineHighlight = {
            ...debug.looseLineHighlight,
            enabled: debug.looseLineHighlight?.enabled ?? resolveDebugConfig(config.debug).looseLineHighlight.enabled,
            threshold: guides.looseLineThreshold as number,
          };
          debugChanged = true;
        }
        if (debugChanged) patch.debug = debug;
        await dispatchAndWait(host, { type: 'UPDATE_CONFIG', payload: patch, history: { merge: false } });
      }

      // The viewers take their settings on their next render.
      await sleep(60);
      if (keepPage !== undefined) {
        if (guides && Object.keys(guides).length > 0) await whenSettled(host);
        for (let tries = 0; tries < 12; tries++) {
          const controls = viewerControls(viewer);
          const status = controls?.status();
          if (controls && status && !status.generating && (status.pageCount ?? 0) > keepPage) {
            if (status.pageIndex === keepPage && tries > 0) break;
            controls.goToPage?.(keepPage);
          }
          await sleep(150);
        }
      }
      return { view: viewState(host), ...(notes.length > 0 ? { notes } : {}) };
    },
  };

  const goToPage: WebMcpTool = {
    name: 'sandbox_go_to_page',
    title: 'Sandbox: go to a page',
    description: 'Show a page of the book in the viewer on screen: the next or previous one, the first or the last, a page by the number printed on it or by its position in a chapter, the first page of a chapter, the page where a passage of the text is set (which also places the selection there when the Manuscript panel is open), or the page where a resource, a heading\'s id, an anchor or a footnote\'s note is set (anchor: where a link to it leads). The EPUB reader goes by its own file: position is a document of its reading order (a page, in the fixed layout), contents an entry of its table of contents. Give one way of naming the page per call.',
    inputSchema: {
      type: 'object',
      properties: {
        step: { type: 'string', enum: ['next', 'previous', 'first', 'last'], description: 'Turn one page (or spread, column or EPUB document) forward or back, or go to the first or the last page of what the viewer shows.' },
        chapter: { type: ['integer', 'string'], description: 'The chapter: its position in the book (from 1), its title or its id. The chapter on screen when left out.' },
        page: { type: 'integer', description: 'The page number as printed on the page and shown in the viewer\'s page field.' },
        position: { type: 'integer', minimum: 1, description: 'The page by its position among the chapter\'s pages (from 1); for pages whose number repeats or that carry none. In the EPUB viewer: the document of the reading order (from 1), as its page field takes it.' },
        text: { type: 'string', description: 'Go to where this passage of the Markdown source is set.' },
        anchor: { type: 'string', description: 'Go to where this id is set: a resource placed in the text (::resource{id="…"}), a heading or anchor id ({#id}), or a footnote ([^id]). Looked for in the chapter named, or else in the chapter on screen and then in the others that mention it.' },
        contents: { type: 'string', description: 'EPUB viewer: go to the entry of the table of contents with this title (or this href, as the status lists them).' },
      },
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      let s = store.getSnapshot();
      const viewer = s.activeViewport;
      const ways = (['step', 'page', 'position', 'text', 'anchor', 'contents'] as const).filter((name) => args[name] !== undefined);
      if (ways.length > 1 && !(ways.length === 2 && ways.includes('page') && ways.includes('position'))) {
        throw new ToolError(`${ways.join(', ')} each name a page in their own way: give one of them.`);
      }
      if (args.step !== undefined) {
        const controls = await controlsOf(viewer);
        if (args.step === 'first' || args.step === 'last') {
          if (!controls.goToEdge) throw new ToolError(`The ${viewer} viewer has no first or last page to go to from here; name the page instead.`);
          controls.goToEdge(args.step);
        } else {
          if (!controls.step) throw new ToolError(`The ${viewer} viewer has no pages to turn from here; name the page instead.`);
          controls.step(args.step === 'next' ? 1 : -1);
        }
        await sleep(120);
        return { view: viewState(host) };
      }

      if (viewer === 'epub') {
        if (args.page !== undefined || args.text !== undefined || args.anchor !== undefined || args.chapter !== undefined) {
          throw new ToolError('The EPUB reader shows its own file, not the book\'s pages: go by position (a document of its reading order; a page in the fixed layout), contents (an entry of its table of contents) or step. For a page number, a passage or an anchor, switch the viewer to canvas, folio, html or pdf.');
        }
        if (args.position === undefined && args.contents === undefined) throw new ToolError('Say where to go in the EPUB: position, contents or step.');
        const controls = await controlsOf('epub');
        // The reader is there once the file is written.
        const written = await whenViewerIdle('epub', controls, { timeoutMs: host.settleTimeoutMs ?? SETTLE_TIMEOUT_MS, signal });
        if (written.error) throw new ToolError(`The EPUB could not be written: ${written.error}`);
        let status = controls.status();
        for (let tries = 0; tries < 20 && status.positionCount === undefined; tries++) {
          await sleep(100);
          status = controls.status();
        }
        if (status.positionCount === undefined) throw new ToolError('The EPUB reader has no file open; sandbox_run_viewer with action regenerate writes it.');
        if (args.contents !== undefined) {
          const entry = contentsEntry(status.contents ?? [], args.contents as string);
          if (!controls.goTo) throw new ToolError('The EPUB reader cannot follow its contents from here.');
          controls.goTo(entry.href);
          await sleep(150);
          return { contents: entry, view: viewState(host) };
        }
        const position = args.position as number;
        if (position > status.positionCount) throw new ToolError(`The EPUB has ${status.positionCount} document(s) in its reading order; position ${position} is not one of them.`);
        controls.goToPage?.(position - 1);
        await sleep(150);
        return { position, positionCount: status.positionCount, view: viewState(host) };
      }
      if (args.contents !== undefined) throw new ToolError(`contents is the EPUB reader's table of contents, and the viewer is ${viewer}. Here a chapter is named with chapter, a heading's id with anchor.`);

      let { chapter, index } = chapterOf(s, args.chapter ?? screenPosition(host).chapterIndex + 1);
      let { doc } = await layOutChapter(host, chapter.id, signal);
      let offset: number | null = null;
      let pageIndex = 0;
      let anchored: { kind: string; id: string; at: [number, number] } | null = null;
      if (typeof args.text === 'string' && args.text !== '') {
        const source = chapter.id === s.activeChapterId ? s.markdown : chapter.markdown;
        offset = source.indexOf(args.text);
        if (offset < 0) throw new ToolError(`That passage is not in chapter ${index + 1}; it must match the source exactly. sandbox_search_text finds the chapter a passage is in.`);
        const on = pagesOfOffset(doc, offset);
        if (on.length === 0) throw new ToolError('That passage is in the source but is not set on a page (text inside a directive, or a comment).');
        pageIndex = on[0]! - 1;
      } else if (typeof args.anchor === 'string') {
        const id = args.anchor.trim().replace(/^#/, '');
        if (id === '') throw new ToolError('anchor needs an id: a resource\'s, a heading\'s {#id}, or a footnote\'s.');
        let found = findAnchor(doc, id);
        if (!found && args.chapter === undefined) {
          // The other chapters whose source names the id, in book order.
          for (let i = 0; i < s.chapters.length && !found; i++) {
            const other = s.chapters[i]!;
            if (other.id === chapter.id || !(other.id === s.activeChapterId ? s.markdown : other.markdown).includes(id)) continue;
            const laidOut = await layOutChapter(host, other.id, signal);
            found = findAnchor(laidOut.doc, id);
            if (found) {
              chapter = other;
              index = i;
              doc = laidOut.doc;
            }
          }
        }
        if (!found) {
          throw new ToolError(`Nothing with the id ${JSON.stringify(id)} is set on a page of ${args.chapter === undefined ? 'the book' : `chapter ${index + 1}`}: no resource placed in the text, no heading or anchor id, no footnote. sandbox_list_resources gives the resources' ids; sandbox_search_text finds an id in the source.`);
        }
        pageIndex = found.pageIndex;
        const on = doc.pages[pageIndex]!;
        anchored = { kind: found.kind, id, at: [Math.round((found.x / on.width) * 1000) / 1000, Math.round((found.y / on.height) * 1000) / 1000] };
      } else {
        pageIndex = pageIndexOf(doc, { position: args.position as number | undefined, number: args.page as number | undefined }, 0);
        if (args.position === undefined && args.page === undefined) {
          // A chapter named alone opens on its first page with content.
          const firstContent = doc.pages.findIndex((p) => !p.blankForParity && !p.blankForForce);
          pageIndex = Math.max(0, firstContent);
        }
      }
      const page = doc.pages[pageIndex]!;
      // The viewers follow the fragment: the chapter is switched to when
      // it is another one, the page jumped to once it is laid out.
      const fragment = viewHashFragment({ ...readViewHash(), chapter: index, page: page.pageNumberValue });
      if (window.location.hash !== fragment) window.location.hash = fragment;
      if (offset !== null && s.activePanel === 'markdown') {
        await dispatchAndWait(host, { type: 'SET_PENDING_EDITOR_FOCUS', payload: { chapterId: chapter.id, anchor: offset, head: offset + (args.text as string).length, selectWord: false } });
      }
      await sleep(150);
      s = store.getSnapshot();
      return {
        chapter: index + 1,
        position: pageIndex + 1,
        page: page.pageLabel,
        chapterPages: doc.pages.length,
        ...(anchored ? { anchor: anchored } : {}),
        ...(s.activeViewport === 'pdf' ? { note: 'The PDF opens at this page the next time it is generated.' } : {}),
      };
    },
  };

  return [setView, goToPage];
}
