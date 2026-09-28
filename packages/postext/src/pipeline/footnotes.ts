/**
 * Footnotes (`[^id]` markers, `[^id]: text` definitions): the definitions
 * leave the flow, the markers are numbered in citation order, and each note
 * is set as a paragraph in the footnote style — at the foot of the column
 * that cites it (`footnotes.placement: 'column'`, placed by `build.ts`) or
 * after the chapter's last block (`'chapterEnd'`, see
 * {@link appendChapterEndNotes}).
 */

import type { ContentBlock, InlineSpan } from '../parse';
import type { ResolvedParagraphStyleConfig } from '../types';
import type { ResolvedConfig, VDTLine } from '../vdt';

/** Id of the paragraph style the notes are set in (not a user style). */
export const FOOTNOTE_STYLE_ID = '__postext-footnote';

/** Container id of the synthetic `:::paragraphs` blocks that hold the
 *  notes of a chapter (`chapterEnd`): far past any id the parser hands out. */
const CHAPTER_END_CONTAINER_BASE = 1_000_000_000;

/** The definitions of a document and the blocks left once they are out of
 *  the flow. The first definition of an id wins. */
export function splitFootnoteDefinitions(blocks: readonly ContentBlock[]): {
  blocks: ContentBlock[];
  defs: Map<string, ContentBlock>;
} {
  const defs = new Map<string, ContentBlock>();
  if (!blocks.some((b) => b.footnoteDef !== undefined)) return { blocks: blocks as ContentBlock[], defs };
  const out: ContentBlock[] = [];
  for (const b of blocks) {
    if (b.footnoteDef === undefined) { out.push(b); continue; }
    if (!defs.has(b.footnoteDef)) defs.set(b.footnoteDef, b);
  }
  return { blocks: out, defs };
}

/** Whether the document cites any footnote. */
export function citesFootnotes(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.spans.some((s) => s.footnote));
}

/** A heading that opens a chapter: numbering starts again under it. */
function opensChapter(b: ContentBlock): boolean {
  return b.type === 'heading' && b.level === 1;
}

export interface FootnoteNumbering {
  /** Note id → printed number. */
  numbers: Map<string, string>;
  /** Chapters of the document in order: the ids first cited in each, in
   *  citation order, and the index of the block that closes it (the last
   *  block before the next chapter's heading, or the last block). */
  chapters: { ids: string[]; lastBlock: number }[];
}

/** Number the notes in order of first citation, starting again at each
 *  chapter (`numbering: 'chapter'`) or running on through the document.
 *  `startAt` is the last number an earlier document of the book used
 *  (`'document'` numbering). */
export function numberFootnotes(
  blocks: readonly ContentBlock[],
  numbering: 'chapter' | 'document',
  startAt = 0,
): FootnoteNumbering {
  const numbers = new Map<string, string>();
  const chapters: { ids: string[]; lastBlock: number }[] = [{ ids: [], lastBlock: blocks.length - 1 }];
  let n = startAt;
  const visit = (spans: readonly InlineSpan[]): void => {
    for (const s of spans) {
      if (s.footnote && !numbers.has(s.footnote.id)) {
        numbers.set(s.footnote.id, String(++n));
        chapters[chapters.length - 1]!.ids.push(s.footnote.id);
      }
      if (s.chip) visit(s.chip.spans);
    }
  };
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (opensChapter(b) && i > 0) {
      chapters[chapters.length - 1]!.lastBlock = i - 1;
      chapters.push({ ids: [], lastBlock: blocks.length - 1 });
      if (numbering === 'chapter') n = 0;
    }
    visit(b.spans);
  }
  return { numbers, chapters };
}

/** Numbers a whole markdown body's notes end on — the `startAt` of the
 *  next document under `'document'` numbering. */
export function lastFootnoteNumber(numbering: FootnoteNumbering): number {
  let max = 0;
  for (const v of numbering.numbers.values()) max = Math.max(max, Number(v));
  return max;
}

/** The paragraph style the notes are set in, from `footnotes`: the body
 *  face at the note size and leading, no first-line indent. */
