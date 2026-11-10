// The body of an exercise in the semantic .docx (#1444): what each kind
// asks, set as Word paragraphs and tables, with the answers left out (a
// teacher's edition prints them in their slots). Words the Markdown holds
// as written (an option, a statement, a question) stay mapped to it, so a
// correction made in Word comes back; what the engine makes of the source
// (blanks, a shuffled column, a word bank) is generated text.

import type { ContentBlock, InlineSpan } from '../../../parse/types.js';
import type { DigitSystem } from '../../../types.js';
import type { ResolvedExerciseStyle } from '../../../defaults/boxes/exercises.js';
import type { ExerciseModel } from '../../../exercises/types.js';
import type { Run } from '../../../exercises/text.js';
import { runOf, trimRun } from '../../../exercises/text.js';
import { seededRandom, shuffledOrder } from '../../../exercises/shuffle.js';
import { counterStyleOf, formatCounter } from '../../../numerals/numbering.js';
import { inlineSourceOf } from '../blocks.js';
import { markInserts } from '../marks.js';
import { abs, blockId, type WriterContext } from '../context.js';
import { generatedRuns, spanPieces, spansText, type Piece } from '../generated.js';
import { renderInline, type InlineSource } from '../inline.js';
import { STYLE } from '../styles.js';
import { paragraph, type ParaProps } from '../wml.js';

/** An empty box and an empty ring to tick (#1444), as the white square
 *  and white circle of the geometric shapes in Arial: the ballot box ☐
 *  lives only in symbol faces (Segoe UI Symbol, MS Gothic) that LibreOffice,
 *  Word for Mac and Google Docs may not have, and they then draw a blank.
 *  Arial has □ and ○ on every system, and LibreOffice's stand-in for it
 *  (Liberation Sans) has them too. */
export const MARK_FONT = 'Arial';
const BOX: Piece = { text: '\u25A1', font: MARK_FONT };
const RING: Piece = { text: '\u25CB', font: MARK_FONT };

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
  /** The book's digits (`١`, `۱`), when not Latin. */
  digits?: DigitSystem;
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

/** Between two answers of a key: a middle dot, but `؛` in Arabic, where a
 *  dot beside Arabic-Indic digits reads as a zero. */
const keySep = (input: ExerciseInput): string => ((input.locale ?? '').toLowerCase().startsWith('ar') ? '\u061B ' : ' · ');

/** An item's number in the book's digits. */
const num = (input: ExerciseInput, n: number): string => formatCounter(n, counterStyleOf('decimal', input.locale), input.locale, input.digits);

/** An option's label (`a)`, `ア`), `''` when the style prints none. */
export function optionLabel(style: ResolvedExerciseStyle, k: number, locale?: string, digits?: DigitSystem): string {
  if (style.options.labels === 'none') return '';
  return `${style.options.prefix}${formatCounter(k + 1, counterStyleOf(style.options.labels, locale), locale, digits)}${style.options.suffix}`;
}

/** A block's own words as runs mapped to the source (`source` when the
 *  block's text is set otherwise, its gaps as blanks). */
function mappedRuns(ctx: WriterContext, b: ContentBlock, role: string, source: InlineSource = inlineSourceOf(ctx, b)): string {
  const { xml, frag } = renderInline(ctx, source);
  return ctx.log.wrap(xml, frag, {
    block: blockId(ctx),
    target: { kind: 'markdown', chapter: ctx.chapter.index },
    range: [abs(ctx, b.sourceStart), abs(ctx, b.sourceEnd)],
    role,
  });
}

/** A paragraph: a generated lead, the block's own words, a generated tail
 *  (each logged in reading order). */
