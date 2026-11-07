// Exercises in the semantic .docx (#1444): each `:::exercise` as a box
// with its number, instruction and items, the answers left out of the
// pupil's text. The key goes where the book prints its solutions (after
// the exercise, at the end of the chapter, at a `:::solutions` line), or
// nowhere when it prints none. The fence and its answers stay in the
// Markdown: nothing written here maps to them, so the round trip leaves
// them as they are.

import type { ContentBlock } from '../../parse/types.js';
import { parseMarkdownWithIssues } from '../../parse/index.js';
import { pickExerciseStyle, solutionsOf, type ExerciseSettings, type ResolvedExerciseStyle } from '../../defaults/boxes/exercises.js';
import { exerciseSettingsFor } from '../../exercises/build.js';
import { numberExercises, type ExpandContext } from '../../exercises/expand.js';
import { readExercises } from '../../exercises/model.js';
import { buildTree, renderNodes, type BlockEnv, type Node } from './blocks.js';
import type { WriterContext } from './context.js';
import { exerciseBody, mappedParagraph } from './exerciseBody.js';
import { generatedRuns, type Piece } from './generated.js';
import { STYLE } from './styles.js';
import { blockSdt, hex, paragraph } from './wml.js';

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

interface ExerciseState {
  settings: ExerciseSettings;
  counters: Record<string, number>;
  headings: { h1: number; h2: number };
  chapter: number;
  /** This chapter's exercises by source start: number and ordinal. */
  numbers: Map<number, { number: string; ordinal: number }>;
  /** Keys waiting for the end of the chapter or a `:::solutions` line. */
  pending: KeyEntry[];
  /** Every key so far (`:::solutions{scope="book"}`). */
  book: KeyEntry[];
}

const states = new WeakMap<WriterContext, ExerciseState>();

function stateOf(ctx: WriterContext): ExerciseState {
  let s = states.get(ctx);
  if (!s) {
    s = { settings: exerciseSettingsFor(ctx.resolved), counters: {}, headings: { h1: 0, h2: 0 }, chapter: -1, numbers: new Map(), pending: [], book: [] };
    states.set(ctx, s);
  }
  if (s.chapter !== ctx.chapter.index) numberChapter(ctx, s);
  return s;
}

/** Number the chapter's exercises as the engine does, its counters
 *  carried from the chapters before. */
function numberChapter(ctx: WriterContext, s: ExerciseState): void {
  s.chapter = ctx.chapter.index;
  s.numbers = new Map();
  s.pending = [];
  const { blocks } = parseMarkdownWithIssues(ctx.chapter.markdown.slice(ctx.chapter.offset));
  const { exercises } = readExercises(blocks);
  const expand = { settings: s.settings, locale: ctx.config.locale, counters: s.counters, headings: { h1: s.headings.h1, h2: s.headings.h2, h3: 0, h4: 0, h5: 0, h6: 0 } } as unknown as ExpandContext;
  const { numbers, counters } = numberExercises(blocks, exercises, expand);
  s.counters = counters;
  for (const ex of exercises) s.numbers.set(ex.sourceStart, { number: numbers.get(ex.id) ?? '', ordinal: ex.ordinal });
  for (const b of blocks) {
    if (b.type !== 'heading') continue;
    if (b.level === 1) s.headings = { h1: s.headings.h1 + 1, h2: 0 };
    else if (b.level === 2) s.headings.h2++;
  }
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

/** A one-cell table bordered in `color` around `content`. */
function boxTable(content: string, widthTwips: number, color: string): string {
  const w = Math.max(240, Math.round(widthTwips));
  const b = `w:val="single" w:sz="6" w:space="0" w:color="${color}"`;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${w}" w:type="dxa"/><w:tblBorders><w:top ${b}/><w:left ${b}/><w:bottom ${b}/><w:right ${b}/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>` +
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tblCellMar>' +
    '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
    `<w:tblGrid><w:gridCol w:w="${w}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${content}</w:tc></w:tr></w:tbl>`
  );
}

