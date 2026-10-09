// Import templates: which Postext construct each Word style becomes, plus
// the import options. A template is saved in the browser, shared as JSON and
// embedded in every `.docx` the Sandbox exports, so a manuscript that went
// out to Word comes back with the same mapping.

import { DEFAULT_CALLOUT_STYLES } from '../defaults/calloutStyles';
import { DEFAULT_CHIP_STYLES } from '../defaults/chipStyles';
import type { PostextConfig } from '../types';
import type { WordDocument, WordStyle } from './model';

export type ParagraphTarget =
  | { kind: 'body' }
  | { kind: 'heading'; level: number; style?: string }
  | { kind: 'paragraphs'; style: string }
  | { kind: 'callout'; type: string }
  | { kind: 'calloutTitle'; type: string }
  | { kind: 'quote' }
  | { kind: 'caption' }
  /** Postext Markdown written as text: passed through verbatim. */
  | { kind: 'markup' }
  /** Starts a new chapter titled with the paragraph's text. */
  | { kind: 'chapter' }
  | { kind: 'drop' };

export type CharacterTarget =
  | { kind: 'text' }
  | { kind: 'bold' }
  | { kind: 'italic' }
  | { kind: 'boldItalic' }
  | { kind: 'smallCaps' }
  | { kind: 'sup' }
  | { kind: 'sub' }
  | { kind: 'chip'; style: string }
  | { kind: 'markup' }
  | { kind: 'drop' };

export type ParagraphTargetKind = ParagraphTarget['kind'];
export type CharacterTargetKind = CharacterTarget['kind'];

export interface WordImportOptions {
  /** Soft returns (Shift+Enter) inside a paragraph: a space, or a new
   *  paragraph of the same style (verse typed line by line). */
  lineBreaks: 'space' | 'paragraph';
  /** Bold, italic, small caps and scripts set by hand on runs. */
  directFormatting: 'keep' | 'ignore';
  /** Short bold paragraphs in body text (headings typed by hand) become
   *  headings of this level; 0 keeps them as paragraphs. */
  manualHeadings: number;
  /** Page breaks typed in Word: `:::pagebreak`, or dropped (the design
   *  decides where pages turn). */
  pageBreaks: 'keep' | 'drop';
  /** Pictures become bitmap resources placed where they were. */
  images: boolean;
  /** Tables become table resources placed where they were. */
  tables: boolean;
}

export interface WordTemplate {
  /** Stable id ('' for the unsaved working mapping). */
  id: string;
  name: string;
  /** Keys are Word style names, compared without case. */
  paragraphs: Record<string, ParagraphTarget>;
  characters: Record<string, CharacterTarget>;
  options: WordImportOptions;
  updatedAt: number;
}

export const DEFAULT_IMPORT_OPTIONS: WordImportOptions = {
  lineBreaks: 'space',
  directFormatting: 'keep',
  manualHeadings: 0,
  pageBreaks: 'drop',
  images: true,
  tables: true,
};

/** Word style names the Sandbox's own exports use. */
export const MARKUP_STYLE = 'Postext Markup';
export const MARKUP_CHAR_STYLE = 'Postext Markup Inline';
export const CHAPTER_STYLE = 'Postext Chapter';

export function emptyTemplate(name = ''): WordTemplate {
  return { id: '', name, paragraphs: {}, characters: {}, options: { ...DEFAULT_IMPORT_OPTIONS }, updatedAt: 0 };
}

const key = (name: string): string => name.trim().toLowerCase();

/** The book's callout types, or the engine's built-in one (`note`) when
 *  the configuration lists none. */
export const calloutStylesOf = (config: PostextConfig) => config.calloutStyles ?? DEFAULT_CALLOUT_STYLES;
/** The book's chip styles, or the engine's built-in one (`chip`). */
export const chipStylesOf = (config: PostextConfig) => config.chipStyles ?? DEFAULT_CHIP_STYLES;

/** A Word style name as Word shows it: built-in names are stored in lower
 *  case (`heading 1`, `caption`) and shown capitalised. */
export function displayStyleName(name: string): string {
  return /^[a-z]/.test(name) ? name[0]!.toUpperCase() + name.slice(1) : name;
}

/** The entry of `map` for a style name, compared without case. */
export function lookup<T>(map: Record<string, T>, name: string): T | undefined {
  if (name in map) return map[name];
  const k = key(name);
  for (const [n, v] of Object.entries(map)) if (key(n) === k) return v;
  return undefined;
}

const slug = (s: string): string =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

interface Named { id: string; name?: string }

function findNamed<T extends Named>(list: readonly T[] | undefined, styleName: string): T | undefined {
  if (!list) return undefined;
  const s = slug(styleName);
  if (!s) return undefined;
  return list.find((x) => slug(x.id) === s || (x.name !== undefined && slug(x.name) === s));
}

