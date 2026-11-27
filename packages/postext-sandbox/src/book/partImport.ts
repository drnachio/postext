// Chapters of another .postext joined to the open book: a part of the book
// converted or edited elsewhere (a module of a course, a few chapters laid
// out apart) that belongs in it. The part's chapters keep the numbers their
// headings give them (`startAt`), and each one is added at its place among
// the book's chapters or takes the place of the book's chapter with that
// number — as the reader chooses, chapter by chapter. Resources come along;
// one named as a resource the book's other chapters use is renamed, with the
// name the reader confirms. The design stays the open book's: of the part's
// configuration only the font families the book lacks are taken.
//
// Pure: it works on texts and records, and says what to change; the caller
// stores the files and dispatches.

import { chapterOrdinals } from 'postext/bundle';
import type { CustomFontFamily, PostextConfig, Resource } from 'postext';
import { renameResourceInResources, renameResourceInText, resourceIdRanges } from '../webmcp/resourceRefs.js';
import { applyTextChanges } from './textChanges.js';

/** What becomes of one chapter of the part. */
export type PartAction = 'add' | 'replace' | 'skip';

export interface PartChoice {
  action: PartAction;
  /** The chapter's number in the book: where it is added, or which of the
   *  book's chapters it replaces. */
  number: number;
}

export interface PartChapterInfo {
  /** Its position in the part (from 0). */
  index: number;
  title: string;
  /** The number its heading gives it (`startAt`), else the one after the
   *  chapter before it in the part. */
  number: number;
  /** The part's resources its text refers to. */
  resources: string[];
}

export interface PartBook {
  chapters: readonly { id: string; title: string; markdown: string }[];
  resources: readonly Resource[];
  config: PostextConfig;
}

export interface PartContent {
  chapters: readonly { title: string; markdown: string }[];
  resources: readonly Resource[];
  config: PostextConfig;
}

/** The numbers the book counts its chapters by. */
export function bookNumbers(book: Pick<PartBook, 'chapters'>): number[] {
  return chapterOrdinals(book.chapters);
}

/** The ids of `resources` that `markdown` refers to. */
function referenced(markdown: string, resources: readonly Resource[]): string[] {
  return resources.filter((r) => resourceIdRanges(markdown, r.id).length > 0).map((r) => r.id);
}

/** The part's chapters, with their numbers and the resources they use. */
export function partChapters(part: PartContent): PartChapterInfo[] {
  const numbers = chapterOrdinals(part.chapters);
  return part.chapters.map((c, index) => ({ index, title: c.title, number: numbers[index]!, resources: referenced(c.markdown, part.resources) }));
}

/** What is proposed for each chapter of the part: to take the place of the
 *  book's chapter with its number when the book has one, else to be added
 *  at its place. */
export function proposeChoices(book: Pick<PartBook, 'chapters'>, part: PartContent): PartChoice[] {
  const numbers = new Set(bookNumbers(book));
  return partChapters(part).map((c) => ({ action: numbers.has(c.number) ? 'replace' : 'add', number: c.number }));
}

/** The book's chapter a choice replaces (its position), or -1. */
export function replacedChapter(book: Pick<PartBook, 'chapters'>, choice: PartChoice): number {
  return choice.action === 'replace' ? bookNumbers(book).indexOf(choice.number) : -1;
}

/** What is wrong with the choices, or an empty list: a replace with no
 *  chapter of that number, two chapters on one number, a number below 1. */
export function choiceProblems(book: Pick<PartBook, 'chapters'>, choices: readonly PartChoice[]): { chapter: number; problem: 'noSuchChapter' | 'sameNumber' | 'badNumber' }[] {
  const problems: { chapter: number; problem: 'noSuchChapter' | 'sameNumber' | 'badNumber' }[] = [];
  const numbers = new Set(bookNumbers(book));
  const seen = new Map<number, number>();
  choices.forEach((c, i) => {
    if (c.action === 'skip') return;
    if (!Number.isInteger(c.number) || c.number < 1) problems.push({ chapter: i, problem: 'badNumber' });
    else if (c.action === 'replace' && !numbers.has(c.number)) problems.push({ chapter: i, problem: 'noSuchChapter' });
    else if (c.action === 'add' && numbers.has(c.number)) problems.push({ chapter: i, problem: 'sameNumber' });
    if (seen.has(c.number)) problems.push({ chapter: i, problem: 'sameNumber' });
    seen.set(c.number, i);
  });
  return problems;
}

/** The part's resources the chosen chapters bring: the ones their texts
 *  refer to, and the pictures the tables among them show. */
export function broughtResources(part: PartContent, choices: readonly PartChoice[]): Resource[] {
  const wanted = new Set<string>();
  part.chapters.forEach((c, i) => {
    if (choices[i]?.action !== 'skip') for (const id of referenced(c.markdown, part.resources)) wanted.add(id);
  });
  const byId = new Map(part.resources.map((r) => [r.id, r]));
  for (const id of [...wanted]) {
    for (const row of byId.get(id)?.table?.model.rows ?? []) {
      for (const cell of row) if (cell.image?.resourceId && byId.has(cell.image.resourceId)) wanted.add(cell.image.resourceId);
    }
  }
  return part.resources.filter((r) => wanted.has(r.id));
}

/** `id`, or `id-2`, `-3`… when taken. */
function freeId(id: string, taken: Set<string>): string {
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(`${id}-${n}`)) n++;
  return `${id}-${n}`;
}

