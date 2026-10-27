// The buttons of the viewers' toolbars and what a click does on their
// pages: lay out or write again, print, download, play a video.

import { VIEWPORT_TABS } from '../../storage/viewHash.js';
import type { ViewportTab } from '../../types/index.js';
import { folioSupported } from '../../viewport/folio/folioSupport.js';
import type { ViewerControls, ViewerVideo } from '../../viewport/viewerControls.js';
import { SETTLE_TIMEOUT_MS, dispatchAndWait, whenSettled, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { MAX_STATUS_ENTRIES, compactStatus, whenViewerIdle } from '../viewerStatus.js';
import { controlsOf } from './view.js';

const ACTIONS = ['regenerate', 'print', 'download', 'play_video', 'stop_video'] as const;
type ViewerAction = (typeof ACTIONS)[number];

/** The viewers that take each action; every viewer when not listed. */
const ACTION_VIEWERS: Partial<Record<ViewerAction, readonly ViewportTab[]>> = {
  print: ['pdf'],
  download: ['pdf', 'epub', 'scorm'],
  play_video: ['folio', 'html'],
  stop_video: ['folio', 'html'],
};

/** The parameters that say which video to play. */
const VIDEO_PARAMS = ['resource', 'page', 'x', 'y'] as const;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const listVideos = (videos: readonly ViewerVideo[] | undefined): string =>
  (videos ?? []).slice(0, MAX_STATUS_ENTRIES).map((v) => `${v.resource} (page ${v.pageNumber}, ${v.state})`).join(', ');

export function viewerCommandTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  /** The file a PDF or EPUB tab shows, or the reason it shows none. */
  const fileOnScreen = (tab: 'pdf' | 'epub', controls: ViewerControls): { name: string; bytes: Uint8Array } => {
    const status = controls.status();
    const name = tab.toUpperCase();
    if (status.generating) throw new ToolError(`The ${name} is being written${typeof status.progress === 'number' ? ` (${Math.round(status.progress * 100)}% of the ${status.phase ?? 'work'})` : ''}: its buttons are off until it is. sandbox_run_viewer with action regenerate waits for it.`);
    if (status.error) throw new ToolError(`There is no ${name} on screen: the last one could not be written (${status.error}). sandbox_run_viewer with action regenerate tries again.`);
    const file = controls.file?.();
    if (!file) throw new ToolError(`There is no ${name} on screen yet. sandbox_run_viewer with action regenerate writes it.`);
    return file;
  };

  const runViewer: WebMcpTool = {
    name: 'sandbox_run_viewer',
    title: "Sandbox: run a viewer's command",
    description: "Press a button of a viewer's toolbar, or play a video on its pages. regenerate lays the pages of the Canvas, Folio or HTML viewer out again, or writes the PDF, the EPUB or the SCORM package again, and waits for it: the answer carries the viewer's status (pages, file size, an EPUB's warnings). print opens the browser's print dialog on the PDF on screen, for the reader to confirm. download saves the PDF or EPUB on screen through the browser, as it is, even when the book has changed since (sandbox_export writes a fresh file and can hand its bytes back). On the SCORM tab, download writes the package of the chapters and sections ticked and saves it. play_video plays a video of the pages in the Folio (on the open spread) or the HTML viewer, as a click on it does: the one of a resource, on a page or at a point, or the first one on show; stop_video stops them. A viewer other than the one on screen is switched to first. sandbox_set_view changes a viewer's settings; sandbox_go_to_page turns its pages.",
    inputSchema: {
      type: 'object',
      properties: {
        viewer: { type: 'string', enum: VIEWPORT_TABS, description: 'The viewer tab to act in; the one on screen when left out. Another one is switched to.' },
        action: { type: 'string', enum: ACTIONS, description: 'regenerate: every viewer. print: pdf. download: pdf, epub, scorm. play_video, stop_video: folio, html.' },
        wait: { type: 'boolean', description: 'regenerate: wait until the pages are laid out or the file is written (default true; a PDF or an EPUB of a long book takes minutes). false answers at once, with the status as the work starts.' },
        resource: { type: 'string', description: 'play_video: the id of the video resource to play.' },
        page: { type: 'integer', description: 'play_video: the page the video is on, by the number printed on it.' },
        x: { type: 'number', minimum: 0, maximum: 1, description: 'play_video: with y, a point on the video, as fractions of its page (as bound, without the margin of bleed) from the top left corner.' },
        y: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['action'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const action = args.action as ViewerAction;
      const tab = (args.viewer as ViewportTab | undefined) ?? store.getSnapshot().activeViewport;
      const takes = ACTION_VIEWERS[action];
      if (takes && !takes.includes(tab)) {
        throw new ToolError(`${action} is a command of the ${takes.length > 1 ? `${takes.slice(0, -1).join(', ')} and ${takes[takes.length - 1]}` : takes[0]} viewer${takes.length > 1 ? 's' : ''}, and the viewer is ${tab}. Set "viewer" to switch.`);
      }
      if (action !== 'play_video') {
        const stray = VIDEO_PARAMS.filter((name) => args[name] !== undefined);
        if (stray.length > 0) throw new ToolError(`${stray.join(', ')} say${stray.length > 1 ? '' : 's'} which video to play: ${stray.length > 1 ? 'they go' : 'it goes'} with action play_video, not ${action}.`);
      }
      if (action !== 'regenerate' && args.wait !== undefined) throw new ToolError(`wait goes with action regenerate, not ${action}.`);
      if ((args.x === undefined) !== (args.y === undefined)) throw new ToolError('A point needs both x and y.');
      if (args.viewer === 'folio' && !folioSupported()) throw new ToolError('This browser cannot show the Folio (it needs WebGL 2). The canvas shows the same pages flat.');

      if (store.getSnapshot().activeViewport !== tab) await dispatchAndWait(host, { type: 'SET_VIEWPORT', payload: tab });
      const controls = await controlsOf(tab);
      const answer = (extra: Record<string, unknown>) => ({ viewer: tab, ...extra, [tab]: compactStatus(controls.status()) });

      if (action === 'regenerate') {
        // The book's last change reaches the viewer before it is asked.
        await whenSettled(host, { signal });
        // The tab's state follows its last render.
        await sleep(80);
        const underWay = controls.status().generating;
        if (args.wait === false) {
          // The button is off while the viewer is at work.
          if (!underWay) void Promise.resolve().then(() => controls.regenerate()).catch(() => undefined);
          await sleep(80);
          return answer({ regenerating: true, ...(underWay ? { alreadyUnderWay: true } : {}) });
        }
        const isFile = tab === 'pdf' || tab === 'epub' || tab === 'scorm';
        let status = underWay ? await whenViewerIdle(tab, controls, { signal }) : controls.status();
        // What was under way is the fresh file, unless the book changed
        // meanwhile or it failed.
        const again = !underWay || status.stale === true || !!status.error || (isFile && !controls.file?.());
        if (again) {
          await controls.regenerate();
          // A preview starts its layout on its next render.
          if (!isFile) for (let tries = 0; tries < 5 && !controls.status().generating; tries++) await sleep(60);
          status = await whenViewerIdle(tab, controls, { signal });
        }
        if (status.error) throw new ToolError(`The ${tab.toUpperCase()} could not be written: ${status.error}`);
        return answer({ regenerated: true, ...(again ? {} : { note: 'The viewer was writing it already: that run was waited for, not started again.' }) });
      }

      if (action === 'print') {
        fileOnScreen('pdf', controls);
        if (!controls.print) throw new ToolError('The PDF viewer cannot print from here.');
        const stale = controls.status().stale === true;
        // The dialog holds the page until the reader answers it: the
        // answer leaves first.
        setTimeout(() => controls.print?.(), 60);
        return answer({
          printing: true,
          note: `The browser's print dialog opens on the PDF for the reader to confirm; nothing is printed from here.${stale ? ' The book changed since this PDF was written: regenerate first to print it as it is now.' : ''}`,
        });
      }

      if (action === 'download' && tab === 'scorm') {
        // The SCORM tab writes its package on the click, of what is ticked.
        if (!controls.download) throw new ToolError('The SCORM viewer cannot download from here.');
        if (controls.status().generating) throw new ToolError('The SCORM package is being written: its button is off until it is.');
        controls.download();
        return answer({ downloading: true, note: 'The book is laid out and the package of what the tree ticks written, then saved by the reader\'s browser. sandbox_run_viewer with action regenerate writes it and waits.' });
      }

      if (action === 'download') {
        const file = fileOnScreen(tab as 'pdf' | 'epub', controls);
        if (!controls.download) throw new ToolError(`The ${tab} viewer cannot download from here.`);
        const stale = controls.status().stale === true;
        controls.download();
        return answer({
          downloaded: file.name,
          size: file.bytes.byteLength,
          note: `Saved by the reader's browser, as the file on screen.${stale ? ' The book changed since it was written.' : ''} sandbox_export writes a fresh file and hands its bytes back with deliver: "data".`,
        });
      }

      if (action === 'stop_video') {
        if (!controls.stopVideo) throw new ToolError(`The ${tab} viewer plays no videos.`);
        controls.stopVideo();
        await sleep(120);
        return answer({ stopped: true });
      }

      // play_video
      if (!controls.playVideo) throw new ToolError(`The ${tab} viewer plays no videos.`);
      // The pages are there once the viewer has laid them out.
      await whenViewerIdle(tab, controls, { timeoutMs: host.settleTimeoutMs ?? SETTLE_TIMEOUT_MS, signal });
      const result = await controls.playVideo({
        ...(args.resource !== undefined ? { resource: args.resource as string } : {}),
        ...(args.page !== undefined ? { pageNumber: args.page as number } : {}),
        ...(args.x !== undefined ? { x: args.x as number, y: args.y as number } : {}),
      });
      if (!result.played) {
        const named = VIDEO_PARAMS.some((name) => args[name] !== undefined);
        if (result.reason === 'elsewhere') {
          throw new ToolError(`That video is on page ${(result.pageNumbers ?? []).join(', ')}, and the Folio plays a video only on the spread it is open at: sandbox_go_to_page there, then play it.`);
        }
        if (result.reason === 'refused') {
          throw new ToolError(`The ${tab} viewer could not play the video of ${result.resource ?? 'that resource'}: it has no file or address to play from, or the browser refused it.`);
        }
        const videos = listVideos(controls.status().videos);
        const scope = tab === 'folio' ? 'on the open spread' : 'in the document on screen';
        throw new ToolError(`${named ? 'No video the viewer can play matches that' : 'There is no video the viewer can play'} ${scope}${videos ? `. The videos there: ${videos}` : ''}. A video is played here when it is a file or a stream address (a YouTube or Vimeo video shows its own player or its poster)${tab === 'html' ? ' and the HTML output sets a player for it' : ''}.`);
      }
      // The player reports its state a moment after it is asked.
      let state: ViewerVideo['state'] = 'stopped';
      for (let tries = 0; tries < 10 && state !== 'playing'; tries++) {
        await sleep(150);
        state = controls.status().videos?.find((v) => v.resource === result.resource && v.pageNumber === result.pageNumber)?.state ?? 'stopped';
      }
      const notes = [
        ...(result.already ? ['It was playing already.'] : []),
        ...(result.muted ? ['The browser lets a video start with its sound only after the reader has clicked on the page: it plays muted.'] : []),
        ...(result.loading || state !== 'playing' ? ['The viewer took the request and the video does not show yet: it is still loading, or its file could not be read (a server that does not let this page read it). The status says playing once it does.'] : []),
      ];
      return answer({ video: { resource: result.resource, page: result.pageNumber, state }, ...(notes.length > 0 ? { notes } : {}) });
    },
  };

  return [runViewer];
}
