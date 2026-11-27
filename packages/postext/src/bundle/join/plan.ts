// Chapters of another book joined to this one (#1727): a part of the book
// converted or edited apart (a module of a course, a few chapters laid out
// elsewhere) that belongs in it. Each chapter of the part keeps the number
// the layout gives it, and is added at its place among the book's chapters
// or takes the place of the book's chapter with that number, as the reader
// chooses. The resources its text uses come along; one named as a resource
// the book keeps using is renamed, with every reference to it. The design
// stays the book's: of the part's configuration only the font families the
// book lacks are taken.
//
// Pure: it works on texts and records and says what to change. The Sandbox
// applies the plan to its state, `joinBundleFiles` to a bundle's files.

import type { CustomFontFamily, HeadingCounters, PostextConfig, Resource } from '../../types.js';
import { chapterBody, chapterNumbers, chapterFileNumbers, numberedChapterHeading } from './numbers.js';
import { configPathsNaming, renameResourceInResources, resourceIdRanges, resourcesNamedIn, withResourceRenamed, type ResourceRefFields } from './refs.js';

/** What becomes of one chapter of the part. */
export type PartAction = 'add' | 'replace' | 'skip';

export interface PartChoice {
  action: PartAction;
  /** The chapter's number in the book: where it is added, or which of the
   *  book's chapters it replaces. */
  number: number;
}

/** One side of a join: the book, or the part joined to it. */
export interface JoinSide<R extends ResourceRefFields = Resource> {
  chapters: readonly { title: string; markdown: string }[];
  resources: readonly R[];
  config: PostextConfig;
  /** The bundle's `start.headings`, for one that holds part of a longer book. */
  start?: Partial<HeadingCounters>;
}

export interface PartChapterInfo {
  /** Its position in the part (from 0). */
  index: number;
  title: string;
  /** The number the layout gives it, or null when it has no numbered
   *  level-1 heading (a cover, a prologue). */
  number: number | null;
  /** The part's resources it uses, its own and the ones they name. */
  resources: string[];
}

export type PartProblem =
  /** A replace with no chapter of that number in the book. */
  | 'noSuchChapter'
  /** Two chapters on one number, or an add on a number the book has. */
  | 'sameNumber'
  /** A number below 1, or not a whole number. */
  | 'badNumber'
  /** A replace by a chapter with no numbered heading: the chapters after
   *  it would lose a number. */
  | 'unnumbered';

/** The resource ids a join can give: the forms every reference reads bare
 *  (`:ref{#id}`, `art=id`). */
const RESOURCE_ID_RE = /^[\p{L}\p{N}_][\p{L}\p{N}_.:-]*$/u;

/** The numbers the book counts its chapters by (null: no number). */
export function bookNumbers(book: Pick<JoinSide<ResourceRefFields>, 'chapters' | 'config' | 'start'>): (number | null)[] {
  return chapterNumbers(book.chapters, book.config, book.start);
}

/** The ids of the part's resources that `ids` bring with them: the ones
 *  their captions, notes and table cells name, and so on. */
function withNamedResources<R extends ResourceRefFields>(ids: Iterable<string>, resources: readonly R[]): Set<string> {
  const byId = new Map(resources.map((r) => [r.id, r]));
  const wanted = new Set<string>();
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (wanted.has(id) || !byId.has(id)) continue;
    wanted.add(id);
    const r = byId.get(id)!;
    const texts = [r.caption, r.note, ...(r.table?.model.rows.flat().map((c) => c.content) ?? [])].filter((t): t is string => !!t);
    for (const text of texts) queue.push(...resourcesNamedIn(text, byId.keys()));
    for (const cell of r.table?.model.rows.flat() ?? []) if (cell.image?.resourceId) queue.push(cell.image.resourceId);
  }
  return wanted;
}

/** The part's chapters, with their numbers and the resources they use. */
export function partChapters<R extends ResourceRefFields>(part: JoinSide<R>): PartChapterInfo[] {
  const numbers = chapterNumbers(part.chapters, part.config, part.start);
  const ids = part.resources.map((r) => r.id);
  return part.chapters.map((c, index) => {
    const used = withNamedResources(resourcesNamedIn(c.markdown, ids), part.resources);
    return { index, title: c.title, number: numbers[index]!, resources: ids.filter((id) => used.has(id)) };
  });
}

