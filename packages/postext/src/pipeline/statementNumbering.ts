/**
 * Labelled equations and numbered statements (#530). A `\label{eq:x}` in a
 * display formula (on a row of an `align` or `gather`) numbers it in
 * reading order, as LaTeX's amsmath does; a callout style with `numbering`
 * counts its boxes as theorems, lemmas or definitions, as amsthm does, and
 * styles naming one counter share it. Both are anchors: `\eqref{eq:x}`,
 * `\ref{x}`, `:ref{id="x"}` and `@eq:x` print their number and link to
 * them.
 *
 * Two passes over the parsed content: {@link numberStatements} counts
 * (pure, also run by the outline and the continuation, so a book laid out
 * one chapter at a time numbers on), {@link applyStatementNumbering}
 * writes the numbers into the content the layout measures — a `\tag*` in
 * the formula, a run-in label or a title on the box, the references inside
 * formulas — and sets a style's end mark (a proof's ∎).
 */

import type { ContentBlock, InlineSpan } from '../parse';
import { TEX_LABEL_RE } from '../parse/equationLabels';
import type { HeadingCounters, ResolvedCalloutNumberingConfig, ResolvedCalloutStyleConfig } from '../types';
import type { ResolvedConfig, VDTLine, VDTLineSegment } from '../vdt';
import type { MeasuredBlock } from '../measure';
import { computeHeadingContext, counterResets, renderTemplateNumber } from './resourceNumbering';
import { headingIsNumbered } from './headingStyles';
import { resolvedLocale } from './config';

const NBSP = ' ';

/** Counter values at a point of the book, by counter name (`'equation'`
 *  for the equations), each with the heading counters of its last count. */
export type StatementCounterState = Record<string, { counter: number; heading: HeadingCounters }>;

/** A numbered target: an equation's label or a counted box's `{#id}`. */
export interface CountedTarget {
  id: string;
  kind: 'equation' | 'statement';
  /** The bare number ("3", "2.1"); what `\ref` and `style=number` print. */
  number: string;
  /** What a reference prints by default: "(3)", "Theorem 2". */
  label: string;
}

/** What a counted box prints. */
export interface CountedStatement {
  numbering: ResolvedCalloutNumberingConfig;
  style: ResolvedCalloutStyleConfig;
  /** "Theorem 2" ("Proof" for a label with no counter). */
  head: string;
  /** The fence's `title`, printed after the head in parentheses. */
  note?: string;
}

export interface StatementNumbering {
  /** Numbered targets by identifier (the first setting wins). */
  targets: Map<string, CountedTarget>;
  /** The TeX of each display formula whose labels were numbered, by the
   *  formula's source start: `\label` turned into `\tag*{(3)}`. */
  tex: Map<number, string>;
  /** Counted boxes by the fence's `containerId`. */
  statements: Map<number, CountedStatement>;
  /** The counters at the end of the content. */
  counters: StatementCounterState;
}

const EMPTY_HEADING: HeadingCounters = { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 };

/** Environments whose rows (`\\`) are numbered one by one. */
const ROW_ENV_RE = /^\s*\\begin\{(align|alignat|flalign|gather|eqnarray)(\*?)\}(\{[^{}]*\})?([\s\S]*)\\end\{\1\2\}\s*$/;
const NO_NUMBER_RE = /\\(?:nonumber|notag)(?![A-Za-z])/g;
const HAS_NO_NUMBER_RE = /\\(?:nonumber|notag)(?![A-Za-z])/;
const TAG_RE = /\\tag(\*?)\s*\{([^{}]*)\}/;

/** The style a callout fence selects (as `pickCalloutStyle`). */
function calloutStyleOf(styles: readonly ResolvedCalloutStyleConfig[], type: string | undefined): ResolvedCalloutStyleConfig | undefined {
  if (styles.length === 0) return undefined;
  return (type ? styles.find((s) => s.id === type) : undefined) ?? styles[0];
}

