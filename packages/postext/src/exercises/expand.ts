/**
 * The exercises of a document set as ordinary blocks (#1227): each
 * `:::exercise` becomes a box (its style's `box`, or a frameless one) of
 * paragraphs, chips and drawn boxes the layout already knows — so an
 * exercise is placed, split, balanced, tagged and painted as any box is.
 * Its solutions go where the book says (#1229), and every exercise leaves
 * a record of what it asks and answers for the digital outputs (#1230).
 */

import type { ContentBlock, DirectiveAttrs, ExerciseGap, InlineIcon, InlineSpan } from '../parse/index.js';
import { CHIP_PLACEHOLDER, SWATCH_PLACEHOLDER } from '../parse/inlineFormatting.js';
import type { CalloutStyleConfig, ChipStyleConfig, DigitSystem, HeadingCounters, OutlineEntry, ParagraphStyleConfig } from '../types.js';
import type { ExerciseSettings, ResolvedExerciseStyle, ResolvedExercisesConfig } from '../defaults/boxes/exercises.js';
import { pickExerciseStyle, solutionsOf } from '../defaults/boxes/exercises.js';
import { counterStyleOf, formatCounter } from '../numerals/numbering.js';
import { readExercises, containerEndOf } from './model.js';
import type { ExerciseIssue, ExerciseModel } from './types.js';
import { EMPTY_RUN, joinRuns, runOf, sliceRun, textRun, trimRun, blockOfRun, type Run } from './text.js';
import { exerciseBoxStyles, exerciseChipStyles, exerciseParagraphStyles, exerciseStyleIds, shapedNumberBand, type ExerciseStyleIds } from './styles.js';
import { areaElements, drawnBox, type AreaKind } from './designs.js';
import { seededRandom, shuffledOrder } from './shuffle.js';
import { gridBox, type GridBox } from './grids.js';
import type { ExerciseGridInfo, ExerciseRecord, ExerciseSlot } from './record.js';

/** Container ids of the synthetic boxes and groups (clear of the parser's
 *  and of the other synthetic bases: 1e9 chapter-end notes, 1.5e9
 *  listings, 1.75e9 flow columns, 1.8e9 frames, 1.9e9 comic text, 2e9
 *  page-span embeds). */
export const EXERCISE_CONTAINER_BASE = 1_600_000_000;

/** What the expansion needs from the document. */
export interface ExpandContext {
  settings: ExerciseSettings;
  /** The document's locale and digits. */
  locale?: string;
  digits?: DigitSystem;
  /** Heading counters before the document (a book's earlier chapters). */
  headings?: HeadingCounters;
  /** Exercise counters carried from earlier chapters, by counter name. */
  counters?: Record<string, number>;
  /** The size of the text, points, and the room across a column. */
  bodySizePt: number;
  lineHeightPt: number;
  measurePt: number;
  /** A right-to-left document (its designs are mirrored). */
  rtl?: boolean;
  /** A vertical page (縦組み): items are numbered ①, ②. */
  vertical?: boolean;
  /** The text's font family: drawn letters (grids, matching) use it. */
  bodyFont?: string;
  /** Ids of the configured box styles (a style's `box` must name one). */
  boxIds: ReadonlySet<string>;
  /** The room a box style takes across (its side padding and border),
   *  points, by id: what an exercise set on that box has less to draw on. */
  boxInsets?: ReadonlyMap<string, number>;
  /** The book's outline, whose `exercise` entries a
   *  `:::solutions{scope="book"}` prints (#1229). */
  outline?: readonly OutlineEntry[];
}

export interface ExerciseExpansion {
  blocks: ContentBlock[];
  /** Whether any exercise was set. */
  wrapped: boolean;
  boxes: CalloutStyleConfig[];
  paragraphStyles: ParagraphStyleConfig[];
  chipStyles: ChipStyleConfig[];
  records: ExerciseRecord[];
  issues: ExerciseIssue[];
  /** The counters after the document, for the next chapter. */
  counters: Record<string, number>;
}

const SPACE = ' ';

/** Where a `::bank` line stands among an exercise's body, until the bank
 *  (which holds the answers the body sets) is made. */
const BANK_SLOT: ContentBlock = { type: 'directive', text: '', spans: [], sourceMap: [], sourceStart: 0, sourceEnd: 0, directiveName: 'bank' };

/** A chip span holding `run`. */
function chipSpan(style: string, run: Run, extra: Partial<NonNullable<InlineSpan['chip']>> = {}): InlineSpan {
  return { text: CHIP_PLACEHOLDER, bold: false, italic: false, chip: { style, spans: run.spans.length > 0 ? run.spans : [{ text: run.text, bold: false, italic: false }], ...extra } };
}

/** A run of one chip, mapped to `at`. */
function chipRun(style: string, run: Run, at: number, extra: Partial<NonNullable<InlineSpan['chip']>> = {}): Run {
  return { text: CHIP_PLACEHOLDER, spans: [chipSpan(style, run, extra)], sourceMap: [at] };
}

/** A tab to the paragraph style's next stop: a tab span holds `'\t'` once
 *  mapped, as the parser leaves it. */
const tabRun = (at: number): Run => ({ text: '\t', spans: [{ text: '\t', bold: false, italic: false, tab: {} }], sourceMap: [at] });

function marker(type: 'containerStart' | 'containerEnd', name: ContentBlock['containerName'], id: number, at: number, attrs?: DirectiveAttrs): ContentBlock {
  return {
    type, text: '', spans: [], sourceMap: [], sourceStart: at, sourceEnd: at,
    containerName: name, containerId: id, ...(attrs ? { containerAttrs: attrs } : {}),
  };
}

/** The plain text of a run, its chips' words included. */
function plain(run: Run | InlineSpan[]): string {
  const spans = Array.isArray(run) ? run : run.spans;
  return spans.map((s) => (s.chip ? plain(s.chip.spans) : s.tab ? ' ' : s.text)).join('');
}

/** An option's label (`a)`, `ア`, `أ)`), `''` for none. */
function optionLabel(style: ResolvedExerciseStyle, k: number, locale?: string, digits?: DigitSystem): string {
  if (style.options.labels === 'none') return '';
  return `${style.options.prefix}${formatCounter(k + 1, counterStyleOf(style.options.labels, locale), locale, digits)}${style.options.suffix}`;
}

/** The exercise numbers of a document, each exercise's own counter reset
 *  by the heading level its style names. */
export function numberExercises(blocks: readonly ContentBlock[], exercises: ExerciseModel[], ctx: ExpandContext): { numbers: Map<number, string>; counters: Record<string, number> } {
  const counters: Record<string, number> = { ...(ctx.counters ?? {}) };
  const heads = [0, ctx.headings?.h1 ?? 0, ctx.headings?.h2 ?? 0];
  const resetAt = new Map<string, number>();
  for (const s of ctx.settings.styles) {
    const level = s.number.resetOn === 'never' ? 0 : Number(s.number.resetOn.slice(1));
    resetAt.set(s.number.counter, Math.max(resetAt.get(s.number.counter) ?? 0, level));
  }
  const numbers = new Map<number, string>();
  let next = 0;
  for (let i = 0; i < blocks.length && next < exercises.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'heading' && b.level) {
      if (b.level <= 2) { heads[b.level] = (heads[b.level] ?? 0) + 1; if (b.level === 1) heads[2] = 0; }
      for (const [counter, level] of resetAt) if (level > 0 && b.level <= level) counters[counter] = 0;
      continue;
    }
    const ex = exercises[next]!;
    if (i !== ex.start) continue;
    next++;
    const style = pickExerciseStyle(ctx.settings.styles, ex.attrs.style);
    const counter = style.number.counter;
    const written = ex.attrs.n !== undefined ? parseInt(ex.attrs.n, 10) : NaN;
    const n = Number.isFinite(written) ? written : (counters[counter] ?? 0) + 1;
    counters[counter] = n;
    const num = formatCounter(n, counterStyleOf(style.number.format, ctx.locale), ctx.locale, ctx.digits);
    numbers.set(ex.id, style.number.template.replace(/\{n\}/g, num).replace(/\{h1\}/g, String(heads[1])).replace(/\{h2\}/g, String(heads[2])));
  }
  return { numbers, counters };
}

/**
 * Set the exercises of `blocks`. Blocks outside exercises pass as they are;
 * a `:::solutions` line becomes the solutions the book prints there.
 */
