// The body of an exercise in the semantic .docx (#1444): what each kind
// asks, set as Word paragraphs and tables, with the answers left out (a
// teacher's edition prints them in their slots). Words the Markdown holds
// as written (an option, a statement, a question) stay mapped to it, so a
// correction made in Word comes back; what the engine makes of the source
// (blanks, a shuffled column, a word bank) is generated text.

import type { ContentBlock, InlineSpan } from '../../parse/types.js';
import type { ResolvedExerciseStyle } from '../../defaults/boxes/exercises.js';
import type { ExerciseModel } from '../../exercises/types.js';
import type { Run } from '../../exercises/text.js';
import { runOf, trimRun } from '../../exercises/text.js';
import { seededRandom, shuffledOrder } from '../../exercises/shuffle.js';
import { counterStyleOf, formatCounter } from '../../numerals/numbering.js';
import { inlineSourceOf } from './blocks.js';
import { abs, blockId, type WriterContext } from './context.js';
import { generatedRuns, spanPieces, spansText, type Piece } from './generated.js';
import { renderInline } from './inline.js';
import { STYLE } from './styles.js';
import { paragraph, type ParaProps } from './wml.js';

/** What the body of one exercise is set from. */
export interface ExerciseInput {
  ctx: WriterContext;
  /** The exercise's blocks, its opening and closing markers included. */
  flat: readonly ContentBlock[];
  ex: ExerciseModel;
  style: ResolvedExerciseStyle;
  /** A teacher's edition: answers printed in their slots. */
  teacher: boolean;
  seed: number;
  /** The exercise's place among its chapter's (seeds its shuffles). */
  ordinal: number;
  locale?: string;
  /** Width of the box's content, twips. */
  widthTwips: number;
  /** Border colour of tables and the bank (hex). */
  rule: string;
}

export interface ExerciseBody {
  xml: string[];
  /** The answers in a line ("1 b · 2 water"), `''` when there are none. */
  key: string;
}

const INDENT = 360;
const KEY_SEP = ' · ';

/** An option's label (`a)`, `ア`), `''` when the style prints none. */
export function optionLabel(style: ResolvedExerciseStyle, k: number, locale?: string): string {
  if (style.options.labels === 'none') return '';
  return `${style.options.prefix}${formatCounter(k + 1, counterStyleOf(style.options.labels, locale), locale)}${style.options.suffix}`;
}

/** A block's own words as runs mapped to the source. */
function mappedRuns(ctx: WriterContext, b: ContentBlock, role: string): string {
  const { xml, frag } = renderInline(ctx, inlineSourceOf(ctx, b));
  return ctx.log.wrap(xml, frag, {
    block: blockId(ctx),
    target: { kind: 'markdown', chapter: ctx.chapter.index },
    range: [abs(ctx, b.sourceStart), abs(ctx, b.sourceEnd)],
    role,
  });
}

/** A paragraph: a generated lead, the block's own words, a generated tail
 *  (each logged in reading order). */
export function mappedParagraph(ctx: WriterContext, b: ContentBlock, props: ParaProps, role: string, lead: Piece[] = [], tail: Piece[] = []): string {
  const head = lead.length ? generatedRuns(ctx, lead, `${role}:label`) : '';
  const body = mappedRuns(ctx, b, role);
  const end = tail.length ? generatedRuns(ctx, tail, `${role}:label`) : '';
  return paragraph(props, head + body + end);
}

const genParagraph = (ctx: WriterContext, pieces: Piece[], props: ParaProps, role: string): string => paragraph(props, generatedRuns(ctx, pieces, role));

/** The text of a run, chips by their words. */
const runText = (r: Run): string => spansText(r.spans.length ? r.spans : [{ text: r.text, bold: false, italic: false }]);

/** A blank the length of the exercise's longest answer. */
function blankFor(input: ExerciseInput): string {
  let longest = 0;
  for (const g of input.ex.gaps) for (const t of g.gap.texts) longest = Math.max(longest, [...t].length);
  return '_'.repeat(Math.max(6, Math.min(24, longest + 3)));
}

/** A block whose gaps print as blanks (or, in a teacher's edition, as
 *  their answers underlined). Generated: the answers are in the source. */