/** A number in an equation format: `({n})` → "(3)". */
function formatted(format: string, n: string): string {
  return format.includes('{n}') ? format.split('{n}').join(n) : `${format}${n}`;
}

/** Text set in a `\tag*{…}` / `\text{…}`: TeX's special characters
 *  escaped. */
function texText(text: string): string {
  return text.replace(/[\\{}$#%&_^~]/g, (c) => (c === '\\' || c === '^' || c === '~' ? '' : `\\${c}`));
}

/** The rows of an environment's body: its `\\` at brace depth 0, outside
 *  any nested environment. */
function splitRows(body: string): string[] {
  const rows: string[] = [];
  let depth = 0;
  let env = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (c === '\\') {
      if (body.startsWith('\\begin{', i)) env++;
      else if (body.startsWith('\\end{', i)) env = Math.max(0, env - 1);
      else if (body[i + 1] === '\\' && depth === 0 && env === 0) {
        rows.push(body.slice(start, i + 2));
        start = i + 2;
      }
      i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') depth = Math.max(0, depth - 1);
  }
  rows.push(body.slice(start));
  return rows;
}

/**
 * Count the labelled equations and the counted boxes of `blocks`, in
 * reading order, from the counters `start` carries (the preceding
 * chapters'). Pure: the content is not touched.
 */
export function numberStatements(
  blocks: readonly ContentBlock[],
  resolved: ResolvedConfig,
  start?: { headings?: HeadingCounters; counters?: StatementCounterState },
): StatementNumbering {
  const targets = new Map<string, CountedTarget>();
  const tex = new Map<number, string>();
  const statements = new Map<number, CountedStatement>();
  const counters: StatementCounterState = { ...(start?.counters ?? {}) };
  const counted = resolved.calloutStyles.some((s) => s.numbering);
  const hasLabels = blocks.some((b) => b.type === 'mathDisplay' && b.tex !== undefined && b.tex.includes('\\label'));
  if (!counted && !hasLabels) return { targets, tex, statements, counters };

  const headings = computeHeadingContext(blocks as ContentBlock[], start?.headings, (b) => headingIsNumbered(b, resolved));
  const digits = resolved.numerals;
  const locale = resolvedLocale(resolved);
  const eq = resolved.math.equationNumbering;
  /** Advance `name` at block `i`, its value reset where `resetOn` says. */
  const advance = (name: string, i: number, resetOn: ResolvedCalloutNumberingConfig['resetOn']): number => {
    const heading = headings[i] ?? start?.headings ?? EMPTY_HEADING;
    const prev = counters[name];
    const value = prev && !counterResets(prev.heading, heading, resetOn) ? prev.counter + 1 : 1;
    counters[name] = { counter: value, heading };
    return value;
  };
  const add = (t: CountedTarget): void => {
    if (!targets.has(t.id)) targets.set(t.id, t);
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (counted && b.type === 'containerStart' && b.containerName === 'callout' && b.containerId !== undefined) {
      const style = calloutStyleOf(resolved.calloutStyles, b.containerAttrs?.type);
      const numbering = style?.numbering;
      if (!style || !numbering) continue;
      let number = '';
      if (numbering.counter) {
        const value = advance(numbering.counter, i, numbering.resetOn);
        number = renderTemplateNumber(numbering.numberingTemplate, value, numbering.counterFormat, counters[numbering.counter]!.heading, digits, locale);
      }
      const head = number ? `${numbering.label}${numbering.label ? NBSP : ''}${number}` : numbering.label;
      const note = b.containerAttrs?.title?.trim();
      statements.set(b.containerId, { numbering, style, head, ...(note ? { note } : {}) });
      const id = b.containerAttrs?.id?.trim();
      if (id && number) add({ id, kind: 'statement', number, label: head });
      continue;
    }
    if (b.type !== 'mathDisplay' || b.tex === undefined) continue;
    if (!b.tex.includes('\\label') && !b.tex.includes('\\nonumber') && !b.tex.includes('\\notag')) continue;
    /** Number one row (or the whole formula): its first label becomes the
     *  tag, unless the row says `\nonumber` or tags itself. */
    const numberRow = (row: string): string => {
      const labels: string[] = [];
      TEX_LABEL_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TEX_LABEL_RE.exec(row)) !== null) if (m[1]) labels.push(m[1]);
      const suppressed = HAS_NO_NUMBER_RE.test(row);
      let out = row.replace(NO_NUMBER_RE, '');
      if (labels.length === 0) return out;
      const tag = TAG_RE.exec(out);
      let tagText = '';
      if (tag) {
        // An explicit tag prints as written and counts nothing: the label
        // names what it prints.
        const text = tag[2]!.trim();
        for (const id of labels) add({ id, kind: 'equation', number: text, label: tag[1] ? text : `(${text})` });
      } else if (!suppressed && eq.enabled) {
        const value = advance('equation', i, eq.resetOn);
        const number = renderTemplateNumber(eq.numberingTemplate, value, eq.counterFormat, counters.equation!.heading, digits, locale);
        const label = formatted(eq.format, number);
        for (const id of labels) add({ id, kind: 'equation', number, label });
        tagText = `\\tag*{${texText(label)}}`;
      }
      // The first label becomes the tag where it stands (inside the row's
      // own group, where MathJax takes a tag); the others go.
      let first = true;
      out = out.replace(TEX_LABEL_RE, () => {
        const put = first ? tagText : '';
        first = false;
        return put;
      });
      return out;
    };
    const env = ROW_ENV_RE.exec(b.tex);
    let rewritten: string;
    if (env) {
      const [, name, star, arg = ''] = env;
      const body = env[4]!;
      rewritten = `\\begin{${name}${star}}${arg}${splitRows(body).map(numberRow).join('')}\\end{${name}${star}}`;
    } else {
      rewritten = numberRow(b.tex);
    }
    if (rewritten !== b.tex) tex.set(b.sourceStart, rewritten);
  }
  return { targets, tex, statements, counters };
}