/** Word's built-in heading styles and their localized ids. */
function builtinHeadingLevel(name: string): number | undefined {
  const m = /^(?:heading|título|titulo|titre|überschrift|titolo|títol|标题|見出し)\s*([1-9])$/i.exec(name.trim());
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 1 && n <= 6 ? n : undefined;
}

/** Walk a style's `basedOn` chain. */
function chain(doc: WordDocument | undefined, style: WordStyle | undefined): WordStyle[] {
  const out: WordStyle[] = [];
  let s = style;
  for (let guard = 0; s && guard < 12; guard++) {
    out.push(s);
    s = s.basedOn && doc ? doc.styles.get(s.basedOn) : undefined;
  }
  return out;
}

/** A built-in role Word gives a style name (heading N, Title, Quote…). */
function builtinRole(name: string): ParagraphTarget | undefined {
  const level = builtinHeadingLevel(name);
  if (level) return { kind: 'heading', level };
  const k = key(name);
  if (k === 'title') return { kind: 'heading', level: 1 };
  if (k === 'quote' || k === 'intense quote' || k === 'block text') return { kind: 'quote' };
  if (k === 'caption') return { kind: 'caption' };
  if (/^(?:toc\s*\d|toc heading|index\s*\d|index heading|header|footer|table of figures)$/.test(k)) return { kind: 'drop' };
  return undefined;
}

/** The target a paragraph style gets when no template names it: the
 *  Sandbox's own export styles, Postext styles with the same name, Word's
 *  built-in roles along the `basedOn` chain, and the outline level. */
export function guessParagraphTarget(name: string, config: PostextConfig, doc?: WordDocument, style?: WordStyle): ParagraphTarget {
  const k = key(name);
  if (k === key(MARKUP_STYLE)) return { kind: 'markup' };
  if (k === key(CHAPTER_STYLE)) return { kind: 'chapter' };
  // `Callout: Note` / `Callout: Note: title`, as the export names them.
  const exported = /^(?:callout|recuadro|requadre|boxe|标注框|囲み|إطار)\s*[:·]\s*(.+?)(\s*[:·]\s*(?:title|título|títol|标题|見出し|عنوان))?$/i.exec(name.trim());
  if (exported) {
    const type = findNamed(calloutStylesOf(config), exported[1]!);
    if (type) return exported[2] ? { kind: 'calloutTitle', type: type.id } : { kind: 'callout', type: type.id };
  }
  const styles = style ? chain(doc, style) : [];
  const levelFromChain = (): number => {
    for (const s of styles) {
      const l = builtinHeadingLevel(s.name);
      if (l) return l;
    }
    const outline = styles.find((x) => x.outlineLevel !== undefined)?.outlineLevel;
    return outline !== undefined && outline < 6 ? outline + 1 : 1;
  };
  const para = findNamed(config.paragraphStyles, name);
  if (para) return { kind: 'paragraphs', style: para.id };
  const callout = findNamed(calloutStylesOf(config), name);
  if (callout) return { kind: 'callout', type: callout.id };
  const heading = findNamed(config.headingStyles, name);
  if (heading) return { kind: 'heading', level: levelFromChain(), style: heading.id };
  for (const [i, n] of (styles.length ? styles.map((s) => s.name) : [name]).entries()) {
    const role = builtinRole(n);
    // Headings, quotes and captions pass to the styles based on them;
    // Title does not (Subtitle, Author and Date are based on it).
    if (role && (i === 0 || key(n) !== 'title')) return role;
  }
  const outline = styles.find((x) => x.outlineLevel !== undefined)?.outlineLevel;
  if (outline !== undefined && outline < 6) return { kind: 'heading', level: outline + 1 };
  return { kind: 'body' };
}

/** The target a character style gets when no template names it. */
export function guessCharacterTarget(name: string, config: PostextConfig, doc?: WordDocument, style?: WordStyle): CharacterTarget {
  const k = key(name);
  if (k === key(MARKUP_CHAR_STYLE)) return { kind: 'markup' };
  const exportChip = /^(?:chip|etiqueta|标签|チップ|شارة)\s*[:·]\s*(.+)$/i.exec(name.trim());
  const chip = findNamed(chipStylesOf(config), exportChip ? exportChip[1]! : name);
  if (chip) return { kind: 'chip', style: chip.id };
  if (k === 'strong' || k === 'intense emphasis' || k === 'book title') return { kind: 'bold' };
  if (k === 'emphasis' || k === 'subtle emphasis') return { kind: 'italic' };
  if (/hyperlink|footnote reference|endnote reference|page number|line number|annotation reference|placeholder text/.test(k)) return { kind: 'text' };
  // A style that sets bold, italic, small caps or a script: the same mark.
  const s = chain(doc, style);
  const bold = s.find((x) => x.bold !== undefined)?.bold;
  const italic = s.find((x) => x.italic !== undefined)?.italic;
  const script = s.find((x) => x.script !== undefined)?.script;
  if (script) return { kind: script };
  if (s.find((x) => x.smallCaps !== undefined)?.smallCaps) return { kind: 'smallCaps' };
  if (bold && italic) return { kind: 'boldItalic' };
  if (bold) return { kind: 'bold' };
  if (italic) return { kind: 'italic' };
  return { kind: 'text' };
}

