/**
 * What an IDML document holds before it is imported: the
 * stories in reading order, the paragraph and character styles the text
 * uses with a guess at what each becomes, and the counts the import dialog
 * shows. The guesses come from the style names, in the languages books are
 * set in, and from names that carry a Postext style's id (`Paragraph lead`,
 * `Box note`), which get that id back.
 */

import { paraText, type IdmlDocument, type IdmlPara, type PageItem } from './read.js';
import { descendants } from './xml.js';

/** What a paragraph style becomes: the body, a heading level, a paragraph
 *  style of its own (`:::paragraphs`), list items, a quotation, a caption
 *  of the table or picture beside it, the text of a box or its title, or
 *  nothing (folios, contents). */
export type ParagraphRole = 'body' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'style' | 'list' | 'ordered' | 'quote' | 'caption' | 'box' | 'box-title' | 'skip';

/** What a character style becomes: the emphasis its face says (`auto`),
 *  a character style of its own, italic, bold, both, a superscript or a
 *  subscript, or plain text. */
export type CharacterRole = 'auto' | 'italic' | 'bold' | 'boldItalic' | 'sup' | 'sub' | 'plain';

export const PARAGRAPH_ROLES: readonly ParagraphRole[] = ['body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'style', 'list', 'ordered', 'quote', 'caption', 'box', 'box-title', 'skip'];
export const CHARACTER_ROLES: readonly CharacterRole[] = ['auto', 'italic', 'bold', 'boldItalic', 'sup', 'sub', 'plain'];

export interface StyleUse<R> {
  /** `ParagraphStyle/…` or `CharacterStyle/…`. */
  self: string;
  name: string;
  /** Paragraphs (or runs) set in it. */
  count: number;
  sample: string;
  guess: R;
  /** A character style that changes more than the face (see
   *  {@link hasOwnLook}). */
  ownLook?: boolean;
}

export interface IdmlAnalysis {
  pages: number;
  /** The stories of the text, in reading order. */
  stories: string[];
  /** Short stories in the page margins (running heads, folios): read as
   *  design, left out of the text. */
  furniture: string[];
  paragraphs: number;
  paragraphStyles: StyleUse<ParagraphRole>[];
  characterStyles: StyleUse<CharacterRole>[];
  tables: number;
  pictures: number;
  footnotes: number;
  /** The file names the pictures link to. */
  links: string[];
  masters: number;
  /** The language of the body text (BCP 47), when InDesign's name for it
   *  is a known one. */
  language?: string;
}

const HEADING = /(?:heading|título|titulo|titre|titolo|títol|überschrift|titel|h|t|nivel|level)[\s_-]*([1-6])\b/i;

/** The role a paragraph style's name suggests. */
export function guessParagraphRole(name: string): ParagraphRole {
  const n = name.trim();
  const low = n.toLowerCase();
  if (/^(body|normalparagraphstyle|\[basic paragraph\]|\[párrafo básico\]|basic paragraph|párrafo básico)$/i.test(n)) return 'body';
  if (/^paragraph\s+\S/i.test(n)) return 'style';
  if (/^box title\b/i.test(n)) return 'box-title';
  if (/^box\s+\S/i.test(n)) return 'box';
  const h = HEADING.exec(n);
  if (h && /(heading|t[íi]tul|titre|titolo|títol|überschrift|titel|^h|^t\d|nivel|level)/i.test(low)) return `h${h[1]}` as ParagraphRole;
  if (/^(chapter|cap[ií]tulo|chapitre|kapitel|capitolo|cap[ií]tol)\b/i.test(n) && /(title|t[ií]tulo|titre|titel|titolo|títol)/i.test(low)) return 'h1';
  if (/(caption|^pie\b|pie de|leyenda|légende|legende|didascalia|bildunterschrift|llegenda|^figure caption)/i.test(low)) return 'caption';
  if (/(running|cornisa|folio|header|footer|encabezado|pie de página|^página|^page number|contents|^índice|^index|sumario|^toc)/i.test(low)) return 'skip';
  if (/(numbered|numerad|ordered|ordenad|nummer)/i.test(low)) return 'ordered';
  if (/(bullet|viñeta|vineta|^list|lista|aufzählung|puce|elenco)/i.test(low)) return 'list';
  if (/(quot|^cita|citation|zitat|citazione)/i.test(low)) return 'quote';
  if (/^figure$/i.test(n)) return 'body';
  if (/(recuadro|^box|sidebar|kasten|encadré|riquadro)/i.test(low)) return 'box';
  return 'style';
}

/** The role a character style's name (and look) suggests. */
export function guessCharacterRole(name: string): CharacterRole {
  const low = name.toLowerCase();
  if (/(super|exponent|superíndice|hochgestellt|exposant|apice)/i.test(low)) return 'sup';
  if (/(subscript|subíndice|tiefgestellt|indice|pedice)/i.test(low)) return 'sub';
  const bold = /(bold|negrita|strong|fett|gras|grassetto|negreta)/i.test(low);
  const italic = /(italic|cursiva|kursiv|italique|corsivo|emphasis|énfasis|enfasis|cursiva)/i.test(low);
  if (bold && italic) return 'boldItalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  // Anything else keeps the emphasis its face gives the text.
  return 'auto';
}

/** Whether a character style changes more than the face (a colour, a size,
 *  small capitals): a look the import cannot keep as a style. */
export function hasOwnLook(attrs: Record<string, string>): boolean {
  return Object.keys(attrs).some((k) => !['FontStyle', 'AppliedLanguage', 'KerningMethod', 'Tracking'].includes(k));
}

/** Is the item inside the margins of its page (above the top margin, below
 *  the bottom one, or beside the text area)? */
function inMargins(doc: IdmlDocument, f: PageItem): boolean {
  const page = doc.pages[f.page];
  if (!page) return false;
  const m = page.margins;
  const [l, t, r, b] = page.box;
  const e = 1;
  return f.box[3] <= t + m.top + e || f.box[1] >= b - m.bottom - e || f.box[2] <= l + m.left + e || f.box[0] >= r - m.right - e;
}

/** The text stories in reading order (the page, then the top, then the
 *  left of the frame their thread starts in), and the furniture stories:
 *  a few words in frames that all sit in the page margins. */
export function storyPlan(doc: IdmlDocument): { order: string[]; furniture: string[] } {
  const frames = new Map<string, PageItem[]>();
  for (const f of doc.items) {
    if (f.kind !== 'TextFrame' || !f.story || f.page < 0) continue;
    const list = frames.get(f.story) ?? [];
    list.push(f);
    frames.set(f.story, list);
  }
  const placed: Array<{ story: string; key: [number, number, number] }> = [];
  const furniture: string[] = [];
  for (const [story, list] of frames) {
    const s = doc.stories.get(story);
    if (!s || s.paras.length === 0) continue;
    const selves = new Set(list.map((f) => f.self));
    const head = list.find((f) => !f.prev || f.prev === 'n' || !selves.has(f.prev)) ?? list[0]!;
    const chars = s.paras.reduce((n, p) => n + paraText(p).length, 0);
    if (s.paras.length <= 3 && chars < 300 && list.every((f) => inMargins(doc, f))) {
      furniture.push(story);
      continue;
    }
    placed.push({ story, key: [head.page, Math.round(head.box[1]), Math.round(head.box[0])] });
  }
  placed.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2]);
  return { order: placed.map((p) => p.story), furniture };
}