/** What a reference inside a formula prints: `\eqref` the formatted
 *  number, `\ref` the bare one; `?` for a label nothing numbers. */
export type CountedLookup = (id: string) => { number: string; label: string } | undefined;

const MATH_REF_RE = /\\(eq)?ref\s*\{\s*([^{}]*?)\s*\}/g;

/** `\eqref{x}` / `\ref{x}` in a formula's TeX replaced by the number they
 *  name, as text. */
export function resolveMathRefs(tex: string, lookup: CountedLookup): string {
  if (!tex.includes('ref')) return tex;
  return tex.replace(MATH_REF_RE, (_, eq: string | undefined, id: string) => {
    const t = lookup(id);
    const text = t ? (eq ? t.label : t.number) : eq ? '(?)' : '?';
    return `\\text{${texText(text)}}`;
  });
}

/** The TeX of an end mark set as a formula's tag. */
const MARK_TEX: Readonly<Record<string, string>> = {
  '∎': '\\blacksquare',
  '■': '\\blacksquare',
  '▪': '\\blacksquare',
  '□': '\\square',
  '◻': '\\square',
  '▫': '\\square',
};

/** Text blocks a run-in label can open. */
const RUN_IN_HOSTS = new Set<ContentBlock['type']>(['paragraph', 'blockquote']);
/** Text blocks an end mark can close. */
const TEXT_HOSTS = new Set<ContentBlock['type']>(['paragraph', 'listItem', 'blockquote']);

/** `block` with `spans` set before its text (the run-in label) or after it
 *  (the end mark). The new characters map to the block's first (last)
 *  source character. */
function withSpans(block: ContentBlock, spans: InlineSpan[], at: 'start' | 'end'): ContentBlock {
  const text = spans.map((s) => s.text).join('');
  const origin = at === 'start' ? block.sourceMap[0] ?? block.sourceStart : block.sourceMap[block.sourceMap.length - 1] ?? block.sourceEnd;
  const map = new Array<number>(text.length).fill(origin);
  return at === 'start'
    ? { ...block, text: text + block.text, spans: [...spans, ...block.spans], sourceMap: [...map, ...block.sourceMap] }
    : { ...block, text: block.text + text, spans: [...block.spans, ...spans], sourceMap: [...block.sourceMap, ...map] };
}

