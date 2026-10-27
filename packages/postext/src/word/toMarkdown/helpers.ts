// Helpers of the Word to Postext conversion: picture resolution, tabs,
// style targets, caption labels, chunks and table models.
import type { TableModel, PostextConfig, TableCell } from '../../types.js';
import type { WordMedia, WordDocument, WordParagraph, WordTabStop, WordStyle, WordTable, WordBlock } from '../model.js';
import { type WordTemplate, type ParagraphTarget, lookup, guessParagraphTarget, type CharacterTarget, guessCharacterTarget } from '../template.js';

export type ChapterMode = 'single' | 'split';

export interface ImportedPicture {
  id: string;
  media: WordMedia;
  name?: string;
  alt?: string;
  caption?: string;
  /** The picture's printed extent in the document, EMU (914 400 an
   *  inch): with the file's pixels it gives the resolution the author
   *  set it at (`pictureResolution`). */
  widthEmu?: number;
  heightEmu?: number;
}

const EMU_PER_INCH = 914400;

/** The resolution a Word picture was printed at (#631): its pixel width
 *  over its extent in inches, rounded to two decimals; undefined without
 *  an extent or pixels. Hosts store it as `Resource.bitmap.fileResolution`,
 *  in preference to the file's own metadata. */
export function pictureResolution(pic: Pick<ImportedPicture, 'widthEmu'>, pixelWidth: number): number | undefined {
  const emu = pic.widthEmu;
  if (!emu || !Number.isFinite(emu) || emu <= 0 || !(pixelWidth > 0)) return undefined;
  return Math.round((pixelWidth / (emu / EMU_PER_INCH)) * 100) / 100;
}

export interface ImportedTable {
  id: string;
  model: TableModel;
  caption?: string;
}

export interface ImportedChapter {
  title: string;
  markdown: string;
}

export interface ImportResult {
  chapters: ImportedChapter[];
  pictures: ImportedPicture[];
  tables: ImportedTable[];
  /** Pictures in formats the Sandbox cannot show (EMF, WMF, TIFF). */
  skippedPictures: string[];
  /** Footnotes on headings (a heading prints a marker as text): dropped. */
  droppedHeadingNotes: number;
}

export interface ImportSettings {
  template: WordTemplate;
  config: PostextConfig;
  /** One chapter, or a new chapter at every level-1 heading (and at every
   *  `Postext Chapter` paragraph of a Sandbox export). */
  chapters: ChapterMode;
  /** Resource ids already taken (the project's). */
  existingIds: ReadonlySet<string>;
  /** Title of text before the first chapter break. */
  untitledChapter: string;
}

/** The tab stops a Word paragraph has (#622): its style chain's, base
 *  first, then its own; a `clear` removes the stop at its position. Sorted,
 *  the alignments Postext sets only. */
export function paragraphTabs(doc: WordDocument, p: WordParagraph): WordTabStop[] {
  const chain: WordStyle[] = [];
  let s = doc.styles.get(p.styleId || doc.defaultParagraphStyle);
  for (let guard = 0; s && guard < 12; guard++) {
    chain.unshift(s);
    s = s.basedOn ? doc.styles.get(s.basedOn) : undefined;
  }
  const at = new Map<number, WordTabStop>();
  for (const list of [...chain.map((x) => x.tabs), p.tabs]) {
    for (const t of list ?? []) {
      if (t.val === 'clear') at.delete(t.pos);
      else at.set(t.pos, t);
    }
  }
  return [...at.values()].filter((t) => TAB_ALIGN[t.val] !== undefined).sort((a, b) => a.pos - b.pos);
}

const TAB_ALIGN: Record<string, string> = { left: 'start', start: 'start', right: 'end', end: 'end', center: 'center', decimal: 'decimal' };
const TAB_LEADER: Record<string, string> = { dot: '.', hyphen: '-', middleDot: '·', underscore: 'rule', heavy: 'rule' };

/** `:tab`, with the attributes of the Word stop it goes to (#622). */
export function tabDirective(stop: WordTabStop | undefined): string {
  if (!stop) return ':tab';
  const attrs = [`at=${Math.round((stop.pos / 20) * 10) / 10}pt`];
  const align = TAB_ALIGN[stop.val];
  if (align && align !== 'start') attrs.push(`align=${align}`);
  const leader = stop.leader ? TAB_LEADER[stop.leader] : undefined;
  if (leader) attrs.push(`leader="${leader}"`);
  return `:tab{${attrs.join(' ')}}`;
}

/** The target of a paragraph style: the template's, else a guess. */
export function paragraphTargetOf(doc: WordDocument, styleId: string, template: WordTemplate, config: PostextConfig): ParagraphTarget {
  const id = styleId || doc.defaultParagraphStyle;
  const style = doc.styles.get(id);
  const name = style?.name ?? (id || 'Normal');
  return lookup(template.paragraphs, name) ?? guessParagraphTarget(name, config, doc, style);
}

