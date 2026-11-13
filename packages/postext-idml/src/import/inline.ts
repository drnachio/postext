// A paragraph's runs as segments of marked text: what each run is set in
// against the look of its paragraph, and what every inline thing of a
// story (a note, an index mark, a link, a variable, an anchored object)
// becomes.

import type { CharacterStyleConfig } from 'postext';
import type { IdmlPageItem, IdmlParagraph, IdmlRun, IdmlTable, Inline } from '../model/document.js';
import { characterFormat, type CharacterFormat } from '../resolve/format.js';
import { runProps, stylePath } from '../resolve/styles.js';
import type { Context } from './context.js';
import { attributeValue, cleanText, idOf, LINE_BREAK, WORD_JOINER } from './escape.js';
import { crossReferences } from './fidelity/crossref.js';
import type { Look } from './looks.js';
import { renderSegs, withInlineBreaks, type Seg } from './marks.js';
import { italicOf, pt, sameColour, weightOf } from './values.js';

export interface InlineEnv {
  /** `body`: a paragraph, a list item, a quotation. `heading`: one line,
   *  no notes. `snippet`: a table cell, a caption (notes, index marks and
   *  tabs print as written there, so they are moved or reworded). */
  where: 'body' | 'heading' | 'snippet';
  look: Look;
  /** Footnote definitions of the chapter. */
  notes: string[];
  /** Blocks that follow the paragraph: tables, pictures, anchored boxes. */
  after: string[];
  /** Blocks set before it: objects anchored above its first line. */
  before?: string[];
  /** Marks that could not stand where they were; the next paragraph of
   *  the text opens with them. */
  carry: string[];
  /** Notes of a table's cells, set under the table. */
  snippetNotes?: string[];
  /** Name of the page the text starts on, for a page number typed as a
   *  special character. */
  pageName?: string;
  /** The anchor a heading must carry. */
  headingId?: string;
  /** What tables and anchored objects become. */
  hooks: InlineHooks;
  /** The text stands in a note: a note in a note is set in line. */
  inNote?: boolean;
  /** A nested style applied by hand: the first `chars` characters of the
   *  paragraph take these marks. */
  leadIn?: { chars: number; marks: Pick<Seg, 'b' | 'i' | 'sc'> };
}

export interface InlineHooks {
  /** A table of the text, as blocks set after its paragraph. */
  table(table: IdmlTable, env: InlineEnv): string[];
  /** An object anchored in the text: Markdown set in the line where it
   *  stands, and blocks set after its paragraph. `inline` when the
   *  paragraph holds other text. */
  item(item: IdmlPageItem, env: InlineEnv, inline: boolean): { inline?: string; blocks: string[]; /** The blocks stand before the paragraph (a box its text runs beside). */ before?: boolean };
  /** The paragraphs of a note as one line of Markdown. */
  note(paragraphs: IdmlParagraph[], env: InlineEnv): string;
}

const formats = new WeakMap<object, WeakMap<object, Map<string, CharacterFormat>>>();

function formatOf(ctx: Context, para: IdmlParagraph, run: IdmlRun): CharacterFormat {
  let byPara = formats.get(para.attrs);
  if (!byPara) formats.set(para.attrs, (byPara = new WeakMap()));
  let byStyle = byPara.get(run.attrs);
  if (!byStyle) byPara.set(run.attrs, (byStyle = new Map()));
  const key = `${para.paragraphStyle ?? ''}\u0000${run.characterStyle ?? ''}`;
  let f = byStyle.get(key);
  if (!f) byStyle.set(key, (f = characterFormat(runProps(ctx.doc, para, run))));
  return f;
}

const KENTEN: Record<string, string> = {
  KentenSesameDot: '{style="sesame"}',
  KentenWhiteSesameDot: '{style="sesame" fill="open"}',
  KentenBlackCircle: '{style="circle" fill="filled"}',
  KentenWhiteCircle: '{style="circle"}',
  KentenSmallBlackCircle: '{style="dot"}',
  KentenSmallWhiteCircle: '{style="dot" fill="open"}',
};