function gapPieces(input: ExerciseInput, spans: readonly InlineSpan[]): Piece[] {
  const out: Piece[] = [];
  const blank = blankFor(input);
  for (const s of spans) {
    const gap = s.chip?.gap;
    if (!gap) {
      out.push(...spanPieces([s]));
      continue;
    }
    if (input.ex.kind === 'mark') out.push({ text: gap.texts.join(' '), ...(s.bold ? { b: true } : {}), ...(s.italic ? { i: true } : {}) });
    else if (gap.choice) out.push({ text: `(${gap.texts.join(' / ')})`, ...(input.teacher ? { u: true } : {}) });
    else if (input.teacher) out.push({ text: gap.texts[gap.correct[0] ?? 0] ?? '', u: true });
    else out.push({ text: blank });
  }
  return out;
}

const hasGap = (b: ContentBlock): boolean => b.spans.some((s) => s.chip?.gap);

/** A shuffled order, seeded as the engine seeds it. */
const shuffle = (input: ExerciseInput, n: number, what: string): number[] => shuffledOrder(n, seededRandom(input.seed, input.ordinal, what));

/** A one-row-per-item table (match columns, sort categories). */
function table(input: ExerciseInput, rows: string[][], header = false): string {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const w = Math.max(240, Math.floor(input.widthTwips / cols));
  const b = `w:val="single" w:sz="4" w:space="0" w:color="${input.rule}"`;
  const borders = `<w:tblBorders><w:top ${b}/><w:left ${b}/><w:bottom ${b}/><w:right ${b}/><w:insideH ${b}/><w:insideV ${b}/></w:tblBorders>`;
  const tr = rows.map((r, i) => `<w:tr>${i === 0 && header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${r.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${c || '<w:p/>'}</w:tc>`).join('')}</w:tr>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${w * cols}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>${`<w:gridCol w:w="${w}"/>`.repeat(cols)}</w:tblGrid>${tr}</w:tbl>`;
}

/** The words of the bank: the blanks' answers and the `::bank` words. */
function bankWords(input: ExerciseInput): string[] {
  const { ex, flat } = input;
  const words: string[] = ex.kind === 'sort' ? ex.categories.flatMap((c) => c.items.map(runText)) : [];
  if (ex.kind !== 'sort') for (const g of ex.gaps) if (!g.gap.choice) words.push(g.gap.texts[g.gap.correct[0] ?? 0] ?? '');
  for (const k of ex.banks) for (const w of flat[k]!.text.split('|')) if (w.trim()) words.push(w.trim());
  const list = words.filter((w) => w !== '');
  const order = input.style.bank.order === 'written'
    ? list.map((_, k) => k)
    : input.style.bank.order === 'alpha'
      ? list.map((_, k) => k).sort((a, b) => list[a]!.localeCompare(list[b]!, input.locale))
      : shuffle(input, list.length, 'bank');
  return order.map((k) => list[k]!);
}

/** The word bank: a bordered paragraph. */
function bank(input: ExerciseInput): string {
  const words = bankWords(input);
  if (!words.length) return '';
  const border = { color: input.rule, sz: 6, space: 4 };
  const sep = input.style.bank.separator || ' ';
  return genParagraph(input.ctx, [{ text: words.join(sep) }], { style: STYLE.normal, jc: 'center', ind: { firstLine: 0 }, border: { top: border, left: border, bottom: border, right: border }, before: 120, after: 120 }, 'exercise:bank');
}

/** The body, item by item, and the key. */
export function exerciseBody(input: ExerciseInput): ExerciseBody {
  const { ctx, flat, ex, style } = input;
  const out: string[] = [];
  const key: string[] = [];
  const item: ParaProps = { style: STYLE.normal, ind: { left: INDENT, firstLine: 0 } };
  const wantsBank = (ex.attrs.bank !== undefined && ex.attrs.bank !== 'false') || ex.banks.length > 0 || ex.kind === 'sort';
  let bankDone = !wantsBank;
  const placeBank = (): void => {
    if (bankDone) return;
    bankDone = true;
    out.push(bank(input));
  };
  // A bank written at a `::bank` line stands there; else above the items.
  if (wantsBank && ex.banks.length === 0) placeBank();
  const groups = new Set<number>();
  let ordered = 0;
  const optionAt = new Map<number, { q: number; k: number; correct: boolean }>();
  ex.questions.forEach((q, qi) => q.options.forEach((o, k) => optionAt.set(o.block, { q: qi, k, correct: o.correct })));
  const tf = style.trueFalse.labels;

  for (const k of ex.body) {
    if (ex.banks.length && !bankDone && k > ex.banks[0]!) placeBank();
    const b = flat[k]!;
    if (b.type === 'containerStart' || b.type === 'containerEnd' || b.type === 'directive') continue;
    if (ex.items.has(k) && !optionAt.has(k) && ex.kind !== 'choice') {
      // Kinds that set their items together, where the first one stands.
      if (!groups.has(0)) {
        groups.add(0);
        out.push(...itemGroup(input, key));
      }
      continue;
    }
    const opt = optionAt.get(k);
    if (opt && ex.kind === 'truefalse') {
      const mark = input.teacher ? [{ text: `   ${opt.correct ? tf[0] : tf[1]}`, b: true }] : [{ text: `   ☐ ${tf[0]}   ☐ ${tf[1]}` }];
      out.push(mappedParagraph(ctx, b, item, 'exercise:statement', [{ text: `${opt.q + 1}. ` }], mark));
      key.push(`${opt.q + 1} ${opt.correct ? tf[0] : tf[1]}`);
      continue;
    }
    if (opt) {
      const label = optionLabel(style, opt.k, input.locale);
      const lead: Piece[] = [{ text: `${label ? `${label} ` : '☐ '}` }];
      const tail: Piece[] = input.teacher && opt.correct ? [{ text: ' ✓', b: true }] : [];
      out.push(mappedParagraph(ctx, b, { ...item, ind: { left: INDENT * 2, firstLine: 0 } }, 'exercise:option', lead, tail));
      continue;
    }
    // Any other text: as written when it has no gap, else with blanks.
    const lead: Piece[] = [];
    if (b.type === 'listItem') {
      if (b.listKind === 'ordered') {
        ordered = b.startNumber !== undefined && ordered === 0 ? b.startNumber : ordered + 1;
        lead.push({ text: `${ordered}. ` });
      } else lead.push({ text: '• ' });
    }
    if (hasGap(b)) out.push(genParagraph(ctx, [...lead, ...gapPieces(input, b.spans)], b.type === 'listItem' ? item : { style: STYLE.normal }, 'exercise:gaps'));
    else if (b.type === 'paragraph' || b.type === 'listItem') out.push(mappedParagraph(ctx, b, b.type === 'listItem' ? item : { style: STYLE.normal }, 'exercise:text', lead));
  }
  placeBank();
  if (ex.kind === 'choice') {
    ex.questions.forEach((q, qi) => {
      const right = q.options.map((o, k) => (o.correct ? optionLabel(style, k, input.locale) || String(k + 1) : '')).filter(Boolean).join(', ');
      if (right) key.push(ex.questions.length > 1 ? `${qi + 1} ${right}` : right);
    });
  }
  if (ex.kind === 'gaps' || ex.kind === 'mark' || (ex.kind === 'choice' && !ex.questions.length)) {
    for (const g of ex.gaps) key.push(`${g.n} ${g.gap.correct.map((c) => g.gap.texts[c] ?? '').join(' / ')}`);
  }
  if (ex.kind === 'open') {
    const lines = Number.parseInt(ex.attrs.lines ?? '', 10);
    const n = Number.isFinite(lines) ? Math.max(0, Math.min(40, lines)) : style.area.kind === 'none' ? 0 : style.area.lines;
    const rule = { color: 'A6A6A6', sz: 4, space: 1 };
    for (let i = 0; i < n; i++) out.push(paragraph({ style: STYLE.normal, ind: { firstLine: 0 }, border: { bottom: rule }, before: 0, after: 0, line: { twips: 440, rule: 'exact' } }, ''));
  }
  return { xml: out, key: key.join(KEY_SEP) };
}

/** The label of the k-th answer of a column: the style's, else a letter
 *  (the questions beside it are numbered). */
const letter = (input: ExerciseInput, k: number): string => optionLabel(input.style, k, input.locale) || `${formatCounter(k + 1, counterStyleOf('lower-alpha', input.locale), input.locale)})`;

/** The items of match, order, scramble, sort, word search, crossword and
 *  arithmetic exercises, set together; their key pushed on `key`. */
function itemGroup(input: ExerciseInput, key: string[]): string[] {
  const { ctx, ex } = input;
  const p = (pieces: Piece[], role: string, props: ParaProps = { style: STYLE.normal, ind: { left: INDENT, firstLine: 0 } }): string => genParagraph(ctx, pieces, props, role);
  switch (ex.kind) {
    case 'match': {
      const lefts = ex.pairs.filter((x) => x.left.text !== '');
      const order = shuffle(input, ex.pairs.length, 'match');
      const rows: string[][] = [];
      const count = Math.max(lefts.length, order.length);
      for (let i = 0; i < count; i++) {
        const l = lefts[i];
        const r = order[i] !== undefined ? ex.pairs[order[i]!] : undefined;
        rows.push([l ? p([{ text: `${i + 1}. ${runText(l.left)}` }], 'exercise:match', { style: STYLE.normal }) : '', r ? p([{ text: `${letter(input, i)} ${runText(r.right)}` }], 'exercise:match', { style: STYLE.normal }) : '']);
      }
      lefts.forEach((l, i) => {
        const at = order.indexOf(ex.pairs.indexOf(l));
        if (at >= 0) key.push(`${i + 1} ${letter(input, at)}`);
      });
      return [table(input, rows)];
    }
    case 'order': {
      const order = shuffle(input, ex.sequence.length, 'order');
      const out = order.map((k) => p([{ text: '☐ ' }, ...spanPieces(trimRun(runOf(input.flat[ex.sequence[k]!]!)).spans)], 'exercise:order'));
      key.push(ex.sequence.map((_, k) => String(order.indexOf(k) + 1)).join(' '));
      return out;
    }
    case 'scramble':
      return ex.sentences.map((s, i) => {
        const order = shuffle(input, s.pieces.length, `scramble${i}`);
        key.push(`${i + 1} ${s.pieces.map(runText).join(' ')}`);
        return p([{ text: `${i + 1}. ${order.map((k) => runText(s.pieces[k]!)).join(' / ')}` }], 'exercise:scramble');
      });
    case 'sort':
      for (const c of ex.categories) key.push(`${runText(c.name)}: ${c.items.map(runText).join(', ')}`);
      return [table(input, [ex.categories.map((c) => p([{ text: runText(c.name), b: true }], 'exercise:sort', { style: STYLE.normal, jc: 'center' })), ex.categories.map(() => '')], true)];
    case 'wordsearch':
    case 'crossword': {
      key.push(ex.entries.map((e) => e.word).join(', '));
      const out = [p([{ text: gridNote(input), i: true }], 'exercise:grid')];
      if (ex.kind === 'wordsearch') out.push(p([{ text: ex.entries.map((e) => e.word).join(' ') }], 'exercise:words'));
      else ex.entries.forEach((e, i) => { if (e.clue) out.push(p([{ text: `${i + 1}. ${runText(e.clue)} (${[...e.word].length})` }], 'exercise:clue')); });
      return out;
    }
    case 'arithmetic':
      return ex.operations.map((o, i) => {
        key.push(`${i + 1} ${o.result}${o.remainder ? ` r ${o.remainder}` : ''}`);
        return p([{ text: `${i + 1}. ${o.a} ${o.sign ?? o.op} ${o.b} = ` }, input.teacher ? { text: o.result, u: true } : { text: '________' }], 'exercise:operation');
      });
    default:
      return [];
  }
}

/** Where a grid exercise's letters are, in the book's language. */
function gridNote(input: ExerciseInput): string {
  const lang = (input.locale ?? 'en').toLowerCase().split('-')[0]!;
  return GRID_NOTE[lang] ?? GRID_NOTE.en!;
}

const GRID_NOTE: Record<string, string> = {
  en: 'The grid is printed in the PDF and in the formatted .docx.',
  es: 'La cuadrícula está en el PDF y en el .docx maquetado.',
  ca: 'La quadrícula és al PDF i al .docx maquetat.',
  fr: 'La grille figure dans le PDF et dans le .docx mis en page.',
  de: 'Das Gitter steht im PDF und in der gesetzten .docx.',
  it: 'La griglia è nel PDF e nel .docx impaginato.',
  pt: 'A grade está no PDF e no .docx diagramado.',
  zh: '方格见 PDF 和版式 .docx。',
  ja: 'マス目は PDF と組版どおりの .docx にあります。',
  ar: 'الشبكة في ملف PDF وفي ملف ‎.docx المُنسَّق.',
};
