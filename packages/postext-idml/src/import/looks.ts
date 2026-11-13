// What the paragraphs of a document look like, and what each look is.
//
// A paragraph's look is what it is set in once its style, the styles
// that one is based on and its local overrides are put together, with
// the character format most of its text carries (a designer who selects
// a paragraph and changes its size overrides the characters, not the
// paragraph). Paragraphs of one style that look different are different
// looks: a document formatted by hand, with every paragraph in
// InDesign's basic style, still imports with its sizes and faces.
//
// Each look is then given a role: the body text (the look most of the
// text is set in), a heading level (by the style's name, or by size and
// weight against the body), a list, a quotation, a caption, or a named
// paragraph style.

import type { IdmlDocument, IdmlParagraph, IdmlRun } from '../model/document.js';
import { characterFormat, paragraphFormat, type CharacterFormat, type ParagraphFormat } from '../resolve/format.js';
import { paragraphProps, runProps, stylePath } from '../resolve/styles.js';
import { italicOf, weightOf } from './values.js';

export type Role = 'body' | 'heading' | 'list' | 'quote' | 'caption' | 'style';

export interface Look {
  key: string;
  /** `Self` of the paragraph style, and its path (`Heads/H1`). */
  style?: string;
  path: string;
  /** The style's own name, without groups. */
  name: string;
  pf: ParagraphFormat;
  cf: CharacterFormat;
  weight: number;
  italic: boolean;
  paragraphs: number;
  characters: number;
  /** The space InDesign leaves above a paragraph of this look that follows
   *  another in its story (the one's space after and its own space before,
   *  which InDesign adds up), by how many times each was seen. */
  gaps?: Map<number, number>;
  /** Paragraphs of the look that end a sentence (a full stop, a question
   *  mark): running text does, a title does not. */
  sentences: number;
  /** Paragraphs of the look that hold a tab: words set in columns at the
   *  look's tab stops (a key, a row of figures) are no title (#1555). */
  tabbed?: number;
  role: Role;
  reason: string;
  /** Heading level 1–6. */
  level?: number;
  /** Id of the paragraph style the look became. */
  id?: string;
  sample: string;
  /** A paragraph of the look, for what the typed formats do not read. */
  first: IdmlParagraph;
  /** Attributes the paragraphs of the look set over their style. */
  overrides: Set<string>;
}

/** The text of a paragraph's own flow: notes, tables and anchored items
 *  left out, special characters as nothing. */
export function ownText(para: IdmlParagraph): string {
  let out = '';
  for (const r of para.runs) for (const i of r.content) if (i.kind === 'text') out += i.text;
  return out;
}

const runLength = (r: IdmlRun): number => {
  let n = 0;
  for (const i of r.content) if (i.kind === 'text') n += i.text.trim().length;
  return n;
};

/** What a run's characters look like, as a key: its character style and
 *  its own attributes and properties. Runs cut apart by a link, a note or
 *  a word set another way are one look when they are written alike. */
function formatKey(r: IdmlRun): string {
  const attrs = Object.keys(r.attrs).sort().map((k) => `${k}=${r.attrs[k]}`).join('\u0001');
  const props = Object.keys(r.properties ?? {}).sort().map((k) => `${k}=${JSON.stringify(r.properties[k])}`).join('\u0001');
  return `${r.characterStyle ?? ''}\u0002${attrs}\u0002${props}`;
}

/** The run most of the paragraph's text stands in. */
export function dominantRun(para: IdmlParagraph): IdmlRun | undefined {
  let best: IdmlRun | undefined;
  let most = -1;
  // Runs that share one character range share its attributes: count them
  // together, so a paragraph cut in many runs by links is still its own.
  const totals = new Map<string, { run: IdmlRun; n: number }>();
  for (const r of para.runs) {
    const key = formatKey(r);
    const t = totals.get(key);
    if (t) t.n += runLength(r);
    else totals.set(key, { run: r, n: runLength(r) });
  }
  for (const t of totals.values()) {
    if (t.n > most) {
      most = t.n;
      best = t.run;
    }
  }
  return best;
}

const FORMAT_ATTRS = new Set(['PointSize', 'FontStyle', 'Justification', 'LeftIndent', 'RightIndent', 'FirstLineIndent', 'SpaceBefore', 'SpaceAfter', 'FillColor', 'FillTint', 'Tracking', 'Capitalization', 'Hyphenation', 'DropCapLines', 'DropCapCharacters', 'ParagraphDirection', 'BulletsAndNumberingListType', 'HorizontalScale', 'VerticalScale', 'BaselineShift', 'Skew']);

export class Looks {
  readonly all = new Map<string, Look>();
  private readonly byParagraph = new WeakMap<IdmlParagraph, Look>();
  private readonly cache = new WeakMap<object, WeakMap<object, Look>>();
  body: Look | undefined;

  constructor(private readonly doc: IdmlDocument) {}

