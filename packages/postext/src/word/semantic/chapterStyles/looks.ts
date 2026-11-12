// Chapter styles in the flow .docx (#1521). A chapter set in a chapter
// style of the book (its `chapterStyle:`, the `:::part{style}` fence it
// opens with, or the part it is in) is written with that style's settings
// over the book's: its section's page, columns and numbering, and its
// paragraphs and runs in styles made from them. Each chapter style has a
// style registry of its own, under the writer's usual style ids; when the
// document is put together, a style of it that sets the text as the
// book's does takes the book's style, and one that differs becomes a
// style of its own, named after the chapter style ("Normal (Appendix)"),
// so the difference survives a round trip through Word, whose styles are
// keyed by name.

import { chapterConfig, chapterStyleIdOf } from '../../../defaults/chapterStyles.js';
import { continuationAfter } from '../../../pipeline/continuation.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import type { LayoutContinuation, PostextConfig } from '../../../types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import type { WordFontPlan } from '../../fonts/types.js';
import { escapeAttr, escapeXml } from '../../xml.js';
import type { PlainBook, WriterContext } from '../context.js';
import { plainConfig } from '../plain/config.js';
import { multiColumn, pageGeometry, type PageGeometry } from '../sections.js';
import { StyleRegistry, type StyleDef } from '../styles.js';
import type { WordChapterInput } from '../types.js';
import { px, type Units } from '../wml.js';

/** What the writer reads of the settings a chapter is set in. */
export interface LookState {
  resolved: ResolvedConfig;
  units: Units;
  styles: StyleRegistry;
  plain?: PlainBook;
  columnPx: number;
  textTwips: number;
  textAreaPx: number;
}

/** One chapter style as the document sets it. */
export interface ChapterLook {
  /** The chapter style's id, and the words its styles are named with. */
  id: string;
  label: string;
  /** What the style's own style ids end with. */
  suffix: string;
  state: LookState;
  geo: PageGeometry;
}

/** The chapter style each chapter is set in, `undefined` for the book's
 *  own settings: its own, the part fence it opens with, or the part it is
 *  in, as the layout reads them (a style the book does not define sets
 *  the chapter in the book's). */
export function chapterStyleIds(chapters: readonly WordChapterInput[], config: PostextConfig): (string | undefined)[] {
  const known = new Set((config.chapterStyles ?? []).map((s) => s.id));
  if (known.size === 0) return chapters.map(() => undefined);
  let before: LayoutContinuation | undefined;
  return chapters.map((c) => {
    const id = chapterStyleIdOf(c.markdown, before?.part?.style);
    const part = continuationAfter({ markdown: c.markdown }, config, before).part;
    before = part ? ({ part } as LayoutContinuation) : undefined;
    return id !== undefined && known.has(id) ? id : undefined;
  });
}

/** The writer's state for a chapter in the book's own settings. */
export function lookState(ctx: WriterContext): LookState {
  return { resolved: ctx.resolved, units: ctx.units, styles: ctx.styles, ...(ctx.plain ? { plain: ctx.plain } : {}), columnPx: ctx.columnPx, textTwips: ctx.textTwips, textAreaPx: ctx.textAreaPx };
}

/** Set the writer to a chapter's settings (`look`), or back to the
 *  book's (`book`). */
export function enterLook(ctx: WriterContext, book: LookState, look: ChapterLook | undefined): void {
  const s = look?.state ?? book;
  ctx.resolved = s.resolved;
  ctx.units = s.units;
  ctx.styles = s.styles;
  if (s.plain) ctx.plain = s.plain;
  ctx.columnPx = s.columnPx;
  ctx.textTwips = s.textTwips;
  ctx.textAreaPx = s.textAreaPx;
  if (look) ctx.look = look.id;
  else delete ctx.look;
}

/** The settings of chapter style `id`, as the document sets them: the
 *  book's design (`plain` false) or the neutral one. */
export function chapterLook(config: PostextConfig, id: string, plain: boolean, fonts: WordFontPlan | undefined): ChapterLook {
  const book = resolveAllConfig(chapterConfig(config, id));
  const resolved = plain ? plainConfig(book) : book;
  const units: Units = { dpi: resolved.page.dpi || 96, basePx: 16 };
  units.basePx = px(units, resolved.bodyText.fontSize) || 16;
  const geo = pageGeometry(resolved, units);
  const bookGeo = plain ? pageGeometry(book, units) : geo;
  const style = config.chapterStyles?.find((s) => s.id === id);
  const n = (config.chapterStyles ?? []).findIndex((s) => s.id === id) + 1;
  return {
    id,
    label: style?.name?.trim() || id,
    suffix: `Cs${n}`,
    geo,
    state: {
      resolved,
      units,
      styles: new StyleRegistry(resolved, units, fonts, plain),
      ...(plain ? { plain: { book, columnPx: bookGeo.columnPx, textAreaPx: multiColumn(bookGeo) ? (bookGeo.textTwips * units.dpi) / 1440 : bookGeo.columnPx } } : {}),
      columnPx: geo.columnPx,
      textTwips: Math.round((geo.columnPx * 1440) / units.dpi),
      textAreaPx: multiColumn(geo) ? (geo.textTwips * units.dpi) / 1440 : geo.columnPx,
    },
  };
}

