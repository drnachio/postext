// Balloon text before it is shaped (SPEC D3.1): the item's spans read into
// one plain string with a style and a source offset per character, the
// house rules applied (ellipsis, double dash, dropped final stop, capitals
// for cased scripts, emphasis as bold italic), the legal line breaks found
// (spaces, hard hyphens, CJK under kinsoku), and any range of it written
// back as design-text markup the layout reads (`inlineMarks`).

import type { InlineDirection, InlineSpan } from '../../parse/types';
import { cjkJoinBreaks } from '../../measure/cjk';
import type { CjkLineBreakLevel } from '../../measure/cjkClasses';
import { hasJoiningScript } from '../../bidi';
import { isBreakingSpace } from '../../measure/spaces';
import { languageOf } from '../../locale';
import type { LetteringStyle, LetteringText } from './types';

/** How one character of the prepared text is set. */
export interface CharStyle {
  bold: boolean;
  italic: boolean;
  script?: 'sup' | 'sub';
  /** Vertical text: a run set in one cell (`tcy`), upright or sideways;
   *  `orientId` tells two `:tcy` runs side by side apart. */
  orient?: 'tcy' | 'upright' | 'sideways';
  orientId?: number;
  /** Ruby (furigana) over this character (`:ruby[漢字]{…}`): the reading
   *  of its run; characters of one ruby share `id`. A group ruby is one
   *  reading over the whole run, which never breaks. */
  ruby?: { id: number; text: string; group: boolean };
}

/** Directional isolate controls (UAX #9): LRI, RLI, PDI. The text of a
 *  `:ltr[…]` / `:rtl[…]` run is wrapped in them, so the design-text bidi
 *  sets it as an isolate; they print nothing and are taken out of the
 *  lines once laid out. */
export const LRI = '\u2066';
export const RLI = '\u2067';
export const PDI = '\u2069';
/** Whether a character is a bidi isolate control. */
export const isIsolateControl = (ch: string): boolean => ch === LRI || ch === RLI || ch === PDI || ch === '\u2068';

/** The text of a balloon ready to shape. `text` holds `\n` at forced
 *  breaks; `style` and `source` are per UTF-16 unit of `text`. */
export interface PreparedText {
  text: string;
  style: CharStyle[];
  /** Source offset of each unit (-1: none known). */
  source: number[];
}

const PLAIN: CharStyle = { bold: false, italic: false };
const LINE_BREAKS = /[\n\u2028]/;

/** Whether a language sets `。` and drops it at the end of a balloon by
 *  default (Japanese and Chinese manga practice). */
export function dropsFinalStopByDefault(locale: string): boolean {
  const lang = languageOf(locale);
  return lang === 'ja' || lang === 'zh';
}