export function footnoteParagraphStyle(resolved: ResolvedConfig): ResolvedParagraphStyleConfig {
  const f = resolved.footnotes;
  const body = resolved.bodyText;
  const fontSize = f.fontSize.unit === 'em' || f.fontSize.unit === 'rem'
    ? { value: f.fontSize.value * body.fontSize.value, unit: body.fontSize.unit }
    : f.fontSize;
  return {
    id: FOOTNOTE_STYLE_ID,
    name: FOOTNOTE_STYLE_ID,
    fontFamily: body.fontFamily,
    fontSize,
    lineHeight: f.lineHeight,
    color: f.color ?? body.color,
    textAlign: f.textAlign ?? body.textAlign,
    ...(body.boldColor ? { boldColor: body.boldColor } : {}),
    ...(body.italicColor ? { italicColor: body.italicColor } : {}),
    fontWeight: body.fontWeight,
    boldFontWeight: body.boldFontWeight,
    italic: false,
    smallCaps: false,
    hyphenation: body.hyphenation.enabled,
    indent: { value: 0, unit: 'em' },
    firstLineIndent: { value: 0, unit: 'em' },
    hangingIndent: f.hangingIndent,
    spaceBetween: f.spaceBetween,
    marginTop: { value: 0, unit: 'em' },
    marginBottom: { value: 0, unit: 'em' },
    snapToGrid: true,
    textTransform: 'none',
  };
}

/** The resolved config with the footnote style among its paragraph styles
 *  (for the `chapterEnd` containers). */
export function withFootnoteStyle(resolved: ResolvedConfig): ResolvedConfig {
  if (resolved.paragraphStyles.some((s) => s.id === FOOTNOTE_STYLE_ID)) return resolved;
  return { ...resolved, paragraphStyles: [...resolved.paragraphStyles, footnoteParagraphStyle(resolved)] };
}

/** Separator between a note's number and its text: an en space, which
 *  justification leaves alone (it is no word space). */
const NUMBER_GAP = ' ';

/** The paragraph a note is set as: its number (a superscript) and its
 *  text. The number maps back to the definition's start. */
export function noteContentBlock(def: ContentBlock | undefined, id: string, number: string): ContentBlock {
  void id;
  const text = def?.text ?? '';
  const spans = def?.spans ?? [];
  const sourceStart = def?.sourceStart ?? 0;
  const prefix = `${number}${NUMBER_GAP}`;
  return {
    type: 'paragraph',
    text: prefix + text,
    spans: [
      { text: number, bold: false, italic: false, script: 'sup' },
      { text: NUMBER_GAP, bold: false, italic: false },
      ...spans,
    ],
    sourceStart,
    sourceEnd: def?.sourceEnd ?? sourceStart,
    sourceMap: [...new Array<number>(prefix.length).fill(sourceStart), ...(def?.sourceMap ?? [])],
  };
}

/** `'chapterEnd'`: the notes of each chapter, in citation order, as a
 *  `:::paragraphs` container in the footnote style after the chapter's last
 *  block. Returns the blocks unchanged when nothing is cited. */
export function appendChapterEndNotes(
  blocks: readonly ContentBlock[],
  numbering: FootnoteNumbering,
  defs: ReadonlyMap<string, ContentBlock>,
): ContentBlock[] {
  if (numbering.numbers.size === 0) return blocks as ContentBlock[];
  const out: ContentBlock[] = [];
  let chapter = 0;
  const flush = (upTo: number): void => {
    while (chapter < numbering.chapters.length && numbering.chapters[chapter]!.lastBlock <= upTo) {
      const { ids } = numbering.chapters[chapter]!;
      if (ids.length > 0) {
        const id = CHAPTER_END_CONTAINER_BASE + chapter;
        const at = out[out.length - 1]?.sourceEnd ?? 0;
        const marker = (type: 'containerStart' | 'containerEnd'): ContentBlock => ({
          type,
          text: '',
          spans: [],
          containerName: 'paragraphs',
          ...(type === 'containerStart' ? { containerAttrs: { style: FOOTNOTE_STYLE_ID } } : {}),
          containerId: id,
          sourceStart: at,
          sourceEnd: at,
          sourceMap: [],
        });
        out.push(marker('containerStart'));
        for (const noteId of ids) {
          out.push({ ...noteContentBlock(defs.get(noteId), noteId, numbering.numbers.get(noteId)!), footnoteNote: noteId });
        }
        out.push(marker('containerEnd'));
      }
      chapter++;
    }
  };
  for (let i = 0; i < blocks.length; i++) {
    out.push(blocks[i]!);
    flush(i);
  }
  flush(Infinity);
  return out;
}

/** The notes the lines cite, in order (each id once). */
export function footnoteIdsOfLines(lines: readonly VDTLine[]): string[] {
  const ids: string[] = [];
  for (const line of lines) {
    for (const seg of line.segments ?? []) {
      if (seg.footnoteId !== undefined && !ids.includes(seg.footnoteId)) ids.push(seg.footnoteId);
    }
  }
  return ids;
}