/** A style's look apart from the styles it names. */
const lookKey = (d: StyleDef): string => JSON.stringify({ ...d, basedOn: undefined, next: undefined });

/** The style ids and names of a chapter style that are its own: those
 *  that set the text otherwise than the book's style of the same id. */
interface Renames {
  ids: Map<string, string>;
  names: Map<string, string>;
}

/**
 * Put the chapter styles' styles into the book's registry: a style that
 * sets the text as the book's does is the book's; any other is added,
 * under its id with the chapter style's suffix and its name with the
 * chapter style's in brackets, based on the book's style or on another
 * of the chapter style's own.
 */
function settle(book: StyleRegistry, look: ChapterLook): Renames {
  const own = look.state.styles.defs;
  const same = new Map<string, boolean>();
  const isSame = (id: string): boolean => {
    const known = same.get(id);
    if (known !== undefined) return known;
    same.set(id, true);
    const v = own.get(id);
    const b = book.defs.get(id);
    const result = !!v && !!b && v.basedOn === b.basedOn && v.next === b.next && lookKey(v) === lookKey(b) && (!v.basedOn || !own.has(v.basedOn) || isSame(v.basedOn));
    same.set(id, result);
    return result;
  };
  const ids = new Map<string, string>();
  const names = new Map<string, string>();
  for (const id of own.keys()) {
    if (isSame(id)) continue;
    let to = `${id}${look.suffix}`;
    for (let k = 2; book.defs.has(to); k++) to = `${id}${look.suffix}x${k}`;
    ids.set(id, to);
  }
  for (const [id, to] of ids) {
    const def = own.get(id)!;
    const name = `${def.name} (${look.label})`;
    names.set(def.name, name);
    const { isDefault: _default, ...rest } = def;
    void _default;
    book.defs.set(to, {
      ...rest,
      name,
      custom: true,
      ...(def.basedOn ? { basedOn: ids.get(def.basedOn) ?? def.basedOn } : {}),
      ...(def.next ? { next: ids.get(def.next) ?? def.next } : {}),
    });
  }
  return { ids, names };
}

/** XML written in a chapter style with its own styles named as settled. */
function rename(xml: string, r: Renames): string {
  if (r.ids.size === 0) return xml;
  let out = xml.replace(/(<w:(?:pStyle|rStyle) w:val=")([^"]*)(")/g, (m, open: string, id: string, close: string) => {
    const to = r.ids.get(id);
    return to ? `${open}${escapeAttr(to)}${close}` : m;
  });
  // A running head reads a chapter's title by the name of its style.
  for (const [from, to] of r.names) out = out.split(`STYLEREF "${escapeXml(from.replace(/"/g, ''))}"`).join(`STYLEREF "${escapeXml(to.replace(/"/g, ''))}"`);
  return out;
}

/** One chapter as written: its XML, its notes (`ctx.footnotes` from
 *  `notes[0]` to `notes[1]`) and the chapter style it was written in. */
export interface WrittenChapter {
  xml: string;
  notes: [number, number];
  look?: ChapterLook;
}

/** The document's body, its notes and its running heads with the chapter
 *  styles' own styles named as the document defines them. */
export function settleLooks(ctx: WriterContext, book: StyleRegistry, looks: readonly ChapterLook[], chapters: readonly WrittenChapter[]): string {
  const renames = new Map(looks.map((l) => [l.id, settle(book, l)]));
  for (const [id, look] of ctx.partLooks ?? []) {
    const r = renames.get(look);
    if (!r) continue;
    if (ctx.headers[id] !== undefined) ctx.headers[id] = rename(ctx.headers[id]!, r);
    if (ctx.footers[id] !== undefined) ctx.footers[id] = rename(ctx.footers[id]!, r);
  }
  return chapters.map((c) => {
    const r = c.look && renames.get(c.look.id);
    if (!r) return c.xml;
    for (let i = c.notes[0]; i < c.notes[1]; i++) ctx.footnotes[i] = rename(ctx.footnotes[i]!, r);
    return rename(c.xml, r);
  }).join('');
}