/** What is proposed for each chapter of the part: to take the place of the
 *  book's chapter with its number when the book has one, else to be added
 *  at its place. A chapter with no number is left out. */
export function proposeChoices(book: JoinSide<ResourceRefFields>, part: JoinSide<ResourceRefFields>): PartChoice[] {
  const numbers = new Set(bookNumbers(book).filter((n): n is number => n !== null));
  return partChapters(part).map((c) => (c.number === null
    ? { action: 'skip', number: 1 }
    : { action: numbers.has(c.number) ? 'replace' : 'add', number: c.number }));
}

/** The book's chapter a choice replaces (its position), or -1. */
export function replacedChapter(book: JoinSide<ResourceRefFields>, choice: PartChoice): number {
  return choice.action === 'replace' ? bookNumbers(book).indexOf(choice.number) : -1;
}

/** What is wrong with the choices (by the part's chapter, from 0), or an
 *  empty list. One problem per chapter, the first that applies. */
export function choiceProblems(book: JoinSide<ResourceRefFields>, part: JoinSide<ResourceRefFields>, choices: readonly PartChoice[]): { chapter: number; problem: PartProblem }[] {
  const problems: { chapter: number; problem: PartProblem }[] = [];
  const numbers = new Set(bookNumbers(book).filter((n): n is number => n !== null));
  const own = chapterNumbers(part.chapters, part.config, part.start);
  const seen = new Set<number>();
  choices.forEach((c, i) => {
    if (c.action === 'skip') return;
    let problem: PartProblem | undefined;
    if (!Number.isInteger(c.number) || c.number < 1) problem = 'badNumber';
    else if (seen.has(c.number)) problem = 'sameNumber';
    else if (c.action === 'replace' && !numbers.has(c.number)) problem = 'noSuchChapter';
    else if (c.action === 'replace' && own[i] === null) problem = 'unnumbered';
    else if (c.action === 'add' && numbers.has(c.number)) problem = 'sameNumber';
    if (Number.isInteger(c.number)) seen.add(c.number);
    if (problem) problems.push({ chapter: i, problem });
  });
  return problems;
}

/** The part's resources the chosen chapters bring. */
export function broughtResources<R extends ResourceRefFields>(part: JoinSide<R>, choices: readonly PartChoice[]): R[] {
  const ids = part.resources.map((r) => r.id);
  const direct = part.chapters.flatMap((c, i) => (choices[i] && choices[i].action !== 'skip' ? resourcesNamedIn(c.markdown, ids) : []));
  const wanted = withNamedResources(direct, part.resources);
  return part.resources.filter((r) => wanted.has(r.id));
}

/** `id`, or `id-2`, `-3`… when taken. */
function freeId(id: string, taken: Set<string>): string {
  if (!taken.has(id)) return id;
  let n = 2;
  while (taken.has(`${id}-${n}`)) n++;
  return `${id}-${n}`;
}

/** Whether the book keeps using its resource `id` once the chapters at
 *  `replaced` are gone: in another chapter, in its design (a callout's
 *  icon, a page template's picture), or in another of its resources that
 *  the part does not bring in its place. */
function bookKeepsUsing(book: JoinSide<ResourceRefFields>, id: string, replaced: ReadonlySet<number>, brought: ReadonlySet<string>): boolean {
  if (book.chapters.some((c, i) => !replaced.has(i) && resourceIdRanges(c.markdown, id).length > 0)) return true;
  if (configPathsNaming(book.config, id).length > 0) return true;
  // Another resource names it when renaming it there would change something.
  return book.resources.some((r) => r.id !== id && !brought.has(r.id) && renameResourceInResources([r], id, `${id}-`).length > 0);
}

/** The resources the part brings that are named as one of the book's which
 *  stays in use, with the name proposed for each. A resource only the
 *  replaced chapters use is not a clash: the part's takes its place. */