/** Every paragraph of the text, footnotes and cells left aside. */
function* paragraphsOf(doc: IdmlDocument, order: readonly string[]): Generator<IdmlPara> {
  for (const s of order) yield* doc.stories.get(s)?.paras ?? [];
}

export function analyzeIdml(doc: IdmlDocument): IdmlAnalysis {
  const { order, furniture } = storyPlan(doc);
  const pCount = new Map<string, { count: number; sample: string }>();
  const cCount = new Map<string, { count: number; sample: string }>();
  let paragraphs = 0;
  let tables = 0;
  let pictures = 0;
  let footnotes = 0;
  const links = new Set<string>();
  const countParas = (paras: Iterable<IdmlPara>, top: boolean) => {
    for (const p of paras) {
      if (top) {
        paragraphs++;
        const entry = pCount.get(p.style) ?? { count: 0, sample: '' };
        entry.count++;
        if (!entry.sample) entry.sample = paraText(p).trim().slice(0, 70);
        pCount.set(p.style, entry);
      }
      for (const item of p.items) {
        if ((item.t === 'text' || item.t === 'variable') && item.cs) {
          const entry = cCount.get(item.cs) ?? { count: 0, sample: '' };
          entry.count++;
          if (!entry.sample && item.t === 'text') entry.sample = item.text.trim().slice(0, 40);
          cCount.set(item.cs, entry);
        } else if (item.t === 'note') {
          footnotes++;
          countParas(item.paras, false);
        } else if (item.t === 'table') {
          tables++;
        } else if (item.t === 'object') {
          for (const l of descendants(item.el, 'Link')) {
            pictures++;
            if (l.attrs.LinkResourceURI) links.add(linkName(l.attrs.LinkResourceURI));
          }
        }
      }
    }
  };
  countParas(paragraphsOf(doc, order), true);
  for (const it of doc.items) if (it.link && it.page >= 0) links.add(linkName(it.link));
  const paragraphStyles = [...pCount.entries()]
    .map(([self, v]) => {
      const name = doc.paragraphStyles.get(self)?.name ?? self.replace(/^ParagraphStyle\//, '');
      const a = doc.paragraphStyles.get(self)?.attrs ?? {};
      let guess = guessParagraphRole(name);
      // A style that shades or borders its paragraphs draws a box.
      if (guess === 'style' && (a.ParagraphShadingOn === 'true' || a.ParagraphBorderOn === 'true')) guess = 'box';
      return { self, name, count: v.count, sample: v.sample, guess };
    })
    .sort((a, b) => b.count - a.count);
  // The most used style that no name claims is the body.
  if (!paragraphStyles.some((s) => s.guess === 'body')) {
    const main = paragraphStyles.find((s) => s.guess === 'style');
    if (main) main.guess = 'body';
  }
  const characterStyles = [...cCount.entries()]
    .map(([self, v]) => {
      const style = doc.characterStyles.get(self);
      const name = style?.name ?? self.replace(/^CharacterStyle\//, '');
      return { self, name, count: v.count, sample: v.sample, guess: guessCharacterRole(name), ownLook: hasOwnLook(ownLook(doc, self)) };
    })
    .sort((a, b) => b.count - a.count);
  const body = paragraphStyles.find((s) => s.guess === 'body');
  const language = languageTag(body ? doc.paragraphStyles.get(body.self)?.attrs.AppliedLanguage : undefined);
  return { pages: doc.pages.length, stories: order, furniture, paragraphs, paragraphStyles, characterStyles, tables, pictures, footnotes, links: [...links].sort(), masters: doc.masters.size, ...(language ? { language } : {}) };
}

/** The attributes a character style sets (its look, the bookkeeping left
 *  out). */
function ownLook(doc: IdmlDocument, self: string): Record<string, string> {
  const a = doc.characterStyles.get(self)?.attrs ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(a)) {
    if (/^(Imported|SplitDocument|EmitCss|IncludeClass|ExtendedKeyboardShortcut|KeyboardShortcut|StyleUniqueId|BasedOn|PreviewColor)$/.test(k)) continue;
    out[k] = v;
  }
  return out;
}

const LANGUAGES: Array<[RegExp, string]> = [
  [/^english: ?uk/i, 'en-GB'],
  [/^english/i, 'en'],
  [/^spanish|^español|^castilian/i, 'es'],
  [/^catalan|^català/i, 'ca'],
  [/^french|^français/i, 'fr'],
  [/^german|^deutsch/i, 'de'],
  [/^italian/i, 'it'],
  [/^portuguese: ?brazil/i, 'pt-BR'],
  [/^portuguese/i, 'pt'],
  [/^japanese/i, 'ja'],
  [/^chinese|^simplified chinese/i, 'zh'],
  [/^arabic/i, 'ar'],
];

/** A BCP 47 tag from InDesign's name of a language (`$ID/Spanish:
 *  Castilian`, `$ID/English: USA`). */
export function languageTag(name: string | undefined): string | undefined {
  const n = (name ?? '').replace(/^\$ID\//, '').trim();
  return LANGUAGES.find(([re]) => re.test(n))?.[1];
}

/** The file name a link URI names (`file:///Volumes/x/Links/fig%201.tif`
 *  → `fig 1.tif`). */
export function linkName(uri: string): string {
  const last = uri.split(/[/\\:]/).filter(Boolean).pop() ?? uri;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