export function mappedParagraph(ctx: WriterContext, b: ContentBlock, props: ParaProps, role: string, lead: Piece[] = [], tail: Piece[] = [], source?: InlineSource): string {
  const head = lead.length ? generatedRuns(ctx, lead, `${role}:label`) : '';
  const body = mappedRuns(ctx, b, role, source);
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

/** How one gap prints: a blank (in a teacher's edition, its answer in
 *  bold), an inline choice with every option (the right one in bold for
 *  the teacher), or a marked word as it is. */
function gapPieces(input: ExerciseInput, s: InlineSpan): Piece[] {
  const gap = s.chip!.gap!;
  if (input.ex.kind === 'mark') return [{ text: gap.texts.join(' '), ...(s.bold ? { b: true } : {}), ...(s.italic ? { i: true } : {}) }];
  if (gap.choice) {
    // Chinese and Japanese print the choice in full-width brackets, the
    // options an ideographic space or a middle dot apart (as the engine).
    const lang = (input.locale ?? '').toLowerCase().split('-')[0];
    const wide = lang === 'zh' || lang === 'ja';
    const out: Piece[] = [{ text: wide ? '\uFF08' : '(' }];
    gap.texts.forEach((t, k) => {
      if (k > 0) out.push({ text: lang === 'zh' ? '\u3000' : lang === 'ja' ? '\u30FB' : ' / ' });
      out.push({ text: t, ...(input.teacher && gap.correct.includes(k) ? { b: true } : {}) });
    });
    out.push({ text: wide ? '\uFF09' : ')' });
    return out;
  }
  if (input.teacher) return [{ text: gap.texts[gap.correct[0] ?? 0] ?? '', b: true }];
  return [{ text: blankFor(input) }];
}

/**
 * The block's inline source with each gap replaced by how it prints. The
 * words around the gaps keep their source offsets, so a correction to
 * them comes back; what stands for a gap maps nowhere, so typing into a
 * blank is reported as an edit to generated text and the gap's source
 * stays as written.
 */
function gapSource(input: ExerciseInput, b: ContentBlock): InlineSource {
  const base = inlineSourceOf(input.ctx, b);
  const spans: InlineSpan[] = [];
  const sourceMap: number[] = [];
  let text = '';
  let p = 0;
  for (const s of base.spans) {
    const len = s.text.length;
    if (s.chip?.gap) {
      for (const piece of gapPieces(input, s)) {
        if (!piece.text) continue;
        spans.push({ text: piece.text, bold: !!piece.b, italic: !!piece.i });
        for (let k = 0; k < piece.text.length; k++) sourceMap.push(-1);
        text += piece.text;
      }
    } else {
      spans.push(s);
      for (let k = 0; k < len; k++) sourceMap.push(base.sourceMap[p + k] ?? -1);
      text += s.text;
    }
    p += len;
  }
  return { ...base, text, spans, sourceMap, inserts: markInserts(input.ctx, b, sourceMap) };
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
  const optionAt = new Map<number, { q: number; k: number; correct: boolean; multiple: boolean }>();
  ex.questions.forEach((q, qi) => q.options.forEach((o, k) => optionAt.set(o.block, { q: qi, k, correct: o.correct, multiple: q.multiple })));
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
      const mark = input.teacher ? [{ text: `   ${opt.correct ? tf[0] : tf[1]}`, b: true }] : [{ text: '   ' }, BOX, { text: ` ${tf[0]}   ` }, BOX, { text: ` ${tf[1]}` }];
      out.push(mappedParagraph(ctx, b, item, 'exercise:statement', [{ text: `${num(input, opt.q + 1)}. ` }], mark));
      key.push(`${num(input, opt.q + 1)} ${opt.correct ? tf[0] : tf[1]}`);
      continue;
    }
    if (opt) {
      const label = optionLabel(style, opt.k, input.locale, input.digits);
      // The style's marker (a box or a ring) before the label, as the
      // engine prints it; an option with neither is ticked in a ring when
      // the question has one answer, in a box when it has several.
      const marker = style.options.marker;
      const tick = marker === 'box' ? BOX : marker === 'circle' ? RING : label ? undefined : opt.multiple ? BOX : RING;
      const lead: Piece[] = [...(tick ? [tick, { text: ' ' }] : []), ...(label ? [{ text: `${label} ` }] : [])];
      const tail: Piece[] = input.teacher && opt.correct ? [{ text: ' ✓', b: true }] : [];
      out.push(mappedParagraph(ctx, b, { ...item, ind: { left: INDENT * 2, firstLine: 0 } }, 'exercise:option', lead, tail));
      continue;
    }
    // Any other text: as written when it has no gap, else with blanks.
    const lead: Piece[] = [];
    if (b.type === 'listItem') {
      if (b.listKind === 'ordered') {
        ordered = b.startNumber !== undefined && ordered === 0 ? b.startNumber : ordered + 1;
        lead.push({ text: `${num(input, ordered)}. ` });
      } else lead.push({ text: '• ' });
    }
    if (hasGap(b)) out.push(mappedParagraph(ctx, b, b.type === 'listItem' ? item : { style: STYLE.normal }, 'exercise:gaps', lead, [], gapSource(input, b)));
    else if (b.type === 'paragraph' || b.type === 'listItem') out.push(mappedParagraph(ctx, b, b.type === 'listItem' ? item : { style: STYLE.normal }, 'exercise:text', lead));
  }
  placeBank();
  if (ex.kind === 'choice') {
    ex.questions.forEach((q, qi) => {
      const right = q.options.map((o, k) => (o.correct ? optionLabel(style, k, input.locale, input.digits) || num(input, k + 1) : '')).filter(Boolean).join(', ');
      if (right) key.push(ex.questions.length > 1 ? `${num(input, qi + 1)} ${right}` : right);
    });
  }
  if (ex.kind === 'gaps' || ex.kind === 'mark' || (ex.kind === 'choice' && !ex.questions.length)) {
    for (const g of ex.gaps) key.push(`${num(input, g.n)} ${g.gap.correct.map((c) => g.gap.texts[c] ?? '').join(' / ')}`);
  }
  if (ex.kind === 'open') {
    const lines = Number.parseInt(ex.attrs.lines ?? '', 10);
    const n = Number.isFinite(lines) ? Math.max(0, Math.min(40, lines)) : style.area.kind === 'none' ? 0 : style.area.lines;
    const rule = { color: 'A6A6A6', sz: 4, space: 1 };
    for (let i = 0; i < n; i++) out.push(paragraph({ style: STYLE.normal, ind: { firstLine: 0 }, border: { bottom: rule }, before: 0, after: 0, line: { twips: 440, rule: 'exact' } }, ''));
  }
  return { xml: out, key: key.join(keySep(input)) };
}