export function expandExercises(blocks: readonly ContentBlock[], ctx: ExpandContext): ExerciseExpansion {
  const { exercises, issues } = readExercises(blocks);
  const book = ctx.settings.exercises;
  const out: ExerciseExpansion = { blocks: [], wrapped: false, boxes: [], paragraphStyles: [], chipStyles: [], records: [], issues, counters: { ...(ctx.counters ?? {}) } };
  const hasSolutionsLine = blocks.some((b) => b.type === 'directive' && b.directiveName === 'solutions');
  if (exercises.length === 0 && !hasSolutionsLine) {
    out.blocks = blocks as ContentBlock[];
    return out;
  }
  out.wrapped = true;
  const { numbers, counters } = numberExercises(blocks, exercises, ctx);
  out.counters = counters;
  let nextId = EXERCISE_CONTAINER_BASE;
  const newId = (): number => nextId++;
  const usedStyles = new Set<string>();
  const extraBoxes: CalloutStyleConfig[] = [];
  /** Solutions waiting for the end of their chapter (or a `:::solutions`). */
  let pending: { ex: ExerciseModel; style: ResolvedExerciseStyle; number: string; e: Emitter }[] = [];

  const emitter = (ex: ExerciseModel, style: ResolvedExerciseStyle, number: string): Emitter =>
    new Emitter(blocks, ex, style, book, number, ctx, newId, extraBoxes);

  const flushPending = (at: number, heading: string | undefined, sink: ContentBlock[]): void => {
    if (pending.length === 0) return;
    const id = newId();
    const style = pending[0]!.style;
    const ids = exerciseStyleIds(style);
    const box = solutionsOf(style, book).box && ctx.boxIds.has(solutionsOf(style, book).box!) ? solutionsOf(style, book).box! : ids.solutionList;
    sink.push(marker('containerStart', 'callout', id, at, { type: box, ...(heading ? { title: heading } : {}) }));
    for (const p of pending) sink.push(...p.e.solutionBlocks(true));
    sink.push(marker('containerEnd', 'callout', id, at));
    pending = [];
  };

  let exIndex = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const ex = exercises[exIndex];
    if (ex && i === ex.start) {
      exIndex++;
      const style = pickExerciseStyle(ctx.settings.styles, ex.attrs.style);
      usedStyles.add(style.id);
      const number = numbers.get(ex.id) ?? '';
      const e = emitter(ex, style, number);
      const set = e.exerciseBlocks();
      out.records.push(e.record());
      for (const word of e.unplaced) issues.push({ kind: 'exerciseWordUnplaced', exercise: ex.id, detail: word, sourceStart: ex.sourceStart, sourceEnd: ex.sourceEnd });
      const placement = solutionsOf(style, book).placement;
      // The solution right after the exercise goes inside its box, before
      // the box closes: a page break never parts them.
      if (placement === 'after' || placement === 'inverted') set.splice(set.length - 1, 0, ...e.solutionBox(placement === 'inverted'));
      else if (placement === 'chapterEnd' || placement === 'directive') pending.push({ ex, style, number, e });
      out.blocks.push(...set);
      i = ex.end;
      continue;
    }
    // A chapter ends where the next one opens.
    if (b.type === 'heading' && b.level === 1 && pending.some((p) => solutionsOf(p.style, book).placement === 'chapterEnd')) {
      flushPending(b.sourceStart, pending[0] ? solutionsOf(pending[0].style, book).heading : undefined, out.blocks);
    }
    if (b.type === 'directive' && b.directiveName === 'solutions') {
      const heading = b.directiveAttrs?.title ?? (pending[0] ? solutionsOf(pending[0].style, book).heading : book.solutions.heading);
      // The whole book's, from its outline (every chapter's exercises).
      const entries = b.directiveAttrs?.scope === 'book' ? ctx.outline?.filter((e) => e.kind === 'exercise' && e.exercise) ?? [] : [];
      if (entries.length > 0) {
        const style = ctx.settings.styles[0]!;
        usedStyles.add(style.id);
        out.blocks.push(...bookSolutions(entries, style, book, heading || undefined, b.sourceStart, newId, ctx));
        pending = [];
      } else {
        flushPending(b.sourceStart, heading || undefined, out.blocks);
      }
      continue;
    }
    // A solution or hint outside an exercise prints nothing.
    if (b.type === 'containerStart' && (b.containerName === 'solution' || b.containerName === 'hint')) {
      i = containerEndOf(blocks, i);
      continue;
    }
    out.blocks.push(b);
  }
  if (pending.some((p) => solutionsOf(p.style, book).placement === 'chapterEnd')) {
    const last = blocks[blocks.length - 1];
    flushPending(last ? last.sourceEnd : 0, solutionsOf(pending[0]!.style, book).heading, out.blocks);
  }

  for (const id of usedStyles) {
    const style = ctx.settings.styles.find((s) => s.id === id)!;
    const solBox = solutionsOf(style, book).box;
    out.boxes.push(...exerciseBoxStyles(style, solBox && ctx.boxIds.has(solBox) ? solBox : undefined, ctx.bodySizePt));
    out.paragraphStyles.push(...exerciseParagraphStyles(style));
    out.chipStyles.push(...exerciseChipStyles(style));
  }
  // The solutions box of a `:::solutions` line with no exercise before it.
  if (usedStyles.size === 0 && ctx.settings.styles[0]) {
    out.boxes.push(...exerciseBoxStyles(ctx.settings.styles[0], undefined, ctx.bodySizePt));
  }
  out.boxes.push(...extraBoxes);
  return out;
}

/** The solutions of the whole book (`:::solutions{scope="book"}`): each
 *  chapter's title, then each exercise's number, key and worked solution,
 *  as the outline carries them (plain text). */
function bookSolutions(entries: readonly OutlineEntry[], style: ResolvedExerciseStyle, book: ResolvedExercisesConfig, heading: string | undefined, at: number, newId: () => number, ctx: ExpandContext): ContentBlock[] {
  const ids = exerciseStyleIds(style);
  const sol = solutionsOf(style, book);
  const boxId = sol.box && ctx.boxIds.has(sol.box) ? sol.box : ids.solutionList;
  const box = newId();
  const out: ContentBlock[] = [marker('containerStart', 'callout', box, at, { type: boxId, ...(heading ? { title: heading } : {}) })];
  const group = newId();
  out.push(marker('containerStart', 'paragraphs', group, at, { style: ids.key }));
  let chapter: string | undefined;
  for (const e of entries) {
    const ex = e.exercise!;
    if (ex.chapter !== chapter) {
      chapter = ex.chapter;
      if (chapter) out.push(blockOfRun('paragraph', textRun(chapter, at, { bold: true }), { sourceStart: at, sourceEnd: at }));
    }
    const lines = [ex.key, ...(sol.layout === 'full' ? ex.solution ?? [] : [])].filter(Boolean);
    lines.forEach((line, k) => {
      const lead = k === 0 ? textRun(`${e.number}${style.number.suffix || '.'}`, at, { bold: style.number.fontWeight >= 600 }) : EMPTY_RUN;
      out.push(blockOfRun('paragraph', joinRuns(lead, tabRun(at), textRun(line, at)), { sourceStart: at, sourceEnd: at }));
    });
  }
  out.push(marker('containerEnd', 'paragraphs', group, at), marker('containerEnd', 'callout', box, at));
  return out;
}

/** Sets one exercise. */
class Emitter {
  readonly ids: ExerciseStyleIds;
  readonly teacher: boolean;
  /** `example`: the first item is printed answered, as a model. */
  readonly example: boolean;
  readonly at: number;
  readonly slots: ExerciseSlot[] = [];
  readonly grids: ExerciseGridInfo[] = [];
  /** The key, one run per item. */
  readonly key: Run[] = [];
  private bankWords: Run[] = [];
  /** The words of a mark exercise's text that are not to be marked. */
  private markWords = 0;
  /** The number, marks, icons and title, before the instruction. */
  private leadRun: Run | undefined;
  /** Whether the lead ends in a number whose suffix is a full-width mark
   *  (`一、`, `１．`): what follows it takes no word space. */
  private leadTight = false;
  /** Words a grid could not place. */
  readonly unplaced: string[] = [];
  private readonly random: () => number;