/** Read the item's text into styled characters with source offsets. */
export function readLetteringText(text: LetteringText, sourceMap: readonly number[] | undefined): PreparedText {
  const out: PreparedText = { text: '', style: [], source: [] };
  const push = (s: string, st: CharStyle, rawAt: number, rawStep: boolean): void => {
    for (let i = 0; i < s.length; i++) {
      const ch = LINE_BREAKS.test(s[i]!) ? '\n' : s[i]!;
      out.text += ch;
      out.style.push(st);
      out.source.push(sourceMap?.[rawStep ? rawAt + i : rawAt] ?? -1);
    }
  };
  if (typeof text === 'string') {
    push(text, PLAIN, 0, true);
    return out;
  }
  let raw = 0;
  let orientId = 0;
  // Open isolates (outermost first), by id.
  let open: InlineDirection[] = [];
  const chainOf = (d: InlineDirection | undefined): InlineDirection[] => {
    const out: InlineDirection[] = [];
    for (let x = d; x; x = x.outer) out.unshift(x);
    return out;
  };
  const control = (ch: string, at: number) => {
    out.text += ch;
    out.style.push(PLAIN);
    out.source.push(sourceMap?.[at] ?? -1);
  };
  const isolatesTo = (want: InlineDirection[], at: number) => {
    let keep = 0;
    while (keep < open.length && keep < want.length && open[keep]!.id === want[keep]!.id) keep++;
    for (let k = open.length - 1; k >= keep; k--) control(PDI, Math.max(0, at - 1));
    for (let k = keep; k < want.length; k++) control(want[k]!.dir === 'rtl' ? RLI : LRI, at);
    open = want;
  };
  for (const span of text as readonly InlineSpan[]) {
    isolatesTo(chainOf(span.direction), raw);
    const st: CharStyle = { bold: span.bold, italic: span.italic };
    if (span.ruby && span.ruby.text) st.ruby = { id: span.ruby.id, text: span.ruby.text, group: span.ruby.group === true };
    if (span.script) st.script = span.script;
    if (span.combineUpright) {
      st.orient = 'tcy';
      st.orientId = ++orientId;
    } else if (span.orientation) st.orient = span.orientation;
    if (span.chip) {
      // A chip prints its words (no box in a balloon).
      const inner = readLetteringText(span.chip.spans, undefined);
      for (let i = 0; i < inner.text.length; i++) {
        out.text += inner.text[i]!;
        out.style.push(inner.style[i]!);
        out.source.push(sourceMap?.[raw] ?? -1);
      }
    } else if (span.ref) {
      push(span.ref.text ?? '', st, raw, false);
    } else if (span.math) {
      push(span.math.tex, st, raw, false);
    } else if (!(span.swatch || span.footnote || span.citation)) {
      push(span.text, st, raw, true);
    }
    raw += span.text.length;
  }
  isolatesTo([], raw);
  return out;
}

/** A slice of a prepared text, as one more prepared text. */
function slicePrepared(p: PreparedText, a: number, b: number): PreparedText {
  return { text: p.text.slice(a, b), style: p.style.slice(a, b), source: p.source.slice(a, b) };
}

/** Replace every match of `re` in `p` by `to` (the replacement takes the
 *  style and source of the first character matched). */
function replaceAll(p: PreparedText, re: RegExp, to: string | ((m: string) => string)): PreparedText {
  const out: PreparedText = { text: '', style: [], source: [] };
  let at = 0;
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = g.exec(p.text)) !== null) {
    if (m[0].length === 0) {
      g.lastIndex++;
      continue;
    }
    const head = slicePrepared(p, at, m.index);
    out.text += head.text;
    out.style.push(...head.style);
    out.source.push(...head.source);
    const rep = typeof to === 'string' ? to : to(m[0]);
    for (let i = 0; i < rep.length; i++) {
      out.text += rep[i]!;
      out.style.push(p.style[m.index]!);
      out.source.push(p.source[Math.min(m.index + i, m.index + m[0].length - 1)]!);
    }
    at = m.index + m[0].length;
  }
  const tail = slicePrepared(p, at, p.text.length);
  out.text += tail.text;
  out.style.push(...tail.style);
  out.source.push(...tail.source);
  return out;
}