/** The label of the k-th answer of a column: the style's, else a letter
 *  (the questions beside it are numbered). */
const letter = (input: ExerciseInput, k: number): string => optionLabel(input.style, k, input.locale, input.digits) || `${formatCounter(k + 1, counterStyleOf('lower-alpha', input.locale), input.locale)})`;

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
        rows.push([l ? p([{ text: `${num(input, i + 1)}. ${runText(l.left)}` }], 'exercise:match', { style: STYLE.normal }) : '', r ? p([{ text: `${letter(input, i)} ${runText(r.right)}` }], 'exercise:match', { style: STYLE.normal }) : '']);
      }
      lefts.forEach((l, i) => {
        const at = order.indexOf(ex.pairs.indexOf(l));
        if (at >= 0) key.push(`${num(input, i + 1)} ${letter(input, at)}`);
      });
      return [table(input, rows)];
    }
    case 'order': {
      const order = shuffle(input, ex.sequence.length, 'order');
      const out = order.map((k) => p([BOX, { text: ' ' }, ...spanPieces(trimRun(runOf(input.flat[ex.sequence[k]!]!)).spans)], 'exercise:order'));
      key.push(ex.sequence.map((_, k) => num(input, order.indexOf(k) + 1)).join(' '));
      return out;
    }
    case 'scramble':
      return ex.sentences.map((s, i) => {
        const order = shuffle(input, s.pieces.length, `scramble${i}`);
        key.push(`${num(input, i + 1)} ${s.pieces.map(runText).join(' ')}`);
        return p([{ text: `${num(input, i + 1)}. ${order.map((k) => runText(s.pieces[k]!)).join(' / ')}` }], 'exercise:scramble');
      });
    case 'sort':
      for (const c of ex.categories) key.push(`${runText(c.name)}: ${c.items.map(runText).join(', ')}`);
      return [table(input, [ex.categories.map((c) => p([{ text: runText(c.name), b: true }], 'exercise:sort', { style: STYLE.normal, jc: 'center' })), ex.categories.map(() => '')], true)];
    case 'wordsearch':
    case 'crossword': {
      key.push(ex.entries.map((e) => e.word).join(', '));
      const out = [p([{ text: gridNote(input), i: true }], 'exercise:grid')];
      if (ex.kind === 'wordsearch') out.push(p([{ text: ex.entries.map((e) => e.word).join(' ') }], 'exercise:words'));
      else ex.entries.forEach((e, i) => { if (e.clue) out.push(p([{ text: `${num(input, i + 1)}. ${runText(e.clue)} (${[...e.word].length})` }], 'exercise:clue')); });
      return out;
    }
    case 'arithmetic':
      return ex.operations.map((o, i) => {
        key.push(`${num(input, i + 1)} ${o.result}${o.remainder ? ` r ${o.remainder}` : ''}`);
        return p([{ text: `${num(input, i + 1)}. ${o.a} ${o.sign ?? o.op} ${o.b} = ` }, input.teacher ? { text: o.result, u: true } : { text: '________' }], 'exercise:operation');
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
  en: 'The grid is printed in the PDF.',
  es: 'La cuadrícula está en el PDF.',
  ca: 'La quadrícula és al PDF.',
  fr: 'La grille figure dans le PDF.',
  de: 'Das Gitter steht im PDF.',
  it: 'La griglia è nel PDF.',
  pt: 'A grade está no PDF.',
  zh: '方格见 PDF。',
  ja: 'マス目は PDF にあります。',
  ar: 'الشبكة في ملف PDF.',
};
