// Inline spans → Word runs plus the fragment that maps them (#1390). Plain
// characters keep their source offset; constructs Word cannot hold (refs,
// citations, chips, swatches, `:tab{…}`, forced breaks) are atoms shown as
// their rendered text; maths is OMML (an atom) or, when it cannot be
// converted, its source text; footnote markers are real footnote
// references.

import type { InlineSpan } from '../../parse/types.js';
import { texToOmml } from '../ommlWrite/index.js';
import { ommlHash } from '../anchors/ommlHash.js';
import { atomEnd, chipText, refLabel } from './atoms.js';
import type { WriterContext } from './context.js';
import { FragmentBuilder, OBJECT_CHAR } from './fragments.js';
import { STYLE } from './styles.js';
import { fieldRuns, halfPoints, hex, rPr, textRuns, wordBookmarkName, type RunProps } from './wml.js';
import { escapeAttr, escapeXml } from '../xml.js';

const BREAK = '\u2028';

export interface InlineSource {
  text: string;
  spans: InlineSpan[];
  /** Offset of each plain character in `src` (already absolute). */
  sourceMap: number[];
  /** The string the offsets index (the chapter Markdown, or a resource
   *  field). */
  src: string;
  /** Maps a parser offset (maths, refs) into `src`. */
  toSrc: (offset: number) => number;
  /** End of the block in `src` (the limit of the last atom). */
  end: number;
  inlineCode?: { start: number; end: number }[];
  /** XML inserted before plain character `i` (index marks, anchors). */
  inserts?: Map<number, string>;
  /** Footnote id → Word footnote id (creates the note); undefined when the
   *  marker cannot become a footnote. */
  noteRef?: (id: string) => number | undefined;
  /** Write links as HYPERLINK fields (in parts without relationships of
   *  their own: footnotes). */
  linkFields?: boolean;
  /** Text set at the start of each line of the block (index = line, the
   *  first before the first character): the indent of a line of verse,
   *  held by an atom over the source's leading spaces. */
  lineLeads?: string[];
  /** Verse set a paragraph per line: the XML that ends a line's
   *  paragraph and opens the next one's (`line` is the next line's
   *  index). The line end is then read back as a paragraph mark. */
  lineParagraph?: (line: number) => string;
  /** The paragraph style the text is set in (Normal when absent): its
   *  bold and italic runs take the family that holds those faces. */
  style?: string;
}

/** What the reader makes of a paragraph mark inside a fragment. */
const PARA_MARK = ' ';

interface Fmt {
  b?: boolean;
  i?: boolean;
  c?: boolean;
  script?: 'sup' | 'sub';
  k?: boolean;
  href?: string;
  mark?: boolean;
  /** Fill of a mark whose style is not the first mark style's. */
  markFill?: string;
  /** Ink of such a mark (`auto` when it has none and the first style has). */
  markInk?: string;
  /** A ruby: the reading set over these characters, and which span of
   *  the ruby they are (each span is a ruby of its own). */
  ruby?: { key: string; text: string; group?: boolean };
}

const flagsOf = (f: Fmt): string => `${f.b ? 'b' : ''}${f.i ? 'i' : ''}${f.c ? 'c' : ''}${f.script === 'sup' ? 'p' : ''}${f.script === 'sub' ? 's' : ''}${f.k ? 'k' : ''}`;
const fmtKey = (f: Fmt): string => `${flagsOf(f)}|${f.href ?? ''}|${f.mark ? 'm' : ''}${f.markFill ?? ''}/${f.markInk ?? ''}|${f.ruby?.key ?? ''}`;

function runProps(f: Fmt, style?: string): RunProps {
  return {
    // Code in a link keeps the code style (it is what marks the run as
    // code on the way back), underlined like the link.
    style: style ?? (f.k ? STYLE.codeChar : f.href ? STYLE.hyperlink : f.mark ? STYLE.mark : undefined),
    u: (f.k && f.href !== undefined) || undefined,
    b: f.b || undefined,
    i: f.i || undefined,
    smallCaps: f.c || undefined,
    shd: f.mark && !f.k && !f.href ? f.markFill : undefined,
    color: f.mark && !f.k && !f.href ? f.markInk : undefined,
    vertAlign: f.script === 'sup' ? 'superscript' : f.script === 'sub' ? 'subscript' : undefined,
  };
}

