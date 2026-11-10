// Find and replace in the book's text, for agents: the find bar's compiler
// and worker (book/find, editor/find/findClient.ts), so a query finds the
// same matches here as in the bar, and a replacement writes the same text.

import { DEFAULT_FIND_OPTIONS, MAX_MATCHES, type FindMatch, type FindOptions } from '../../book/find/compile.js';
import { replaceChanges } from '../../book/find/replace.js';
import { applyTextChanges } from '../../book/textChanges.js';
import type { SandboxState } from '../../context/SandboxContext.js';
import { applyViewerEdits } from '../../editor/viewerEdits.js';
import { sharedFindClient } from '../../editor/find/findClient.js';
import type { ChapterMatches } from '../../book/find/session.js';
import { chapterText, stateReaches } from '../chapterEdits.js';
import { chapterOf, layOutChapter, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { pagesOfOffset } from '../pageText.js';
import { CHAPTER_PARAM, UNDO_HINT, WAIT_PARAM, layoutAnswer } from './book.js';

/** How long the tools let a search run: longer than the bar's budget, for
 *  a complete answer. */
const TOOL_BUDGET_MS = 1000;
const LANDING_MS = 5000;

const OPTION_PARAMS = {
  matchCase: { type: 'boolean', description: 'Upper and lower case differ (default false).' },
  wholeWord: { type: 'boolean', description: 'Only whole words. In Chinese, Japanese and Thai the word boundaries are the browser\'s word segmenter\'s.' },
  ignoreAccents: { type: 'boolean', description: 'Accented and plain letters match each other (celula finds célula; Arabic pointing is ignored). Ñ, ç, й and ё stay letters of their own. Plain text only.' },
  regex: { type: 'boolean', description: 'The query is a JavaScript regular expression (Unicode; ^ and $ at line ends). In the replacement, $1…$99, $<name>, $&, $$, \\n, \\t and \\\\ are read; everything else is literal.' },
} as const;

function optionsOf(args: Record<string, unknown>): FindOptions {
  return {
    ...DEFAULT_FIND_OPTIONS,
    matchCase: args.matchCase === true,
    wholeWord: args.wholeWord === true,
    ignoreAccents: args.ignoreAccents === true,
    regex: args.regex === true,
  };
}

/** The chapters in scope, in book order, with their current text. */
function scopeChapters(s: SandboxState, only: number | null): { id: string; index: number; text: string }[] {
  return s.chapters.flatMap((c, index) => (only !== null && only !== index ? [] : [{ id: c.id, index, text: chapterText(s, c.id)! }]));
}

async function runSearch(query: string, options: FindOptions, chapters: { id: string; text: string }[], maxMatches: number): Promise<{ results: ChapterMatches[]; stopped: 'count' | 'time' | null }> {
  if (query === '') throw new ToolError('The query is empty.');
  const answer = await sharedFindClient().search({ query, options, chapters, budgetMs: TOOL_BUDGET_MS, maxMatches });
  if ('superseded' in answer) throw new ToolError('Another search started before this one ran; ask again.');
  if ('error' in answer) throw new ToolError(`The regular expression does not compile: ${answer.error}`);
  if (answer.stopped === 'timeout') throw new ToolError('The regular expression takes too long to run (it backtracks without end, as (a+)+$ does). Write it so that each character can be matched one way only.');
  return { results: answer.results, stopped: answer.stopped };
}

function lineAt(text: string, offset: number): { line: number; text: string } {
  let line = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < offset; i = text.indexOf('\n', i + 1)) line++;
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const end = text.indexOf('\n', offset);
  const whole = text.slice(start, end === -1 ? text.length : end);
  return { line, text: whole.length > 240 ? `${whole.slice(0, 240)}…` : whole };
}