  constructor(
    readonly blocks: readonly ContentBlock[],
    readonly ex: ExerciseModel,
    readonly style: ResolvedExerciseStyle,
    readonly book: ResolvedExercisesConfig,
    readonly number: string,
    readonly ctx: ExpandContext,
    readonly newId: () => number,
    readonly extraBoxes: CalloutStyleConfig[],
  ) {
    this.ids = exerciseStyleIds(style);
    this.teacher = book.edition === 'teacher';
    this.example = ex.attrs.example !== undefined && ex.attrs.example !== 'false';
    this.at = ex.sourceStart;
    this.random = seededRandom(book.seed, ex.ordinal, ex.kind);
  }

  /** Whether an item prints its answer: in a teacher's edition, and the
   *  first item of an `example` exercise. */
  private answered(first: boolean): boolean {
    return this.teacher || (this.example && first);
  }

  /** The exercise slot of an item, none for the model item of an
   *  `example` exercise (it is not asked). */
  private hit(slot: string, first: boolean): { exercise?: { ex: number; slot: string } } {
    return this.example && first && !this.teacher ? {} : { exercise: { ex: this.ex.id, slot } };
  }

  /** Between two answers of a key: a middle dot, but `؛` in Arabic, where
   *  a dot beside Arabic-Indic digits reads as a zero (`٠`). */
  private get sep(): string {
    return this.book.language === 'ar' ? '\u061B ' : ' · ';
  }

  /** An item's number in the document's digits (`١`, `۱`, `1`). */
  private num(n: number): string {
    return formatCounter(n, counterStyleOf('decimal', this.ctx.locale), this.ctx.locale, this.ctx.digits);
  }

  /** An item's label: `1.`; on a vertical page a circled number (`①`),
   *  which stands upright in the column where a Latin full stop would not
   *  (#1244). */
  private item(n: number): string {
    return this.ctx.vertical ? formatCounter(n, 'circled-decimal', this.ctx.locale) : `${this.num(n)}.`;
  }

  /** Item and solution numbers are bold when the exercise number is (its
   *  `number.fontWeight`): a face with no bold cut sets both regular. */
  private get numberBold(): boolean {
    return this.style.number.fontWeight >= 600;
  }

  private label(k: number): string {
    return optionLabel(this.style, k, this.ctx.locale, this.ctx.digits);
  }

  /** A label without its prefix and suffix, as a key prints it. */
  private bareLabel(k: number): string {
    if (this.style.options.labels === 'none') return '';
    return formatCounter(k + 1, counterStyleOf(this.style.options.labels, this.ctx.locale), this.ctx.locale, this.ctx.digits);
  }

  private open(name: ContentBlock['containerName'], attrs?: DirectiveAttrs): { start: ContentBlock; end: ContentBlock } {
    const id = this.newId();
    return { start: marker('containerStart', name, id, this.at, attrs), end: marker('containerEnd', name, id, this.at) };
  }

  /** The paragraphs of `runs` in the paragraph style `style`. */
  private paragraphs(style: string, runs: Run[]): ContentBlock[] {
    if (runs.length === 0) return [];
    const g = this.open('paragraphs', { style });
    return [g.start, ...runs.map((r) => blockOfRun('paragraph', r, { sourceStart: this.at, sourceEnd: this.at })), g.end];
  }

  /** A drawn box (an area, a grid) as blocks. */
  private drawn(style: CalloutStyleConfig): ContentBlock[] {
    this.extraBoxes.push(style);
    const g = this.open('callout', { type: style.id });
    return [g.start, g.end];
  }

  /** A drawn grid as blocks, its geometry and slots recorded. */
  private drawnGrid(box: GridBox): ContentBlock[] {
    const { slots, key, clues, words, info, unplaced, ...style } = box;
    void key; void clues; void words; void unplaced;
    const blocks = this.drawn(style);
    const id = blocks[0]!.containerId!;
    if (info) this.grids.push({ ...info, box: id });
    for (const s of slots ?? []) this.slots.push({ ...s, box: id });
    return blocks;
  }

  /** The room across inside the exercise's box: the column, less the
   *  padding and border of the style's `box` (a card's areas and grids
   *  stay inside it). */
  private get measure(): number {
    const box = this.style.box && this.ctx.boxIds.has(this.style.box) ? this.style.box : undefined;
    return Math.max(1, this.ctx.measurePt - (box ? this.ctx.boxInsets?.get(box) ?? 0 : 0));
  }

  /** The band of the shaped number in ems of the instruction, whose size
   *  the number's em and the icons' sizes are read against. */
  private numberBand(): { height: number; drop: number } {
    const ins = this.style.instruction.fontSize;
    const textPt = ins ? dimPt(ins, this.ctx.bodySizePt) : this.ctx.bodySizePt;
    return shapedNumberBand(dimPt(this.style.number.fontSize, textPt) / Math.max(0.01, textPt));
  }

  private get dpiFree(): { size: number; line: number; measure: number } {
    return { size: this.ctx.bodySizePt, line: this.ctx.lineHeightPt, measure: this.measure };
  }

  /** A writing area of `lines` lines, the answers written in a teacher's
   *  edition. */
  private area(lines: number, slot: string, answers?: string[], kind?: AreaKind, widthPt?: number, shown = false, cells?: number[]): ContentBlock[] {
    const a = this.style.area;
    const k = kind ?? a.kind;
    const spacing = a.spacing ? dimPt(a.spacing, this.dpiFree.size) : this.dpiFree.line * (k === 'grid' || k === 'tianzige' ? 1.2 : 1.35);
    const { elements, heightPt } = areaElements({
      kind: k, lines, spacingPt: spacing, widthPt: widthPt ?? this.dpiFree.measure, color: a.color, weightPt: dimPt(a.weight, this.dpiFree.size),
      ...(cells && cells.length > 0 ? { cells } : {}),
      ...((this.teacher || shown) && answers ? { answers, answerColor: this.style.answers.color, answerSizePt: this.dpiFree.size * 0.95, ...(this.style.answers.fontFamily ?? this.ctx.bodyFont ? { answerFont: this.style.answers.fontFamily ?? this.ctx.bodyFont } : {}) } : {}),
    });
    const id = `${this.ids.frame}-area-${this.ex.ordinal}-${slot}`;
    const blocks = this.drawn(drawnBox(id, elements, heightPt));
    this.slots.push({ key: slot, kind: 'text', accept: answers?.filter((s) => s !== '') ?? [], box: blocks[0]!.containerId!, linePt: spacing, ...(kind === 'none' && this.ex.attrs.area?.trim() === 'none' ? { bare: true } : {}) });
    return blocks;
  }

  // --- The exercise ---------------------------------------------------------

  exerciseBlocks(): ContentBlock[] {
    const ex = this.ex;
    const frame = this.style.box && this.ctx.boxIds.has(this.style.box) ? this.style.box : this.ids.frame;
    const attrs: DirectiveAttrs = { type: frame, exercise: String(ex.id) };
    const outer = { start: marker('containerStart', 'callout', ex.id, this.at, attrs), end: marker('containerEnd', 'callout', ex.id, this.blocks[ex.end]!.sourceStart) };
    // A `{#id}` on the fence names the exercise.
    if (ex.attrs.id) outer.start.containerAttrs = { ...outer.start.containerAttrs, id: ex.attrs.id };
    let head = this.head();
    // The body first: the bank holds the answers it sets.
    const body = this.body();
    // An exercise that opens with its text (a gap in its first sentence):
    // the number runs into that paragraph.
    const firstAt = body[0]?.type === 'containerStart' && body[0].containerAttrs?.style === this.ids.text ? 1 : 0;
    if (this.ex.instruction.length === 0 && this.leadRun && body[firstAt]?.type === 'paragraph') {
      const first = body[firstAt]!;
      const run = joinRuns(this.leadRun, textRun(this.leadTight ? '' : SPACE, this.at), runOf(first));
      body[firstAt] = { ...first, text: run.text, spans: run.spans, sourceMap: run.sourceMap };
      head = [];
    }
    const wantsBank = (this.ex.attrs.bank !== undefined && this.ex.attrs.bank !== 'false') || this.ex.banks.length > 0 || this.ex.kind === 'sort';
    // The bank stands where its `::bank` line is written, else under the
    // instruction.
    const bank = wantsBank ? this.bank() : [];
    const at = body.indexOf(BANK_SLOT);
    if (at >= 0) body.splice(at, 1, ...bank);
    const out = [outer.start, ...head, ...(at >= 0 ? [] : bank), ...body, outer.end];
    this.carryMarks(out);
    return out;
  }