const sc = (c: string): boolean => c === 'SmallCaps' || c === 'CapToSmallCap';
const spanIds = new WeakMap<Context, Map<string, string>>();

/** A run in a named character style that sets another face, size or
 *  tracking than its paragraph's (which no mark of Postext sets) is set in
 *  a character style of the book with the run's whole look:
 *  `:span[…]{style="id"}` (#1555). One book style per character style and
 *  look. Words set so by hand, in no character style, keep the paragraph's
 *  face and are reported: the change is formatting of the document, not a
 *  style of it. */
function spanStyle(ctx: Context, f: CharacterFormat, look: Look, run: IdmlRun): string | undefined {
  const cs = run.characterStyle ? ctx.doc.styles.character.get(run.characterStyle) : undefined;
  if (!cs || cs.root) return undefined;
  const base = look.cf;
  const scripted = /Superscript|Subscript|Numerator|Denominator/.test(f.position);
  const face = !!f.fontFamily && !!base.fontFamily && f.fontFamily !== base.fontFamily;
  const size = Math.abs(f.pointSize - base.pointSize) > 0.01 && !scripted;
  if (!face && !size && f.tracking === base.tracking) return undefined;
  const colour = ctx.palette.colour(f.fillColor, f.fillTint, 'text');
  const weight = weightOf(f.fontStyle);
  const italic = italicOf(f.fontStyle) || f.skew !== 0;
  const key = [cs.self, f.fontFamily ?? '', f.pointSize, weight, italic, colour?.hex ?? '', f.tracking, sc(f.capitalization)].join('|');
  let ids = spanIds.get(ctx);
  if (!ids) spanIds.set(ctx, (ids = new Map()));
  const hit = ids.get(key);
  if (hit) return hit;
  const id = ctx.styleIds.take(idOf(cs.name, 'span'));
  const style: CharacterStyleConfig = { id, name: stylePath(cs), fontSize: pt(f.pointSize), fontWeight: weight, italic };
  if (f.fontFamily) style.fontFamily = f.fontFamily;
  if (colour) style.color = colour;
  if (f.tracking) style.letterSpacing = { value: Math.round(f.tracking) / 1000, unit: 'em' };
  if (sc(f.capitalization)) style.smallCaps = true;
  ctx.characterStyles.set(id, style);
  ids.set(key, id);
  return id;
}

/** The marks of a run against its paragraph's look, and what of its
 *  format has no mark (counted in the report). A run in a character style
 *  of the book (`spanStyle`) takes its face, size, weight, slant and
 *  colour from that style, and marks only the rest. */
