// Exercises in the semantic .docx (#1444): each `:::exercise` as a box
// with its number, instruction and items, the answers left out of the
// pupil's text. The key goes where the book prints its solutions (after
// the exercise, at the end of the chapter, at a `:::solutions` line), or
// nowhere when it prints none. The fence and its answers stay in the
// Markdown: nothing written here maps to them, so the round trip leaves
// them as they are.

import type { ContentBlock } from '../../../parse/types.js';
import { resolvedLocale } from '../../../pipeline/config.js';
import { computeHeadingContext, type HeadingContext } from '../../../pipeline/resources/resourceNumbering.js';
import { headingIsNumbered } from '../../../pipeline/sections/headingStyles.js';
import { pickExerciseStyle, solutionsOf, type ExerciseSettings, type ResolvedExerciseStyle } from '../../../defaults/boxes/exercises.js';
import { exerciseSettingsFor } from '../../../exercises/build.js';
import { numberExercises, type ExpandContext } from '../../../exercises/expand.js';
import { readExercises } from '../../../exercises/model.js';
import { buildTree, renderNodes, type BlockEnv, type Node } from '../blocks.js';
import type { ParsedChapter } from '../chapter.js';
import type { WriterContext } from '../context.js';
import { exerciseBody, mappedParagraph } from './exerciseBody.js';
import { generatedRuns, type Piece } from '../generated.js';
import { STYLE } from '../styles.js';
import { blockSdt, hex, paragraph, px, twips } from '../wml.js';
import { inPartStyle } from '../design/partColor.js';
import type { ResolvedCalloutStyleConfig } from '../../../types.js';

type ContainerNode = Extract<Node, { container: unknown }>;

interface KeyEntry {
  number: string;
  key: string;
  /** Worked solutions, set after the key when the layout is `full`
   *  (only within the chapter that wrote them). */
  worked: Node[][];
  chapter: number;
  style: ResolvedExerciseStyle;
}

type Placed = Map<number, { number: string; ordinal: number }>;

interface ExerciseState {
  settings: ExerciseSettings;
  locale?: string;
  chapter: number;
  /** Every chapter's exercises by source start: number and ordinal. */
  byChapter: Placed[];
  /** This chapter's. */
  numbers: Placed;
  /** Keys waiting for the end of the chapter or a `:::solutions` line. */
  pending: KeyEntry[];
  /** Every key so far (`:::solutions{scope="book"}`). */
  book: KeyEntry[];
}

const states = new WeakMap<WriterContext, ExerciseState>();

function stateOf(ctx: WriterContext): ExerciseState {
  let s = states.get(ctx);
  if (!s) {
    const locale = resolvedLocale(ctx.resolved);
    s = { settings: exerciseSettingsFor(ctx.resolved), ...(locale ? { locale } : {}), chapter: -1, byChapter: [], numbers: new Map(), pending: [], book: [] };
    states.set(ctx, s);
  }
  if (s.chapter !== ctx.chapter.index) {
    s.chapter = ctx.chapter.index;
    s.numbers = s.byChapter[ctx.chapter.index] ?? new Map();
    s.pending = [];
  }
  return s;
}

const NO_HEADINGS: HeadingContext = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

/**
 * Number every chapter's exercises before the body is written, as the
 * engine numbers a book laid out chapter after chapter: each chapter
 * starts from the numbered headings of the chapters before it and carries
 * their exercise counters on, in the book's digits.
 */
export function prepareExercises(ctx: WriterContext, chapters: readonly ParsedChapter[]): void {
  const s = stateOf(ctx);
  const isNumbered = (b: ContentBlock): boolean => headingIsNumbered(b, ctx.resolved);
  let headings = NO_HEADINGS;
  let counters: Record<string, number> = {};
  chapters.forEach((pc, i) => {
    const placed: Placed = new Map();
    const { exercises } = readExercises(pc.blocks);
    if (exercises.length) {
      const expand = {
        settings: s.settings,
        ...(s.locale ? { locale: s.locale } : {}),
        ...(ctx.resolved.numerals ? { digits: ctx.resolved.numerals } : {}),
        headings,
        counters,
      } as unknown as ExpandContext;
      const out = numberExercises(pc.blocks, exercises, expand);
      counters = out.counters;
      for (const ex of exercises) placed.set(ex.sourceStart, { number: out.numbers.get(ex.id) ?? '', ordinal: ex.ordinal });
    }
    s.byChapter[i] = placed;
    const context = computeHeadingContext(pc.blocks, headings, isNumbered);
    if (context.length) headings = context[context.length - 1]!;
  });
  s.chapter = -1;
}

/** The container's blocks back in a flat list, its markers included. */
function flatten(node: ContainerNode): ContentBlock[] {
  const out: ContentBlock[] = [node.container];
  const walk = (nodes: readonly Node[]): void => {
    for (const n of nodes) {
      if ('block' in n) out.push(n.block);
      else {
        out.push(n.container);
        walk(n.children);
        if (n.end) out.push(n.end);
      }
    }
  };
  walk(node.children);
  out.push(node.end ?? { ...node.container, type: 'containerEnd' });
  return out;
}

