// The Word export of the Sandbox (#1397, #1458): the book as flowing,
// editable text, built from the Markdown. Semantic is content only (plain
// Word styles that name each part); Formatted sets the same text with the
// book's design and its fonts embedded. The export dialog and the
// `sandbox_export` tool share it. Both files carry the export map, so the
// edited document comes back through `applyDocxEdits` (./wordEdits).

import { baseFontFamily, type PostextConfig, type Resource } from 'postext';
import {
  planWordFonts,
  semanticDocx,
  type FontWarning,
  type SourceFace,
  type WordChapterInput,
  type WordFontPlan,
} from 'postext/word';
import { decompressWoff2, rasterizeSvgWithDom, type PdfFontProvider } from 'postext-pdf';
import type { Chapter } from '../book/types.js';
import { configFontUses, ensureConfigFontsLoaded } from '../controls/fonts/fontLoader.js';
import { getBlob } from '../storage/blobStore.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type WordVariant = 'semantic' | 'formatted';
export type WordScope = 'chapter' | 'book';

/** Where an export stands: faces fetched, then the document written. */
export interface WordExportProgress {
  phase: 'fonts' | 'write';
  done: number;
  total: number;
}
/** What the export could not carry over as the book has it. */
export type WordExportNote =
  | { kind: 'font'; family: string; reason: FontWarning['reason']; detail?: string }
  | { kind: 'content'; code: string; message: string; chapter?: string };

/** The chapters an export takes, as the writers read them. */
export function wordChapters(chapters: readonly Chapter[], scope: WordScope, activeChapterId: string): WordChapterInput[] {
  const list = scope === 'book' ? chapters : chapters.filter((c) => c.id === activeChapterId);
  return list.map((c) => ({ id: c.id, title: c.title, markdown: c.markdown }));
}

/** Characters a file name cannot hold on some system. */
const UNSAFE_NAME = /[\\/:*?"<>|\u0000-\u001f]+/g;

/** `<book title>.docx`, or `<book title> - <chapter title>.docx` for one
 *  chapter of a book of several. */
export function docxFileName(bookTitle: string, chapterTitle: string | null): string {
  const clean = (s: string) => s.replace(UNSAFE_NAME, ' ').replace(/\s+/g, ' ').trim();
  const book = clean(bookTitle) || 'document';
  const chapter = chapterTitle === null ? '' : clean(chapterTitle);
  return `${chapter ? `${book} - ${chapter}` : book}.docx`;
}

/** The pictures' bytes as Word takes them: bitmaps, video posters and the
 *  SVG source (not a PDF print master, which Word cannot show). Missing
 *  blobs are left out; the writers say so. */
export async function wordResourceBytes(resources: readonly Resource[]): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const load = async (fileId: string | undefined): Promise<void> => {
    if (!fileId || out.has(fileId)) return;
    const rec = await getBlob(fileId).catch(() => null);
    if (rec) out.set(fileId, new Uint8Array(rec.bytes));
  };
  for (const r of resources) {
    if (r.kind === 'bitmap') await load(r.bitmap?.fileId);
    else if (r.kind === 'svg') await load(r.svg?.fileId);
    else if (r.kind === 'video') await load(r.video?.poster?.fileId);
  }
  return out;
}

