// The book's text: what is open, its chapters, reading and editing them.

import { newChapter, wordCount } from '../../book/chapterOps.js';
import { chapterPageLabels } from '../../book/pagination.js';
import type { SandboxAction, SandboxState } from '../../context/SandboxContext.js';
import { importMarkdownFile } from '../../storage/persistence.js';
import { generateChapterId } from '../../storage/projects.js';
import { chapterText, editChapter, stateReaches, undoChapterEdit } from '../chapterEdits.js';
import { bookPagesSummary, chapterOf, dispatchAndWait, isSettled, layOutChapter, whenSettled, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { pagesOfOffset } from '../pageText.js';
import { applyFindReplace, findInText, numberedLines } from '../textEdits.js';
import { describeRange, lineRange, occurrencesOf, positionOf } from '../textPositions.js';
import { readFileInput, type FileInput } from './resources.js';
import { viewState } from './view.js';
import { historyState } from './history.js';

export const CHAPTER_PARAM = {
  type: ['integer', 'string'],
  description: 'The chapter: its position in the book (from 1), its title or its id. The chapter on screen when left out.',
} as const;

export const WAIT_PARAM = {
  type: 'boolean',
  description: 'Wait for the book to be laid out again and answer with the pages each chapter came to (default true). False answers at once.',
} as const;

/** A file handed to a tool: where to fetch it, or its bytes. */
export function fileParam(description: string) {
  return {
    type: 'object',
    description,
    properties: {
      url: { type: 'string', description: 'An http(s) or data: URL the page can fetch.' },
      base64: { type: 'string', description: 'The bytes, base64-encoded.' },
      mimeType: { type: 'string', description: 'Its media type. Read from the response or the file name when left out.' },
      fileName: { type: 'string', description: 'Its file name, with its extension.' },
    },
    additionalProperties: false,
  } as const;
}

/** What an answer says after a text edit that can be taken back. */
export const UNDO_HINT = 'sandbox_undo_text takes this edit back.';

/** How long the Manuscript editor is given to take a caret request. */
const EDITOR_TAKES_MS = 1500;

/** What a tool that changed the book answers with: its pages once laid
 *  out again, or `laidOut: false` when it was told not to wait. */
export async function layoutAnswer(host: SandboxToolHost, wait: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
  if (wait === false) return { laidOut: false };
  const laidOut = await whenSettled(host, { signal });
  return { laidOut, book: bookPagesSummary(host) };
}

/** The book on screen: a project of the reader's, or a sample. */
export function bookIdentity(host: SandboxToolHost): Record<string, unknown> {
  const s = host.store.getSnapshot();
  if (s.activeProjectId) {
    const project = s.projects.find((p) => p.id === s.activeProjectId);
    return { kind: 'project', id: s.activeProjectId, name: project?.name ?? null, ...(project?.locale ? { language: project.locale } : {}) };
  }
  const preset = s.presetSummaries.find((p) => p.id === s.activePresetId);
  const language = s.presetApplied?.presetId === s.activePresetId ? s.presetApplied.locale : undefined;
  return { kind: 'sample', id: s.activePresetId, name: preset?.name ?? null, ...(language ? { language } : {}) };
}

/** The question the Sandbox is asking the reader, when a link names a
 *  book they have their own version of: what it asks and how a tool
 *  answers it. */
export function pendingQuestion(s: SandboxState): Record<string, unknown> | null {
  const prompt = s.bundleReplacePrompt;
  if (!prompt) return null;
  const sample = prompt.kind === 'preset';
  return {
    about: sample ? 'sample' : 'project',
    id: prompt.id,
    name: prompt.name,
    asks: sample
      ? `The link opens the sample "${prompt.name}", which the reader has edited: open their version, or put the original back (their changes are deleted)?`
      : `The link opens "${prompt.name}", which is already among the reader's projects, perhaps with their own changes: open their copy, or replace it with the published version (their copy and its changes are deleted)?`,
    answer: 'sandbox_answer with replaceCopy: false keeps the reader\'s version (what closing the dialog does), replaceCopy: true replaces it. Ask the reader before replacing.',
  };
}

/** What `ready: false` is waiting for. */
function waitingFor(s: SandboxState): string | null {
  if (s.bundleReplacePrompt) return 'A question for the reader is open (see question): the book opens once it is answered.';
  if (!s.storeReady) return 'The books kept in this browser are being read.';
  if (s.booting) return 'The book the address names is being opened.';
  if (s.bookLoading) return 'Another book is being opened.';
  return null;
}

/** The caret or the selection of the Manuscript editor, in the chapter on
 *  screen; nothing while the caret has never left the start. */
function editorSelection(s: SandboxState): Record<string, unknown> {
  const { from, to } = s.selection;
  if (from === to && from === 0 && !s.editorFocused) return {};
  return describeRange(s.markdown, s.chapters.findIndex((c) => c.id === s.activeChapterId) + 1, from, to);
}

/** What the Books panel says besides its lists: the last operation's
 *  notice and status, and a sample that changed where it comes from. */
function libraryStanding(s: SandboxState): Record<string, unknown> {
  const status = {
    ...(s.projectStatus !== 'idle' ? { project: s.projectStatus, ...(s.projectStatus === 'error' && s.projectError ? { projectError: s.projectError } : {}) } : {}),
    ...(s.presetStatus !== 'idle' ? { sample: s.presetStatus, ...(s.presetStatus === 'error' && s.presetError ? { sampleError: s.presetError } : {}) } : {}),
  };
  const question = pendingQuestion(s);
  return {
    ...(s.projectNotice ? { notice: s.projectNotice } : {}),
    ...(Object.keys(status).length > 0 ? { status } : {}),
    ...(s.presetUpdatedAt !== null ? { sampleUpdated: true, sampleUpdatedAt: new Date(s.presetUpdatedAt).toISOString() } : {}),
    ...(s.presetStale && s.activeProjectId === null ? { sampleStale: true } : {}),
    ...(question ? { question } : {}),
  };
}

export function bookTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const getState: WebMcpTool = {
    name: 'sandbox_get_state',
    title: 'Sandbox: what is open',
    description: 'The book open in the Postext Sandbox and how it is shown: its chapters with their page ranges, the chapter and page on screen, the viewer tab and its display settings, the open side panel, the interface language, the selection (or the caret) of the Manuscript editor, the resource open in the Resources panel, how many warnings the layout has, and the change sandbox_undo would take back and the one it would put back (history). What needs attention is added when there is any: waitingFor (why ready is false), notice (the Books panel\'s message, cleared with sandbox_answer), status (an operation on the books that is busy or failed), sampleUpdated (the sample on screen was reloaded because its source changed), sampleStale (its source changed but the reader\'s edits were kept; sandbox_reset_to_original loads the new version) and question (a dialog asking the reader something, answered with sandbox_answer). Start here, and call it again to see where things stand.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => {
      const s = store.getSnapshot();
      const plan = store.getPlan(s);
      const summary = bookPagesSummary(host, s);
      const ready = s.storeReady && !s.booting && !s.bookLoading;
      const waiting = ready ? null : waitingFor(s);
      return {
        ready,
        ...(waiting ? { waitingFor: waiting } : {}),
        laidOut: isSettled(host, s),
        book: bookIdentity(host),
        interfaceLanguage: s.locale,
        pages: summary.pages,
        chapters: s.chapters.map((c, i) => {
          const pages = plan.bookPages[c.id];
          const labels = pages ? chapterPageLabels(pages) : null;
          return {
            chapter: i + 1,
            id: c.id,
            title: c.title,
            ...(c.id === s.activeChapterId ? { onScreen: true } : {}),
            characters: c.markdown.length,
            words: wordCount(c.markdown),
            pages: plan.byId[c.id]?.layout?.pageCount ?? null,
            ...(labels ? { firstPage: labels.from, lastPage: labels.to } : {}),
          };
        }),
        view: viewState(host),
        ...editorSelection(s),
        resources: s.resources.length,
        ...(s.activeResourceId !== null ? { openResource: s.activeResourceId } : {}),
        warnings: store.getWarnings(s).length,
        ...historyState(host),
        ...libraryStanding(s),
      };
    },
  };

  const readText: WebMcpTool = {
    name: 'sandbox_read_text',
    title: 'Sandbox: read a chapter',
    description: "A chapter's Markdown source, each line behind its number. Postext's Markdown has its own extensions (directives such as ::resource, :ref, :::callout, front matter on the first chapter): the format is documented at /docs/document-format. Long chapters can be read in parts with fromLine and toLine.",
    inputSchema: {
      type: 'object',
      properties: {
        chapter: CHAPTER_PARAM,
        fromLine: { type: 'integer', minimum: 1, description: 'First line to read (from 1).' },
        toLine: { type: 'integer', minimum: 1, description: 'Last line to read, inclusive.' },
        plain: { type: 'boolean', description: 'Give the text as it is, without line numbers.' },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: (args) => {
      const s = store.getSnapshot();
      const { chapter, index } = chapterOf(s, args.chapter);
      const text = chapterText(s, chapter.id)!;
      const part = numberedLines(text, args.fromLine as number | undefined, args.toLine as number | undefined);
      return {
        chapter: index + 1,
        title: chapter.title,
        lines: part.total,
        fromLine: part.from,
        toLine: part.to,
        text: args.plain ? text.split('\n').slice(part.from - 1, part.to).join('\n') : part.text,
      };
    },
  };

  const writeText: WebMcpTool = {
    name: 'sandbox_write_text',
    title: 'Sandbox: replace a chapter',
    description: "Replace a chapter's whole Markdown source with new text, given here (markdown) or read from a Markdown file (file, as the Manuscript panel's import does). For a change to part of a chapter, sandbox_edit_text keeps the rest untouched; a Word document goes through sandbox_import_word. The text it replaces comes back with sandbox_undo_text.",
    inputSchema: {
      type: 'object',
      properties: {
        chapter: CHAPTER_PARAM,
        markdown: { type: 'string', description: "The chapter's new Markdown source. Give this or file, not both." },
        file: fileParam('A Markdown file (.md) whose text becomes the chapter\'s source: where to fetch it (url) or its bytes (base64). Give this or markdown, not both.'),
        wait: WAIT_PARAM,
      },
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      if ((args.markdown === undefined) === (args.file === undefined)) {
        throw new ToolError('Give the new text as "markdown", or a Markdown file as "file": one of the two.');
      }
      let markdown = args.markdown as string | undefined;
      let fileName: string | undefined;
      if (markdown === undefined) {
        const file = await readFileInput(args.file as FileInput, signal);
        fileName = file.name;
        try {
          // The panel reads the file with a FileReader, which only a browser has.
          markdown = typeof FileReader === 'undefined' ? await file.text() : await importMarkdownFile(file);
        } catch {
          throw new ToolError(`${file.name} could not be read as text.`);
        }
      }
      // Read after the file: the chapter may have changed while it was fetched.
      const s = store.getSnapshot();
      const { chapter, index } = chapterOf(s, args.chapter);
      const changed = await editChapter(host, chapter.id, chapterText(s, chapter.id)!, markdown);
      return {
        chapter: index + 1,
        changed,
        characters: markdown.length,
        ...(fileName ? { file: fileName } : {}),
        ...(changed ? { undo: UNDO_HINT } : {}),
        ...(await layoutAnswer(host, args.wait, signal)),
      };
    },
  };

  const editText: WebMcpTool = {
    name: 'sandbox_edit_text',
    title: 'Sandbox: edit a chapter',
    description: "Change passages of a chapter's Markdown source: each edit finds an exact passage and puts another in its place. The passage must match the source exactly and occur once (or set all to change every occurrence). Edits apply in order. Nothing is changed unless every edit applies. The call is one step for sandbox_undo_text, which takes it back whole.",
    inputSchema: {
      type: 'object',
      properties: {
        chapter: CHAPTER_PARAM,
        edits: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              find: { type: 'string', description: 'The exact text to replace, as it is in the source.' },
              replace: { type: 'string', description: 'The text that takes its place (empty to delete).' },
              all: { type: 'boolean', description: 'Replace every occurrence.' },
            },
            required: ['find', 'replace'],
            additionalProperties: false,
          },
        },
        wait: WAIT_PARAM,
      },
      required: ['edits'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const { chapter, index } = chapterOf(s, args.chapter);
      const before = chapterText(s, chapter.id)!;
      const { text, applied } = applyFindReplace(before, args.edits as { find: string; replace: string; all?: boolean }[]);
      const changed = await editChapter(host, chapter.id, before, text);
      return { chapter: index + 1, changed, edits: applied, ...(changed ? { undo: UNDO_HINT } : {}), ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  const undoText: WebMcpTool = {
    name: 'sandbox_undo_text',
    title: 'Sandbox: take back a text edit',
    description: "Take back the last change when it is an edit to a chapter's text, or with redo put back the last one taken back. The Sandbox keeps one history of text and design, in the order the changes were made (the one Cmd/Ctrl+Z undoes): text typed in the Manuscript editor, the edits the reader made on the previews (a comic panel resized, a frame's text), and what sandbox_write_text, sandbox_edit_text and sandbox_import_word (into a chapter) changed, one call at a time, latest first whatever the chapter. When the last change was to the design it is refused, with the settings it touched: sandbox_undo takes back the last change whatever it is, and so are the changes of sandbox_apply_word_edits, which sandbox_undo takes back together. Chapters added, removed, split, merged or moved, resources and fonts are not in the history, and opening another book empties it. An edit is taken back over the changes made to the chapter since by other means, which stay. The history is kept for this visit: it is empty after the page is reloaded.",
    inputSchema: {
      type: 'object',
      properties: {
        redo: { type: 'boolean', description: 'Put back the last edit taken back, instead of taking one back.' },
        chapter: { ...CHAPTER_PARAM, description: 'Only when the edit is to this chapter (position from 1, title or id): an edit to another one is refused, with where it is. Whatever chapter when left out.' },
        wait: WAIT_PARAM,
      },
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const redo = args.redo === true;
      const only = args.chapter === undefined ? undefined : chapterOf(store.getSnapshot(), args.chapter).chapter.id;
      const done = await undoChapterEdit(host, redo, only);
      const s = store.getSnapshot();
      const index = s.chapters.findIndex((c) => c.id === done.chapterId);
      return {
        [redo ? 'redone' : 'undone']: true,
        chapter: index + 1,
        title: s.chapters[index]!.title,
        characters: done.text.length,
        canUndo: done.canUndo,
        canRedo: done.canRedo,
        ...(await layoutAnswer(host, args.wait, signal)),
      };
    },
  };

  const selectText: WebMcpTool = {
    name: 'sandbox_select_text',
    title: 'Sandbox: place the caret or select text',
    description: "Place the caret of the Manuscript editor, or select a stretch of a chapter's source, as a click on a finding of the Checks panel does: the chapter is shown, the Manuscript panel opened, and the editor scrolls to the place and takes the keyboard. Say where with one of: text (an exact passage, selected), line (the caret at its start; with toLine, those lines selected whole) or offset (a caret; with toOffset, a selection). Answers with the selection or the caret as sandbox_get_state reports it. To show a printed page instead, sandbox_go_to_page; to change the text, sandbox_edit_text.",
    inputSchema: {
      type: 'object',
      properties: {
        chapter: CHAPTER_PARAM,
        text: { type: 'string', description: 'An exact passage of the source to select. It must occur once in the chapter, unless occurrence says which.' },
        occurrence: { type: 'integer', minimum: 1, description: 'text: which occurrence of the passage (from 1), when it occurs more than once.' },
        line: { type: 'integer', minimum: 1, description: 'A line of the source (from 1, as sandbox_read_text numbers them): the caret goes to its start.' },
        toLine: { type: 'integer', minimum: 1, description: 'line: select from that line to this one, both whole.' },
        offset: { type: 'integer', minimum: 0, description: 'A place in the source counted in characters from its start: the caret goes there.' },
        toOffset: { type: 'integer', minimum: 0, description: 'offset: select from that offset up to this one.' },
        openPanel: { type: 'boolean', description: 'Open the Manuscript panel so the editor shows the place (default true). False leaves the side panel as it is: the caret is then placed when the panel is next opened.' },
      },
      additionalProperties: false,
    },
    annotations: { untrustedContentHint: true },
    execute: async (args) => {
      const s = store.getSnapshot();
      const { chapter, index } = chapterOf(s, args.chapter);
      const text = chapterText(s, chapter.id)!;
      const ways = (['text', 'line', 'offset'] as const).filter((k) => args[k] !== undefined);
      if (ways.length !== 1) throw new ToolError('Say where with one of "text" (an exact passage), "line" or "offset".');
      const stray = ([['occurrence', 'text'], ['toLine', 'line'], ['toOffset', 'offset']] as const).find(([extra, way]) => args[extra] !== undefined && ways[0] !== way);
      if (stray) throw new ToolError(`"${stray[0]}" goes with "${stray[1]}", not with "${ways[0]}".`);
      let anchor: number;
      let head: number;
      if (args.text !== undefined) {
        const passage = args.text as string;
        if (passage === '') throw new ToolError('"text" is empty. For a caret, give a line or an offset.');
        const found = occurrencesOf(text, passage);
        const where = `chapter ${index + 1} (${chapter.title})`;
        if (found.length === 0) throw new ToolError(`The passage is not in ${where}. It must match the source exactly, spaces and line breaks included; sandbox_search_text finds the chapter and the line a word is on.`);
        const nth = args.occurrence as number | undefined;
        if (nth === undefined && found.length > 1) {
          throw new ToolError(`The passage occurs ${found.length} times in ${where} (lines ${found.map((o) => positionOf(text, o).line).join(', ')}). Give more of the text around it, or say which with "occurrence".`);
        }
        if (nth !== undefined && nth > found.length) throw new ToolError(`The passage occurs ${found.length} time(s) in ${where}; occurrence ${nth} is not one of them.`);
        anchor = found[(nth ?? 1) - 1]!;
        head = anchor + passage.length;
      } else if (args.line !== undefined) {
        const lines = text.split('\n').length;
        const first = lineRange(text, args.line as number);
        const last = args.toLine === undefined ? null : lineRange(text, args.toLine as number);
        if (!first || (args.toLine !== undefined && !last)) throw new ToolError(`Chapter ${index + 1} has ${lines} line(s).`);
        if (last && last.start < first.start) throw new ToolError('"toLine" comes before "line".');
        anchor = first.start;
        head = last ? last.end : first.start;
      } else {
        anchor = args.offset as number;
        head = (args.toOffset as number | undefined) ?? anchor;
        if (anchor > text.length || head > text.length) throw new ToolError(`Chapter ${index + 1} is ${text.length} characters long.`);
        if (head < anchor) throw new ToolError('"toOffset" comes before "offset".');
      }
      const actions: SandboxAction[] = [];
      if (args.openPanel !== false && s.activePanel !== 'markdown') actions.push({ type: 'SET_PANEL', payload: 'markdown' });
      actions.push({ type: 'SET_PENDING_EDITOR_FOCUS', payload: { chapterId: chapter.id, anchor, head, selectWord: false } });
      await dispatchAndWait(host, actions);
      // The editor takes the request once it is on screen, and reports the
      // selection it made.
      const taken = await stateReaches(host, () => store.getSnapshot().pendingEditorFocus === null, Math.min(EDITOR_TAKES_MS, host.settleTimeoutMs ?? EDITOR_TAKES_MS));
      const after = store.getSnapshot();
      const answer = { chapter: index + 1, title: chapter.title };
      if (taken && after.activeChapterId === chapter.id) {
        return { ...answer, placed: true, ...describeRange(after.markdown, index + 1, after.selection.from, after.selection.to) };
      }
      return {
        ...answer,
        placed: false,
        ...describeRange(text, index + 1, anchor, head),
        note: after.activePanel === 'markdown'
          ? 'The Manuscript editor has not taken the request yet; sandbox_get_state says where the caret is once it has.'
          : 'The Manuscript panel is not open: the caret is placed when it opens (sandbox_set_view with panel: "markdown").',
      };
    },
  };

  const searchText: WebMcpTool = {
    name: 'sandbox_search_text',
    title: 'Sandbox: find text in the book',
    description: 'Where a word or passage occurs in the Markdown source: the chapter, the line and the line itself, and, with pages set, the page each occurrence is set on (the chapters that hold one are laid out for it).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The text to look for.' },
        chapter: { ...CHAPTER_PARAM, description: 'Search this chapter only (position from 1, title or id). Every chapter when left out.' },
        matchCase: { type: 'boolean' },
        pages: { type: 'boolean', description: 'Also say which page each occurrence is set on.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Most occurrences to list (default 40).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const only = args.chapter === undefined ? null : chapterOf(s, args.chapter).index;
      const limit = (args.limit as number | undefined) ?? 40;
      const matches: Record<string, unknown>[] = [];
      for (const [i, c] of s.chapters.entries()) {
        if (only !== null && only !== i) continue;
        const text = c.id === s.activeChapterId ? s.markdown : c.markdown;
        const found = findInText(text, args.query as string, { matchCase: !!args.matchCase, limit: limit - matches.length });
        if (found.length === 0) continue;
        const doc = args.pages ? (await layOutChapter(host, c.id, signal)).doc : null;
        for (const m of found) {
          const on = doc ? pagesOfOffset(doc, m.offset) : [];
          matches.push({
            chapter: i + 1,
            line: m.line,
            text: m.text,
            ...(doc ? { pagePositions: on, pageLabels: on.map((p) => doc.pages[p - 1]!.pageLabel) } : {}),
          });
        }
        if (matches.length >= limit) break;
      }
      return { matches, ...(matches.length >= limit ? { more: true } : {}) };
    },
  };

  const manageChapters: WebMcpTool = {
    name: 'sandbox_manage_chapters',
    title: 'Sandbox: arrange the chapters',
    description: "Add a chapter, rename one, move one to another position, split one in two (at a passage, or at every level-1 heading), merge one into the chapter before it, or show one on screen. A chapter's title is its name in the interface, not text of the book.",
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['add', 'rename', 'move', 'split', 'split_at_headings', 'merge_with_previous', 'show'] },
        chapter: CHAPTER_PARAM,
        title: { type: 'string', description: 'add, rename: the title.' },
        markdown: { type: 'string', description: 'add: the new chapter\'s Markdown source.' },
        position: { type: 'integer', minimum: 1, description: 'add, move: where in the book (from 1). add puts the chapter after the one on screen when left out.' },
        before: { type: 'string', description: 'split: the exact passage the second chapter starts with; it must occur once in the chapter.' },
        wait: WAIT_PARAM,
      },
      required: ['action'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const action = args.action as string;
      if (action === 'add') {
        const title = (args.title as string | undefined)?.trim() || s.labels.chapterUntitled.replace('__n__', String(s.chapters.length + 1));
        const chapter = newChapter(generateChapterId(), title, (args.markdown as string | undefined) ?? '');
        const index = args.position === undefined ? undefined : Math.min(s.chapters.length, (args.position as number) - 1);
        await dispatchAndWait(host, { type: 'ADD_CHAPTER', payload: { chapter, ...(index !== undefined ? { index } : {}) } });
        const at = store.getSnapshot().chapters.findIndex((c) => c.id === chapter.id);
        return { added: at + 1, id: chapter.id, title, ...(await layoutAnswer(host, args.wait, signal)) };
      }
      const { chapter, index } = chapterOf(s, args.chapter);
      switch (action) {
        case 'rename': {
          const title = (args.title as string | undefined)?.trim();
          if (!title) throw new ToolError('rename needs a title.');
          await dispatchAndWait(host, { type: 'RENAME_CHAPTER', payload: { id: chapter.id, title } });
          return { chapter: index + 1, title };
        }
        case 'move': {
          if (args.position === undefined) throw new ToolError('move needs the position to move the chapter to (from 1).');
          await dispatchAndWait(host, { type: 'MOVE_CHAPTER', payload: { id: chapter.id, to: (args.position as number) - 1 } });
          const at = store.getSnapshot().chapters.findIndex((c) => c.id === chapter.id);
          return { chapter: at + 1, title: chapter.title, ...(await layoutAnswer(host, args.wait, signal)) };
        }
        case 'split': {
          const text = chapterText(s, chapter.id)!;
          const passage = args.before as string | undefined;
          if (!passage) throw new ToolError('split needs "before": the exact passage the second chapter starts with. To split at every level-1 heading, the action is split_at_headings.');
          const first = text.indexOf(passage);
          if (first < 0) throw new ToolError('The passage to split before is not in the chapter; it must match the source exactly.');
          if (text.indexOf(passage, first + 1) >= 0) throw new ToolError('The passage to split before occurs more than once in the chapter; give more of it.');
          if (first === 0) throw new ToolError('The chapter already starts with that passage.');
          const newId = generateChapterId();
          await dispatchAndWait(host, { type: 'SPLIT_CHAPTER', payload: { id: chapter.id, at: first, newId } });
          return { chapter: index + 1, newChapter: index + 2, id: newId, ...(await layoutAnswer(host, args.wait, signal)) };
        }
        case 'split_at_headings': {
          const text = chapterText(s, chapter.id)!;
          const headings = (text.match(/^#\s+\S/gm) ?? []).length;
          if (headings < 2) throw new ToolError(`The chapter has ${headings} level-1 heading(s); it takes at least two to split at them.`);
          const before = s.chapters.length;
          await dispatchAndWait(host, { type: 'SPLIT_CHAPTER_AT_HEADINGS', payload: { id: chapter.id, newIds: Array.from({ length: headings - 1 }, generateChapterId) } });
          return { chapter: index + 1, chaptersMade: store.getSnapshot().chapters.length - before, ...(await layoutAnswer(host, args.wait, signal)) };
        }
        case 'merge_with_previous': {
          if (index === 0) throw new ToolError('The first chapter has none before it to merge into.');
          await dispatchAndWait(host, { type: 'MERGE_CHAPTER_WITH_PREVIOUS', payload: chapter.id });
          return { mergedInto: index, ...(await layoutAnswer(host, args.wait, signal)) };
        }
        case 'show':
          await dispatchAndWait(host, { type: 'SET_ACTIVE_CHAPTER', payload: chapter.id });
          return { chapter: index + 1, title: chapter.title };
        default:
          throw new ToolError(`Unknown action ${JSON.stringify(action)}.`);
      }
    },
  };

  const removeChapter: WebMcpTool = {
    name: 'sandbox_remove_chapter',
    title: 'Sandbox: delete a chapter',
    description: 'Delete a chapter and its text from the book. It cannot be undone; a book keeps at least one chapter.',
    inputSchema: {
      type: 'object',
      properties: { chapter: { ...CHAPTER_PARAM, description: 'The chapter to delete: its position in the book (from 1), its title or its id.' }, wait: WAIT_PARAM },
      required: ['chapter'],
      additionalProperties: false,
    },
    annotations: { consequentialHint: true },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      if (s.chapters.length < 2) throw new ToolError('This is the only chapter of the book; a book keeps at least one. Its text can be emptied with sandbox_write_text.');
      const { chapter, index } = chapterOf(s, args.chapter);
      await dispatchAndWait(host, { type: 'REMOVE_CHAPTER', payload: chapter.id });
      return { removed: index + 1, title: chapter.title, ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  return [getState, readText, writeText, editText, undoText, selectText, searchText, manageChapters, removeChapter];
}