/** How an exercise's box is drawn: its fill, its rule (none when the
 *  box style draws none) and its insets, twips. */
interface BoxLook {
  fill?: string;
  border?: string;
  pad: { top: number; left: number; bottom: number; right: number };
}

/** The look of the box style an exercise style names (#1444), or a thin
 *  rule in `color` round the exercise when it names none. */
function boxLook(ctx: WriterContext, box: ResolvedCalloutStyleConfig | undefined, color: string): BoxLook {
  if (!box) return { border: color, pad: { top: 100, left: 140, bottom: 100, right: 140 } };
  const u = ctx.units;
  const p = box.padding;
  const ink = box.border.enabled && px(u, box.border.width) > 0 ? hex(box.border.color) : undefined;
  return {
    fill: box.backgroundEnabled ? hex(box.background) : undefined,
    border: ink,
    pad: { top: twips(u, p.top), left: twips(u, p.left), bottom: twips(u, p.bottom), right: twips(u, p.right) },
  };
}

/** A one-cell table drawn as `look` around `content`. */
function boxTable(content: string, widthTwips: number, look: BoxLook): string {
  const w = Math.max(240, Math.round(widthTwips));
  const side = (name: string): string => (look.border ? `<w:${name} w:val="single" w:sz="6" w:space="0" w:color="${look.border}"/>` : `<w:${name} w:val="nil"/>`);
  const shd = look.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${look.fill}"/>` : '';
  const { top, left, bottom, right } = look.pad;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${w}" w:type="dxa"/><w:tblBorders>${side('top')}${side('left')}${side('bottom')}${side('right')}<w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>${shd}` +
    `<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="${top}" w:type="dxa"/><w:left w:w="${left}" w:type="dxa"/><w:bottom w:w="${bottom}" w:type="dxa"/><w:right w:w="${right}" w:type="dxa"/></w:tblCellMar>` +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
    `<w:tblGrid><w:gridCol w:w="${w}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shd}</w:tcPr>${content}</w:tc></w:tr></w:tbl>`
  );
}

/** The number, difficulty and title before the instruction. A number
 *  the style sets on a shape is a badge: the shape's colour shades it,
 *  in the number's own colour (white unless set), a space each side. */
function headPieces(style: ResolvedExerciseStyle, number: string, attrs: Record<string, string>): Piece[] {
  const out: Piece[] = [];
  const n = style.number;
  if (n.show && number) {
    const text = `${n.label ? `${n.label} ` : ''}${number}${n.suffix}`;
    const badge = n.shape !== 'none' ? hex(n.background) : undefined;
    if (badge) out.push({ text: `\u00a0${text}\u00a0`, b: true, shd: badge, color: hex(n.color) ?? 'FFFFFF' }, { text: ' ' });
    else out.push({ text: `${text} `, b: true });
  }
  const level = Number.parseInt(attrs.level ?? '', 10);
  if (Number.isFinite(level) && level > 0) {
    const max = Math.max(style.level.max, level);
    const ink = hex(style.level.color);
    out.push({ text: `${style.level.glyph.repeat(Math.min(level, max))}${style.level.empty.repeat(Math.max(0, max - level))} `, ...(ink ? { color: ink } : {}) });
  }
  if (attrs.title) out.push({ text: `${attrs.title} `, b: true });
  return out;
}

/** The answers of the exercises in `entries`, one paragraph each, as the
 *  engine prints them (`solutionBlocks`): the number when `listed` among
 *  others, the key, then a `full` layout's worked solution. An exercise
 *  with neither key nor worked solution prints nothing. */
function keyParagraphs(ctx: WriterContext, entries: readonly KeyEntry[], env: BlockEnv, listed: boolean, heading?: string): string {
  const s = stateOf(ctx);
  const props = { style: STYLE.normal, ind: { firstLine: 0 } };
  const workedOf = (e: KeyEntry): Node[] => (solutionsOf(e.style, s.settings.exercises).layout === 'full' && e.chapter === ctx.chapter.index ? e.worked.flat() : []);
  const printed = entries.filter((e) => e.key || workedOf(e).length);
  if (!printed.length) return '';
  // The heading first: fragments are logged in reading order.
  let xml = heading ? paragraph({ style: STYLE.boxTitle, keepNext: true }, generatedRuns(ctx, [{ text: heading, b: true }], 'exercise:solutions')) : '';
  for (const e of printed) {
    const worked = workedOf(e);
    const lead: Piece[] = listed && e.number ? [{ text: `${e.number}${e.style.number.suffix || '.'} `, b: true }] : [];
    const first = worked[0];
    // No key (an open question): the worked solution's first paragraph
    // goes on the number's line.
    if (!e.key && first && 'block' in first && first.block.type === 'paragraph') {
      xml += mappedParagraph(ctx, first.block, props, 'exercise:worked', lead);
      worked.shift();
    } else if (e.key || lead.length) xml += paragraph(props, generatedRuns(ctx, [...lead, { text: e.key }], 'exercise:key'));
    if (worked.length) xml += renderNodes(ctx, worked, env);
  }
  return xml;
}

