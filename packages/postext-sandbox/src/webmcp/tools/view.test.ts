import { afterEach, describe, expect, it } from 'vitest';
import { onSettingsSwitchesRequest, reportSettingsChangedOnly, type SettingsPanelSwitches } from '../../context/settingsNavigation.js';
import type { ViewportTab } from '../../types/index.js';
import {
  latestControls,
  registerViewerControls,
  viewerControls,
  type ViewerControls,
  type ViewerStatus,
  type ViewerVideoTarget,
} from '../../viewport/viewerControls.js';
import { pickVideo, type PlayableVideo } from '../../viewport/viewerVideos.js';
import { runTool } from '../modelContext.js';
import { editModeNow, resetEditMode } from '../../editing/editMode.js';
import { fitMarksChoiceNow, resetFitMarksView, setFitMarksChoice } from '../../viewport/composed/fitMarksView.js';
import { sourcePlace } from '../pagePoint.js';
import { compactStatus } from '../viewerStatus.js';
import { chapter, harness } from './testHarness.js';
import { contentsEntry } from './view.js';
import { viewerCommandTools } from './viewerCommands.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const undo of cleanups.splice(0)) undo();
});

/** A viewer tab standing in for the real one: its status is `status`,
 *  changed in place by a test, and every call it takes is in `calls`. */
function fakeViewer(tab: ViewportTab, status: ViewerStatus, members: (calls: unknown[][]) => Partial<ViewerControls> = () => ({})) {
  const calls: unknown[][] = [];
  const controls: ViewerControls = {
    status: () => status,
    set: (settings) => {
      calls.push(['set', settings]);
      Object.assign(status, settings);
    },
    regenerate: () => { calls.push(['regenerate']); },
    ...members(calls),
  };
  cleanups.push(registerViewerControls(tab, controls));
  return { calls, status };
}

const CONTENTS = [
  { title: 'Opening', href: 'OEBPS/c1.xhtml', depth: 0 },
  { title: 'A quiet start', href: 'OEBPS/c1.xhtml#quiet', depth: 1 },
  { title: 'Second', href: 'OEBPS/c2.xhtml', depth: 0 },
  { title: 'Second thoughts', href: 'OEBPS/c2.xhtml#thoughts', depth: 1 },
];

/** The EPUB tab with a file of three documents on screen. */
function fakeEpub(extra: Partial<ViewerStatus> = {}) {
  const status: ViewerStatus = { generating: false, stale: false, error: null, fileSize: 2048, position: 1, positionCount: 3, canNext: true, canPrevious: false, contents: CONTENTS, notices: [], ...extra };
  return fakeViewer('epub', status, (calls) => ({
    goToPage: (index) => { calls.push(['goToPage', index]); status.position = index + 1; },
    step: (delta) => { calls.push(['step', delta]); },
    goToEdge: (edge) => { calls.push(['goToEdge', edge]); },
    goTo: (href) => { calls.push(['goTo', href]); },
    file: () => (status.fileSize ? { bytes: new Uint8Array(status.fileSize), name: 'book.epub', mime: 'application/epub+zip' } : null),
    download: () => { calls.push(['download']); },
  }));
}