/** A paragraph holding only `spans`, at `block`'s source position. */
function paragraphOf(spans: InlineSpan[], at: number, extra?: Partial<ContentBlock>): ContentBlock {
  const text = spans.map((s) => s.text).join('');
  return { type: 'paragraph', text, spans, sourceStart: at, sourceEnd: at, sourceMap: new Array<number>(text.length).fill(at), ...extra };
}

/** The spans of a box's run-in label: "**Theorem 2** (Bradley–Terry)**.** ". */
function runInSpans(s: CountedStatement): InlineSpan[] {
  const n = s.numbering;
  const bodyItalic = s.style.body.italic;
  // A span's `italic` sets it in the other face than the box's body.
  const labelItalic = n.italic ? !bodyItalic : bodyItalic;
  const out: InlineSpan[] = [{ text: s.head, bold: n.bold, italic: labelItalic }];
  if (s.note) out.push({ text: ` (${s.note})`, bold: false, italic: bodyItalic });
  if (n.suffix) out.push({ text: n.suffix, bold: n.bold, italic: labelItalic });
  out.push({ text: ' ', bold: false, italic: false });
  return out;
}

/**
 * The content with the numbers written in (see the module comment). The
 * blocks `numbering` counted are found by their key (a formula's source
 * start, a fence's container id), so the content may have gained blocks
 * since it was counted (an expanded `:::toc`). `lookup` resolves a
 * reference inside a formula that names a target of another chapter.
 */
export function applyStatementNumbering(
  blocks: readonly ContentBlock[],
  numbering: StatementNumbering,
  resolved: ResolvedConfig,
  lookup?: CountedLookup,
): ContentBlock[] {
  const marks = resolved.calloutStyles.some((s) => s.endMark.length > 0);
  const refs = blocks.some((b) => (b.tex !== undefined && b.tex.includes('ref')) || b.spans.some((s) => s.math?.tex.includes('ref')));
  if (numbering.tex.size === 0 && numbering.statements.size === 0 && !marks && !refs) return blocks as ContentBlock[];
  const find: CountedLookup = (id) => numbering.targets.get(id) ?? lookup?.(id);

  const out: ContentBlock[] = [];
  /** Open counted boxes: the index in `out` of their start, whether the
   *  run-in label is still owed, and the box's style. */
  const open: { id: number; owed?: CountedStatement; style?: ResolvedCalloutStyleConfig }[] = [];
  for (const raw of blocks) {
    let b = raw;
    if (b.type === 'mathDisplay' && b.tex !== undefined) {
      const tex = resolveMathRefs(numbering.tex.get(b.sourceStart) ?? b.tex, find);
      if (tex !== b.tex) b = { ...b, tex };
    } else if (refs && b.spans.some((s) => s.math?.tex.includes('ref'))) {
      b = { ...b, spans: b.spans.map((s) => (s.math && s.math.tex.includes('ref') ? { ...s, math: { ...s.math, tex: resolveMathRefs(s.math.tex, find) } } : s)) };
    }
    const top = open[open.length - 1];
    const closing = b.type === 'containerEnd' && top !== undefined && b.containerId === top.id;
    if (top?.owed && !closing) {
      // The label opens the box's first paragraph; a box that opens with
      // anything else (a list, a formula, a nested box) gets a paragraph
      // of its own for it.
      const owed = top.owed;
      top.owed = undefined;
      if (RUN_IN_HOSTS.has(b.type) && b.toc === undefined) {
        out.push(withSpans(b, runInSpans(owed), 'start'));
        continue;
      }
      out.push(paragraphOf(runInSpans(owed), b.sourceStart));
    }
    if (b.type === 'containerStart' && b.containerName === 'callout' && b.containerId !== undefined) {
      const id = b.containerId;
      const counted = numbering.statements.get(id);
      const style = counted?.style ?? (marks ? calloutStyleOf(resolved.calloutStyles, b.containerAttrs?.type) : undefined);
      if (counted && counted.numbering.placement === 'title') {
        const title = counted.note ? `${counted.head} (${counted.note})` : counted.head;
        b = { ...b, containerAttrs: { ...(b.containerAttrs ?? {}), title } };
      } else if (counted) {
        // The fence's title goes into the run-in label, not over the box.
        const { title: _title, ...attrs } = b.containerAttrs ?? {};
        b = { ...b, containerAttrs: attrs };
      }
      out.push(b);
      open.push({ id, ...(counted && counted.numbering.placement === 'runIn' ? { owed: counted } : {}), ...(style ? { style } : {}) });
      continue;
    }
    if (closing) {
      open.pop();
      if (top!.owed) out.push(paragraphOf(runInSpans(top!.owed), b.sourceStart));
      const mark = top!.style?.endMark ?? '';
      if (mark) setEndMark(out, mark, b.sourceStart, top!.style!.body.italic);
      out.push(b);
      continue;
    }
    out.push(b);
  }
  return out;
}