/** No-break spaces either side of a chip's words stand for its padding, so
 *  two chips side by side stay two shaded boxes; a chip with no words (an
 *  end mark drawn as a filled box) is three of them, filled. */
function chipLabel(chip: NonNullable<InlineSpan['chip']>): string {
  // The words never break inside a chip: it is one unit in the engine too.
  const words = chipText(chip).trim().replace(/ /g, '\u00a0');
  return words ? `\u00a0${words}\u00a0` : '\u00a0\u00a0\u00a0';
}

/** Left-to-right mark: keeps the punctuation at the ends of code from
 *  taking the direction of right-to-left text around it. */
const LRM = '\u200e';

/** The band and ink of a mark whose style is not the first one (the first
 *  is the mark character style's own shading and colour, which the run
 *  overrides here). */
function markLook(ctx: WriterContext, style: string): { fill?: string; ink?: string } {
  const styles = ctx.resolved.markStyles ?? [];
  const ms = style ? styles.find((m) => m.id === style) : undefined;
  if (!ms || ms === styles[0]) return {};
  const ink = hex(ms.color) ?? (hex(styles[0]?.color) ? 'auto' : undefined);
  return { fill: hex(ms.background), ink };
}

/** Base runs under their reading, as a Word ruby (furigana, pinyin,
 *  #1444): the reading at `cjk.ruby.fontSize` of the base, raised over a
 *  base of its paragraph style's size. The reader takes the base as the text
 *  and the reading from the source, so the round trip keeps both. */
function rubyRun(ctx: WriterContext, ruby: NonNullable<Fmt['ruby']>, base: string, style: string | undefined): string {
  const u = ctx.units;
  // The base's size is its paragraph style's (a heading's, a caption's):
  // Word raises the reading by it.
  const hps = ctx.styles.styleSize(style);
  const rt = halfPoints(u, ctx.resolved.cjk.ruby.fontSize, (hps * u.dpi) / 144);
  const lid = escapeAttr(ctx.config.locale || 'ja-JP');
  return (
    `<w:r><w:ruby><w:rubyPr><w:rubyAlign w:val="${ruby.group ? 'distributeSpace' : 'center'}"/><w:hps w:val="${rt}"/><w:hpsRaise w:val="${hps}"/><w:hpsBaseText w:val="${hps}"/><w:lid w:val="${lid}"/></w:rubyPr>` +
    `<w:rt>${textRuns(ruby.text, rPr({ sz: rt }))}</w:rt><w:rubyBase>${base}</w:rubyBase></w:ruby></w:r>`
  );
}