function marksOf(ctx: Context, f: CharacterFormat, look: Look, run: IdmlRun, sample: string): Omit<Seg, 't'> {
  const base = look.cf;
  const out: Omit<Seg, 't'> = {};
  const span = spanStyle(ctx, f, look, run);
  if (span) out.span = span;
  const weight = weightOf(f.fontStyle);
  if (span) {
    // (The style sets all of these.)
  } else if (weight >= 600 && look.weight < 600) out.b = true;
  else if (weight < 600 && look.weight >= 600) ctx.rep.add('lighterRun', 'warning', 'Text lighter than the paragraph it stands in is set at the paragraph\'s weight: Postext marks bold, not its absence', sample);
  if (!span && (italicOf(f.fontStyle) || f.skew !== 0) !== look.italic) out.i = true;
  if (!span && sc(f.capitalization) && !sc(base.capitalization)) out.sc = true;
  if (f.underline && !base.underline) out.u = true;
  if (f.strikeThru && !base.strikeThru) out.s = true;
  if (/Superscript|Numerator/.test(f.position)) out.script = 'sup';
  else if (/Subscript|Denominator/.test(f.position)) out.script = 'sub';
  if (f.characterDirection && f.characterDirection !== look.pf.direction) out.dir = f.characterDirection;
  // Colour: a mark style that only colours.
  if (!span && ((f.fillColor ?? '') !== (base.fillColor ?? '') || (f.fillTint ?? -1) !== (base.fillTint ?? -1))) {
    const own = ctx.palette.colour(f.fillColor, f.fillTint, 'text');
    const of = ctx.palette.colour(base.fillColor, base.fillTint);
    if (own && !sameColour(own, of)) {
      out.mark = ctx.inkStyle(own);
      ctx.rep.add('colouredText', 'info', 'Coloured words are set with a mark style that changes only the colour of the text', sample);
    }
  }
  const style = run.characterStyle ? ctx.doc.styles.character.get(run.characterStyle)?.name : undefined;
  const named = style ? ` (character style ${style})` : '';
  if (!span && f.fontFamily && base.fontFamily && f.fontFamily !== base.fontFamily) ctx.rep.add('inlineFontFamily', 'loss', 'Words set in another typeface than their paragraph by hand, in no character style, keep the paragraph\'s (a character style that changes the face becomes one of the book\'s)', `${f.fontFamily}${named}: ${sample}`);
  if (!span && Math.abs(f.pointSize - base.pointSize) > 0.01 && !out.script) ctx.rep.add('inlineFontSize', 'loss', 'Words set in another size than their paragraph by hand, in no character style, keep the paragraph\'s (a character style that changes the size becomes one of the book\'s)', `${f.pointSize} pt${named}: ${sample}`);
  if (!span && f.tracking !== base.tracking) ctx.rep.add('inlineTracking', 'warning', 'Tracking set on some words of a paragraph is not carried: Postext tracks whole styles', `${f.tracking}${named}: ${sample}`);
  if (f.baselineShift !== 0 && f.baselineShift !== base.baselineShift) ctx.rep.add('baselineShift', 'warning', 'A baseline shift is not carried', sample);
  if ((f.horizontalScale !== 100 || f.verticalScale !== 100) && (f.horizontalScale !== base.horizontalScale || f.verticalScale !== base.verticalScale)) ctx.rep.add('glyphScaling', 'warning', 'Horizontally or vertically scaled characters are set at their natural width', sample);
  if (f.strokeColor && f.strokeColor !== base.strokeColor && (f.strokeWeight ?? 0) > 0 && !/None$/.test(f.strokeColor)) ctx.rep.add('strokedText', 'warning', 'A stroke on characters is not carried', sample);
  return out;
}

/** The language of the text, counted for the book's locale. */
function countLanguage(ctx: Context, f: CharacterFormat, n: number): void {
  const tag = f.languageTag ?? (f.language ? `?${f.language}` : undefined);
  if (tag) ctx.languages.set(tag, (ctx.languages.get(tag) ?? 0) + n);
}

function indexMark(ctx: Context, inline: Extract<Inline, { kind: 'indexMark' }>, seen: Set<string>): string | undefined {
  const topic = ctx.doc.topics.get(inline.topic);
  if (!topic) {
    ctx.rep.add('indexTopicMissing', 'loss', 'An index mark names a topic the document does not hold; the mark is left out', inline.topic);
    return undefined;
  }
  ctx.counts.indexMarks++;
  ctx.hasIndexMarks = true;
  const attrs = [`term="${indexTerm(ctx, [...topic.path, topic.name])}"`];
  if (topic.sortOrder && topic.sortOrder !== topic.name) attrs.push(`sort="${attributeValue(topic.sortOrder).text}"`);
  // A "see also" stands after the pages: the first mark of its topic
  // carries it.
  if (!seen.has(topic.self)) {
    seen.add(topic.self);
    const also = topic.crossReferences.filter((x) => /also/i.test(x.type));
    const target = also[0] ? ctx.doc.topics.get(also[0].topic) : undefined;
    if (target) attrs.push(`seealso="${indexTerm(ctx, [...target.path, target.name])}"`);
    if (also.length > 1) ctx.rep.add('indexSeeAlsoMany', 'warning', 'A topic with several "see also" references keeps the first', topic.name, also.length - 1);
  }
  const type = inline.type ?? 'CurrentPage';
  if (type === 'SuppressPageNumbers') ctx.rep.add('indexSuppressedPage', 'warning', 'An index entry set to print no page number prints its page', topic.name);
  else if (type !== 'CurrentPage') ctx.rep.add('indexRange', 'warning', 'An index entry over a range of pages (to the next style change, for N pages…) prints the page of its mark', `${topic.name}: ${type}`);
  return `:index{${attrs.join(' ')}}`;
}

