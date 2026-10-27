// Turning annotation marks into span fields (#1278: split out of
// annotations.ts).
import type { InlineWarichu, InlineDirection, InlineSideline, InlineKunten, DirectiveAttrs, EmphasisMark, InlineRuby, InlineSpan } from '../types.js';
import { graphemesOf } from '../../measure/graphemes.js';
import { type AnnotationName, type QueuedAnnotation, MARK_RE, innermostRuby, KIND_OF_OPEN, CLOSE } from './scan.js';

/** An annotation open while the spans are walked. */
export interface Frame {
  name: AnnotationName;
  entry: QueuedAnnotation;
  id: number;
  /** The object every span of a warichu note shares. */
  warichu?: InlineWarichu;
  /** The object every span of a directional isolate shares. */
  direction?: InlineDirection;
  /** The object every span of a side line shares. */
  sideline?: InlineSideline;
  /** The object every span of a kanbun mark shares. */
  kunten?: InlineKunten;
  /** Indices (in the output) of the spans a ruby holds. */
  pieces?: number[];
}

const DOT_STYLES = new Set(['dot', 'circle', 'sesame']);
const SIDES = new Set(['over', 'under']);
const SIDELINE_STYLES = new Set(['solid', 'double', 'wavy', 'dotted']);
const RUBY_SIDES = new Set(['over', 'under', 'right']);

function emphasisOf(attrs: DirectiveAttrs): EmphasisMark {
  const mark: EmphasisMark = {};
  if (attrs.style && DOT_STYLES.has(attrs.style)) mark.style = attrs.style as EmphasisMark['style'];
  const fill = attrs.fill;
  if (fill === 'open' || fill === 'filled') mark.fill = fill;
  const pos = attrs.pos ?? attrs.position;
  if (pos && SIDES.has(pos)) mark.position = pos as EmphasisMark['position'];
  return mark;
}

/** A side line's look as written: `style` and `pos` (or `position`);
 *  values the engine does not know are left unset. */
function sidelineOf(id: number, attrs: DirectiveAttrs): InlineSideline {
  const line: InlineSideline = { id };
  if (attrs.style && SIDELINE_STYLES.has(attrs.style)) line.style = attrs.style as InlineSideline['style'];
  const pos = attrs.pos ?? attrs.position;
  if (pos && SIDES.has(pos)) line.position = pos as InlineSideline['position'];
  return line;
}

/** The kanbun code points (U+3191–319F, ㆑ ㆒ … ㆟): the 返り点 they
 *  stand for, set as ordinary characters at the marks' size (the fonts
 *  that have these glyphs draw them small and placed, differently from
 *  each other). U+3190 ㆐ is the 竪点. */
const KANBUN_MARKS: Record<string, string> = {
  '㆑': 'レ', '㆒': '一', '㆓': '二', '㆔': '三', '㆕': '四', '㆖': '上', '㆗': '中', '㆘': '下',
  '㆙': '甲', '㆚': '乙', '㆛': '丙', '㆜': '丁', '㆝': '天', '㆞': '地', '㆟': '人',
};

/** A kanbun mark as written: `kaeri` (返り点, kanbun code points read as
 *  the characters they stand for), `okuri` (送り仮名, `（ヲ）` read as
 *  ヲ) and the flag `tate` (竪点); empty values are left unset. */
function kuntenOf(id: number, attrs: DirectiveAttrs): InlineKunten {
  const k: InlineKunten = { id };
  const kaeri = (attrs.kaeri ?? '').replace(/[㆑-㆟]/g, (c) => KANBUN_MARKS[c] ?? c).trim();
  if (kaeri.length > 0) k.kaeri = kaeri;
  const okuri = (attrs.okuri ?? '').trim().replace(/^[（(](.*)[）)]$/, '$1');
  if (okuri.length > 0) k.okuri = okuri;
  if (flag(attrs.tate)) k.tate = true;
  return k;
}

/** A flag attribute: present, and not written `false` or `no`. */
function flag(value: string | undefined): boolean {
  return value !== undefined && value !== 'false' && value !== 'no';
}

const RUBY_MODES = new Set(['mono', 'group', 'jukugo']);
const RUBY_ALIGNS = new Set(['center', 'jis', 'start']);

/** A ruby's `mode` (#422): `mono`, `group` or `jukugo` as written (the
 *  `group` flag is `mode=group`); undefined when it says none. */