function hyperlink(ctx: WriterContext, href: string, runs: string, field?: boolean): string {
  if (field) {
    const target = href.replace(/"/g, '%22');
    const instr = target.startsWith('#') ? `HYPERLINK \\l "${wordBookmarkName(target.slice(1)) ?? target.slice(1)}"` : `HYPERLINK "${target}"`;
    return (
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      `<w:r><w:instrText xml:space="preserve"> ${escapeXml(instr)} </w:instrText></w:r>` +
      `<w:r><w:fldChar w:fldCharType="separate"/></w:r>${runs}<w:r><w:fldChar w:fldCharType="end"/></w:r>`
    );
  }
  // Anchors are bookmarks under Word-safe names (marks.ts).
  if (href.startsWith('#')) return `<w:hyperlink w:anchor="${escapeAttr(wordBookmarkName(href.slice(1)) ?? href.slice(1))}">${runs}</w:hyperlink>`;
  return `<w:hyperlink r:id="${ctx.pkg.addLink(href)}">${runs}</w:hyperlink>`;
}

type Unit =
  | { kind: 'char'; p: number; ch: string; src: number; fmt: Fmt }
  | { kind: 'obj'; p: number; xml: string; fmt: Fmt; text: string; atom?: { start: number; end: number; kind: string; hash?: string } }
  | { kind: 'mapped'; p: number; text: string; map: number[]; fmt: Fmt; style: string };

/** Runs and fragment of an inline source. */
export function renderInline(ctx: WriterContext, s: InlineSource): { xml: string; frag: FragmentBuilder } {
  const units: Unit[] = [];
  const nextMapped = (p: number): number => {
    for (let k = p + 1; k < s.sourceMap.length; k++) if (s.sourceMap[k]! >= 0) return s.sourceMap[k]!;
    return s.end;
  };
  // Code ranges sorted by start, searched by halving (a long paragraph
  // with many code spans would otherwise cost characters × spans).
  const code = [...(s.inlineCode ?? [])].sort((a, b) => a.start - b.start);
  const inCode = (o: number): boolean => {
    let lo = 0;
    let hi = code.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = code[mid]!;
      if (o < r.start) hi = mid - 1;
      else if (o >= r.end) lo = mid + 1;
      else return true;
    }
    return false;
  };
  // The indent of the first line of verse, over the spaces before it.
  const firstLead = s.lineLeads?.[0];
  const first = s.sourceMap[0] ?? -1;
  if (firstLead && first > 0) {
    let ws = first;
    while (ws > 0 && /[ \t\u3000]/.test(s.src[ws - 1]!)) ws--;
    if (ws < first) units.push({ kind: 'obj', p: 0, xml: textRuns(firstLead, ''), fmt: {}, text: firstLead, atom: { start: ws, end: first, kind: 'indent' } });
  }
  let line = 0;
  let p = 0;
  for (const span of s.spans) {
    const len = span.text.length;
    const base: Fmt = { b: span.bold, i: span.italic, c: span.smallCaps, script: span.script, ...(span.ruby ? { ruby: { key: `${span.ruby.id}:${p}`, text: span.ruby.text, ...(span.ruby.group ? { group: true } : {}) } } : {}) };
    const at = s.sourceMap[p] ?? -1;
    const limit = nextMapped(p + len - 1);
    if (span.math) {
      const start = s.toSrc(span.math.sourceStart);
      const end = s.toSrc(span.math.sourceEnd);
      const omml = texToOmml(span.math.tex, false);
      if (omml) units.push({ kind: 'obj', p, xml: omml, fmt: base, text: OBJECT_CHAR, atom: { start, end, kind: 'math', hash: ommlHash(omml) } });
      else units.push(sourceUnit(s, p, start, end));
    } else if (span.footnote) {
      const end = atomEnd(s.src, at, limit);
      const wordId = s.noteRef?.(span.footnote.id);
      if (wordId !== undefined) {
        units.push({ kind: 'obj', p, xml: `<w:r>${rPr({ style: STYLE.footnoteRef })}<w:footnoteReference w:id="${wordId}"/></w:r>`, fmt: {}, text: OBJECT_CHAR, atom: { start: at, end, kind: 'footnote' } });
      } else units.push(sourceUnit(s, p, at, end));
    } else if (span.ref) {
      const label = refLabel(ctx, span.ref);
      const unit = atomUnit(p, label.text, base, STYLE.reference, at, atomEnd(s.src, at, limit), 'ref');
      if (label.page && label.bookmark && unit.kind === 'obj') {
        // The page as a PAGEREF Word fills in, read back as one object.
        const props = rPr(runProps(base, STYLE.reference));
        unit.xml = textRuns(label.page.before, props) + pageRef(label.bookmark, props) + textRuns(label.page.after, props);
        unit.text = label.page.before + OBJECT_CHAR + label.page.after;
      }
      // A reference to a heading or an anchor jumps to it.
      if (label.bookmark && unit.kind === 'obj') unit.xml = s.linkFields ? hyperlink(ctx, `#${label.bookmark}`, unit.xml, true) : `<w:hyperlink w:anchor="${label.bookmark}" w:history="1">${unit.xml}</w:hyperlink>`;
      units.push(unit);
    } else if (span.citation) {
      const raw = span.citation.raw;
      const end = s.src.startsWith(raw, at) ? at + raw.length : atomEnd(s.src, at, limit);
      units.push(atomUnit(p, raw, base, STYLE.reference, at, end, 'citation'));
    } else if (span.chip) {
      units.push(atomUnit(p, chipLabel(span.chip), base, ctx.styles.chip(span.chip.style), at, atomEnd(s.src, at, limit), span.chip.gap ? 'gap' : 'chip'));
    } else if (span.swatch) {
      const icon = span.swatch.icon;
      const text = icon ? icon.alt || icon.glyph || '\u25A0' : '\u25A0';
      const color = icon ? undefined : hex(span.swatch.color);
      const xml = textRuns(text, rPr({ ...runProps(base, STYLE.reference), color }));
      units.push({ kind: 'obj', p, xml, fmt: base, text, atom: { start: at, end: atomEnd(s.src, at, limit), kind: icon ? 'icon' : 'swatch' } });
    } else if (span.tab && s.src[at] !== '\t') {
      units.push(atomUnit(p, '\t', base, undefined, at, atomEnd(s.src, at, limit), 'tab'));
    } else if (!span.inserted) {
      for (let k = 0; k < len; k++) {
        const ch = span.text[k]!;
        const src = s.sourceMap[p + k] ?? -1;
        const fmt: Fmt = { ...base, k: src >= 0 && inCode(src) };
        const link = span.links?.find((l) => k >= l.start && k < l.end);
        if (link?.mark) {
          fmt.mark = true;
          const look = markLook(ctx, link.mark.style);
          if (look.fill) fmt.markFill = look.fill;
          if (look.ink) fmt.markInk = look.ink;
        } else if (link?.href) fmt.href = link.href;
        if (ch === BREAK) {
          let end = src >= 0 && s.src[src] === '\\' ? (s.src[src + 1] === '\\' ? src + 2 : src + 1) : src + 1;
          // The atom takes the source line end too: deleting the break in
          // Word then leaves no stray newline behind.
          if (src >= 0 && s.src[end] === '\n') end++;
          units.push({ kind: 'obj', p: p + k, xml: '<w:r><w:br/></w:r>', fmt: {}, text: '\n', atom: { start: src, end, kind: 'break' } });
        } else if (ch === '\n' && s.lineLeads && src >= 0 && s.src[src] === '\n') {
          // A line of verse: the break and the next line's indent, over the
          // line end and the spaces that follow it.
          const lead = s.lineLeads[++line] ?? '';
          const next = nextMapped(p + k);
          const brk = s.lineParagraph ? s.lineParagraph(line) : '<w:r><w:br/></w:r>';
          const mark = s.lineParagraph ? PARA_MARK : '\n';
          units.push({ kind: 'obj', p: p + k, xml: brk + textRuns(lead, ''), fmt: {}, text: mark + lead, atom: { start: src, end: next > src ? next : src + 1, kind: 'line' } });
        } else if (src < 0 || s.src[src] === ch || (/\s/.test(ch) && /\s/.test(s.src[src] ?? ''))) {
          units.push({ kind: 'char', p: p + k, ch, src, fmt });
        } else {
          // A character the source writes otherwise (a verse's `||`, an
          // escape the parser resolved): kept whole as an atom.
          const next = nextMapped(p + k);
          units.push({ kind: 'obj', p: p + k, xml: textRuns(ch, rPr(runProps(fmt))), fmt, text: ch, atom: { start: src, end: next > src ? next : src + 1, kind: 'char' } });
        }
      }
    }
    p += len;
  }
  return emit(ctx, s, units);
}