const CJK_CHAR = /[\u3000-\u303F\u3040-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/;

/** Options of {@link prepareText} beyond the style. */
export interface PrepareOptions {
  locale: string;
  vertical: boolean;
}

/**
 * The house rules of SPEC D3.1 applied to a read text:
 * - whitespace runs set as one space, lines trimmed;
 * - an ellipsis written as dots made one `…` (two, `……`, in Chinese);
 * - `doubleDash`: an em dash becomes `--`;
 * - `dropFinalStop`: a final `。` (or `．`) dropped;
 * - emphasis printed bold italic (bold only where the script has no
 *   italics: Arabic, CJK);
 * - `uppercase`: capitals for the cased letters only (scripts without case
 *   stay as they are), with the locale's rules (Turkish i).
 */
export function prepareText(read: PreparedText, style: LetteringStyle, opts: PrepareOptions): PreparedText {
  let p = read;
  const lang = languageOf(opts.locale);
  // Whitespace: runs to one space; spaces around forced breaks dropped.
  p = replaceAll(p, /[^\S\n\u00A0\u202F\u3000]+/g, ' ');
  p = replaceAll(p, / ?\n ?/g, '\n');
  p = trimPrepared(p);
  // Ellipsis.
  p = replaceAll(p, /\.(?: ?\.){2,}/g, '…');
  // Japanese and Chinese set no space between their characters, their
  // marks and a leader (a translator's "願う ？ …" is "願う？…").
  if (lang === 'ja' || lang === 'zh') {
    p = replaceAll(p, /(?<=[\u3000-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u2025\u2026]) (?=[\u3000-\u30FF\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u2025\u2026!?])/g, '');
    p = replaceAll(p, /(?<=[\u2025\u2026]) (?=\S)/g, '');
  }
  if (lang === 'zh') p = replaceAll(p, /…+/g, (m) => (m.length % 2 === 1 ? `${m}…` : m));
  if (style.doubleDash) p = replaceAll(p, /—/g, '--');
  // Columns of Japanese or Chinese: ASCII `!` and `?` stand upright as
  // their full-width forms, as a vertical setter writes them (turned
  // sideways they read as dashes). A Japanese pair (`!?`, `!!`) is left
  // as it is: the vertical layout sets it upright in one cell (JLReq
  // 3.1.10) with the face's own glyphs (comic faces often lack ⁉ ‼).
  if (opts.vertical && (lang === 'ja' || lang === 'zh')) {
    const full = (c: string) => (c === '!' ? '！' : '？');
    p = replaceAll(p, /[!?]+/g, (m) => (lang === 'ja' && m.length === 2 ? m : [...m].map(full).join('')));
  }
  const dropStop = style.dropFinalStop ?? dropsFinalStopByDefault(opts.locale);
  if (dropStop) {
    let end = p.text.length;
    while (end > 0 && /[\s]/.test(p.text[end - 1]!)) end--;
    if (end > 0 && /[。．]/.test(p.text[end - 1]!)) p = { text: p.text.slice(0, end - 1), style: p.style.slice(0, end - 1), source: p.source.slice(0, end - 1) };
  }
  // Emphasis: bold italic where the script slants, bold elsewhere (a run
  // holding Arabic or CJK letters keeps upright).
  if ((style.emphasis ?? 'bold-italic') === 'bold-italic') {
    const styles = [...p.style];
    let i = 0;
    while (i < styles.length) {
      if (!styles[i]!.bold && !styles[i]!.italic) {
        i++;
        continue;
      }
      let j = i;
      while (j < styles.length && (styles[j]!.bold || styles[j]!.italic) && p.text[j] !== '\n') j++;
      const run = p.text.slice(i, j);
      const slants = !hasJoiningScript(run) && !CJK_CHAR.test(run);
      for (let k = i; k < j; k++) styles[k] = { ...styles[k]!, bold: true, italic: slants };
      i = j;
    }
    p = { ...p, style: styles };
  }
  if (style.textTransform === 'uppercase') p = uppercasePrepared(p, opts.locale);
  return p;
}

function trimPrepared(p: PreparedText): PreparedText {
  let a = 0;
  let b = p.text.length;
  while (a < b && /\s/.test(p.text[a]!)) a++;
  while (b > a && /\s/.test(p.text[b - 1]!)) b--;
  return slicePrepared(p, a, b);
}

/** Capitals for the lowercase letters of cased scripts, in the locale's
 *  rules; a letter that becomes two (ß → SS) keeps its source offset. */
function uppercasePrepared(p: PreparedText, locale: string): PreparedText {
  const out: PreparedText = { text: '', style: [], source: [] };
  let tag: string | undefined = locale;
  try {
    'a'.toLocaleUpperCase(locale);
  } catch {
    tag = undefined;
  }
  for (let i = 0; i < p.text.length;) {
    const cp = p.text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const up = /\p{Lowercase}/u.test(ch) ? ch.toLocaleUpperCase(tag) : ch;
    for (let k = 0; k < up.length; k++) {
      out.text += up[k]!;
      out.style.push(p.style[i]!);
      out.source.push(p.source[i]!);
    }
    i += ch.length;
  }
  return out;
}

/** A place a line may break: the line ends at `end`, the next starts at
 *  `next` (after the spaces). `penalty` grows with how badly the break
 *  parts a word or a phrase; `forced` breaks must be taken. */
export interface BreakPoint {
  end: number;
  next: number;
  penalty: number;
  forced: boolean;
}

type Kind = 'H' | 'K' | 'C' | 'P' | 'O' | 'L';
const HIRAGANA = /[\u3041-\u309F]/;
const KATAKANA = /[\u30A0-\u30FF\uFF66-\uFF9F]/;
const HAN = /[\u3005\u3007\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
const CJK_PUNCT = /[\u3000-\u3004\u3008-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65\u2026\u2025\uFF01\uFF1F]/;
/** Hiragana that usually close a phrase (文節): the particles and the
 *  sentence-final ones. A break after one of them, before more kana, is
 *  better than one inside a word. */
const PARTICLES = new Set([...'はがをにでともへやのねよかぞぜさわ']);
/** Of those, the ones that also end a verb's or an adjective's stem
 *  (okurigana: 癒さ|れる, 言わ|ない, 強か|った): right after a kanji they
 *  are part of the word, not a particle. */
const OKURIGANA_PRONE = new Set([...'さわよねかぞぜや']);

/** Whether the hiragana `a` (after `before`) closes a phrase. */
function closesPhrase(a: string, before: string | undefined): boolean {
  return PARTICLES.has(a) && !(OKURIGANA_PRONE.has(a) && before !== undefined && kindOf(before) === 'C');
}

/** Chinese characters that stand as words of their own (particles,
 *  pronouns, common verbs and adverbs): a break beside one does not part
 *  a word. */
const ZH_FUNCTION_CHARS = new Set([...'的了吗呢吧啊呀哦么嘛是在和与也都就不很还又才把被给让对向从到着过地得这那我你他她它们']);

function kindOf(ch: string): Kind {
  if (HIRAGANA.test(ch)) return 'H';
  if (KATAKANA.test(ch)) return ch === '・' ? 'P' : 'K';
  if (HAN.test(ch)) return 'C';
  if (CJK_PUNCT.test(ch)) return 'P';
  if (/[\p{L}\p{N}]/u.test(ch)) return 'L';
  return 'O';
}

/** Penalty of a break between two CJK characters: an approximation of
 *  Japanese phrase (文節) boundaries — after punctuation or a particle is
 *  cheap, inside a run of kanji or katakana or before okurigana is dear.
 *  Chinese breaks anywhere at a small even cost, cheaper after
 *  punctuation. */
function cjkBreakPenalty(a: string, b: string, japanese: boolean, before?: string): number {
  const ka = kindOf(a);
  const kb = kindOf(b);
  // A two-character leader (…… ‥‥) stays whole; after the end of a
  // sentence or a clause are the best places.
  if (a === b && (a === '\u2026' || a === '\u2025')) return 50;
  if (/[\u3002\uFF01\uFF1F!?\u2026\uFF0E]/.test(a)) return -1;
  if (ka === 'P') return /[\u3001\uFF0C]/.test(a) ? -0.3 : 0;
  if (kb === 'P') return 2;
  if (!japanese) return ka === 'L' || kb === 'L' ? 1.5 : 1;
  // A particle sticks to the word before it: never break just before one.
  if (kb === 'H' && PARTICLES.has(b) && ka !== 'H') return 6;
  if (ka === 'H') {
    const particle = closesPhrase(a, before);
    if (kb === 'C' || kb === 'K' || kb === 'L') return particle ? 0.2 : 0.8;
    if (PARTICLES.has(b)) return 5;
    return particle ? 1.5 : 3.5;
  }
  if ((ka === 'C' || ka === 'K') && kb === 'H') return 5;
  if (ka === 'C' && kb === 'C') return 4;
  if (ka === 'K' && kb === 'K') return 7;
  if (ka === 'C' && kb === 'K') return 2;
  if (ka === 'K' && kb === 'C') return 2;
  return 3;
}

/** Short words that lean on the next one (articles, prepositions,
 *  conjunctions of the Latin-script languages the site speaks): a line
 *  should not end on one. */
const LEANING_WORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'and', 'or', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'i',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'o', 'en', 'con', 'por', 'para', 'mi', 'tu', 'su', 'que',
  'le', 'les', 'une', 'des', 'du', 'et', 'ou', 'au', 'aux', 'ce', 'ma', 'ta', 'sa', 'mon', 'ton', 'son', 'je', 'tu', 'il', 'ne',
  'els', 'l', 'd', 'per', 'amb', 'es', 'em', 'et',
]);

