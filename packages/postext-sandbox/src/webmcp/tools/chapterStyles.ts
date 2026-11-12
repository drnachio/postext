// Chapter styles for agents (#1521): the book's styles and the chapters
// set in each, a style made, renamed or taken out, and a chapter given its
// style. A style's settings are written with sandbox_set_config and its
// `chapterStyle` argument, as the Design panel edits them.

import { bookSettingsOf, chapterStyleIdOf, chapterStyleOf, openingPart, type ChapterStyleConfig } from 'postext';
import type { SandboxState } from '../../context/SandboxContext.js';
import { setChapterStyle } from '../../book/frontmatter.js';
import { newChapterStyle } from '../../editions/chapterStyleEdit.js';
import { chapterText, editChapter } from '../chapterEdits.js';
import { chapterOf, dispatchAndWait, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { CHAPTER_PARAM, WAIT_PARAM, layoutAnswer } from './book.js';

/** Where each chapter's style comes from: its own front matter, the part
 *  fence it opens with, or the part it belongs to. */
function chapterStyles(host: SandboxToolHost, s: SandboxState): { chapter: number; title: string; style: string | null; from?: 'chapter' | 'part' | 'partBefore' }[] {
  const plan = host.store.getPlan(s);
  return s.chapters.map((c, i) => {
    const text = chapterText(s, c.id) ?? c.markdown;
    const own = chapterStyleOf(text);
    const inherited = plan.byId[c.id]?.continuation?.part?.style;
    const style = chapterStyleIdOf(text, inherited);
    const from = own ? 'chapter' : style && openingPart(text) ? 'part' : style ? 'partBefore' : undefined;
    return { chapter: i + 1, title: c.title, style: style ?? null, ...(from ? { from } : {}) };
  });
}

export function chapterStyleTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const styles: WebMcpTool = {
    name: 'sandbox_chapter_styles',
    title: 'Sandbox: the chapter styles',
    description: "The book's chapter styles (config.chapterStyles): named designs a chapter is set in, each the settings it changes over the book's. Lists every style with the settings it changes (paths) and the chapters set in it, and for each chapter the style it is set in and where that comes from: chapter (its front matter, chapterStyle: <id>), part (the :::part{style} fence it opens with) or partBefore (the part it belongs to, until the next part). action create makes a style (name), rename renames one (style, name), remove takes one out of the book (the chapters naming it go back to the book's settings, with a warning until their text is changed). A style's settings are changed with sandbox_set_config and chapterStyle: <id>; a chapter is given its style with sandbox_set_chapter_style. A style cannot change what the whole book shares (the trim, the language, the fonts, print, the viewers): bookSettings lists any it holds, which the engine ignores.",
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'rename', 'remove'], description: 'Default list.' },
        style: { type: 'string', description: 'rename, remove: the style id.' },
        name: { type: 'string', description: 'create, rename: the name shown for it.' },
      },
      additionalProperties: false,
    },
    execute: async (args) => {
      const s = store.getSnapshot();
      const list = s.config.chapterStyles ?? [];
      const action = (args.action as string | undefined) ?? 'list';
      const find = (): ChapterStyleConfig => {
        const id = args.style as string | undefined;
        const st = list.find((x) => x.id === id);
        if (!st) throw new ToolError(`No chapter style ${JSON.stringify(id)}. The book's: ${list.map((x) => x.id).join(', ') || 'none'}.`);
        return st;
      };
      const write = (next: ChapterStyleConfig[]) => dispatchAndWait(host, { type: 'UPDATE_CONFIG', payload: { chapterStyles: next.length > 0 ? next : undefined }, history: { merge: false } });
      if (action === 'create') {
        const name = (args.name as string | undefined)?.trim();
        if (!name) throw new ToolError('create needs a name.');
        const made = newChapterStyle(list, name);
        await write([...list, made]);
        return { created: made.id, name, note: `Change its settings with sandbox_set_config and chapterStyle: "${made.id}"; give it to a chapter with sandbox_set_chapter_style.` };
      }
      if (action === 'rename') {
        const st = find();
        const name = (args.name as string | undefined)?.trim();
        if (!name) throw new ToolError('rename needs a name.');
        await write(list.map((x) => (x.id === st.id ? { ...x, name } : x)));
        return { style: st.id, name };
      }
      if (action === 'remove') {
        const st = find();
        const naming = chapterStyles(host, s).filter((c) => c.style === st.id).map((c) => c.chapter);
        await write(list.filter((x) => x.id !== st.id));
        return { removed: st.id, ...(naming.length > 0 ? { chaptersThatNamedIt: naming, note: 'These chapters are set in the book\'s settings now; their chapterStyle: or :::part{style} still names the style (a chapterStyleUnknown warning) until it is changed.' } : {}) };
      }
      if (action !== 'list') throw new ToolError(`Unknown action ${JSON.stringify(action)}.`);
      const chapters = chapterStyles(host, s);
      return {
        styles: list.map((st) => {
          const book = bookSettingsOf(st);
          return {
            id: st.id,
            ...(st.name ? { name: st.name } : {}),
            changes: Object.keys(st.config ?? {}),
            chapters: chapters.filter((c) => c.style === st.id).map((c) => c.chapter),
            ...(book.length > 0 ? { bookSettings: book } : {}),
          };
        }),
        chapters,
      };
    },
  };

  const give: WebMcpTool = {
    name: 'sandbox_set_chapter_style',
    title: 'Sandbox: give a chapter its style',
    description: "Set a chapter in one of the book's chapter styles, or back in the book's settings: its front matter's chapterStyle: line is written, added or taken out (one step of the chapter's undo history). A chapter that names a style is set in it even inside a part with another style; style null takes its own out, so it is set in its part's style again, if any. To set every chapter of a part in a style, write style=\"<id>\" on the part's :::part fence instead (sandbox_edit_text): the chapter the fence opens and the chapters after it, until the next part, take it.",
    inputSchema: {
      type: 'object',
      properties: {
        chapter: CHAPTER_PARAM,
        chapters: { type: 'array', items: CHAPTER_PARAM, description: 'Several chapters at once, instead of chapter.' },
        style: { type: ['string', 'null'], description: 'The style id (sandbox_chapter_styles), or null for none of its own.' },
        wait: WAIT_PARAM,
      },
      required: ['style'],
      additionalProperties: false,
    },
    execute: async (args, { signal }) => {
      const s = store.getSnapshot();
      const id = (args.style as string | null | undefined) ?? undefined;
      if (id !== undefined && !(s.config.chapterStyles ?? []).some((st) => st.id === id)) {
        throw new ToolError(`No chapter style ${JSON.stringify(id)}. The book's: ${(s.config.chapterStyles ?? []).map((st) => st.id).join(', ') || 'none'}; make one with sandbox_chapter_styles (action create).`);
      }
      const refs = Array.isArray(args.chapters) ? (args.chapters as unknown[]) : [args.chapter];
      const targets = refs.map((ref) => chapterOf(s, ref));
      const changed: number[] = [];
      for (const { chapter, index } of targets) {
        const before = chapterText(store.getSnapshot(), chapter.id) ?? chapter.markdown;
        if (await editChapter(host, chapter.id, before, setChapterStyle(before, id))) changed.push(index + 1);
      }
      const now = chapterStyles(host, store.getSnapshot());
      return {
        changed,
        chapters: targets.map(({ index }) => now[index]!),
        ...(await layoutAnswer(host, args.wait, signal)),
      };
    },
  };

  return [styles, give];
}