/** A PAGEREF field with no result yet, marked for Word to update. */
function pageRef(bookmark: string, props: string): string {
  return fieldRuns(`PAGEREF ${bookmark} \\h`, '', props).replace('w:fldCharType="begin"/>', 'w:fldCharType="begin" w:dirty="true"/>');
}

function atomUnit(p: number, text: string, fmt: Fmt, style: string | undefined, start: number, end: number, kind: string): Unit {
  const xml = textRuns(text, rPr(runProps(fmt, style)));
  return { kind: 'obj', p, xml, fmt, text, atom: { start, end, kind } };
}

/** The source text of a construct the writer could not convert, mapped
 *  character by character (it comes back as written). */
function sourceUnit(s: InlineSource, p: number, start: number, end: number): Unit {
  const text = s.src.slice(start, end).replace(/\r/g, ' ');
  return { kind: 'mapped', p, text, map: Array.from({ length: text.length }, (_, k) => start + k), fmt: {}, style: STYLE.sourceChar };
}

function emit(ctx: WriterContext, s: InlineSource, units: Unit[]): { xml: string; frag: FragmentBuilder } {
  const frag = new FragmentBuilder();
  let xml = '';
  let i = 0;
  const rtl = ctx.resolved.direction === 'rtl';
  // A generated mark: written and logged as text no source character
  // stands for.
  const ltrMark = (): void => {
    xml += textRuns(LRM, '');
    frag.push(LRM, [-1]);
  };
  const insertAt = (p: number): string => {
    const x = s.inserts?.get(p);
    if (x) s.inserts!.delete(p);
    return x ?? '';
  };
  while (i < units.length) {
    const u = units[i]!;
    xml += insertAt(u.p);
    if (u.kind === 'obj') {
      xml += u.fmt.href ? hyperlink(ctx, u.fmt.href, u.xml, s.linkFields) : u.xml;
      if (u.atom) frag.atom(u.text, u.atom.start, u.atom.end, u.atom.kind, flagsOf(u.fmt), u.atom.hash);
      else frag.push(u.text, new Array<number>(u.text.length).fill(-1), flagsOf(u.fmt));
      i++;
      continue;
    }
    if (u.kind === 'mapped') {
      if (rtl) ltrMark();
      xml += textRuns(u.text, rPr({ style: u.style }));
      frag.push(u.text, u.map);
      if (rtl) ltrMark();
      i++;
      continue;
    }
    // A run of plain characters with one format and no insertion inside.
    // A ruby base stays whole (a split one would show its reading twice):
    // what is anchored inside it goes after it.
    const key = fmtKey(u.fmt);
    let text = '';
    let after = '';
    const map: number[] = [];
    let j = i;
    while (j < units.length) {
      const v = units[j]!;
      if (v.kind !== 'char' || fmtKey(v.fmt) !== key) break;
      if (j > i && s.inserts?.has(v.p)) {
        if (!u.fmt.ruby) break;
        after += insertAt(v.p);
      }
      text += v.ch;
      map.push(v.src);
      j++;
    }
    const font = u.fmt.k ? undefined : ctx.styles.runFont(s.style, !!u.fmt.b, !!u.fmt.i);
    const plainRuns = textRuns(text, rPr({ ...runProps(u.fmt), ...(font ? { font } : {}) }));
    const runs = u.fmt.ruby ? rubyRun(ctx, u.fmt.ruby, plainRuns, s.style) : plainRuns;
    // Code in right-to-left text: left-to-right marks either side keep its
    // end punctuation from being mirrored.
    const ltr = rtl && !!u.fmt.k && !u.fmt.href;
    if (ltr) ltrMark();
    xml += u.fmt.href ? hyperlink(ctx, u.fmt.href, runs, s.linkFields) : runs;
    frag.push(text, map, flagsOf(u.fmt), u.fmt.href);
    if (ltr) ltrMark();
    xml += after;
    i = j;
  }
  // Marks anchored past the last character.
  if (s.inserts) for (const x of s.inserts.values()) xml += x;
  return { xml, frag };
}