export function resourceClashes(book: JoinSide<ResourceRefFields>, part: JoinSide<ResourceRefFields>, choices: readonly PartChoice[]): { id: string; rename: string }[] {
  const replaced = new Set(choices.map((c) => replacedChapter(book, c)).filter((i) => i >= 0));
  const bookIds = new Set(book.resources.map((r) => r.id));
  const brought = broughtResources(part, choices);
  const broughtIds = new Set(brought.map((r) => r.id));
  const taken = new Set([...bookIds, ...part.resources.map((r) => r.id)]);
  const clashes: { id: string; rename: string }[] = [];
  for (const r of brought) {
    if (!bookIds.has(r.id) || !bookKeepsUsing(book, r.id, replaced, broughtIds)) continue;
    const rename = freeId(r.id, taken);
    taken.add(rename);
    clashes.push({ id: r.id, rename });
  }
  return clashes;
}

/** The clashing resources whose new name (`renames`, else the proposed one)
 *  cannot be used: not an id every reference reads, or taken by another
 *  resource of the book or the part, or given to two of them. */
export function renameProblems(
  book: JoinSide<ResourceRefFields>,
  part: JoinSide<ResourceRefFields>,
  choices: readonly PartChoice[],
  renames: Readonly<Record<string, string>> = {},
): string[] {
  const clashes = resourceClashes(book, part, choices);
  const taken = new Set([...book.resources.map((r) => r.id), ...part.resources.map((r) => r.id)]);
  const names = clashes.map((c) => renames[c.id] ?? c.rename);
  return clashes.filter((c, i) => {
    const name = names[i]!;
    return !RESOURCE_ID_RE.test(name) || name === c.id || (taken.has(name) && name !== c.rename) || names.indexOf(name) !== i;
  }).map((c) => c.id);
}

/** `markdown` with its first numbered level-1 heading given the number `n`
 *  (`{startAt=n}`): the attribute is set, or added to the heading's
 *  attributes, or given them. Front matter and code blocks are never taken
 *  for the heading (the parser finds it). A chapter with no such heading is
 *  left as it is. */
export function withChapterNumber(markdown: string, n: number, config?: PostextConfig): string {
  const body = chapterBody(markdown, config);
  const heading = numberedChapterHeading(body);
  if (!heading) return markdown;
  const start = body.offset + heading.sourceStart;
  const lineEnd = markdown.indexOf('\n', start);
  const end = lineEnd < 0 ? markdown.length : lineEnd;
  const line = markdown.slice(start, end).replace(/[ \t\r]+$/, '');
  const startAt = /(^|\s)startAt\s*=\s*("[^"]*"|'[^']*'|[^\s}]+)/;
  const attrs = line.match(/\{([^{}]*)\}$/);
  let next: string;
  if (!attrs) next = `${line} {startAt=${n}}`;
  else {
    const inside = startAt.test(attrs[1]!) ? attrs[1]!.replace(startAt, `$1startAt=${n}`) : `startAt=${n} ${attrs[1]!.trim()}`.trim();
    next = `${line.slice(0, attrs.index)}{${inside}}`;
  }
  return markdown.slice(0, start) + next + markdown.slice(start + line.length);
}

/** Whether the chapter's numbered heading carries `startAt`. */
function hasStartAt(markdown: string, config?: PostextConfig): boolean {
  return numberedChapterHeading(chapterBody(markdown, config))?.attrs?.startAt !== undefined;
}

export type PartStep =
  /** The book's chapter at `at` (its position before the join) gets the
   *  part's text and title; it keeps its identity (id, history). */
  | { kind: 'replace'; at: number; part: number; title: string; markdown: string; number: number }
  /** A new chapter at `index`, counting the chapters added before it. */
  | { kind: 'add'; index: number; part: number; title: string; markdown: string; number: number };

export interface PartJoinPlan<R extends ResourceRefFields = Resource> {
  /** In the order to apply them. */
  steps: PartStep[];
  /** The part's resources, renamed, to add or put in place of the book's
   *  with the same id. */
  resources: R[];
  /** Clashing resources and the id each takes. */
  renamed: { from: string; to: string }[];
  /** The book's font families with the part's missing ones added, when it
   *  lacks any; undefined when nothing is missing. */
  customFonts?: CustomFontFamily[];
  /** The part's families the book did not have. */
  fontsAdded: string[];
}