/** Levels of an index term as `A!B!C`. */
export function indexTerm(ctx: Context, levels: string[]): string {
  return levels
    .map((l) => {
      const v = attributeValue(l);
      const text = v.text.replace(/!/g, '！');
      if (v.changed || text !== v.text) ctx.rep.add('indexTermRewritten', 'warning', 'An index term holding a quote, a brace or an exclamation mark is written with a look-alike character', l);
      return text;
    })
    .join('!');
}

const seenTopics = new WeakMap<Context, Set<string>>();

/** Where a link source leads: an address, an anchor of the book, or
 *  nowhere the book can go. */
function hrefOf(ctx: Context, run: IdmlRun, sample: string): string | undefined {
  const link = run.linkSource ? ctx.linkBySource.get(run.linkSource) : undefined;
  if (!link) {
    if (run.linkSource) ctx.rep.add('linkWithoutTarget', 'warning', 'A hyperlink source with no hyperlink keeps its text only', sample);
    return undefined;
  }
  const d = ctx.destination(link.destination);
  if (!d) {
    ctx.rep.add('linkWithoutTarget', 'warning', 'A hyperlink whose destination the document does not hold keeps its text only', link.name || sample);
    return undefined;
  }
  if (d.kind === 'url') {
    const url = (d.url ?? '').trim();
    if (!/^(?:https?:|mailto:|tel:|ftp:)/i.test(url)) {
      ctx.rep.add('linkScheme', 'warning', 'A link to an address Postext does not follow (a file, another scheme) keeps its text only', url || link.name);
      return undefined;
    }
    return url;
  }
  if (d.kind === 'text' || d.kind === 'paragraph') {
    const id = ctx.anchorOf.get(d.self);
    return id ? `#${id}` : undefined;
  }
  if (d.kind === 'page') {
    const page = ctx.pageByRef(d.page);
    if (page) return `#${ctx.anchorForPage(page)}`;
    ctx.rep.add('linkWithoutTarget', 'warning', 'A link to a page the document does not hold keeps its text only', link.name || sample);
    return undefined;
  }
  ctx.rep.add('externalDocumentLink', 'warning', 'A link into another document keeps its text only', d.documentPath ?? link.name);
  return undefined;
}

export interface InlineResult {
  /** Inline Markdown; forced breaks are U+2028. */
  text: string;
  /** The paragraph holds text of its own (not only objects). */
  hasText: boolean;
}

/** One paragraph as inline Markdown. Notes, tables and anchored objects
 *  go to `env`. */