/** The resources the part brings that are named as one of the book's which
 *  stays in use — by a chapter the import does not replace — with the name
 *  proposed for each. A resource only the replaced chapters use is not a
 *  clash: the part's takes its place. */
export function resourceClashes(book: PartBook, part: PartContent, choices: readonly PartChoice[]): { id: string; rename: string }[] {
  const replaced = new Set(choices.map((c) => replacedChapter(book, c)).filter((i) => i >= 0));
  const bookIds = new Set(book.resources.map((r) => r.id));
  const taken = new Set([...bookIds, ...part.resources.map((r) => r.id)]);
  const clashes: { id: string; rename: string }[] = [];
  for (const r of broughtResources(part, choices)) {
    if (!bookIds.has(r.id)) continue;
    const users = book.chapters.map((c, i) => (resourceIdRanges(c.markdown, r.id).length > 0 ? i : -1)).filter((i) => i >= 0);
    if (users.length > 0 && users.every((i) => replaced.has(i))) continue;
    const rename = freeId(r.id, taken);
    taken.add(rename);
    clashes.push({ id: r.id, rename });
  }
  return clashes;
}

/** `markdown` with its first level-1 heading numbered `n` (`{startAt=n}`):
 *  the attribute is set, or added to the heading's attributes, or given
 *  them. A chapter with no ATX level-1 heading is left as it is. */
export function withChapterNumber(markdown: string, n: number): string {
  return markdown.replace(/^(#[ \t]+)(.*?)[ \t]*$/m, (line, mark: string, rest: string) => {
    const attrs = rest.match(/\{([^{}]*)\}$/);
    if (!attrs) return `${mark}${rest} {startAt=${n}}`;
    const inside = /(^|\s)startAt\s*=\s*("[^"]*"|'[^']*'|\S+)/.test(attrs[1]!)
      ? attrs[1]!.replace(/(^|\s)startAt\s*=\s*("[^"]*"|'[^']*'|\S+)/, `$1startAt=${n}`)
      : `startAt=${n} ${attrs[1]!.trim()}`.trim();
    return `${mark}${rest.slice(0, attrs.index)}{${inside}}`;
  });
}

export type PartStep =
  | { kind: 'replace'; chapterId: string; title: string; markdown: string; number: number }
  | { kind: 'add'; index: number; title: string; markdown: string; number: number };

export interface PartImport {
  /** In the order to apply them: each `add` index counts the chapters the
   *  steps before it added. */
  steps: PartStep[];
  /** Resources to add or put in place of the book's with the same id. */
  resources: Resource[];
  /** The book's font families with the part's missing ones added, when it
   *  lacks any; undefined when nothing is missing. */
  customFonts?: CustomFontFamily[];
  /** The part's families the book did not have. */
  fontsAdded: string[];
}

/** What to change in the book to join the chosen chapters of the part, with
 *  the resources renamed as `renames` says (the part's id → the one it
 *  takes; a clash left out keeps the proposed name). */
export function planPartImport(book: PartBook, part: PartContent, choices: readonly PartChoice[], renames: Readonly<Record<string, string>> = {}): PartImport {
  const problems = choiceProblems(book, choices);
  if (problems.length > 0) throw new Error(`The choices do not fit the book: ${problems.map((p) => `chapter ${p.chapter + 1} ${p.problem}`).join(', ')}.`);
  const names = new Map<string, string>();
  for (const clash of resourceClashes(book, part, choices)) names.set(clash.id, renames[clash.id] ?? clash.rename);
  // The resources brought, renamed, and every reference to them with them.
  let resources = broughtResources(part, choices);
  const texts = part.chapters.map((c) => c.markdown);
  for (const [from, to] of names) {
    if (to === from) continue;
    texts.forEach((t, i) => { texts[i] = applyTextChanges(t, renameResourceInText(t, from, to)); });
    const rewritten = new Map(renameResourceInResources(resources, from, to).map((x) => [x.resource.id, x.resource]));
    resources = resources.map((r) => (r.id === from ? { ...r, id: to } : (rewritten.get(r.id) ?? r)));
  }
  // The steps, in the order of the numbers: an added chapter goes before the
  // first chapter numbered above it, counting those added already.
  const numbers = bookNumbers(book);
  const order = choices.map((c, i) => ({ c, i })).filter(({ c }) => c.action !== 'skip').sort((a, b) => a.c.number - b.c.number);
  const steps: PartStep[] = [];
  const placed = [...numbers];
  for (const { c, i } of order) {
    const markdown = withChapterNumber(texts[i]!, c.number);
    const title = part.chapters[i]!.title;
    if (c.action === 'replace') {
      const at = numbers.indexOf(c.number);
      steps.push({ kind: 'replace', chapterId: book.chapters[at]!.id, title, markdown, number: c.number });
    } else {
      let index = placed.findIndex((n) => n > c.number);
      if (index < 0) index = placed.length;
      placed.splice(index, 0, c.number);
      steps.push({ kind: 'add', index, title, markdown, number: c.number });
    }
  }
  // The fonts: the part's families the book has no family of that name for.
  const own = book.config.customFonts ?? [];
  const missing = (part.config.customFonts ?? []).filter((f) => !own.some((o) => o.name.toLowerCase() === f.name.toLowerCase()));
  return {
    steps,
    resources,
    ...(missing.length > 0 ? { customFonts: [...own, ...missing] } : {}),
    fontsAdded: missing.map((f) => f.name),
  };
}