describe('the viewer controls registry', () => {
  it('holds the controls of a tab until they are taken back', () => {
    const controls: ViewerControls = { status: () => ({ generating: false }), set: () => undefined, regenerate: () => undefined };
    const undo = registerViewerControls('canvas', controls);
    expect(viewerControls('canvas')).toBe(controls);
    undo();
    expect(viewerControls('canvas')).toBeNull();
  });

  it('reaches the latest controls, and says what a viewer does not do', () => {
    // What the viewer hands in on each of its renders.
    const rendered: { controls: ViewerControls } = { controls: { status: () => ({ generating: false }), set: () => undefined, regenerate: () => undefined } };
    const seen: number[] = [];
    const proxy = latestControls(() => rendered.controls);
    expect(proxy.step).toBeUndefined();
    expect(proxy.print).toBeUndefined();
    rendered.controls = { ...rendered.controls, step: (delta) => { seen.push(delta); } };
    proxy.step!(1);
    expect(seen).toEqual([1]);
  });

  it('leaves out of a status what says nothing, and cuts long lists', () => {
    const contents = Array.from({ length: 45 }, (_, i) => ({ title: `Entry ${i}`, href: `c${i}.xhtml`, depth: 0 }));
    const compact = compactStatus({ generating: true, error: null, progress: 0.4567, phase: 'layout', fileSize: null, notices: [], contents, view: { tilt: 31.26, yaw: -4.04 }, magnification: null });
    expect(compact).toEqual({ generating: true, progress: 0.46, phase: 'layout', contents: contents.slice(0, 40), contentsMore: 5, view: { tilt: 31.3, yaw: -4 } });
  });

  it('picks the video a caller names among those a viewer can play', () => {
    const video = (resource: string, pageIndex: number, box: [number, number, number, number]): PlayableVideo<string> =>
      ({ resource, pageIndex, contains: (x, y) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3], item: `${resource}@${pageIndex}` });
    const videos = [video('intro', 2, [0, 0, 1, 0.5]), video('loop', 2, [0, 0.5, 1, 1]), video('intro', 5, [0, 0, 1, 1])];
    expect(pickVideo(videos, {})!.item).toBe('intro@2');
    expect(pickVideo(videos, { resource: 'loop' })!.item).toBe('loop@2');
    expect(pickVideo(videos, { resource: 'intro', pageIndex: 5 })!.item).toBe('intro@5');
    expect(pickVideo(videos, { pageIndex: 2, x: 0.5, y: 0.8 })!.item).toBe('loop@2');
    expect(pickVideo(videos, { resource: 'outro' })).toBeNull();
  });
});