/** Penalty of a break at the space starting at `k`: cheap after the end of
 *  a sentence or a clause, dear after a word that leans on the next. */
function spacePenalty(t: string, k: number): number {
  const before = t[k - 1] ?? '';
  if (/[.?!\u2026\u061F\u06D4]/.test(before)) return -1;
  if (/[,;:\u060C\u061B]/.test(before)) return -0.5;
  let a = k;
  while (a > 0 && !/\s/.test(t[a - 1]!)) a--;
  const word = t.slice(a, k).toLowerCase().replace(/^[\u00BF\u00A1"'\u00AB(]+/u, '');
  if (LEANING_WORDS.has(word)) return 1.2;
  return 0.3;
}

/** Word hints of a CJK text from the runtime's segmenter: the offsets
 *  inside a word (`interiors`), and — Chinese — those between two Han
 *  characters the segmenter left as words of one character each, neither
 *  of them a word that stands alone (`unknown`): the dictionary does not
 *  know the word they make (魔|药, 大|赛 in 魔药大赛), which is still one. */
function cjkWordHints(t: string, japanese: boolean): { interiors: Set<number>; unknown: Set<number> } {
  const interiors = new Set<number>();
  const unknown = new Set<number>();
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'word' }) => { segment(s: string): Iterable<{ segment: string; index: number; isWordLike?: boolean }> } }).Segmenter;
  if (!Seg || !CJK_CHAR.test(t)) return { interiors, unknown };
  try {
    let prevSingle: { index: number; segment: string } | undefined;
    for (const s of new Seg(japanese ? 'ja' : 'zh', { granularity: 'word' }).segment(t)) {
      const single = !japanese && [...s.segment].length === 1 && HAN.test(s.segment) && !ZH_FUNCTION_CHARS.has(s.segment);
      if (single && prevSingle && prevSingle.index + prevSingle.segment.length === s.index) unknown.add(s.index);
      prevSingle = single ? s : undefined;
      if (!s.isWordLike || !CJK_CHAR.test(s.segment)) continue;
      for (let k = 1; k < s.segment.length; k++) {
        const c = s.segment.charCodeAt(k);
        if (c >= 0xdc00 && c <= 0xdfff) continue;
        interiors.add(s.index + k);
      }
    }
  } catch {
    // No segmenter data for the language: no word hints.
  }
  return { interiors, unknown };
}

