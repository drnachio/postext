// `sandbox_import_chapters`: the chapters of another .postext joined to the
// book on screen, each at its number (book/partImport.ts).

import { bookNumbers, choiceProblems, partChapters, proposeChoices, replacedChapter, resourceClashes, type PartAction, type PartChoice } from '../../book/partImport.js';
import { joinPart, openBook, readPartBundle } from '../../presets/partBundle.js';
import { dispatchAndWait, type SandboxToolHost } from '../host.js';
import { ToolError, type WebMcpTool } from '../modelContext.js';
import { fileParam, layoutAnswer, WAIT_PARAM } from './book.js';
import { readFileInput, type FileInput } from './resources.js';

export function partTools(host: SandboxToolHost): WebMcpTool[] {
  const { store } = host;

  const importChapters: WebMcpTool = {
    name: 'sandbox_import_chapters',
    title: 'Sandbox: join chapters of another book',
    description: "Join the chapters of another .postext to the book on screen — a part of the book made or edited apart (a module, a few chapters laid out elsewhere) — as the Manuscript panel's \"Add chapters from another book\" does. Each chapter keeps the number its heading gives it ({startAt=…}, else the one after the chapter before): it takes the place of the book's chapter with that number (replace), or is added at its place among the book's chapters (add), or is left out (skip); its heading is given the number it goes to. The resources its text uses come along; one named as a resource the book's other chapters still use is renamed (renames, else the name proposed), with every reference to it. The design stays the book's: of the file's settings only the font families the book lacks are taken. Run it first with inspect: true — it changes nothing and answers with each chapter's number, what is proposed for it and which of the book's chapters it would replace, the clashing resources with their proposed names and the fonts that would be added.",
    inputSchema: {
      type: 'object',
      properties: {
        file: fileParam('The .postext file the chapters come from.'),
        inspect: { type: 'boolean', description: 'Answer with the chapters and what is proposed for them, changing nothing.' },
        chapters: {
          type: 'array',
          description: "What becomes of each of the file's chapters, in the file's order (one entry each). Left out: what inspect proposes.",
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['add', 'replace', 'skip'] },
              number: { type: 'integer', minimum: 1, description: 'The chapter\'s number in the book: where it is added, or which chapter it replaces. Left out: its own.' },
            },
            required: ['action'],
            additionalProperties: false,
          },
        },
        renames: { type: 'object', additionalProperties: { type: 'string' }, description: 'For a clashing resource, the id it takes in the book instead of the one proposed: { "fig-1-1": "fig-5-1" }.' },
        wait: WAIT_PARAM,
      },
      required: ['file'],
      additionalProperties: false,
    },
    annotations: { consequentialHint: true },
    execute: async (args, { signal }) => {
      const file = await readFileInput(args.file as FileInput, signal);
      const s = store.getSnapshot();
      let part;
      try {
        part = await readPartBundle(new Uint8Array(await file.arrayBuffer()), file.name, s.locale, (n) => s.labels.chapterUntitled.replace('__n__', String(n)));
      } catch (err) {
        throw new ToolError(`The file could not be read as a .postext book: ${err instanceof Error ? err.message : String(err)}`);
      }
      const book = openBook(s);
      const proposed = proposeChoices(book, part);
      const info = partChapters(part);
      const given = args.chapters as { action: PartAction; number?: number }[] | undefined;
      if (given && given.length !== info.length) throw new ToolError(`The file has ${info.length} chapter(s); chapters needs one entry for each, in the file's order.`);
      const choices: PartChoice[] = given ? given.map((g, i) => ({ action: g.action, number: g.number ?? info[i]!.number })) : proposed;
      const renames = (args.renames as Record<string, string> | undefined) ?? {};
      const clashes = resourceClashes(book, part, choices);
      const problems = choiceProblems(book, choices);
      const describe = () => ({
        chapters: info.map((c, i) => {
          const at = replacedChapter(book, choices[i]!);
          return {
            chapter: i + 1, title: c.title, number: c.number, resources: c.resources,
            action: choices[i]!.action, to: choices[i]!.number,
            ...(at >= 0 ? { replaces: { chapter: at + 1, title: book.chapters[at]!.title } } : {}),
          };
        }),
        book: ((numbers) => book.chapters.map((c, i) => ({ chapter: i + 1, number: numbers[i], title: c.title })))(bookNumbers(book)),
        clashes: clashes.map((c) => ({ id: c.id, renamedTo: renames[c.id] ?? c.rename })),
        ...(problems.length > 0 ? { problems: problems.map((p) => ({ chapter: p.chapter + 1, problem: p.problem })) } : {}),
      });
      if (args.inspect) return { imported: false, file: file.name, ...describe() };
      if (problems.length > 0) {
        throw new ToolError(`The choices do not fit the book: ${problems.map((p) => `chapter ${p.chapter + 1} of the file, ${p.problem === 'noSuchChapter' ? 'no chapter of the book has that number to replace' : p.problem === 'sameNumber' ? 'its number is taken (by the book or another chapter of the file): replace it, or choose another' : 'the number must be 1 or more'}`).join('; ')}.`);
      }
      const joined = await joinPart(s, part, choices, renames, async (action) => { await dispatchAndWait(host, action); });
      return { imported: true, file: file.name, ...joined, ...(await layoutAnswer(host, args.wait, signal)) };
    },
  };

  return [importChapters];
}