/** Set a box's end mark after the last block of `out` (the box's last
 *  child): on its last line, or a line of its own. A formula takes it as
 *  its tag when it has none. */
function setEndMark(out: ContentBlock[], mark: string, at: number, bodyItalic: boolean): void {
  const last = out[out.length - 1];
  const spans: InlineSpan[] = [{ text: ' ', bold: false, italic: false }, { text: mark, bold: false, italic: bodyItalic }];
  if (last && TEXT_HOSTS.has(last.type) && last.toc === undefined && last.text.length > 0) {
    out[out.length - 1] = { ...withSpans(last, spans, 'end'), endMark: mark };
    return;
  }
  const texMark = MARK_TEX[mark];
  if (last && last.type === 'mathDisplay' && last.tex !== undefined && texMark && !/\\tag\b/.test(last.tex)) {
    out[out.length - 1] = { ...last, tex: `${last.tex}\\tag*{$${texMark}$}` };
    return;
  }
  out.push({ ...paragraphOf([{ text: mark, bold: false, italic: bodyItalic }], at), endMark: mark });
}

/** The targets a book outline's counted anchors name, for references
 *  inside formulas to another chapter. */
export function outlineLookup(targets: ReadonlyMap<string, { number: string; numberLabel?: string }> | undefined): CountedLookup | undefined {
  if (!targets) return undefined;
  return (id) => {
    const t = targets.get(id);
    return t?.numberLabel ? { number: t.number, label: t.numberLabel } : undefined;
  };
}

/** A box's end mark flush right on its block's last line (#530): the space
 *  before it widened to the measure, or, on a line the mark has to itself,
 *  a space set before it. A line read in another order (right-to-left
 *  runs) keeps its setting. */
export function flushEndMark(measured: MeasuredBlock, mark: string, measureWidth: number): MeasuredBlock {
  const lines = measured.lines;
  const last = lines[lines.length - 1];
  const segs = last?.segments;
  if (!last || !segs || segs.length === 0 || last.order) return measured;
  const k = segs.length - 1;
  const seg = segs[k]!;
  if (seg.kind !== 'text' || seg.text !== mark) return measured;
  const extra = measureWidth - (last.bbox.x + last.bbox.width);
  if (extra <= 0.01) return measured;
  const prev = segs[k - 1];
  const widened: VDTLineSegment[] = prev && prev.kind === 'space'
    ? [...segs.slice(0, k - 1), { ...prev, width: prev.width + extra, labelTab: true }, seg]
    : [...segs.slice(0, k), { kind: 'space', text: '', width: extra, labelTab: true }, seg];
  const line: VDTLine = { ...last, segments: widened, bbox: { ...last.bbox, width: last.bbox.width + extra } };
  return { ...measured, lines: [...lines.slice(0, -1), line] };
}