/** The legal breaks of a prepared text (the text's end included, as a
 *  forced break). */
export function breakPoints(p: PreparedText, level: CjkLineBreakLevel, japanese: boolean): BreakPoint[] {
  const t = p.text;
  const out: BreakPoint[] = [];
  const insideOriented = (k: number): boolean => {
    const a = p.style[k - 1];
    const b = p.style[k];
    if (a?.ruby && b?.ruby && a.ruby.id === b.ruby.id && a.ruby.group) return true;
    return !!a && !!b && a.orient !== undefined && a.orient === b.orient && a.orientId === b.orientId;
  };
  // Inside a word of a CJK text (a dictionary segmenter, where the runtime
  // has one): a break there parts a word (如|此, くれ|る).
  const hints = cjkWordHints(t, japanese);
  const inWord = hints.interiors;
  let k = 0;
  while (k < t.length) {
    const ch = t[k]!;
    if (ch === '\n') {
      out.push({ end: k, next: k + 1, penalty: 0, forced: true });
      k++;
      continue;
    }
    if (isBreakingSpace(ch)) {
      let e = k;
      while (e < t.length && isBreakingSpace(t[e]) && t[e] !== '\n') e++;
      // A space before a closing mark (French "Papi !", "là ?"), or after
      // an opening one, binds: "!" never opens a line.
      const binds = /[!?;:\u00BB\u203A)\]}%\u2026\u061F]/.test(t[e] ?? '') || /[\u00AB\u2039(\[{\u00BF\u00A1]/.test(t[k - 1] ?? '');
      if (k > 0 && t[e] !== '\n' && e < t.length && !insideOriented(k) && !binds) out.push({ end: k, next: e, penalty: spacePenalty(t, k), forced: false });
      k = e;
      continue;
    }
    const at = k + (ch.codePointAt(0)! > 0xffff ? 2 : 1);
    if (at < t.length && !isBreakingSpace(t[at]) && t[at] !== '\n' && !insideOriented(at)) {
      const next = String.fromCodePoint(t.codePointAt(at)!);
      const prev = ch;
      let penalty: number | undefined;
      if (cjkJoinBreaks(t.slice(Math.max(0, at - 4), at), t.slice(at, at + 4), level)) {
        const before = k > 0 ? String.fromCodePoint(t.codePointAt(k - 1 - (k > 1 && /[\uDC00-\uDFFF]/.test(t[k - 1]!) ? 1 : 0))!) : undefined;
        penalty = cjkBreakPenalty(prev, next, japanese, before) + (inWord.has(at) ? (japanese ? 3 : 6) : hints.unknown.has(at) ? 4 : 0);
      } else if (/\p{L}/u.test(next)) {
        // A hard hyphen or a dash between words; an ellipsis run into the
        // next word ("…AND").
        if (prev === '-' && t[at - 2] === '-') penalty = 1;
        else if (prev === '-' && /\p{L}/u.test(t[at - 2] ?? '')) penalty = 3;
        else if (prev === '—' || prev === '–') penalty = 1;
        else if (prev === '…') penalty = 1.5;
        else if (prev === '/') penalty = 3;
      }
      if (penalty !== undefined) out.push({ end: at, next: at, penalty, forced: false });
    }
    k = at;
  }
  out.push({ end: t.length, next: t.length, penalty: 0, forced: true });
  return out;
}