/** The number, difficulty and title before the instruction. */
function headPieces(style: ResolvedExerciseStyle, number: string, attrs: Record<string, string>): Piece[] {
  const out: Piece[] = [];
  if (style.number.show && number) out.push({ text: `${style.number.label ? `${style.number.label} ` : ''}${number}${style.number.suffix} `, b: true });
  const level = Number.parseInt(attrs.level ?? '', 10);
  if (Number.isFinite(level) && level > 0) {
    const max = Math.max(style.level.max, level);
    out.push({ text: `${style.level.glyph.repeat(Math.min(level, max))}${style.level.empty.repeat(Math.max(0, max - level))} ` });
  }
  if (attrs.title) out.push({ text: `${attrs.title} `, b: true });
  return out;
}

/** The answers of the exercises in `entries`, one paragraph each. */
function keyParagraphs(ctx: WriterContext, entries: readonly KeyEntry[], env: BlockEnv, heading?: string): string {
  let xml = heading ? paragraph({ style: STYLE.boxTitle, keepNext: true }, generatedRuns(ctx, [{ text: heading, b: true }], 'exercise:solutions')) : '';
  for (const e of entries) {
    if (e.key || e.number) xml += paragraph({ style: STYLE.normal, ind: { firstLine: 0 } }, generatedRuns(ctx, [{ text: e.number ? `${e.number}${e.style.number.suffix} ` : '', b: true }, { text: e.key }], 'exercise:key'));
    const full = solutionsOf(e.style, stateOf(ctx).settings.exercises).layout === 'full';
    if (full && e.chapter === ctx.chapter.index) for (const nodes of e.worked) xml += renderNodes(ctx, nodes, env);
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
  const style = pickExerciseStyle(s.settings.styles, ex.attrs.style);
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
  const body = exerciseBody({ ctx, flat, ex, style, teacher: book.edition === 'teacher', seed: book.seed, ordinal: placed.ordinal, locale: ctx.config.locale, widthTwips: width, rule });
  for (const part of body.xml) {
    // Word joins two tables in a row; a paragraph keeps them apart.
    if (part.startsWith('<w:tbl>') && cell.endsWith('</w:tbl>')) cell += '<w:p/>';
    cell += part;
  }
  const worked = ex.solutions.map((r) => buildTree(flat.slice(r.start + 1, r.end)));
  const entry: KeyEntry = { number: placed.number, key: body.key, worked, chapter: ctx.chapter.index, style };
  s.book.push(entry);
  const placement = solutionsOf(style, book).placement;
  if (placement === 'after' || placement === 'inverted') cell += keyParagraphs(ctx, [entry], { ...env, widthTwips: width });
  else if (placement === 'chapterEnd' || placement === 'directive') s.pending.push(entry);
  if (!cell || cell.endsWith('</w:tbl>')) cell += '<w:p/>';
  return blockSdt(ctx.nextSdtId(), 'ptx:exercise', ex.attrs.type ? `exercise: ${ex.attrs.type}` : `exercise: ${ex.kind}`, boxTable(cell, env.widthTwips ?? ctx.textTwips, rule));
}

/** A `:::solutions` line: the keys waiting in the chapter, or the whole
 *  book's with `scope="book"`. */
export function renderSolutions(ctx: WriterContext, b: ContentBlock, env: BlockEnv): string {
  const s = stateOf(ctx);
  const entries = b.directiveAttrs?.scope === 'book' ? s.book : s.pending;
  const heading = b.directiveAttrs?.title ?? (entries[0] ? solutionsOf(entries[0].style, s.settings.exercises).heading : s.settings.exercises.solutions.heading);
  const xml = entries.length ? keyParagraphs(ctx, entries, env, heading || undefined) : '';
  s.pending = [];
  return xml ? blockSdt(ctx.nextSdtId(), 'ptx:solutions', undefined, xml) : '';
}

/** The end of a chapter: the keys printed at the end of it. */
export function chapterSolutions(ctx: WriterContext): string {
  const s = states.get(ctx);
  if (!s || s.chapter !== ctx.chapter.index) return '';
  const end = s.pending.filter((e) => solutionsOf(e.style, s.settings.exercises).placement === 'chapterEnd');
  s.pending = [];
  if (!end.length) return '';
  return blockSdt(ctx.nextSdtId(), 'ptx:solutions', undefined, keyParagraphs(ctx, end, {}, solutionsOf(end[0]!.style, s.settings.exercises).heading || undefined));
}