describe('sandbox_set_view', () => {
  it('closes the resource that is open', async () => {
    const { call, get } = harness();
    await call('sandbox_save_resource', { caption: 'Sizes', table: { rows: [['Size', 'Use'], ['A5', 'Novels']] }, wait: false });
    const opened = await call('sandbox_set_view', { resource: 'sizes' });
    expect(opened.view).toMatchObject({ panel: 'resources', resource: 'sizes' });
    const closed = await call('sandbox_set_view', { resource: null });
    expect(get().activeResourceId).toBeNull();
    expect(closed.view.panel).toBe('resources');
    expect(closed.view.resource).toBeUndefined();
  });

  it("sets the Design panel's explanations and its changed-only filter", async () => {
    const { call, get } = harness();
    const taken: SettingsPanelSwitches[] = [];
    // The panel's side: it applies the switches and reports its filter.
    cleanups.push(onSettingsSwitchesRequest((switches) => {
      taken.push(switches);
      if (switches.changedOnly !== undefined) reportSettingsChangedOnly(switches.changedOnly);
    }), () => reportSettingsChangedOnly(false));
    const set = await call('sandbox_set_view', { settingsHelp: true, settingsChangedOnly: true });
    expect(taken).toEqual([{ help: true }, { changedOnly: true }]);
    expect(get().activePanel).toBe('config');
    expect(set.view).toMatchObject({ panel: 'config', settingsChangedOnly: true });
    await call('sandbox_set_view', { settingsChangedOnly: false });
    expect(taken[2]).toEqual({ changedOnly: false });
    expect((await call('sandbox_set_view', { settingsChangedOnly: true, panel: 'fonts' })).error).toMatch(/filter of the Design panel/);
  });

  it('switches between the Content and Design modes (#864)', async () => {
    const { call } = harness();
    cleanups.push(() => resetEditMode());
    const design = await call('sandbox_set_view', { mode: 'design' });
    expect(design.view).toMatchObject({ mode: 'design' });
    expect(editModeNow()).toBe('design');
    const content = await call('sandbox_set_view', { mode: 'content' });
    expect(content.view).toMatchObject({ mode: 'content' });
    expect((await call('sandbox_set_view', { mode: 'layout' })).error).toBeTruthy();
  });

  it("holds the Folio's magnifying glass, and says what it switched", async () => {
    const { call } = harness({ activeViewport: 'folio' });
    const status: ViewerStatus = { generating: false, interaction: 'hand', magnification: null, view: { tilt: 30, yaw: 0 } };
    const folio = fakeViewer('folio', status, (calls) => ({
      setMagnification: (zoom) => {
        calls.push(['setMagnification', zoom]);
        status.magnification = zoom;
        if (zoom !== null) status.interaction = 'magnify';
      },
    }));
    const held = await call('sandbox_set_view', { magnification: 4 });
    expect(folio.calls).toEqual([['setMagnification', 4]]);
    expect(held.view.folio).toMatchObject({ magnification: 4, interaction: 'magnify', view: { tilt: 30, yaw: 0 } });
    expect(held.notes).toEqual(['The pointer mode went from hand to magnify, which the glass belongs to.']);
    const away = await call('sandbox_set_view', { magnification: null });
    expect(away.view.folio.magnification).toBeUndefined();
    expect(away.notes).toBeUndefined();
    expect((await call('sandbox_set_view', { magnification: 4, interaction: 'orbit' })).error).toMatch(/held in the magnify pointer mode/);
    expect((await call('sandbox_set_view', { magnification: 40 })).error).toMatch(/magnification must be at most 10/);
    expect((await call('sandbox_set_view', { viewer: 'canvas', magnification: 2 })).error).toMatch(/Folio's magnifying glass, and the viewer is canvas/);
  });

  it('says that a vertical book keeps its columns in the HTML viewer', async () => {
    const { call } = harness({ activeViewport: 'html', config: { layout: { writingMode: 'vertical-rl' } } });
    const html = fakeViewer('html', { generating: false, columns: 'multi', fontScale: 1 });
    const set = await call('sandbox_set_view', { columns: 'single' });
    expect(html.calls).toEqual([['set', { columns: 'single' }]]);
    expect(set.notes[0]).toMatch(/set vertically.*keeps columns/);
    const horizontal = harness({ activeViewport: 'html' });
    expect((await horizontal.call('sandbox_set_view', { columns: 'single' })).notes).toBeUndefined();
  });

  it('chooses the fit marks of composed pages over the book\'s default, and goes back to it (#1160)', async () => {
    cleanups.push(() => { setFitMarksChoice(null); resetFitMarksView(); });
    const { call } = harness({ config: { debug: { fitMarks: 'problems', fitMarksMinScale: 0.95 } } });
    expect((await call('sandbox_get_state')).view.fitMarks).toEqual({ mode: 'problems', minScale: 0.95, source: 'book' });
    const none = await call('sandbox_set_view', { fitMarks: 'none' });
    expect(none.view.fitMarks).toEqual({ mode: 'none', minScale: 0.95, source: 'viewer' });
    expect(fitMarksChoiceNow()).toBe('none');
    const book = await call('sandbox_set_view', { fitMarks: 'book' });
    expect(book.view.fitMarks).toEqual({ mode: 'problems', minScale: 0.95, source: 'book' });
    expect((await call('sandbox_set_view', { fitMarks: 'some' })).error).toBeTruthy();
  });
});

describe('sandbox_go_to_page', () => {
  it('goes to a document of the EPUB, and to its first and last', async () => {
    const { call } = harness({ activeViewport: 'epub' });
    const epub = fakeEpub();
    const gone = await call('sandbox_go_to_page', { position: 3 });
    expect(epub.calls).toEqual([['goToPage', 2]]);
    expect(gone).toMatchObject({ ok: true, position: 3, positionCount: 3 });
    expect(gone.view.epub).toMatchObject({ position: 3, positionCount: 3, canNext: true });
    expect((await call('sandbox_go_to_page', { position: 4 })).error).toMatch(/The EPUB has 3 document\(s\) in its reading order; position 4 is not one of them/);
    await call('sandbox_go_to_page', { step: 'last' });
    await call('sandbox_go_to_page', { step: 'next' });
    expect(epub.calls.slice(1)).toEqual([['goToEdge', 'last'], ['step', 1]]);
    expect((await call('sandbox_go_to_page', { page: 12 })).error).toMatch(/The EPUB reader shows its own file.*position.*contents.*step/);
    expect((await call('sandbox_go_to_page', {})).error).toMatch(/position, contents or step/);
    expect((await call('sandbox_go_to_page', { step: 'next', position: 2 })).error).toMatch(/give one of them/);
  });

  it('follows an entry of the EPUB contents by its title', async () => {
    const { call } = harness({ activeViewport: 'epub' });
    const epub = fakeEpub();
    expect((await call('sandbox_go_to_page', { contents: 'Second' })).contents).toEqual(CONTENTS[2]);
    await call('sandbox_go_to_page', { contents: 'a QUIET start' });
    await call('sandbox_go_to_page', { contents: 'thoughts' });
    await call('sandbox_go_to_page', { contents: 'OEBPS/c1.xhtml' });
    expect(epub.calls).toEqual([['goTo', 'OEBPS/c2.xhtml'], ['goTo', 'OEBPS/c1.xhtml#quiet'], ['goTo', 'OEBPS/c2.xhtml#thoughts'], ['goTo', 'OEBPS/c1.xhtml']]);
    expect((await call('sandbox_go_to_page', { contents: 'Third' })).error).toMatch(/No entry of the contents is titled "Third"\. The entries: "Opening", "A quiet start", "Second", "Second thoughts"\./);
    expect(() => contentsEntry(CONTENTS, 'sec')).toThrow(/2 entries of the contents hold "sec": "Second", "Second thoughts"/);
    expect(() => contentsEntry([], 'x')).toThrow(/no table of contents/);
  });

  it('waits for no EPUB that failed, and has no contents outside the EPUB', async () => {
    const failed = harness({ activeViewport: 'epub' });
    fakeEpub({ error: 'No chapters to write', fileSize: null, positionCount: undefined });
    expect((await failed.call('sandbox_go_to_page', { position: 1 })).error).toBe('The EPUB could not be written: No chapters to write');
    const canvas = harness();
    expect((await canvas.call('sandbox_go_to_page', { contents: 'Second' })).error).toMatch(/contents is the EPUB reader's table of contents, and the viewer is canvas/);
  });

  it('says so when a viewer has no pages to turn', async () => {
    const { call } = harness({ activeViewport: 'pdf' });
    fakeViewer('pdf', { generating: false });
    expect((await call('sandbox_go_to_page', { step: 'next' })).error).toMatch(/The pdf viewer has no pages to turn from here/);
    expect((await call('sandbox_go_to_page', { step: 'first' })).error).toMatch(/The pdf viewer has no first or last page/);
  });

  it('goes where an id is set, in whatever chapter', async () => {
    const chapters = [
      chapter('a', 'Opening', '# Opening\n\nA first paragraph that points ahead.\n'),
      chapter('b', 'Second', '# Second\n\nSome words before the section.\n\n## Deep down {#deep}\n\nThe section itself.\n\n::resource{id="sizes"}\n'),
    ];
    const { call } = harness({ chapters, markdown: chapters[0]!.markdown });
    await call('sandbox_save_resource', { caption: 'Sizes', table: { rows: [['Size', 'Use'], ['A5', 'Novels']] }, wait: false });
    // The viewers follow the address: the tool writes the page there.
    const location = { hash: '' };
    (globalThis as { window?: unknown }).window = { location };
    cleanups.push(() => { delete (globalThis as { window?: unknown }).window; });

    const heading = await call('sandbox_go_to_page', { anchor: '#deep' });
    expect(heading).toMatchObject({ ok: true, chapter: 2, position: 1, anchor: { kind: 'anchor', id: 'deep' } });
    expect(location.hash).toBe(`#chapter=2&page=${heading.page}`);
    expect(heading.anchor.at[1]).toBeGreaterThan(0);
    const table = await call('sandbox_go_to_page', { anchor: 'sizes' });
    expect(table).toMatchObject({ chapter: 2, anchor: { kind: 'resource', id: 'sizes' } });
    expect((await call('sandbox_go_to_page', { anchor: 'nowhere' })).error).toMatch(/Nothing with the id "nowhere" is set on a page of the book/);
    expect((await call('sandbox_go_to_page', { chapter: 1, anchor: 'deep' })).error).toMatch(/is set on a page of chapter 1/);
  });
});

describe('sandbox_run_viewer', () => {
  const run = (host: ReturnType<typeof harness>['host'], args: Record<string, unknown>) =>
    runTool(viewerCommandTools(host)[0]!, args) as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any

  it('is named, described and takes an object', () => {
    const [tool] = viewerCommandTools(harness().host);
    expect(tool!.name).toBe('sandbox_run_viewer');
    expect(tool!.description.length).toBeGreaterThan(60);
    expect(tool!.inputSchema).toMatchObject({ type: 'object', additionalProperties: false, required: ['action'] });
  });

  it('writes a stale PDF again and answers with its status', async () => {
    const { host, get } = harness();
    const status: ViewerStatus = { generating: false, stale: true, error: null, fileSize: 1000, pageCount: 4 };
    const pdf = fakeViewer('pdf', status, (calls) => ({
      regenerate: async () => {
        calls.push(['regenerate']);
        Object.assign(status, { stale: false, fileSize: 5000, pageCount: 6 });
      },
      file: () => ({ bytes: new Uint8Array(status.fileSize ?? 0), name: 'Opening.pdf', mime: 'application/pdf' }),
      download: () => { calls.push(['download']); },
      print: () => { calls.push(['print']); },
    }));
    const done = await run(host, { viewer: 'pdf', action: 'regenerate' });
    expect(get().activeViewport).toBe('pdf');
    expect(pdf.calls).toEqual([['regenerate']]);
    expect(done).toMatchObject({ ok: true, viewer: 'pdf', regenerated: true, pdf: { generating: false, stale: false, fileSize: 5000, pageCount: 6 } });

    const saved = await run(host, { action: 'download' });
    expect(saved).toMatchObject({ downloaded: 'Opening.pdf', size: 5000 });
    expect(saved.note).toMatch(/sandbox_export/);
    const printing = await run(host, { action: 'print' });
    expect(printing.printing).toBe(true);
    // The dialog opens after the answer has left.
    expect(pdf.calls).toEqual([['regenerate'], ['download']]);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(pdf.calls[2]).toEqual(['print']);
  });

  it('waits for a file already being written instead of starting another', async () => {
    const { host } = harness({ activeViewport: 'epub' });
    const epub = fakeEpub({ generating: true, progress: 0.5, phase: 'documents', fileSize: null, positionCount: undefined });
    setTimeout(() => Object.assign(epub.status, { generating: false, progress: null, phase: null, fileSize: 4096, positionCount: 3, notices: [{ kind: 'missingFont', family: 'Inter' }] }), 500);
    expect((await run(host, { action: 'download' })).error).toMatch(/The EPUB is being written \(50% of the documents\)/);
    const early = await run(host, { action: 'regenerate', wait: false });
    expect(early).toMatchObject({ regenerating: true, alreadyUnderWay: true, epub: { generating: true, progress: 0.5, phase: 'documents' } });
    const done = await run(host, { action: 'regenerate' });
    expect(epub.calls).toEqual([]);
    expect(done.note).toMatch(/was writing it already/);
    expect(done.epub).toMatchObject({ fileSize: 4096, notices: [{ kind: 'missingFont', family: 'Inter' }] });
  });

  it('says what could not be written', async () => {
    const { host } = harness({ activeViewport: 'pdf' });
    const status: ViewerStatus = { generating: false, stale: false, error: 'A font is missing', fileSize: null };
    fakeViewer('pdf', status, () => ({ file: () => null, print: () => undefined }));
    expect((await run(host, { action: 'regenerate' })).error).toBe('The PDF could not be written: A font is missing');
    expect((await run(host, { action: 'print' })).error).toMatch(/no PDF on screen: the last one could not be written \(A font is missing\)/);
  });

  it('plays and stops a video of the pages', async () => {
    const { host } = harness({ activeViewport: 'html' });
    const asked: ViewerVideoTarget[] = [];
    const status: ViewerStatus = { generating: false, videos: [{ resource: 'intro', pageNumber: 3, state: 'stopped' }] };
    fakeViewer('html', status, () => ({
      playVideo: async (target) => {
        asked.push(target);
        if (target.resource !== undefined && target.resource !== 'intro') return { played: false, reason: 'none' };
        status.videos![0]!.state = 'playing';
        return { played: true, resource: 'intro', pageNumber: 3, muted: true };
      },
      stopVideo: () => {
        status.videos![0]!.state = 'stopped';
      },
    }));
    const playing = await run(host, { action: 'play_video', resource: 'intro', page: 3 });
    expect(asked).toEqual([{ resource: 'intro', pageNumber: 3 }]);
    expect(playing).toMatchObject({ viewer: 'html', video: { resource: 'intro', page: 3, state: 'playing' }, html: { videos: [{ resource: 'intro', pageNumber: 3, state: 'playing' }] } });
    expect(playing.notes).toEqual([expect.stringMatching(/plays muted/)]);
    expect((await run(host, { action: 'stop_video' })).html.videos[0].state).toBe('stopped');
    expect((await run(host, { action: 'play_video', resource: 'outro' })).error).toMatch(/No video the viewer can play matches that in the document on screen\. The videos there: intro \(page 3, stopped\)/);
    expect((await run(host, { action: 'play_video', x: 0.5 })).error).toBe('A point needs both x and y.');
  });

  it('tells the Folio to turn to the page of a video first', async () => {
    const { host } = harness({ activeViewport: 'folio' });
    fakeViewer('folio', { generating: false }, () => ({ playVideo: () => ({ played: false, reason: 'elsewhere', pageNumbers: [12] }) }));
    expect((await run(host, { action: 'play_video', resource: 'intro' })).error).toMatch(/That video is on page 12.*sandbox_go_to_page there/);
  });

  it('keeps each command to the viewers that have it', async () => {
    const { host } = harness();
    expect((await run(host, { action: 'print' })).error).toMatch(/print is a command of the pdf viewer, and the viewer is canvas/);
    expect((await run(host, { viewer: 'canvas', action: 'download' })).error).toMatch(/download is a command of the pdf, epub and scorm viewers/);
    expect((await run(host, { viewer: 'pdf', action: 'play_video' })).error).toMatch(/play_video is a command of the folio and html viewers/);
    expect((await run(host, { viewer: 'pdf', action: 'regenerate', resource: 'intro' })).error).toMatch(/resource says which video to play/);
    expect((await run(host, { viewer: 'pdf', action: 'print', wait: false })).error).toBe('wait goes with action regenerate, not print.');
    expect((await run(host, {})).error).toMatch(/action is required/);
  });

  it('lays a preview out again', async () => {
    const { host } = harness();
    const canvas = fakeViewer('canvas', { generating: false, pageCount: 9, pageIndex: 0, pageNumber: 1 });
    const done = await run(host, { action: 'regenerate' });
    expect(canvas.calls).toEqual([['regenerate']]);
    expect(done).toMatchObject({ viewer: 'canvas', regenerated: true, canvas: { pageCount: 9 } });
  });
});

describe('sandbox_inspect_point', () => {
  /** The middle of a block of a page, in the fractions the tools take. */
  const middle = (block: { box: [number, number, number, number] }) => ({ x: block.box[0] + block.box[2] / 2, y: block.box[1] + block.box[3] / 2 });

  it('finds the source under a point of the page', async () => {
    const { call } = harness();
    const { blocks } = (await call('sandbox_inspect_pages', { chapter: 1, position: 1 })).pages[0];
    const title = await call('sandbox_inspect_point', { chapter: 1, position: 1, ...middle(blocks[0]) });
    expect(title).toMatchObject({ ok: true, chapter: 1, position: 1, page: '1', click: 'place_caret', block: { type: 'heading', level: 1, text: 'Opening' } });
    expect(title.source).toMatchObject({ line: 1, lineText: '# Opening' });
    expect(title.source.column).toBeGreaterThan(2);
    expect(title.source.word).toBe('Opening');

    const paragraph = await call('sandbox_inspect_point', { chapter: 1, position: 1, ...middle(blocks[1]) });
    expect(paragraph.block.type).toBe('paragraph');
    expect(paragraph.source.line).toBe(3);
    expect(paragraph.source.lineText.slice(paragraph.source.column - 1)).toContain(paragraph.source.word);
    expect(paragraph.source.word.length).toBeGreaterThan(0);
  });

  it('answers for a margin, and for arguments it cannot take', async () => {
    const { call } = harness();
    const corner = await call('sandbox_inspect_point', { chapter: 1, position: 1, x: 0.002, y: 0.002 });
    expect(corner.click).toBe('none');
    expect(corner.block).toBeUndefined();
    expect(corner.source).toBeUndefined();
    expect((await call('sandbox_inspect_point', { x: 1.2, y: 0.5 })).error).toMatch(/x must be at most 1/);
    expect((await call('sandbox_inspect_point', { x: 0.5 })).error).toMatch(/y is required/);
    expect((await call('sandbox_inspect_point', { x: 0.5, y: 0.5, word: true })).error).toMatch(/set select to true/);
    expect((await call('sandbox_inspect_point', { chapter: 1, position: 99, x: 0.5, y: 0.5 })).error).toMatch(/position 99 is not one of them/);
  });

  it('puts the caret, a word or a selection in the Manuscript panel', async () => {
    const { call, get } = harness();
    const { blocks } = (await call('sandbox_inspect_pages', { chapter: 2, position: 1 })).pages[0];
    const at = middle(blocks[1]);
    const caret = await call('sandbox_inspect_point', { chapter: 2, position: 1, ...at, select: true });
    expect(get().activePanel).toBe('markdown');
    expect(get().pendingEditorFocus).toEqual({ chapterId: 'b', anchor: caret.source.offset, head: caret.source.offset, selectWord: false, fromViewer: true });
    expect(caret.selected).toEqual({ panel: 'markdown', chapter: 2, anchor: caret.source.offset, head: caret.source.offset });

    await call('sandbox_inspect_point', { chapter: 2, position: 1, ...at, select: true, word: true });
    expect(get().pendingEditorFocus).toMatchObject({ chapterId: 'b', selectWord: true });

    const dragged = await call('sandbox_inspect_point', { chapter: 2, position: 1, ...middle(blocks[0]), select: true, to: at });
    expect(dragged.selected.anchor).toBeLessThan(dragged.selected.head);
    expect(get().pendingEditorFocus).toMatchObject({ anchor: dragged.selected.anchor, head: caret.source.offset });
    expect((await call('sandbox_inspect_point', { chapter: 2, position: 1, ...at, select: true, to: { x: 0.002, y: 0.002 } })).error).toMatch(/second point is not on text/);
  });

  it('names the resource and the cell under a point, and opens it', async () => {
    const chapters = [chapter('a', 'Opening', '# Opening\n\nA paragraph before the table.\n\n::resource{id="sizes"}\n')];
    const { call, get } = harness({ chapters, markdown: chapters[0]!.markdown });
    await call('sandbox_save_resource', { caption: 'Sizes', table: { rows: [['Size', 'Use'], ['A5', 'Novels']] }, wait: false });
    const page = (await call('sandbox_inspect_pages', { chapter: 1, position: 1 })).pages[0];
    const placed = [...page.blocks, ...(page.floats ?? [])].find((b: { resource?: string }) => b.resource === 'sizes');
    expect(placed).toBeDefined();
    // The table's cells fill its body: the middle of the block is in one.
    const hit = await call('sandbox_inspect_point', { chapter: 1, position: 1, ...middle(placed), select: true });
    expect(hit.resource).toMatchObject({ id: 'sizes' });
    expect(['cell', 'caption', 'note']).toContain(hit.resource.part);
    expect(hit.click).toBe('edit_resource_text');
    expect(get().activePanel).toBe('resources');
    expect(get().activeResourceId).toBe('sizes');
    expect(get().pendingResourceFocus).toMatchObject({ resourceId: 'sizes', selectWord: false });
    expect(hit.selected).toMatchObject({ panel: 'resources', resource: 'sizes' });
  });

  /** What the tool answers over a box of a page, on a grid of `columns`
   *  by `rows` points: the answers that carry `key`, one per distinct
   *  value of it. */
  async function over(call: ReturnType<typeof harness>['call'], where: Record<string, unknown>, box: [number, number, number, number], [columns, rows]: [number, number], key: 'link' | 'comic') {
    const found = new Map<string, Record<string, any>>(); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let j = 1; j < rows; j++) {
      for (let i = 0; i <= columns; i++) {
        const answer = await call('sandbox_inspect_point', { ...where, x: box[0] + (box[2] * i) / columns, y: box[1] + (box[3] * j) / rows });
        if (answer[key] && !found.has(JSON.stringify(answer[key]))) found.set(JSON.stringify(answer[key]), answer);
      }
    }
    return [...found.values()];
  }

  it('says where a link leads, and what a click on it does', async () => {
    const chapters = [chapter('a', 'Opening', '# Opening\n\nSee :ref{id="sizes"} and [the site](https://postext.dev), with a note[^n].\n\n::resource{id="sizes"}\n\n[^n]: The note itself.\n')];
    const { call, get } = harness({ chapters, markdown: chapters[0]!.markdown });
    await call('sandbox_save_resource', { caption: 'Sizes', table: { rows: [['Size', 'Use'], ['A5', 'Novels']] }, wait: false });
    const paragraph = (await call('sandbox_inspect_pages', { chapter: 1, position: 1 })).pages[0].blocks[1];
    const links = await over(call, { chapter: 1, position: 1 }, paragraph.box, [80, 4], 'link');
    const byKind = Object.fromEntries(links.map((a) => [a.link.kind, a]));
    expect(byKind.resource).toMatchObject({ click: 'follow_link', link: { kind: 'resource', id: 'sizes', leadsTo: { chapter: 1, position: 1, page: '1' } } });
    expect(byKind.footnote).toMatchObject({ click: 'follow_link', link: { kind: 'footnote', id: 'n', leadsTo: { chapter: 1, position: 1 } } });
    // A plain click on a URL puts the caret in its text.
    expect(byKind.url).toMatchObject({ click: 'place_caret', link: { kind: 'url', href: 'https://postext.dev', followed: 'with Cmd or Ctrl held' } });
    expect(byKind.url.source.lineText).toContain('[the site](https://postext.dev)');
    // Reading a link changes nothing.
    expect(get().activePanel).toBeNull();
    expect(get().pendingEditorFocus).toBeNull();
  });

  it('names the part of a comic under a point', async () => {
    const chapters = [chapter('a', 'Comic', '# Comic\n\n:::page\n::panel\nana: Did you hear that?\n::panel\nben: Nothing.\n:::\n')];
    const { call } = harness({ chapters, markdown: chapters[0]!.markdown });
    const outline = await call('sandbox_inspect_pages', { chapter: 1 });
    const position = outline.pages.find((p: { role: string }) => p.role === 'comic').position;
    const parts = await over(call, { chapter: 1, position }, [0, 0, 1, 1], [20, 20], 'comic');
    const ana = parts.find((a) => a.comic.balloon?.speaker === 'ana')!;
    expect(ana).toMatchObject({ click: 'place_caret', comic: { balloon: { kind: 'balloon', style: 'speech', panel: 1 } }, source: { lineText: 'ana: Did you hear that?' } });
    expect(parts.some((a) => a.comic.part === 'panel' && a.comic.panel === 2 && a.click === 'none')).toBe(true);
  });

  it('places an offset in the source by line, column and word', () => {
    const text = '# Title\n\nA line of words.\nAnother.';
    expect(sourcePlace(text, 0)).toEqual({ line: 1, column: 1, offset: 0, word: '', lineText: '# Title' });
    expect(sourcePlace(text, text.indexOf('line') + 2)).toEqual({ line: 3, column: 5, offset: 13, word: 'line', lineText: 'A line of words.' });
    expect(sourcePlace(text, text.indexOf('Another'))).toMatchObject({ line: 4, column: 1, word: 'Another' });
    expect(sourcePlace(text, text.length)).toMatchObject({ line: 4, column: 9, word: '' });
  });
});