  /** What the exercise's own name is in a reference: "Exercise 3". */
  anchorText(): string {
    return `${this.style.number.label || this.book.words.exercise} ${this.number}`.trim();
  }

  /** The anchors and index marks of the blocks the expansion set anew (the
   *  instruction, the items) go on the first paragraph of the exercise. */
  private carryMarks(out: ContentBlock[]): void {
    // Marks a passed-through block still carries are where they were.
    const present = new Set<string>();
    for (const b of out) {
      for (const m of b.anchorMarks ?? []) present.add(`a${m.anchorId}@${m.sourceStart}`);
      for (const m of b.indexMarks ?? []) present.add(`i${m.sourceStart}`);
    }
    const anchors: NonNullable<ContentBlock['anchorMarks']> = [];
    const index: NonNullable<ContentBlock['indexMarks']> = [];
    for (let k = this.ex.start + 1; k < this.ex.end; k++) {
      const b = this.blocks[k]!;
      for (const m of b.anchorMarks ?? []) if (!present.has(`a${m.anchorId}@${m.sourceStart}`)) anchors.push(m);
      for (const m of b.indexMarks ?? []) if (!present.has(`i${m.sourceStart}`)) index.push(m);
    }
    if (anchors.length === 0 && index.length === 0) return;
    const host = out.find((b) => b.type === 'paragraph' || b.type === 'listItem');
    if (!host) return;
    const i = out.indexOf(host);
    out[i] = { ...host, anchorMarks: [...anchors, ...(host.anchorMarks ?? [])], ...(index.length > 0 ? { indexMarks: [...index, ...(host.indexMarks ?? [])] } : {}) };
  }

  /** The number, level marks, icons, title and instruction. */
  private head(): ContentBlock[] {
    const ex = this.ex;
    const n = this.style.number;
    const lead: Run[] = [];
    // A full-width suffix carries its own room: `一、看拼音`, not `一、 看拼音`.
    const tight = /[\u3001\u3002\uFF0C\uFF0E\uFF1A]$/u.test(n.suffix);
    if (n.show && this.number) {
      const text = `${n.label ? `${n.label} ` : ''}${this.number}${n.suffix}`;
      // A number stands upright under an italic instruction (#1244).
      lead.push(chipRun(this.ids.number, textRun(text, this.at), this.at, { upright: true }));
    }
    const level = ex.attrs.level !== undefined ? Math.max(0, Math.min(this.style.level.max, parseInt(ex.attrs.level, 10) || 0)) : 0;
    if (level > 0) {
      const marks = this.style.level.glyph.repeat(level) + this.style.level.empty.repeat(this.style.level.max - level);
      lead.push(chipRun(this.ids.level, textRun(marks, this.at), this.at));
    }
    // Activity icons are inline symbols (#1058): a picture of the book or a
    // glyph in its own face, in its own colour, read as their `alt`. Beside
    // a shaped number they share its band (#1248): as tall as the shape
    // unless they give their own size, centred on it either way.
    const band = n.show && this.number && n.shape !== 'none' ? this.numberBand() : undefined;
    for (const name of (ex.attrs.icon ?? '').split(/\s+/).filter(Boolean)) {
      const icon = this.style.icons[name];
      if (!icon || (!icon.resourceId && !icon.glyph)) continue;
      const size = icon.size !== undefined && icon.size > 0 ? icon.size : band?.height;
      const drop = band ? band.drop - (band.height - (size ?? band.height)) / 2 : 0;
      const symbol: InlineIcon = {
        alt: icon.alt ?? '',
        ...(icon.resourceId ? { resource: icon.resourceId } : { glyph: icon.glyph!, ...(icon.fontFamily ? { font: icon.fontFamily } : {}) }),
        ...(size !== undefined ? { size: round3(size) } : {}),
        ...(drop > 0 ? { drop: round3(drop) } : {}),
      };
      const color = icon.color?.paletteId ?? icon.color?.hex ?? '';
      lead.push(textRun(SWATCH_PLACEHOLDER, this.at, { swatch: { color, icon: symbol } }));
    }
    if (ex.attrs.title) lead.push(textRun(ex.attrs.title, this.at, { bold: true }));
    const first = ex.instruction[0];
    const rest = ex.instruction.slice(1);
    const runs: Run[] = [];
    const numbered = n.show && !!this.number;
    const leadRun = joinRuns(...lead.flatMap((r, k) => (k > 0 ? [textRun(k === 1 && numbered && tight ? '' : SPACE, this.at), r] : [r])));
    this.leadRun = leadRun.text ? leadRun : undefined;
    this.leadTight = numbered && tight && lead.length === 1;
    const bold = this.style.instruction.bold;
    const styled = (r: Run): Run => (bold ? { ...r, spans: r.spans.map((s) => (s.chip ? s : { ...s, bold: true })) } : r);
    if (first !== undefined) {
      const body = styled(this.gapsOf(runOf(this.blocks[first]!)));
      runs.push(leadRun.text ? joinRuns(leadRun, textRun(this.leadTight ? '' : SPACE, this.at), body) : body);
    } else if (leadRun.text) {
      runs.push(leadRun);
    }
    for (const k of rest) runs.push(styled(this.gapsOf(runOf(this.blocks[k]!))));
    return this.paragraphs(this.ids.instruction, runs);
  }

  /** The body: blocks passed through (their answers set), the kind's items
   *  set in their place, `'bank'` where the word bank goes. */
  private body(): ContentBlock[] {
    const ex = this.ex;
    const out: ContentBlock[] = [];
    const done = new Set<number>();
    const lists = ex.body.filter((k) => this.blocks[k]!.type === 'listItem' && (this.blocks[k]!.depth ?? 1) <= 1);
    const firstOf = <T>(items: T[], blockOf: (t: T) => number): number | undefined => (items.length > 0 ? blockOf(items[0]!) : undefined);
    const groupStart = new Map<number, () => ContentBlock[]>();
    switch (ex.kind) {
      case 'choice':
        ex.questions.forEach((q, qi) => groupStart.set(q.stem ?? q.options[0]!.block, () => this.options(qi)));
        break;
      case 'truefalse': {
        const at = firstOf(ex.questions, (q) => q.options[0]!.block);
        if (at !== undefined) groupStart.set(at, () => this.statements());
        break;
      }
      case 'match': {
        const at = firstOf(ex.pairs, (p) => p.block);
        if (at !== undefined) groupStart.set(at, () => this.match());
        break;
      }
      case 'order': {
        const at = ex.sequence[0];
        if (at !== undefined) groupStart.set(at, () => this.order());
        break;
      }
      case 'scramble': {
        const at = firstOf(ex.sentences, (s) => s.block);
        if (at !== undefined) groupStart.set(at, () => this.scramble());
        break;
      }
      case 'sort': {
        const at = firstOf(ex.categories, (c) => c.block);
        if (at !== undefined) groupStart.set(at, () => this.sort());
        break;
      }
      case 'wordsearch': case 'crossword': case 'arithmetic': {
        const items = ex.kind === 'arithmetic' ? ex.operations.map((o) => o.block) : ex.entries.map((e) => e.block);
        if (items[0] !== undefined) groupStart.set(items[0], () => this.grid());
        break;
      }
      default:
        break;
    }
    // The exercise's own paragraphs, a run at a time, in its text style
    // (never indented); not inside a container the author opened.
    let text: ContentBlock[] = [];
    let depth = 0;
    const bankAt = ex.banks[0];
    let bankPlaced = false;
    const flush = (): void => {
      if (text.length === 0) return;
      const g = this.open('paragraphs', { style: this.ids.text });
      out.push(g.start, ...text, g.end);
      text = [];
    };
    for (const k of ex.body) {
      if (done.has(k)) continue;
      if (bankAt !== undefined && !bankPlaced && k > bankAt) {
        flush();
        out.push(BANK_SLOT);
        bankPlaced = true;
      }
      const group = groupStart.get(k);
      if (group) {
        flush();
        out.push(...group());
        continue;
      }
      if (ex.items.has(k)) continue;
      const b = this.blocks[k]!;
      if (b.type === 'containerStart') depth++;
      if (b.type === 'containerEnd') depth--;
      const set = this.passThrough(b, k);
      if (depth === 0 && set.type === 'paragraph') { text.push(set); continue; }
      flush();
      out.push(set);
      // An open question: lines under each item of the list.
      if (ex.kind === 'open' && b.type === 'listItem' && (b.depth ?? 1) <= 1) {
        out.push(...this.area(this.openLines(), `t${lists.indexOf(k) + 1}`, this.openAnswer(lists.indexOf(k)), this.openArea(), undefined, false, this.openCells()));
      }
    }
    flush();
    if (bankAt !== undefined && !bankPlaced) out.push(BANK_SLOT);
    if (ex.kind === 'open' && lists.length === 0) out.push(...this.area(this.openLines(), 't1', this.openAnswer(0), this.openArea(), undefined, false, this.openCells()));
    if (ex.kind === 'gaps' || ex.kind === 'choice' || ex.kind === 'mark') this.keyOfGaps();
    return out;
  }