/** The target of a character style: the template's, else a guess. */
export function characterTargetOf(doc: WordDocument, name: string, template: WordTemplate, config: PostextConfig): CharacterTarget {
  const style = [...doc.styles.values()].find((s) => s.type === 'character' && s.name === name);
  return lookup(template.characters, name) ?? guessCharacterTarget(name, config, doc, style);
}

const CAPTION_LABEL_RE = /^\s*(?:fig(?:ure|ura|\.)?|figs?\.|table|tabla|tab\.|taula|tableau|tabelle|tabella|plate|lámina|làmina|chart|gráfico|map|mapa|image|imagen|imatge|ilustración|il·lustració|illustration|esquema|diagram|diagrama|图|表|図|شكل|جدول)\s*[0-9IVXLC٠-٩]+(?:[.\-–][0-9٠-٩]+)*\s*[.:\-–—]?\s*/iu;

/** A caption without its typed label (Postext numbers resources). */
export function stripCaptionLabel(text: string): string {
  return text.replace(CAPTION_LABEL_RE, '');
}

export const attrValue = (v: string): string => `"${v.replace(/"/g, '”').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()}"`;

export function slugify(text: string, fallback: string): string {
  const s = text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
    .split('-').slice(0, 4).join('-').slice(0, 40).replace(/-+$/, '');
  return s || fallback;
}

export type Chunk = { kind: 'block' | 'list' | 'markup'; text: string };

export function joinChunks(chunks: Chunk[]): string {
  let out = '';
  chunks.forEach((c, i) => {
    if (i > 0) {
      const prev = chunks[i - 1]!;
      out += (prev.kind === c.kind && c.kind !== 'block') ? '\n' : '\n\n';
    }
    out += c.text;
  });
  return out;
}

/** Container fences a markup paragraph opens (`:::callout{…}`); a bare
 *  `:::` closes the innermost. Inside one, paragraph styles mapped to
 *  callouts and paragraph styles do not open boxes of their own. */
export const FENCE_OPEN_RE = /^:::\s*(callout|paragraphs|part|columns|paper|verse|references|page|strip)\b/;
export const FENCE_CLOSE_RE = /^:::\s*$/;

export interface Group {
  kind: 'callout' | 'paragraphs' | 'verse';
  key: string;
  title?: string;
  chunks: Chunk[];
  /** A poem (#620): its last stanza came from a one-line paragraph, which
   *  the next one-line paragraph runs on (verse typed a line a paragraph). */
  runOn?: boolean;
  /** A poem: an empty paragraph ended its last stanza. */
  stanzaBreak?: boolean;
  /** A poem: a line carries a hemistich separator (`||`), so the fence
   *  names the line layout. */
  layoutLines?: boolean;
}

export interface ListLevel { ilvl: number; indent: number; width: number }

/** A Word table as a Postext table model: merged cells as spans (covered
 *  cells point at the cell covering them), the header rows, the column
 *  widths as weights and the cell fills. */
export function tableModel(t: WordTable, text: (blocks: WordBlock[]) => string): TableModel {
  // Lay the Word cells on the grid (a gridSpan takes several columns).
  const grid: Array<Array<{ cell: TableModel['rows'][number][number]; vMerge?: 'restart' | 'continue' }>> = [];
  let columns = 0;
  t.rows.forEach((row, ri) => {
    const out: (typeof grid)[number] = [];
    let col = 0;
    for (const c of row) {
      const cell: TableCell = { content: c.vMerge === 'continue' ? '' : text(c.blocks) };
      if (c.colSpan > 1) cell.colSpan = c.colSpan;
      if (c.shading) cell.background = { hex: c.shading, model: 'hex' };
      if (ri < t.headerRows) cell.isHeader = true;
      out.push({ cell, vMerge: c.vMerge });
      for (let k = 1; k < c.colSpan; k++) out.push({ cell: { content: '', hiddenBy: { row: ri, col } } });
      col += c.colSpan;
    }
    columns = Math.max(columns, col);
    grid.push(out);
  });
  // Vertical merges: the restart cell spans the continue cells under it.
  for (let ri = 0; ri < grid.length; ri++) {
    grid[ri]!.forEach((g, ci) => {
      if (g.vMerge !== 'restart') return;
      let span = 1;
      for (let rj = ri + 1; rj < grid.length; rj++) {
        const below = grid[rj]![ci];
        if (below?.vMerge !== 'continue') break;
        span++;
        below.cell = { content: '', hiddenBy: { row: ri, col: ci } };
        for (let k = 1; k < (g.cell.colSpan ?? 1); k++) {
          const side = grid[rj]![ci + k];
          if (side) side.cell = { content: '', hiddenBy: { row: ri, col: ci } };
        }
      }
      if (span > 1) g.cell.rowSpan = span;
    });
  }
  const rows = grid.map((r) => {
    const cells = r.map((g) => g.cell);
    while (cells.length < columns) cells.push({ content: '' });
    return cells;
  });
  const model: TableModel = { rows };
  if (t.headerRows > 0) model.headerRowCount = t.headerRows;
  if (t.widths && t.widths.length === columns) {
    const min = Math.min(...t.widths);
    model.columnWidths = t.widths.map((w) => Math.round((w / min) * 100) / 100);
  }
  return model;
}