export function inlineOf(ctx: Context, para: IdmlParagraph, env: InlineEnv): InlineResult {
  const segs: Seg[] = [];
  const sample = (): string => ctx.sample(para);
  let seen = seenTopics.get(ctx);
  if (!seen) seenTopics.set(ctx, (seen = new Set()));
  let hasText = false;
  for (const r of para.runs) for (const i of r.content) if (i.kind === 'text' && i.text.trim()) hasText = true;
  const raw = (t: string): void => {
    segs.push({ t, raw: true });
  };
  // A paragraph none of whose words may break is set by its forced line
  // breaks alone (lines kept from another setting): its words keep their
  // ordinary spaces, which a justified line stretches. A no-break space
  // is a fixed one in Postext.
  const keptLines = hasText && para.runs.every((r) => !r.content.some((i) => i.kind === 'text' && i.text.trim()) || formatOf(ctx, para, r).noBreak);
  const references = para.runs.some((r) => r.crossReference) ? crossReferences(ctx, para, sample) : undefined;
  for (const run of para.runs) {
    if (!ctx.runShown(run, sample)) continue;
    const f = formatOf(ctx, para, run);
    let marks: Omit<Seg, 't'> | undefined;
    const marked = (): Omit<Seg, 't'> => (marks ??= marksOf(ctx, f, env.look, run, sample()));
    const reference = references?.get(run);
    let href = run.linkSource && reference === undefined ? hrefOf(ctx, run, sample()) : undefined;
    if (run.linkSource && reference !== null) ctx.counts.hyperlinks++;
    if (run.tags.length) ctx.rep.add('xmlTags', 'info', 'XML tags on the text are not carried (Postext has no tagged structure of its own)', run.tags[run.tags.length - 1]);
    const text = (t: string): void => {
      let s = cleanText(t);
      if (!s) return;
      if (f.capitalization === 'AllCaps' && env.look.cf.capitalization !== 'AllCaps') {
        s = s.toLocaleUpperCase(f.languageTag);
        ctx.rep.add('allCapsRun', 'info', 'Words set in all capitals by a character setting are written in capitals', sample());
      }
      if (f.noBreak && !keptLines) s = s.replace(/ /g, '\u00a0');
      const n = s.trim().length;
      ctx.countFace(f.fontFamily, f.fontStyle, n);
      countLanguage(ctx, f, n);
      const seg: Seg = { t: s, ...marked() };
      if (href !== undefined) seg.href = href;
      if (f.ruby) seg.ruby = { text: f.ruby.text, group: f.ruby.type === 'GroupRuby' };
      else if (f.tatechuyoko) seg.tcy = true;
      else if (f.kenten) seg.dots = KENTEN[f.kenten.kind] ?? '';
      if (f.kenten && !(f.kenten.kind in KENTEN)) ctx.rep.add('kentenShape', 'warning', 'An emphasis mark of a shape Postext has not is set as the default mark', f.kenten.kind);
      segs.push(seg);
    };
    // A cross-reference written as references of the book: its first run
    // carries the pieces, the others are part of them.
    if (reference !== undefined) {
      for (const piece of reference ?? []) {
        if ('raw' in piece) raw(piece.raw);
        else {
          href = piece.link ? hrefOf(ctx, run, sample()) : undefined;
          text(piece.text);
        }
      }
      continue;
    }
    for (const inline of run.content) {
      switch (inline.kind) {
        case 'text': {
          const parts = inline.text.split('\t');
          parts.forEach((p, n) => {
            if (n > 0) {
              if (env.where === 'body') raw(' :tab ');
              else {
                text(' ');
                ctx.rep.add('tabOutsideBody', 'info', 'A tab in a heading, a caption or a table cell is set as a space', sample());
              }
            }
            text(p);
          });
          break;
        }
        case 'special':
          special(ctx, inline, env, text, raw, sample);
          break;
        case 'footnote':
        case 'endnote':
          note(ctx, inline, env, raw, text, sample);
          break;
        case 'note':
          ctx.rep.add('editorialNotes', 'info', 'Editorial notes (InCopy notes) are left out', ctx.sample(inline.paragraphs[0] ?? para) || sample());
          break;
        case 'table':
          env.after.push(...env.hooks.table(inline.table, env));
          break;
        case 'item':
        {
          const placed = env.hooks.item(inline.item, env, hasText);
          if (placed.inline) raw(placed.inline);
          if ((inline.item.anchored?.position === 'AboveLine' || placed.before) && env.before) env.before.push(...placed.blocks);
          else env.after.push(...placed.blocks);
          break;
        }
        case 'indexMark': {
          const mark = indexMark(ctx, inline, seen);
          if (!mark) break;
          if (env.where === 'snippet') {
            env.carry.push(mark);
            ctx.rep.add('indexMarkMoved', 'info', 'An index mark in a table cell or a caption stands at the start of the paragraph after it', sample());
          } else {
            const last = segs[segs.length - 1];
            // After a colon a mark is not read: part them.
            raw((last && /:$/.test(last.t) ? WORD_JOINER : '') + mark);
          }
          break;
        }
        case 'variable':
          text(inline.result);
          ctx.rep.add('textVariables', 'info', 'A text variable is set as the text it showed when the document was saved', ctx.doc.textVariables.get(inline.variable)?.name ?? inline.result);
          break;
        case 'destination': {
          const id = ctx.anchorOf.get(inline.self);
          if (!id) break;
          if (env.where === 'heading') env.headingId = id;
          else if (env.where === 'snippet') env.carry.push(`:anchor{#${id}}`);
          else raw(`:anchor{#${id}}`);
          break;
        }
      }
    }
  }
  if (env.leadIn) applyLeadIn(segs, env.leadIn);
  return { text: renderSegs(segs), hasText };
}