  /** The writing area an open question asks for (`area=grid`), else the
   *  style's. */
  private openArea(): AreaKind | undefined {
    const k = this.ex.attrs.area?.trim();
    if (k === 'lines' || k === 'dots' || k === 'grid' || k === 'seyes' || k === 'tianzige' || k === 'box' || k === 'none') return k;
    // Cells asked of an area of lines: squares.
    return this.openCells() && this.style.area.kind !== 'grid' && this.style.area.kind !== 'tianzige' ? 'grid' : undefined;
  }

  /** The squares an open question's area is sized to (`cells=4`), or set
   *  in groups side by side (`cells="2 2 3"`, a word's 田字格 each). */
  private openCells(): number[] | undefined {
    const cells = (this.ex.attrs.cells ?? '').split(/[\s,]+/).map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0);
    return cells.length > 0 ? cells : undefined;
  }

  private openLines(): number {
    const n = parseInt(this.ex.attrs.lines ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : this.style.area.lines;
  }

  /** The model answer of an open question, cut into the lines a teacher's
   *  edition writes it on (only the first solution's first paragraph). */
  private openAnswer(k: number): string[] | undefined {
    const sol = this.ex.solutions[0];
    if (!sol) return undefined;
    const paras: string[] = [];
    for (let j = sol.start + 1; j < sol.end; j++) {
      const b = this.blocks[j]!;
      if (b.type === 'paragraph' || b.type === 'listItem') paras.push(plain(runOf(b)));
    }
    const text = paras[k] ?? (k === 0 ? paras[0] : undefined);
    return text ? [text] : undefined;
  }

  /** A block of the body with its answers set. */
  private passThrough(b: ContentBlock, k: number): ContentBlock {
    // A question's stem ends in a bracket to write the letter in (Chinese
    // and Japanese tests), its answer written in a teacher's edition.
    const qi = this.style.options.bracket ? this.ex.questions.findIndex((q) => q.stem === k) : -1;
    const marks = this.ex.kind === 'mark' && (b.type === 'paragraph' || b.type === 'listItem' || b.type === 'blockquote');
    if (!b.spans.some((s) => s.chip?.gap) && qi < 0 && !marks) return b;
    // A mark exercise's text: each of its words is one to mark or not.
    let run = marks ? this.markText(runOf(b)) : this.gapsOf(runOf(b));
    if (qi >= 0) {
      const at = b.sourceEnd;
      const answer = this.bracketAnswer(qi);
      run = joinRuns(run, textRun('\uFF08', at), chipRun(this.teacher ? this.ids.answer : this.ids.icon, textRun(this.teacher ? answer : '\u2003\u2003', at), at, {
        ...(this.teacher ? {} : { blank: true as const, blankLabel: this.book.words.blank }), exercise: { ex: this.ex.id, slot: `q${qi + 1}b` },
      }), textRun('\uFF09', at));
    }
    return { ...b, text: run.text, spans: run.spans, sourceMap: run.sourceMap };
  }

  /** The labels of a question's right options, as its bracket holds them. */
  private bracketAnswer(qi: number): string {
    const q = this.ex.questions[qi]!;
    return q.options.flatMap((o, k) => (o.correct ? [this.label(k).replace(/[).\uFF0E\u3001]$/u, '')] : [])).join('');
  }

  // --- Answers in the text -----------------------------------------------------

  private longestAnswer(): string {
    let best = '';
    for (const g of this.ex.gaps) {
      if (g.gap.choice) continue;
      const t = g.gap.texts[g.gap.correct[0] ?? 0] ?? '';
      if (t.length > best.length) best = t;
    }
    return best;
  }

  /** `run` with each `[[…]]` set: a blank, an inline choice or a word to
   *  mark. */
  private gapsOf(run: Run): Run {
    if (!run.spans.some((s) => s.chip?.gap)) return run;
    if (this.ex.kind === 'mark') return this.markText(run);
    const pieces: Run[] = [];
    let at = 0;
    for (const span of run.spans) {
      const len = span.text.length;
      const piece = sliceRun(run, at, at + len);
      const src = run.sourceMap[at] ?? this.at;
      at += len;
      const gap = span.chip?.gap;
      if (!gap) { pieces.push(piece); continue; }
      const ref = this.ex.gaps.find((g) => g.gap === gap);
      const n = ref?.n ?? 0;
      pieces.push(gap.choice ? this.choiceRun(gap, n, src) : this.blankRun(gap, n, src, span.bold, span.italic));
    }
    return joinRuns(...pieces);
  }

  private blankRun(gap: ExerciseGap, n: number, at: number, bold: boolean, italic: boolean): Run {
    const answer: Run = { text: gap.texts[gap.correct[0] ?? 0] ?? '', spans: gap.options[gap.correct[0] ?? 0] ?? [], sourceMap: [] };
    const width = this.style.blank.width;
    // Room past the answer: em spaces as many as `extra` holds ems.
    const extra = '\u2003'.repeat(Math.max(0, Math.round(dimPt(this.style.blank.extra, this.ctx.bodySizePt) / this.ctx.bodySizePt)));
    const widthText = width === 'longest' ? this.longestAnswer() + extra : width === 'answer' ? answer.text + extra : undefined;
    const words = answer.spans.length > 0 ? answer : textRun(answer.text || '\u00A0', at);
    const slot = `g${n}`;
    const shown = this.answered(n === 1);
    if (!(this.example && n === 1 && !this.teacher)) this.slots.push({ key: slot, kind: 'gap', accept: gap.texts.filter((_, k) => gap.correct.includes(k)) });
    // The model item's answer is already written: the bank leaves it out.
    if (!(this.example && n === 1)) this.bankWords.push(textRun(answer.text, at));
    // `[[went]]{width=6}`: a blank six ems wide.
    const ems = parseFloat(gap.attrs?.width ?? '');
    const run = chipRun(shown ? this.ids.blankAnswer : this.ids.blank, words, at, {
      ...(Number.isFinite(ems) && ems > 0 ? { widthText: '\u2003'.repeat(Math.round(ems)) } : widthText ? { widthText } : {}),
      ...(shown ? {} : { blank: true as const, blankLabel: this.book.words.blank }),
      ...this.hit(slot, n === 1),
    });
    run.spans[0] = { ...run.spans[0]!, bold, italic };
    return run;
  }

  private choiceRun(gap: ExerciseGap, n: number, at: number): Run {
    // Chinese and Japanese print the choice in full-width brackets, the
    // options an ideographic space (`（zhǒng　zhòng）`) or a middle dot
    // (`（ちりました・のぼりました）`) apart.
    const lang = this.book.language;
    const wide = lang === 'zh' || lang === 'ja';
    const parts: Run[] = [textRun(wide ? '\uFF08' : '(', at)];
    gap.options.forEach((opt, k) => {
      if (k > 0) parts.push(textRun(lang === 'zh' ? '\u3000' : lang === 'ja' ? '\u30FB' : ' / ', at));
      const right = gap.correct.includes(k);
      const words: Run = { text: gap.texts[k] ?? '', spans: opt.length > 0 ? opt : [{ text: gap.texts[k] || '\u00A0', bold: false, italic: false }], sourceMap: [] };
      parts.push(chipRun(this.answered(n === 1) && right ? this.ids.choiceRing : this.ids.choice, words, at, this.hit(`g${n}o${k + 1}`, n === 1)));
    });
    parts.push(textRun(wide ? '\uFF09' : ')', at));
    this.slots.push({ key: `g${n}`, kind: 'choice', options: gap.options.length, correct: gap.correct.map((k) => k + 1), multiple: false });
    return joinRuns(...parts);
  }

  /** A mark exercise's text: every word is a slot the reader may mark, so
   *  the words to mark are not the only ones that answer a click, and all
   *  are set alike so the page gives none away. The `[[…]]` words are the
   *  right ones; any other marked counts as wrong. */
  private markText(run: Run): Run {
    const out: Run[] = [];
    let at = 0;
    for (const span of run.spans) {
      const len = span.text.length;
      const piece = sliceRun(run, at, at + len);
      const src = run.sourceMap[at] ?? this.at;
      at += len;
      const gap = span.chip?.gap;
      if (gap) {
        const n = this.ex.gaps.find((g) => g.gap === gap)?.n ?? 0;
        out.push(this.markRun(gap, n, src));
        continue;
      }
      // A chip, a formula, a reference, a note, a tab… stays as it is.
      if (span.chip || span.math || span.ref || span.footnote || span.tab || span.swatch || span.citation) { out.push(piece); continue; }
      let last = 0;
      for (const [a, b] of wordRanges(span.text, this.ctx.locale)) {
        if (a > last) out.push(sliceRun(piece, last, a));
        const word = sliceRun(piece, a, b);
        const slot = `x${++this.markWords}`;
        this.slots.push({ key: slot, kind: 'mark', correct: [] });
        out.push(chipRun(this.ids.markPlain, word, word.sourceMap[0] ?? src, { exercise: { ex: this.ex.id, slot } }));
        last = b;
      }
      if (last < len) out.push(sliceRun(piece, last));
    }
    return joinRuns(...out);
  }

  private markRun(gap: ExerciseGap, n: number, at: number): Run {
    const words: Run = { text: gap.texts[0] ?? '', spans: gap.options[0] ?? [], sourceMap: [] };
    this.slots.push({ key: `m${n}`, kind: 'mark', correct: [1] });
    // How the answer shows the word: a ring (the default), a box, a line
    // under it, a highlight; per word (`[[riega]]{mark=underline}`) or for
    // the exercise.
    const look = (gap.attrs?.mark ?? this.ex.attrs.mark ?? 'circle').trim();
    const on = look === 'box' || look === 'underline' || look === 'highlight' ? `${this.ids.markOn}-${look}` : this.ids.markOn;
    return chipRun(this.answered(n === 1) ? on : this.ids.mark, words.spans.length > 0 ? words : textRun(words.text, at), at, this.hit(`m${n}`, n === 1));
  }

  private keyOfGaps(): void {
    for (const g of this.ex.gaps) {
      const answer = g.gap.correct.map((k) => g.gap.texts[k] ?? '').filter(Boolean)[0] ?? '';
      if (answer) this.key.push(textRun(this.ex.gaps.length > 1 ? `${this.num(g.n)} ${answer}` : answer, this.at));
    }
  }

  /** The word bank: the blanks' answers and the distractors of `::bank`
   *  lines, in a box. */
  private bank(): ContentBlock[] {
    const words: Run[] = this.ex.kind === 'sort'
      ? this.ex.categories.flatMap((c) => c.items)
      : [...this.bankWords.filter((w) => w.text !== '')];
    for (const k of this.ex.banks) {
      const b = this.blocks[k]!;
      if (b.text.trim()) {
        const run = runOf(b);
        let last = 0;
        for (let j = 0; j <= run.text.length; j++) {
          if (j === run.text.length || run.text[j] === '|') {
            const w = trimRun(sliceRun(run, last, j));
            if (w.text) words.push(w);
            last = j + 1;
          }
        }
      }
    }
    // The answers of a gaps exercise are known only once the body is set.
    if (words.length === 0 && this.ex.kind !== 'sort') {
      for (const g of this.ex.gaps) if (!g.gap.choice && !(this.example && g.n === 1)) words.push(textRun(g.gap.texts[g.gap.correct[0] ?? 0] ?? '', this.at));
    }
    const order = this.style.bank.order === 'written'
      ? words.map((_, k) => k)
      : this.style.bank.order === 'alpha'
        ? words.map((_, k) => k).sort((a, b) => words[a]!.text.localeCompare(words[b]!.text, this.ctx.locale))
        : shuffledOrder(words.length, seededRandom(this.book.seed, this.ex.ordinal, 'bank'));
    const parts: Run[] = [];
    order.forEach((k, j) => {
      if (j > 0) parts.push(textRun(this.style.bank.separator, this.at));
      const slot = this.ex.kind === 'sort' ? { exercise: { ex: this.ex.id, slot: `s${k + 1}` } } : {};
      parts.push(chipRun(this.ids.word, words[k]!, words[k]!.sourceMap[0] ?? this.at, slot));
    });
    if (parts.length === 0) return [];
    const boxId = this.style.bank.box && this.ctx.boxIds.has(this.style.bank.box) ? this.style.bank.box : this.ids.bankBox;
    const g = this.open('callout', { type: boxId });
    return [g.start, ...this.paragraphs(this.ids.text, [joinRuns(...parts)]), g.end];
  }

  // --- Choice and true/false ---------------------------------------------------

  private optionText(block: number): Run {
    return this.gapsOf(trimRun(runOf(this.blocks[block]!)));
  }

  private options(qi: number): ContentBlock[] {
    const q = this.ex.questions[qi]!;
    const o = this.style.options;
    const order = o.shuffle ? shuffledOrder(q.options.length, seededRandom(this.book.seed, this.ex.ordinal, 'q', qi), false) : q.options.map((_, k) => k);
    const group = `q${qi + 1}`;
    this.slots.push({ key: group, kind: 'choice', options: q.options.length, correct: order.flatMap((k, pos) => (q.options[k]!.correct ? [pos + 1] : [])), multiple: q.multiple });
    // Side by side (`columns=n` or a row layout), a label and its words are
    // a space apart: the tabs go between the options.
    const asked = parseInt(this.ex.attrs.columns ?? '', 10);
    const inRows = (Number.isFinite(asked) && asked > 0) || o.layout === 'row';
    const items: Run[] = order.map((k, pos) => {
      const opt = q.options[k]!;
      const at = this.blocks[opt.block]!.sourceStart;
      const label = this.label(pos);
      const parts: Run[] = [];
      const slot = this.hit(`${group}o${pos + 1}`, qi === 0);
      const shown = this.answered(qi === 0);
      if (o.marker !== 'none') {
        parts.push(chipRun(shown && opt.correct ? this.ids.tickOn : this.ids.tick, textRun('\u00A0', at), at, slot));
        parts.push(textRun(SPACE, at));
      }
      if (label) {
        const labelRun = textRun(label, at);
        parts.push(o.marker === 'none' ? chipRun(shown && opt.correct ? this.ids.choiceRing : this.ids.choice, labelRun, at, slot) : labelRun);
      }
      if (parts.length > 0) parts.push(inRows ? textRun('\u00A0', at) : tabRun(at));
      parts.push(this.optionText(opt.block));
      return joinRuns(...parts);
    });
    const rightLabels = order.flatMap((k, pos) => (q.options[k]!.correct ? [this.bareLabel(pos) || plain(this.optionText(q.options[k]!.block))] : []));
    // One question: its right option's label and words; several: the labels.
    const single = this.ex.questions.length === 1 && rightLabels.length === 1 && o.labels !== 'none';
    if (single) {
      const right = order.findIndex((k) => q.options[k]!.correct);
      this.key.push(joinRuns(textRun(`${this.label(right)} `, this.at), this.optionText(q.options[order[right]!]!.block)));
    } else {
      this.key.push(textRun(`${this.ex.questions.length > 1 ? `${this.num(qi + 1)} ` : ''}${rightLabels.join(', ')}`, this.at));
    }
    // The stem's bracket to write the letter in (Chinese and Japanese tests).
    const blocks: ContentBlock[] = [];
    // The stem, numbered as the questions are counted.
    if (q.stem !== undefined) {
      const stem = this.passThrough(this.blocks[q.stem]!, q.stem);
      const at = stem.sourceStart;
      const n = this.ex.questions.filter((x) => x.stem !== undefined).indexOf(q) + 1;
      blocks.push(...this.paragraphs(this.ids.item, [joinRuns(textRun(this.item(n), at, { bold: this.numberBold }), tabRun(at), runOf(stem))]));
    }
    const optionStyle = q.stem !== undefined ? this.ids.optionUnder : this.ids.option;
    // `columns=3` on the fence, or a row layout: the options side by side.
    if (inRows) {
      const per = Math.max(1, Math.min(6, Number.isFinite(asked) && asked > 0 ? asked : o.columns ?? items.length));
      const rows: Run[] = [];
      for (let k = 0; k < items.length; k += per) {
        rows.push(joinRuns(...items.slice(k, k + per).flatMap((r, j) => (j > 0 ? [tabRun(this.at), r] : [r]))));
      }
      blocks.push(...this.paragraphs(`${this.ids.row}-${Math.min(6, per)}`, rows));
    } else {
      blocks.push(...this.paragraphs(optionStyle, items));
    }
    return blocks;
  }

  private statements(): ContentBlock[] {
    const [t, f] = this.style.trueFalse.labels;
    const runs: Run[] = [];
    this.ex.questions.forEach((q, k) => {
      const opt = q.options[0]!;
      const at = this.blocks[opt.block]!.sourceStart;
      const slot = `tf${k + 1}`;
      this.slots.push({ key: slot, kind: 'truefalse', correct: [opt.correct ? 1 : 2] });
      const marks: Run[] = [];
      if (this.style.trueFalse.look === 'bracket') {
        // One bracket to write the answer in: full width in Chinese and
        // Japanese, `（　）`.
        const wide = this.book.language === 'zh' || this.book.language === 'ja';
        const answer = textRun(opt.correct ? t : f, at);
        const shown = this.answered(k === 0);
        marks.push(textRun(wide ? '\uFF08' : '(', at), chipRun(shown ? this.ids.answer : this.ids.icon, answer, at, {
          widthText: `${t.length > f.length ? t : f}\u2003`, ...(shown ? {} : { blank: true as const, blankLabel: this.book.words.blank }), ...this.hit(slot, k === 0),
        }), textRun(wide ? '\uFF09' : ')', at));
      } else {
        marks.push(textRun(`${t}\u00A0`, at), chipRun(this.answered(k === 0) && opt.correct ? this.ids.tickOn : this.ids.tick, textRun('\u00A0', at), at, this.hit(`${slot}t`, k === 0)));
        marks.push(textRun(`\u2003${f}\u00A0`, at), chipRun(this.answered(k === 0) && !opt.correct ? this.ids.tickOn : this.ids.tick, textRun('\u00A0', at), at, this.hit(`${slot}f`, k === 0)));
      }
      // Before the statement (`place: 'start'`, a Brazilian `( ) frase`),
      // else flush with the line's end.
      const parts: Run[] = this.style.trueFalse.place === 'start'
        ? [textRun(this.item(k + 1), at), tabRun(at), ...marks, textRun(SPACE, at), this.optionText(opt.block)]
        : [textRun(this.item(k + 1), at), tabRun(at), this.optionText(opt.block), tabRun(at), ...marks];
      runs.push(joinRuns(...parts));
      this.key.push(textRun(`${this.num(k + 1)} ${opt.correct ? t : f}`, this.at));
    });
    return this.paragraphs(this.ids.statement, runs);
  }

  // --- Match, order, scramble, sort -------------------------------------------

  private match(): ContentBlock[] {
    const pairs = this.ex.pairs;
    const lefts = pairs.filter((p) => p.left.text !== '');
    const rights = pairs.map((p) => p.right);
    const order = this.ex.attrs.shuffle === 'false' ? rights.map((_, k) => k) : shuffledOrder(rights.length, seededRandom(this.book.seed, this.ex.ordinal, 'match'));
    // Position of each pair's right item in the printed column.
    const posOf = new Map<number, number>();
    order.forEach((k, pos) => posOf.set(k, pos));
    lefts.forEach((p, i) => {
      const pos = posOf.get(pairs.indexOf(p))!;
      // Written as the right item's label (the letters look).
      const label = this.style.match.look === 'dots' ? undefined : this.bareLabel(pos);
      this.slots.push({ key: `p${i + 1}`, kind: 'pair', correct: [pos + 1], ...(label ? { accept: [label] } : {}) });
      this.key.push(this.style.match.look === 'dots'
        ? joinRuns(this.gapsOf(p.left), textRun(' \u2013 ', this.at), this.gapsOf(p.right))
        : textRun(`${this.num(i + 1)} ${this.bareLabel(pos) || this.num(pos + 1)}`, this.at));
    });
    if (this.style.match.look === 'dots') {
      return this.drawnGrid(gridBox({
        kind: 'match', id: `${this.ids.frame}-match-${this.ex.ordinal}`, style: this.style,
        left: lefts.map((p) => plain(this.gapsOf(p.left))), right: order.map((k) => plain(this.gapsOf(rights[k]!))),
        links: this.teacher ? lefts.map((p) => posOf.get(pairs.indexOf(p))!) : this.example && lefts[0] ? [posOf.get(pairs.indexOf(lefts[0]))!] : undefined,
        bodySizePt: this.ctx.bodySizePt, lineHeightPt: this.ctx.lineHeightPt, measurePt: this.measure, labels: order.map((_, pos) => this.label(pos)),
        ...(this.ctx.bodyFont ? { font: this.ctx.bodyFont } : {}),
      }));
    }
    const rows = Math.max(lefts.length, order.length);
    const runs: Run[] = [];
    for (let i = 0; i < rows; i++) {
      const parts: Run[] = [];
      const p = lefts[i];
      if (p) {
        const pos = posOf.get(pairs.indexOf(p))!;
        parts.push(textRun(`${this.item(i + 1)} `, this.at), this.gapsOf(p.left), textRun(' ', this.at));
        parts.push(chipRun(this.answered(i === 0) ? this.ids.blankAnswer : this.ids.blank, textRun(this.bareLabel(pos) || this.num(pos + 1), this.at), this.at, {
          widthText: '\u2003\u2003', ...(this.answered(i === 0) ? {} : { blank: true as const, blankLabel: this.book.words.blank }), ...this.hit(`p${i + 1}`, i === 0),
        }));
      }
      parts.push(tabRun(this.at));
      const k = order[i];
      if (k !== undefined) parts.push(textRun(`${this.label(i) || this.num(i + 1)} `, this.at), this.gapsOf(rights[k]!));
      runs.push(joinRuns(...parts));
    }
    return this.paragraphs(this.ids.pairs, runs);
  }

  private order(): ContentBlock[] {
    const seq = this.ex.sequence;
    const order = this.ex.attrs.shuffle === 'false' ? seq.map((_, k) => k) : shuffledOrder(seq.length, seededRandom(this.book.seed, this.ex.ordinal, 'order'));
    const runs = order.map((k, pos) => {
      const at = this.blocks[seq[k]!]!.sourceStart;
      const slot = `o${pos + 1}`;
      this.slots.push({ key: slot, kind: 'rank', accept: [String(k + 1), this.num(k + 1)].filter((v, j, a) => a.indexOf(v) === j) });
      return joinRuns(
        chipRun(this.answered(k === 0) ? this.ids.rankAnswer : this.ids.rank, textRun(this.num(k + 1), at), at, {
          ...(this.answered(k === 0) ? {} : { blank: true as const, blankLabel: this.book.words.blank }), ...this.hit(slot, k === 0),
        }),
        tabRun(at),
        this.optionText(seq[k]!),
      );
    });
    this.key.push(textRun(order.map((k) => this.num(k + 1)).join(this.sep), this.at));
    return this.paragraphs(this.ids.item, runs);
  }

  private scramble(): ContentBlock[] {
    const out: ContentBlock[] = [];
    this.ex.sentences.forEach((s, k) => {
      const at = this.blocks[s.block]!.sourceStart;
      const order = shuffledOrder(s.pieces.length, seededRandom(this.book.seed, this.ex.ordinal, 'scramble', k));
      const words = order.flatMap((j, pos) => (pos > 0 ? [textRun(' / ', at), s.pieces[j]!] : [s.pieces[j]!]));
      out.push(...this.paragraphs(this.ids.item, [joinRuns(textRun(this.item(k + 1), at), tabRun(at), ...words)]));
      const sentence = s.pieces.map((p) => plain(p)).join(' ');
      out.push(...this.area(1, `sc${k + 1}`, [sentence], this.style.area.kind === 'none' ? 'lines' : this.style.area.kind, undefined, this.example && k === 0));
      this.key.push(textRun(`${this.num(k + 1)} ${sentence}`, at));
    });
    return out;
  }

  private sort(): ContentBlock[] {
    const cats = this.ex.categories;
    const rows = Math.max(1, ...cats.map((c) => c.items.length));
    const out: ContentBlock[] = [];
    const count = Math.min(cats.length, 4);
    const cols = this.open('columns', { count: String(count) });
    // A sub-column's width: the gap between two is a line of text.
    const colWidth = (this.measure - (count - 1) * this.ctx.lineHeightPt) / count;
    out.push(cols.start);
    cats.forEach((c, ci) => {
      out.push(...this.paragraphs(this.ids.instruction, [{ ...c.name, spans: c.name.spans.map((s) => ({ ...s, bold: true })) }]));
      out.push(...this.area(rows, `c${ci + 1}`, c.items.map((it) => plain(it)), 'lines', colWidth));
      this.key.push(joinRuns(textRun(`${plain(c.name)}: `, this.at), textRun(c.items.map((it) => plain(it)).join(', '), this.at)));
    });
    out.push(cols.end);
    // The words to sort: which category each answers.
    // The bank's word `s<n>` is the n-th item counted through the categories.
    cats.flatMap((c) => c.items.map(() => plain(c.name))).forEach((name, k) => this.slots.push({ key: `s${k + 1}`, kind: 'category', accept: [name] }));
    return out;
  }

  private grid(): ContentBlock[] {
    const ex = this.ex;
    const box = gridBox({
      kind: ex.kind as 'wordsearch' | 'crossword' | 'arithmetic', id: `${this.ids.frame}-grid-${ex.ordinal}`, style: this.style, exercise: ex,
      blocks: this.blocks, seed: this.book.seed, teacher: this.teacher, bodySizePt: this.ctx.bodySizePt, lineHeightPt: this.ctx.lineHeightPt, measurePt: this.measure,
      words: { across: this.book.words.across, down: this.book.words.down, comma: this.book.language === 'ar' ? '\u060C ' : this.book.language === 'zh' || this.book.language === 'ja' ? '\u3001' : ', ' },
      num: (n) => this.num(n),
      ...(this.ctx.digits ? { digits: this.ctx.digits } : {}),
      ...(this.ctx.rtl ? { rtl: true } : {}),
      ...(this.ctx.bodyFont ? { font: this.ctx.bodyFont } : {}),
    });
    const out = this.drawnGrid(box);
    if (box.key) this.key.push(...box.key.map((k) => textRun(k, this.at)));
    for (const w of box.unplaced ?? []) this.unplaced.push(w);
    if (box.clues && box.clues.length > 0) {
      out.push(...this.paragraphs(this.ids.key, box.clues.map((c) => (c.heading
        ? textRun(c.label, this.at, { bold: true })
        : joinRuns(textRun(c.label, this.at, { bold: true }), tabRun(this.at), c.clue ? this.gapsOf(c.clue) : EMPTY_RUN)))));
    }
    if (box.words && box.words.length > 0 && ex.attrs.hidden === undefined) {
      out.push(...this.paragraphs(this.ids.row, [joinRuns(...box.words.flatMap((w, k) => (k > 0 ? [textRun('\u2003', this.at), textRun(w, this.at)] : [textRun(w, this.at)])))]));
    }
    return out;
  }

  // --- Solutions --------------------------------------------------------------

  /** The solution as paragraphs: the number and the key, then (in the
   *  full layout) the worked solution's blocks. `listed`: among others at
   *  the end of a chapter. */
  solutionBlocks(listed: boolean): ContentBlock[] {
    if (this.key.length === 0) this.exerciseBlocks();
    const sol = solutionsOf(this.style, this.book);
    const lead = listed && this.number ? [textRun(`${this.number}${this.style.number.suffix || '.'}`, this.at, { bold: this.numberBold }), tabRun(this.at)] : [];
    const keyRun = this.key.length > 0 ? joinRuns(...this.key.flatMap((r, k) => (k > 0 ? [textRun(this.sep, this.at), r] : [r]))) : EMPTY_RUN;
    const out: ContentBlock[] = [];
    const worked: ContentBlock[] = [];
    if (sol.layout === 'full') {
      for (const s of this.ex.solutions) for (let j = s.start + 1; j < s.end; j++) worked.push(this.blocks[j]!);
    }
    // Nothing to print (an open question with no model answer): no entry.
    if (!keyRun.text && worked.length === 0) return [];
    // A worked solution's first paragraph goes on the number's line when
    // there is no key (an open question).
    if (!keyRun.text && worked[0]?.type === 'paragraph') {
      const first = worked.shift()!;
      out.push(...this.paragraphs(this.ids.key, [joinRuns(...lead, runOf(first))]));
    } else if (keyRun.text || lead.length > 0) {
      out.push(...this.paragraphs(this.ids.key, [joinRuns(...lead, keyRun)]));
    }
    const paras: ContentBlock[] = [];
    const flush = (): void => {
      if (paras.length > 0) out.push(...this.paragraphs(listed ? this.ids.key : this.ids.text, paras.splice(0).map((b) => listed ? joinRuns(tabRun(b.sourceStart), runOf(b)) : runOf(b))));
    };
    for (const b of worked) {
      if (b.type === 'paragraph') { paras.push(b); continue; }
      flush();
      out.push(b);
    }
    flush();
    return out;
  }

  /** The solution in a box after the exercise, turned upside down when
   *  `inverted`. */
  solutionBox(inverted: boolean): ContentBlock[] {
    const blocks = this.solutionBlocks(false);
    if (blocks.length === 0) return [];
    const sol = solutionsOf(this.style, this.book);
    const box = sol.box && this.ctx.boxIds.has(sol.box) ? sol.box : this.ids.solutionBox;
    const g = this.open('callout', { type: box, ...(inverted ? { turn: '180' } : {}) });
    return [g.start, ...blocks, g.end];
  }

  /** What the digital outputs need. */
  record(): ExerciseRecord {
    const sol = this.ex.solutions.flatMap((s) => {
      const out: string[] = [];
      for (let j = s.start + 1; j < s.end; j++) {
        const b = this.blocks[j]!;
        if (b.type === 'paragraph' || b.type === 'listItem') out.push(plain(runOf(b)));
      }
      return out;
    });
    const hints = this.ex.hints.flatMap((h) => {
      const out: string[] = [];
      for (let j = h.start + 1; j < h.end; j++) {
        const b = this.blocks[j]!;
        if (b.type === 'paragraph' || b.type === 'listItem') out.push(plain(runOf(b)));
      }
      return out;
    });
    return {
      id: this.ex.id,
      ordinal: this.ex.ordinal,
      number: this.number,
      kind: this.ex.kind,
      style: this.style.id,
      slots: this.slots,
      key: this.key.map((r) => plain(r)).join(' · '),
      ...(sol.length > 0 ? { solution: sol } : {}),
      ...(hints.length > 0 ? { hints } : {}),
      ...(this.ex.attrs.id ? { anchor: this.ex.attrs.id } : {}),
      ...(this.ex.attrs.mark ? { mark: this.ex.attrs.mark } : {}),
      ...(this.grids.length > 0 ? { grids: this.grids } : {}),
      ...(this.ex.attrs.id ? { anchorText: this.anchorText() } : {}),
      ...(this.ex.attrs.title ? { title: this.ex.attrs.title } : {}),
    };
  }
}

/** `v` to three decimals: a stable cache key. */
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** The words of `text` (start and end), as the language divides them:
 *  `Intl.Segmenter` where the runtime has it (Chinese and Japanese words
 *  too), else runs of letters and digits. */
export function wordRanges(text: string, locale?: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'word' }) => { segment(t: string): Iterable<{ index: number; segment: string; isWordLike?: boolean }> } }).Segmenter;
  if (Segmenter) {
    for (const s of new Segmenter(locale, { granularity: 'word' }).segment(text)) if (s.isWordLike) out.push([s.index, s.index + s.segment.length]);
    return out;
  }
  const re = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'\u2019-]*/gu;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** A length in points, `em` read against `sizePt`. */
export function dimPt(d: { value: number; unit: string }, sizePt: number): number {
  switch (d.unit) {
    case 'pt': return d.value;
    case 'mm': return (d.value / 25.4) * 72;
    case 'cm': return (d.value / 2.54) * 72;
    case 'in': return d.value * 72;
    case 'px': return d.value * 0.75;
    default: return d.value * sizePt;
  }
}