function rubyMode(attrs: DirectiveAttrs): 'mono' | 'group' | 'jukugo' | undefined {
  if (flag(attrs.group)) return 'group';
  const mode = attrs.mode?.trim();
  return mode && RUBY_MODES.has(mode) ? (mode as 'mono' | 'group' | 'jukugo') : undefined;
}

/** The fields `mode` and `align` give each span of a ruby (#422). */
function rubyFlags(attrs: DirectiveAttrs, perCharacter: boolean, count: number): Pick<InlineRuby, 'jukugo' | 'mono' | 'align'> {
  const mode = rubyMode(attrs);
  const align = attrs.align?.trim();
  return {
    ...(perCharacter && mode === 'jukugo' && count > 1 ? { jukugo: true as const } : {}),
    ...(perCharacter && mode === 'mono' ? { mono: true as const } : {}),
    ...(align && RUBY_ALIGNS.has(align) ? { align: align as InlineRuby['align'] } : {}),
  };
}

/**
 * The readings of a ruby, one per base character when they pair up (a mono
 * ruby, or a jukugo ruby), else undefined (a group ruby): the `rt`
 * attribute split on `|` or spaces, or the readings of a compact ruby (one
 * `|` each; a single one split on spaces).
 */
function monoReadings(entry: QueuedAnnotation, count: number): string[] | undefined {
  if (rubyMode(entry.attrs) === 'group') return undefined;
  let readings: string[];
  if (entry.readings) {
    readings = entry.readings.length === 1 ? entry.readings[0]!.split(/\s+/) : entry.readings;
  } else {
    const rt = (entry.attrs.rt ?? '').trim();
    readings = rt.includes('|') ? rt.split('|') : rt.split(/\s+/);
  }
  readings = readings.map((r) => r.trim());
  return readings.length === count && readings.every((r) => r.length > 0) ? readings : undefined;
}