/** A `:::exercise` fence. */
export function renderExercise(ctx: WriterContext, node: ContainerNode, env: BlockEnv): string {
  const s = stateOf(ctx);
  const flat = flatten(node);
  const { exercises } = readExercises(flat);
  const ex = exercises[0];
  if (!ex) return '';
  // In the colours of the part the exercise stands in.
  const style = inPartStyle(ctx, node.container, pickExerciseStyle(s.settings.styles, ex.attrs.style));
  const book = s.settings.exercises;
  const placed = s.numbers.get(node.container.sourceStart) ?? { number: '', ordinal: 0 };
  const rule = hex(style.number.background) ?? '808080';
  const width = (env.widthTwips ?? ctx.textTwips) - 280;
  let cell = '';
  // The number leads the first paragraph of the instruction.
  const head = headPieces(style, placed.number, ex.attrs);
  if (ex.instruction.length) {
    ex.instruction.forEach((k, i) => {
      cell += mappedParagraph(ctx, flat[k]!, { style: STYLE.normal, ind: { firstLine: 0 }, keepNext: true }, 'exercise:instruction', i === 0 ? head : []);
    });
  } else if (head.length) cell += paragraph({ style: STYLE.normal, keepNext: true }, generatedRuns(ctx, head, 'exercise:number'));
  const body = exerciseBody({ ctx, flat, ex, style, teacher: book.edition === 'teacher', seed: book.seed, ordinal: placed.ordinal, ...(s.locale ? { locale: s.locale } : {}), ...(ctx.resolved.numerals ? { digits: ctx.resolved.numerals } : {}), widthTwips: width, rule });
  for (const part of body.xml) {
    // Word joins two tables in a row; a paragraph keeps them apart.
    if (part.startsWith('<w:tbl>') && cell.endsWith('</w:tbl>')) cell += '<w:p/>';
    cell += part;
  }
  const worked = ex.solutions.map((r) => buildTree(flat.slice(r.start + 1, r.end)));
  const entry: KeyEntry = { number: placed.number, key: body.key, worked, chapter: ctx.chapter.index, style };
  s.book.push(entry);
  const placement = solutionsOf(style, book).placement;
  if (placement === 'after' || placement === 'inverted') cell += keyParagraphs(ctx, [entry], { ...env, widthTwips: width }, false);
  else if (placement === 'chapterEnd' || placement === 'directive') s.pending.push(entry);
  if (!cell || cell.endsWith('</w:tbl>')) cell += '<w:p/>';
  return blockSdt(ctx.nextSdtId(), 'ptx:exercise', ex.attrs.type ? `exercise: ${ex.attrs.type}` : `exercise: ${ex.kind}`, boxTable(cell, env.widthTwips ?? ctx.textTwips, boxLook(ctx, inPartStyle(ctx, node.container, style.box ? ctx.styles.callout(style.box) : undefined), rule)));
}

/** A `:::solutions` line: the keys waiting in the chapter, or the whole
 *  book's with `scope="book"`. */
export function renderSolutions(ctx: WriterContext, b: ContentBlock, env: BlockEnv): string {
  const s = stateOf(ctx);
  const entries = b.directiveAttrs?.scope === 'book' ? s.book : s.pending;
  const heading = b.directiveAttrs?.title ?? (entries[0] ? solutionsOf(entries[0].style, s.settings.exercises).heading : s.settings.exercises.solutions.heading);
  const xml = entries.length ? keyParagraphs(ctx, entries, env, true, heading || undefined) : '';
  s.pending = [];
  return xml ? blockSdt(ctx.nextSdtId(), 'ptx:solutions', undefined, xml) : '';
}

/** The keys waiting when one of them goes at the end of the chapter: all
 *  of them, as the engine flushes them where a chapter ends. */
function flushChapterEnd(ctx: WriterContext): string {
  const s = states.get(ctx);
  if (!s || s.chapter !== ctx.chapter.index) return '';
  const book = s.settings.exercises;
  if (!s.pending.some((e) => solutionsOf(e.style, book).placement === 'chapterEnd')) return '';
  const entries = s.pending;
  s.pending = [];
  const xml = keyParagraphs(ctx, entries, {}, true, solutionsOf(entries[0]!.style, book).heading || undefined);
  return xml ? blockSdt(ctx.nextSdtId(), 'ptx:solutions', undefined, xml) : '';
}

/** Before a level-1 heading: a chapter ends there, and its keys print
 *  before the next one opens (a file holding several chapters). */
export function solutionsBeforeHeading(ctx: WriterContext, b: ContentBlock): string {
  return b.level === 1 ? flushChapterEnd(ctx) : '';
}

/** The end of a chapter file: the keys printed at the end of it. */
export function chapterSolutions(ctx: WriterContext): string {
  return flushChapterEnd(ctx);
}