const ESCAPABLE = /[*_^~`@\\]/g;

/** Design-text markup of `p[a, b)`: the characters escaped, each run of
 *  one style wrapped in its markers (bold, italic, scripts, orientation),
 *  closed at the end of the range. */
export function markupOf(p: PreparedText, a: number, b: number): string {
  let out = '';
  let i = a;
  while (i < b) {
    const s = p.style[i]!;
    let j = i + 1;
    while (j < b && sameStyle(p.style[j]!, s)) j++;
    let piece = p.text.slice(i, j).replace(ESCAPABLE, (c) => (c === '\\' ? '\\' : `\\${c}`));
    if (s.script === 'sup') piece = `^${piece}^`;
    else if (s.script === 'sub') piece = `~${piece}~`;
    if (s.orient) piece = `:${s.orient}[${piece}]`;
    if (s.bold && s.italic) piece = `***${piece}***`;
    else if (s.bold) piece = `**${piece}**`;
    else if (s.italic) piece = `*${piece}*`;
    out += piece;
    i = j;
  }
  return out;
}

function sameStyle(a: CharStyle, b: CharStyle): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.script === b.script && a.orient === b.orient && a.orientId === b.orientId;
}

/** Whether any character of `p[a, b)` is set in a style other than the
 *  plain one. */
export function hasMarks(p: PreparedText, a = 0, b = p.text.length): boolean {
  for (let i = a; i < b; i++) {
    const s = p.style[i]!;
    if (s.bold || s.italic || s.script || s.orient) return true;
  }
  return false;
}