/** An SVG drawn to PNG in this page, for the picture Word shows beside it. */
async function rasterizeSvg(svg: string, widthPx: number, heightPx: number): Promise<Uint8Array | undefined> {
  try {
    return (await rasterizeSvgWithDom(svg, widthPx, heightPx)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** The faces the book sets text in and the characters the export holds,
 *  read from the settings and the text (no layout): every weight and slant
 *  the configuration asks of each family, and one set of characters for
 *  them all (chapters, resources' wording, the texts of the design). */
export function fontUse(
  config: PostextConfig,
  chapters: readonly WordChapterInput[],
  resources: readonly Resource[],
  title?: string,
): { faces: { family: string; weight: number; style: 'normal' | 'italic' }[]; usedText: Map<string, Set<number>> } {
  const text = new Set<number>();
  const read = (s: string | undefined) => {
    if (s) for (const ch of s) text.add(ch.codePointAt(0)!);
  };
  for (const c of chapters) {
    read(c.title);
    read(c.markdown);
  }
  read(title);
  read(JSON.stringify(resources));
  read(JSON.stringify(config));
  const faces: { family: string; weight: number; style: 'normal' | 'italic' }[] = [];
  const usedText = new Map<string, Set<number>>();
  const seen = new Set<string>();
  for (const [name, uses] of configFontUses(config, chapters.map((c) => c.markdown))) {
    const family = baseFontFamily(name);
    usedText.set(family, text);
    for (const use of uses) {
      const key = `${family}|${use.weight}|${use.style}`;
      if (seen.has(key)) continue;
      seen.add(key);
      faces.push({ family, weight: use.weight, style: use.style });
    }
  }
  return { faces, usedText };
}

/** The faces the book uses, each asked of the PDF tab's font provider
 *  with the characters the export holds; a face that cannot be had is a
 *  note. */
export async function sourceFaces(
  use: ReturnType<typeof fontUse>,
  provider: PdfFontProvider,
  onProgress?: (done: number, total: number) => void,
): Promise<{ faces: SourceFace[]; missing: FontWarning[] }> {
  const faces: SourceFace[] = [];
  const missing: FontWarning[] = [];
  let done = 0;
  for (const { family, weight, style } of use.faces) {
    try {
      const answer = await provider(family, weight, style, { codePoints: use.usedText.get(family) ?? new Set<number>() });
      faces.push({ family, weight, style, files: Array.isArray(answer) ? [...answer] : [answer] });
    } catch (err) {
      if (!missing.some((m) => m.family === family)) missing.push({ family, reason: 'missing', detail: err instanceof Error ? err.message : String(err) });
    }
    onProgress?.(++done, use.faces.length);
  }
  return { faces, missing };
}

export interface WordExportInput {
  variant: WordVariant;
  scope: WordScope;
  chapters: readonly Chapter[];
  activeChapterId: string;
  resources: Resource[];
  /** The book's configuration (hyphenation locale applied). */
  config: PostextConfig;
  title?: string;
  /** The PDF tab's provider (`createPdfFontProvider()`): TrueType bytes.
   *  With it the Formatted document embeds the book's faces. */
  fontProvider?: PdfFontProvider;
  onProgress?: (p: WordExportProgress) => void;
  onNote?: (note: WordExportNote) => void;
}

const fontNote = (w: FontWarning): WordExportNote => ({ kind: 'font', family: w.family, reason: w.reason, ...(w.detail ? { detail: w.detail } : {}) });

/** Write the .docx of the book on screen. */
export async function buildWordExport(input: WordExportInput): Promise<Uint8Array> {
  // Each note once: a family warns for every weight and style it has, a
  // construct for every place it stands.
  const seen = new Set<string>();
  const note = (n: WordExportNote) => {
    const key = n.kind === 'font' ? `f|${n.family}|${n.reason}` : `c|${n.code}|${n.message}|${n.chapter ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    input.onNote?.(n);
  };
  const content = (w: { code: string; message: string; chapter?: string }) => note({ kind: 'content', code: w.code, message: w.message, ...(w.chapter ? { chapter: w.chapter } : {}) });
  const chapters = wordChapters(input.chapters, input.scope, input.activeChapterId);
  // Semantic: content only, in neutral styles and the reader's own fonts.
  // Formatted: the book's design, with its faces embedded.
  let plan: WordFontPlan | undefined;
  if (input.variant === 'formatted' && input.fontProvider) {
    // The loader knows each family's files once the previews asked for it.
    await ensureConfigFontsLoaded(input.config).catch(() => undefined);
    const use = fontUse(input.config, chapters, input.resources, input.title);
    const { faces, missing } = await sourceFaces(use, input.fontProvider, (done, total) => input.onProgress?.({ phase: 'fonts', done, total }));
    plan = await planWordFonts(faces, { usedText: use.usedText, decompressWoff2 });
    for (const w of [...missing, ...plan.warnings]) note(fontNote(w));
  }
  const bytes = await wordResourceBytes(input.resources);
  input.onProgress?.({ phase: 'write', done: 0, total: 1 });
  return semanticDocx({
    chapters,
    config: input.config,
    design: input.variant === 'semantic' ? 'plain' : 'book',
    resources: input.resources,
    resourceBytes: (id) => bytes.get(id),
    rasterizeSvg,
    ...(plan ? { fonts: plan } : {}),
    ...(input.title ? { title: input.title } : {}),
    onWarning: content,
  });
}