function special(ctx: Context, inline: Extract<Inline, { kind: 'special' }>, env: InlineEnv, text: (t: string) => void, raw: (t: string) => void, sample: () => string): void {
  switch (inline.char) {
    case 'forcedLineBreak':
      raw(LINE_BREAK);
      break;
    case 'discretionaryHyphen':
      raw('\u00ad');
      break;
    case 'nonbreakingHyphen':
      raw('‑');
      break;
    case 'discretionaryLineBreak':
      raw('\u200b');
      break;
    case 'pageNumber':
    case 'nextPageNumber':
    case 'previousPageNumber':
      text(env.pageName ?? '');
      ctx.rep.add('pageNumberInText', 'warning', 'An automatic page number typed in the text is set as the number its page had in InDesign; it does not follow the book\'s pages', sample());
      break;
    case 'sectionMarker':
      text(ctx.doc.sections[0]?.marker ?? '');
      ctx.rep.add('sectionMarkerInText', 'warning', 'A section marker typed in the text is set as the first section\'s marker', sample());
      break;
    case 'footnoteNumber':
      // The note's own number: Postext sets it.
      break;
    case 'rightIndentTab':
      if (env.where === 'body') raw(' :tab{at=end align=end} ');
      else text(' ');
      break;
    case 'indentHere':
      ctx.rep.add('indentToHere', 'warning', 'An "indent to here" character is left out: the lines after it start at the paragraph\'s indent', sample());
      break;
    case 'endNestedStyle':
      break;
    case 'columnBreak':
    case 'frameBreak':
    case 'pageBreak':
    case 'oddPageBreak':
    case 'evenPageBreak':
      // Told by the paragraph's `breakAfter`.
      break;
    default:
      ctx.rep.add('unknownSpecialCharacter', 'loss', 'A special character the importer does not know is left out: the text about it closes up', `code ${inline.code ?? '?'}: ${sample()}`);
  }
}

function note(ctx: Context, inline: Extract<Inline, { kind: 'footnote' | 'endnote' }>, env: InlineEnv, raw: (t: string) => void, text: (t: string) => void, sample: () => string): void {
  ctx.counts.footnotes++;
  ctx.noteParagraph ??= inline.paragraphs.find((p) => p.runs.length);
  if (inline.kind === 'endnote') ctx.rep.add('endnotes', 'info', 'Endnotes are set as notes of the book (see footnotes.placement in the configuration)', sample());
  const body = withInlineBreaks(env.hooks.note(inline.paragraphs, { ...env, where: 'body', inNote: true, after: env.after }));
  if (env.inNote) {
    raw(` (${body}) `);
    return;
  }
  if (env.where === 'snippet') {
    const notes = (env.snippetNotes ??= []);
    notes.push(body);
    raw(`^${notes.length}^`);
    ctx.rep.add('noteInTable', 'warning', 'A note in a table cell or a caption is numbered by hand and set under its table: Postext reads note markers only in running text', sample());
    return;
  }
  const id = ctx.nextNote();
  env.notes.push(`[^${id}]: ${body || '\u00a0'}`);
  if (env.where === 'heading') {
    env.carry.push(`[^${id}]`);
    ctx.rep.add('noteOnHeading', 'warning', 'A note on a heading is cited at the start of the paragraph after it: a heading prints a note marker as text', sample());
    return;
  }
  raw(`[^${id}]`);
}

/** Lay marks over the first characters of the paragraph's own text. */
function applyLeadIn(segs: Seg[], leadIn: NonNullable<InlineEnv['leadIn']>): void {
  let left = leadIn.chars;
  for (let n = 0; n < segs.length && left > 0; n++) {
    const s = segs[n]!;
    if (s.raw) continue;
    if (s.t.length > left) {
      segs.splice(n + 1, 0, { ...s, t: s.t.slice(left) });
      s.t = s.t.slice(0, left);
    }
    left -= s.t.length;
    Object.assign(s, leadIn.marks);
  }
}