  /** The look of a paragraph, counted once. */
  of(para: IdmlParagraph): Look {
    const hit = this.byParagraph.get(para);
    if (hit) return hit;
    const run = dominantRun(para);
    // Paragraphs cut from one range share its attributes, and so do the
    // runs of one character range: their look is worked out once.
    const outer = para.attrs;
    const inner = run ? run.attrs : outer;
    let level = this.cache.get(outer);
    if (!level) this.cache.set(outer, (level = new WeakMap()));
    let look = run?.characterStyle ? undefined : level.get(inner);
    if (!look) {
      look = this.make(para, run);
      if (!run?.characterStyle) level.set(inner, look);
    }
    this.byParagraph.set(para, look);
    return look;
  }

  /** Count a paragraph of the text the book is made of. */
  count(para: IdmlParagraph): Look {
    const look = this.of(para);
    const text = ownText(para);
    look.paragraphs++;
    look.characters += text.length;
    if (/[.!?…:;»”"。！？]\s*$/.test(text)) look.sentences++;
    if (text.includes('\t')) look.tabbed = (look.tabbed ?? 0) + 1;
    if (!look.sample && text.trim()) look.sample = text.trim().slice(0, 60);
    return look;
  }

  private make(para: IdmlParagraph, run: IdmlRun | undefined): Look {
    const doc = this.doc;
    const props = paragraphProps(doc, para);
    const pf = paragraphFormat(props);
    const cf = characterFormat(run ? runProps(doc, para, run) : props);
    const style = para.paragraphStyle ? doc.styles.paragraph.get(para.paragraphStyle) : undefined;
    const list = pf.list ? `${pf.list.type}/${pf.list.level}/${pf.list.bullet ?? ''}/${pf.list.numberFormat ?? ''}/${pf.list.expression ?? ''}/${pf.list.continues}/${pf.list.startAt}/${pf.list.numberingList ?? ''}` : '';
    const key = [
      para.paragraphStyle ?? '', cf.fontFamily ?? '', cf.fontStyle, cf.pointSize, Math.round(cf.leading * 100) / 100, cf.fillColor ?? '', cf.fillTint ?? '', cf.tracking, cf.capitalization,
      pf.justification, pf.leftIndent, pf.rightIndent, pf.firstLineIndent, pf.spaceBefore, pf.spaceAfter, pf.direction, pf.hyphenation, pf.dropCap ? `${pf.dropCap.characters}x${pf.dropCap.lines}` : '', list, pf.tabs.map((t) => `${t.position}${t.alignment}${t.leader}`).join(','),
      pf.ruleAbove ? 'ra' : '', pf.ruleBelow ? 'rb' : '', pf.shading ? `sh${pf.shading.color}` : '', pf.spanColumns ?? '',
    ].join('|');
    const hit = this.all.get(key);
    const overrides = new Set<string>();
    for (const k in para.attrs) if (FORMAT_ATTRS.has(k)) overrides.add(k);
    if (run && !run.characterStyle) for (const k in run.attrs) if (FORMAT_ATTRS.has(k)) overrides.add(k);
    if (run && !run.characterStyle && run.properties.AppliedFont) overrides.add('AppliedFont');
    if (hit) {
      for (const o of overrides) hit.overrides.add(o);
      return hit;
    }
    const look: Look = {
      key,
      path: style ? stylePath(style) : '[none]',
      name: style?.name ?? '',
      pf,
      cf,
      weight: weightOf(cf.fontStyle),
      italic: italicOf(cf.fontStyle) || cf.skew !== 0,
      paragraphs: 0,
      characters: 0,
      sentences: 0,
      role: 'style',
      reason: '',
      sample: '',
      first: para,
      overrides,
    };
    if (para.paragraphStyle) look.style = para.paragraphStyle;
    this.all.set(key, look);
    return look;
  }

  /** Give every counted look its role. `main` are the looks of the text
   *  the body style is chosen from (the main story); all of them when it
   *  holds none. */
  classify(main?: ReadonlySet<Look>): void {
    const used = [...this.all.values()].filter((l) => l.paragraphs > 0);
    const plain = used.filter((l) => !l.pf.list);
    const pool = main && plain.some((l) => main.has(l)) ? plain.filter((l) => main.has(l)) : plain;
    // Running text ends its paragraphs with a full stop; among the looks
    // that do, the one with most text is the body.
    const running = pool.filter((l) => l.sentences * 2 >= l.paragraphs && !nameRole(l.name)?.startsWith('h'));
    const body = (running.length ? running : pool).reduce<Look | undefined>((a, b) => (!a || b.characters > a.characters ? b : a), undefined);
    this.body = body;
    const size = body?.cf.pointSize ?? 12;
    const headings: Look[] = [];
    // Headings whose style name states their level.
    const levelled = new Set<Look>();
    for (const l of used) {
      const named = nameRole(l.name);
      if (l.pf.list) {
        l.role = 'list';
        l.reason = 'list settings';
      } else if (l === body) {
        l.role = 'body';
        l.reason = 'most of the running text';
      } else if (named && named.startsWith('h')) {
        l.role = 'heading';
        l.reason = 'style name';
        const n = Number(named.slice(1));
        if (n) {
          l.level = n;
          levelled.add(l);
        }
        headings.push(l);
      } else if (named === 'quote' || named === 'caption') {
        l.role = named;
        l.reason = 'style name';
      } else if (isTitleLike(l, body, size)) {
        l.role = 'heading';
        l.reason = l.cf.pointSize > size ? 'larger than the body text' : 'heavier than the body text, short lines';
        headings.push(l);
      } else {
        l.role = 'style';
        l.reason = l.style && l.style === body?.style ? 'local overrides on the body style' : 'own look';
      }
    }
    // Levels: the ones a name gives stay; the others follow by size.
    const taken = new Set(headings.map((l) => l.level).filter((n): n is number => n !== undefined));
    const free = headings.filter((l) => l.level === undefined).sort((a, b) => b.cf.pointSize - a.cf.pointSize || b.weight - a.weight);
    let next = taken.size ? Math.max(...taken) : 0;
    let last: Look | undefined;
    for (const l of free) {
      // Two looks of one size and weight are one level.
      if (!(last && last.cf.pointSize === l.cf.pointSize && last.weight === l.weight)) next++;
      l.level = Math.min(6, Math.max(1, next));
      last = l;
    }
    for (const l of headings) l.level = Math.min(6, Math.max(1, l.level ?? 1));
    // Postext aligns every heading alike. A look taken for a heading by
    // its size, or by a name that states no level, that is aligned another way than the headings with
    // most text (the title of a title page, a display line) keeps its
    // alignment as a paragraph style instead.
    const byAlign = new Map<string, number>();
    for (const l of headings) byAlign.set(l.pf.align, (byAlign.get(l.pf.align) ?? 0) + l.characters);
    const usual = [...byAlign.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    for (const l of headings) {
      if (levelled.has(l) || l.pf.align === usual) continue;
      l.role = 'style';
      l.level = undefined;
      l.reason = 'set apart from the headings by its alignment';
    }
  }
}

const HEADING_NAME = /^(?:h|head(?:ing|line)?|t[ií]tulo|title|titre|titolo|[üu]berschrift|encabezado|cabecera|rubrik|kop)\s*[-_ .]?\s*([1-6])?\b/i;
const CHAPTER_NAME = /^(?:chapter|cap[ií]tulo|chapitre|kapitel|capitolo|part\b|parte\b)/i;
const SECTION_NAME = /^(?:section|secci[oó]n|abschnitt|sezione|subhead|sub-?t[ií]tulo|subtitle|sous-titre|apartado|ep[ií]grafe)\s*[-_ .]?\s*([1-6])?/i;
const QUOTE_NAME = /quot|\bcita\b|citation|zitat|extract|epigraph|ep[ií]grafe/i;
const CAPTION_NAME = /caption|pie de (?:foto|figura|imagen)|leyenda|l[ée]gende|bildunterschrift|didascalia/i;

/** What a style's name says it is: `h1`…`h6`, `h` (a heading of no stated
 *  level), `quote`, `caption`. */
export function nameRole(name: string): string | undefined {
  const n = name.trim();
  if (!n || n.startsWith('[') || n === 'NormalParagraphStyle') return undefined;
  if (CAPTION_NAME.test(n)) return 'caption';
  let m = HEADING_NAME.exec(n);
  if (m && (m[1] || /^(?:h\d|head|t[ií]tul|title|titre|titolo|[üu]ber|encab|cabec|rubrik|kop)/i.test(n))) {
    // `H` alone must be followed by its digit; `Hint` is no heading.
    if (/^h/i.test(n) && !/^head/i.test(n) && !m[1]) return undefined;
    return m[1] ? `h${m[1]}` : 'h';
  }
  if (CHAPTER_NAME.test(n)) return 'h1';
  m = SECTION_NAME.exec(n);
  if (m) return m[1] ? `h${Math.min(6, Number(m[1]) + 1)}` : 'h';
  if (QUOTE_NAME.test(n)) return 'quote';
  return undefined;
}

/** A look that reads as a title: clearly larger than the body, or as
 *  large and heavier, in paragraphs short enough to be titles. */
function isTitleLike(l: Look, body: Look | undefined, bodySize: number): boolean {
  if (!body || !l.paragraphs) return false;
  const mean = l.characters / l.paragraphs;
  // A letter set alone (a drop cap in a frame of its own) is no title.
  if (mean > 140 || mean < 3) return false;
  // Titles do not end in a full stop; captions and short notes do.
  if (l.sentences * 2 > l.paragraphs) return false;
  // Words set in columns at tab stops (a cover's key) are not a title: a
  // heading would set its tabs as spaces and the columns would close up
  // (#1555).
  if (l.pf.tabs.length && (l.tabbed ?? 0) * 2 > l.paragraphs) return false;
  if (l.cf.pointSize >= bodySize * 1.15) return true;
  return l.cf.pointSize >= bodySize && l.weight >= 600 && body.weight < 600;
}