/** What to change in the book to join the chosen chapters of the part, the
 *  clashing resources renamed as `renames` says (a clash it leaves out
 *  takes the proposed name). Throws when the choices or the names do not
 *  fit (see {@link choiceProblems}, {@link renameProblems}). */
export function planPartJoin<R extends ResourceRefFields>(
  book: JoinSide<ResourceRefFields>,
  part: JoinSide<R>,
  choices: readonly PartChoice[],
  renames: Readonly<Record<string, string>> = {},
): PartJoinPlan<R> {
  if (choices.length !== part.chapters.length) throw new Error(`The part has ${part.chapters.length} chapter(s): give one choice for each.`);
  const problems = choiceProblems(book, part, choices);
  if (problems.length > 0) throw new Error(`The choices do not fit the book: ${problems.map((p) => `chapter ${p.chapter + 1} ${p.problem}`).join(', ')}.`);
  const badNames = renameProblems(book, part, choices, renames);
  if (badNames.length > 0) throw new Error(`These resources cannot take the names given: ${badNames.join(', ')}.`);
  const renamed = resourceClashes(book, part, choices).map((c) => ({ from: c.id, to: renames[c.id] ?? c.rename }));

  // The resources brought, renamed, and every reference to them with them.
  let resources = broughtResources(part, choices);
  const texts = part.chapters.map((c) => c.markdown);
  for (const { from, to } of renamed) {
    texts.forEach((t, i) => { texts[i] = withResourceRenamed(t, from, to); });
    const rewritten = new Map(renameResourceInResources(resources, from, to).map((x) => [x.resource.id, x.resource]));
    resources = resources.map((r) => (r.id === from ? { ...r, id: to } : (rewritten.get(r.id) ?? r)));
  }

  // The steps, in the order of the numbers: an added chapter goes before the
  // first chapter numbered above it (a chapter with no number counts as the
  // one before it), counting those added already.
  const numbers = bookNumbers(book);
  const order = choices.map((c, i) => ({ c, i })).filter(({ c }) => c.action !== 'skip').sort((a, b) => a.c.number - b.c.number);
  // The book as it will be: each entry the number it is counted by (null:
  // none) and, for a chapter of the part, which one.
  const book2: { number: number | null; part?: number; orig?: number }[] = numbers.map((number, orig) => ({ number, orig }));
  const steps: PartStep[] = [];
  for (const { c, i } of order) {
    const title = part.chapters[i]!.title;
    if (c.action === 'replace') {
      const at = numbers.indexOf(c.number);
      book2[book2.findIndex((b) => b.orig === at)] = { number: c.number, part: i, orig: at };
      steps.push({ kind: 'replace', at, part: i, title, markdown: texts[i]!, number: c.number });
    } else {
      const own = chapterNumbers([part.chapters[i]!], part.config)[0];
      const fileNumbers = chapterFileNumbers(book2.map((b) => b.number));
      let index = fileNumbers.findIndex((n) => n > c.number);
      if (index < 0) index = book2.length;
      book2.splice(index, 0, { number: own === null ? null : c.number, part: i });
      steps.push({ kind: 'add', index, part: i, title, markdown: texts[i]!, number: c.number });
    }
  }
  // Each heading brought in gets the number it goes to, when its place does
  // not give it that number already or it states one of its own.
  let counter = book.start?.h1 ?? 0;
  const natural = new Map<number, number>();
  for (const entry of book2) {
    if (entry.number === null) continue;
    if (entry.part !== undefined) natural.set(entry.part, counter + 1);
    counter = entry.number;
  }
  for (const step of steps) {
    const needs = natural.get(step.part) !== step.number || hasStartAt(step.markdown, part.config);
    if (needs) step.markdown = withChapterNumber(step.markdown, step.number, part.config);
  }

  // The fonts: the part's families the book has no family of that name for.
  const own = book.config.customFonts ?? [];
  const missing = (part.config.customFonts ?? []).filter((f) => !own.some((o) => o.name.toLowerCase() === f.name.toLowerCase()));
  return {
    steps,
    resources,
    renamed,
    ...(missing.length > 0 ? { customFonts: [...own, ...missing] } : {}),
    fontsAdded: missing.map((f) => f.name),
  };
}