// ---------------------------------------------------------------------------
// Validation (templates come from JSON files and from `.docx` files)
// ---------------------------------------------------------------------------

const PARA_KINDS = new Set<ParagraphTargetKind>(['body', 'heading', 'paragraphs', 'callout', 'calloutTitle', 'quote', 'caption', 'markup', 'chapter', 'drop']);
const CHAR_KINDS = new Set<CharacterTargetKind>(['text', 'bold', 'italic', 'boldItalic', 'smallCaps', 'sup', 'sub', 'chip', 'markup', 'drop']);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length <= 200 ? v : undefined);

function parseParagraphTarget(v: unknown): ParagraphTarget | undefined {
  if (!isObj(v) || !PARA_KINDS.has(v.kind as ParagraphTargetKind)) return undefined;
  switch (v.kind) {
    case 'heading': {
      const level = Number(v.level);
      if (!Number.isInteger(level) || level < 1 || level > 6) return undefined;
      const style = str(v.style);
      return { kind: 'heading', level, ...(style ? { style } : {}) };
    }
    case 'paragraphs': {
      const style = str(v.style);
      return style ? { kind: 'paragraphs', style } : undefined;
    }
    case 'callout':
    case 'calloutTitle': {
      const type = str(v.type);
      return type ? { kind: v.kind, type } : undefined;
    }
    default:
      return { kind: v.kind as 'body' };
  }
}

function parseCharacterTarget(v: unknown): CharacterTarget | undefined {
  if (!isObj(v) || !CHAR_KINDS.has(v.kind as CharacterTargetKind)) return undefined;
  if (v.kind === 'chip') {
    const style = str(v.style);
    return style ? { kind: 'chip', style } : undefined;
  }
  return { kind: v.kind as 'text' };
}

function parseOptions(v: unknown): WordImportOptions {
  const o = isObj(v) ? v : {};
  const d = DEFAULT_IMPORT_OPTIONS;
  const level = Number(o.manualHeadings);
  return {
    lineBreaks: o.lineBreaks === 'paragraph' ? 'paragraph' : o.lineBreaks === 'space' ? 'space' : d.lineBreaks,
    directFormatting: o.directFormatting === 'ignore' ? 'ignore' : o.directFormatting === 'keep' ? 'keep' : d.directFormatting,
    manualHeadings: Number.isInteger(level) && level >= 0 && level <= 6 ? level : d.manualHeadings,
    pageBreaks: o.pageBreaks === 'keep' ? 'keep' : o.pageBreaks === 'drop' ? 'drop' : d.pageBreaks,
    images: typeof o.images === 'boolean' ? o.images : d.images,
    tables: typeof o.tables === 'boolean' ? o.tables : d.tables,
  };
}

/** A template read from untrusted JSON, or undefined when it is none. */
export function parseTemplate(v: unknown): WordTemplate | undefined {
  if (!isObj(v)) return undefined;
  const t = isObj(v.postextWordTemplate) ? v.postextWordTemplate : v;
  if (!isObj(t.paragraphs) && !isObj(t.characters)) return undefined;
  const paragraphs: Record<string, ParagraphTarget> = {};
  const characters: Record<string, CharacterTarget> = {};
  if (isObj(t.paragraphs)) for (const [k, x] of Object.entries(t.paragraphs)) {
    const target = parseParagraphTarget(x);
    if (target && k.length <= 200) paragraphs[k] = target;
  }
  if (isObj(t.characters)) for (const [k, x] of Object.entries(t.characters)) {
    const target = parseCharacterTarget(x);
    if (target && k.length <= 200) characters[k] = target;
  }
  return {
    id: str(t.id) ?? '',
    name: str(t.name) ?? '',
    paragraphs,
    characters,
    options: parseOptions(t.options),
    updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : 0,
  };
}

/** The JSON a template is shared as. */
export function templateFile(t: WordTemplate): string {
  return JSON.stringify({ postextWordTemplate: { version: 1, ...t } }, null, 2) + '\n';
}

export function newTemplateId(): string {
  return `wt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