export function findTextTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const searchText: WebMcpTool = {
    name: 'sandbox_search_text',
    title: 'Sandbox: find text in the book',
    description: 'Where a word, a passage or a regular expression occurs in the Markdown source: the chapter, the line and the line itself, and, with pages set, the page each occurrence is set on (the chapters that hold one are laid out for it). The same search as the find bar of the Manuscript panel.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The text (or with regex, the expression) to look for.' },
        chapter: { ...CHAPTER_PARAM, description: 'Search this chapter only (position from 1, title or id). Every chapter when left out.' },
        ...OPTION_PARAMS,
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
      const chapters = scopeChapters(s, only);
      const { results, stopped } = await runSearch(args.query as string, optionsOf(args), chapters, limit + 1);
      const byId = new Map(chapters.map((c) => [c.id, c]));
      const matches: Record<string, unknown>[] = [];
      for (const r of results) {
        const c = byId.get(r.chapterId)!;
        const doc = args.pages ? (await layOutChapter(host, c.id, signal)).doc : null;
        for (const m of r.matches) {
          if (matches.length >= limit) break;
          const on = doc ? pagesOfOffset(doc, m.from) : [];
          matches.push({
            chapter: c.index + 1,
            ...lineAt(c.text, m.from),
            match: c.text.slice(m.from, m.to),
            ...(doc ? { pagePositions: on, pageLabels: on.map((p) => doc.pages[p - 1]!.pageLabel) } : {}),
          });
        }
      }
      const total = results.reduce((n, r) => n + r.matches.length, 0);
      return {
        matches,
        ...(total > limit ? { more: true } : {}),
        ...(stopped === 'time' ? { stopped: 'The search ran out of time before the end of the book: the list is incomplete. Narrow the query or search one chapter.' } : {}),
      };
    },
  };

  const replaceText: WebMcpTool = {
    name: 'sandbox_replace_text',
    title: 'Sandbox: find and replace',
    description: "Replace every occurrence of a word, a passage or a regular expression in one chapter or in the whole book, as the find bar's Replace all does. With dryRun it lists what would change and changes nothing. Applied, the replacements are one change of the history: sandbox_undo takes them back at once (sandbox_undo_text too, when they touched one chapter). For one exact passage, sandbox_edit_text.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The text (or with regex, the expression) to replace.' },
        replace: { type: 'string', description: 'What takes its place (empty to delete). Plain text is written as it is; with regex, see regex.' },
        scope: { type: 'string', enum: ['chapter', 'book'], description: 'One chapter (chapter, or the one on screen) or every chapter.' },
        chapter: { ...CHAPTER_PARAM, description: 'With scope chapter: the chapter (position from 1, title or id); the chapter on screen when left out.' },
        ...OPTION_PARAMS,
        dryRun: { type: 'boolean', description: 'List the replacements (up to limit) and their count without changing anything.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'With dryRun, most replacements to list (default 40).' },
        wait: WAIT_PARAM,
      },
      required: ['query', 'replace', 'scope'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const options = optionsOf(args);
      const only = args.scope === 'chapter' ? chapterOf(s, args.chapter).index : null;
      if (args.scope === 'book' && args.chapter !== undefined) throw new ToolError('chapter goes with scope "chapter"; scope "book" replaces in every chapter.');
      const chapters = scopeChapters(s, only);
      const { results, stopped } = await runSearch(args.query as string, options, chapters, MAX_MATCHES);
      if (stopped) {
        throw new ToolError(stopped === 'count'
          ? `The query matches more than ${MAX_MATCHES} times: nothing was replaced. Narrow it, or replace chapter by chapter.`
          : 'The search ran out of time before the end, so not every match is known: nothing was replaced. Narrow the query, or replace chapter by chapter.');
      }
      const byId = new Map(chapters.map((c) => [c.id, c]));
      const template = args.replace as string;
      const edits = results.map((r) => {
        const c = byId.get(r.chapterId)!;
        const pairs = r.matches.map((m: FindMatch) => ({ m, change: replaceChanges(c.text, [m], template, options.regex)[0]! }))
          .filter((p) => p.change.insert !== p.change.expect);
        return { chapter: c, pairs };
      }).filter((e) => e.pairs.length > 0);
      const count = edits.reduce((n, e) => n + e.pairs.length, 0);
      const chaptersTouched = edits.map((e) => e.chapter.index + 1);
      if (args.dryRun === true) {
        const limit = (args.limit as number | undefined) ?? 40;
        const list = edits.flatMap((e) => e.pairs.map((p) => {
          const after = applyTextChanges(e.chapter.text.slice(p.m.from, p.m.to), [{ ...p.change, from: p.change.from - p.m.from, to: p.change.to - p.m.from }]);
          return { chapter: e.chapter.index + 1, line: lineAt(e.chapter.text, p.m.from).line, before: e.chapter.text.slice(p.m.from, p.m.to), after };
        })).slice(0, limit);
        return { dryRun: true, count, chapters: chaptersTouched, replacements: list, ...(count > list.length ? { more: true } : {}) };
      }
      if (count === 0) return { replaced: 0, changed: false };
      const after = new Map(edits.map((e) => [e.chapter.id, applyTextChanges(e.chapter.text, e.pairs.map((p) => p.change))]));
      applyViewerEdits(
        (a) => store.dispatch(a),
        edits.map((e) => ({ chapterId: e.chapter.id, changes: e.pairs.map((p) => p.change), baseLength: e.chapter.text.length })),
        s.activeChapterId,
      );
      const landed = await stateReaches(host, () => {
        const now = store.getSnapshot();
        return [...after].every(([id, text]) => chapterText(now, id) === text);
      }, LANDING_MS);
      if (!landed) throw new ToolError('The book changed while the replacements were on their way, so some may not have been made. Search again and replace in the text as it is now.');
      return {
        replaced: count,
        changed: true,
        chapters: chaptersTouched,
        undo: edits.length > 1 ? 'sandbox_undo takes all these replacements back at once.' : UNDO_HINT,
        ...(await layoutAnswer(host, args.wait, signal)),
      };
    },
  };

  return [searchText, replaceText];
}