/** The whole reading of a group ruby, spaces collapsed. */
function groupReading(entry: QueuedAnnotation): string {
  const raw = entry.readings ? entry.readings.join(entry.readings.length > 1 ? ' ' : '') : entry.attrs.rt ?? '';
  return raw.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Split the spans at the annotation marks, setting the fields of each
 * annotation on the spans between its marks and dropping the marks (and
 * any piece left empty). `queue` holds the annotations in the order of
 * their marks (see {@link markAnnotations}); ids count from 1 per call, so
 * a paragraph parsed twice gets the same ones. A mono ruby becomes one span
 * per base character; a group ruby one span (in its first piece's style).
 */
export function applyAnnotationMarks(spans: InlineSpan[], queue: readonly QueuedAnnotation[]): InlineSpan[] {
  if (queue.length === 0 || !spans.some((s) => MARK_RE.test(s.text))) return spans;
  const out: InlineSpan[] = [];
  const stack: Frame[] = [];
  const rubies: Frame[] = [];
  let next = 0;
  let id = 0;
  const fieldsOf = (): Partial<InlineSpan> => {
    const fields: Partial<InlineSpan> = {};
    let depth = 0;
    for (const f of stack) {
      switch (f.name) {
        case 'dots':
          fields.emphasisMark = emphasisOf(f.entry.attrs);
          break;
        case 'name':
          fields.properName = f.id;
          break;
        case 'book':
          depth++;
          fields.bookTitle = { id: f.id, depth };
          break;
        case 'warichu':
          fields.warichu = f.warichu!;
          break;
        case 'ltr':
        case 'rtl':
          // The innermost isolate: it names the ones around it.
          fields.direction = f.direction!;
          break;
        case 'sideline':
          // The innermost line: a span takes one.
          fields.sideline = f.sideline!;
          break;
        case 'kunten':
          fields.kunten = f.kunten!;
          break;
        case 'ruby':
          break;
      }
    }
    return fields;
  };
  for (const span of spans) {
    if (!MARK_RE.test(span.text)) {
      const fields = stack.length > 0 ? fieldsOf() : undefined;
      out.push(fields ? { ...span, ...fields } : span);
      const ruby = innermostRuby(stack);
      if (ruby) ruby.pieces!.push(out.length - 1);
      continue;
    }
    let piece = '';
    const flush = (): void => {
      if (piece.length === 0) return;
      out.push({ ...span, text: piece, ...fieldsOf() });
      const ruby = innermostRuby(stack);
      if (ruby) ruby.pieces!.push(out.length - 1);
      piece = '';
    };
    for (const ch of span.text) {
      const kind = KIND_OF_OPEN.get(ch);
      if (kind !== undefined) {
        flush();
        const entry = queue[next++] ?? { name: kind, attrs: {} };
        const frame: Frame = { name: kind, entry, id: ++id };
        if (kind === 'warichu') {
          frame.warichu = {
            id: frame.id,
            ...(entry.attrs.open !== undefined ? { open: entry.attrs.open } : {}),
            ...(entry.attrs.close !== undefined ? { close: entry.attrs.close } : {}),
          };
        }
        if (kind === 'ruby') {
          frame.pieces = [];
          rubies.push(frame);
        }
        if (kind === 'sideline') frame.sideline = sidelineOf(frame.id, entry.attrs);
        if (kind === 'kunten') frame.kunten = kuntenOf(frame.id, entry.attrs);
        if (kind === 'ltr' || kind === 'rtl') {
          let outer: InlineDirection | undefined;
          for (let i = stack.length - 1; i >= 0 && !outer; i--) outer = stack[i]!.direction;
          const lang = entry.attrs.lang?.trim();
          frame.direction = {
            dir: kind,
            id: frame.id,
            ...(lang ? { lang } : {}),
            ...(outer ? { outer } : {}),
          };
        }
        stack.push(frame);
        continue;
      }
      if (ch === CLOSE) {
        flush();
        stack.pop();
        continue;
      }
      piece += ch;
    }
    flush();
  }
  if (rubies.length === 0) return out;

  // The rubies: each piece index to the spans it becomes.
  const replace = new Map<number, InlineSpan[]>();
  const drop = new Set<number>();
  for (const frame of rubies) {
    const pieces = frame.pieces!;
    if (pieces.length === 0) continue;
    const base = pieces.map((i) => out[i]!.text).join('');
    const graphemes = graphemesOf(base);
    const pos = frame.entry.attrs.pos ?? frame.entry.attrs.position;
    const position = pos && RUBY_SIDES.has(pos) ? (pos as InlineRuby['position']) : undefined;
    const readings = monoReadings(frame.entry, graphemes.length);
    const flags = rubyFlags(frame.entry.attrs, readings !== undefined, graphemes.length);
    if (readings) {
      let r = 0;
      for (const i of pieces) {
        const span = out[i]!;
        const parts: InlineSpan[] = [];
        for (const g of graphemesOf(span.text)) {
          parts.push({ ...span, text: g, ruby: { text: readings[r++]!, id: frame.id, ...(position ? { position } : {}), ...flags } });
        }
        replace.set(i, parts);
      }
    } else {
      const first = out[pieces[0]!]!;
      const reading = groupReading(frame.entry);
      replace.set(pieces[0]!, [{
        ...first,
        text: base,
        ...(reading.length > 0 ? { ruby: { text: reading, group: true, id: frame.id, ...(position ? { position } : {}), ...flags } } : {}),
      }]);
      for (const i of pieces.slice(1)) drop.add(i);
    }
  }
  const result: InlineSpan[] = [];
  out.forEach((span, i) => {
    if (drop.has(i)) return;
    const parts = replace.get(i);
    if (parts) result.push(...parts);
    else result.push(span);
  });
  return result;
}

/** The fields of an annotation a span carries, for a pass that cuts a span
 *  into pieces (a placeholder injected inside it): every piece keeps them.
 *  `withRuby` keeps a ruby too (a text piece; never the placeholder). */
export function annotationFields(span: InlineSpan, withRuby = true): Partial<InlineSpan> {
  const out: Partial<InlineSpan> = {};
  if (span.emphasisMark) out.emphasisMark = span.emphasisMark;
  if (span.properName !== undefined) out.properName = span.properName;
  if (span.bookTitle) out.bookTitle = span.bookTitle;
  if (span.warichu) out.warichu = span.warichu;
  if (span.direction) out.direction = span.direction;
  if (span.sideline) out.sideline = span.sideline;
  if (span.kunten) out.kunten = span.kunten;
  if (withRuby && span.ruby) out.ruby = span.ruby;
  if (span.inserted) out.inserted = true;
  return out;
}
