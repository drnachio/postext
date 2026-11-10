// The Word export of the Sandbox (#1397): the semantic document (Word
// styles, lists, notes and tables, built from the Markdown) or the
// formatted one (every page as the PDF tab prints it, built from the same
// print chain, picture bytes and fonts). The export dialog and the
// `sandbox_export` tool share it. Both files carry the export map, so the
// edited document comes back through `applyDocxEdits` (./wordEdits).

import { buildFontString, documentDisplayList, fontStringFamilies, parseFontString, withSymbolFont, type PostextConfig, type Resource, type VDTDocument } from 'postext';
import {
  formattedDocx,
  planWordFonts,
  semanticDocx,
  type FontWarning,
  type SourceFace,
  type WordChapterInput,
  type WordFontPlan,
} from 'postext/word';
import { decompressWoff2, rasterizeSvgWithDom, type PdfFontProvider } from 'postext-pdf';
import { composeBookMemo } from '../book/compose.js';
import { isGenericFontFamily } from '../controls/fonts/systemFonts.js';
import { planContent } from '../book/jumps.js';
import { layoutCacheKey } from '../book/layoutKeys.js';
import { layOutBookPrint } from '../book/printChain.js';
import type { BookPlan, Chapter } from '../book/types.js';
import { ensureConfigFontsLoaded } from '../controls/fonts/fontLoader.js';
import { getBlob } from '../storage/blobStore.js';
import type { LayoutService } from '../worker/LayoutService.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type WordVariant = 'semantic' | 'formatted';
export type WordScope = 'chapter' | 'book';

/** Where an export stands: chapters laid out, faces fetched, pages written. */
export interface WordExportProgress {
  phase: 'layout' | 'fonts' | 'pages' | 'write';
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

/** The faces the pages set text in and the characters each sets, read from
 *  the display lists the formatted writer draws from. */
export function fontUse(docs: readonly VDTDocument[]): { fontStrings: string[]; usedText: Map<string, Set<number>> } {
  const usedText = new Map<string, Set<number>>();
  const strings = new Set<string>();
  const note = (fontString: string | undefined, text: string) => {
    if (!fontString) return;
    strings.add(fontString);
    const face = parseFontString(fontString);
    if (!face) return;
    const key = `${face.family}|${face.weight}|${face.style}`;
    let set = usedText.get(key);
    if (!set) usedText.set(key, (set = new Set()));
    for (const ch of text) set.add(ch.codePointAt(0)!);
    // The symbol font the string lists after its family (#1460): its
    // regular face goes into the file too, for the characters the run's
    // face lacks (which ones is known only once the faces are read, so
    // the run's text is noted for it whole).
    const symbol = fontStringFamilies(fontString)[1];
    if (symbol && !isGenericFontFamily(symbol)) note(withSymbolFont(undefined, () => buildFontString(symbol, 16, '400')), text);
  };
  type Item = ReturnType<typeof documentDisplayList>[number]['items'][number];
  const visit = (item: Item | null | undefined) => {
    if (!item) return;
    if (item.kind === 'table') {
      for (const cell of item.cells) visit(cell.item);
      return;
    }
    if (item.kind !== 'text') return;
    for (const line of item.lines) {
      for (const run of line.runs) {
        note(run.fontString, run.text);
        if (run.ruby) note(run.ruby.fontString, run.ruby.text);
        if (run.warichu) note(run.warichu.fontString, run.warichu.upper + run.warichu.lower);
        for (const mark of run.kunten?.runs ?? []) note(mark.fontString, mark.text);
      }
    }
  };
  for (const doc of docs) {
    for (const page of documentDisplayList(doc)) for (const item of page.items) visit(item);
  }
  return { fontStrings: [...strings], usedText };
}

/** The faces the pages use, each asked of the PDF tab's font provider
 *  with the characters it sets; a face that cannot be had is a note. */
export async function sourceFaces(
  use: ReturnType<typeof fontUse>,
  provider: PdfFontProvider,
  onProgress?: (done: number, total: number) => void,
): Promise<{ faces: SourceFace[]; missing: FontWarning[] }> {
  const faces: SourceFace[] = [];
  const missing: FontWarning[] = [];
  const keys = [...use.usedText.keys()];
  let done = 0;
  for (const key of keys) {
    const [family, weight, style] = key.split('|') as [string, string, 'normal' | 'italic'];
    try {
      const answer = await provider(family, Number(weight), style, { codePoints: use.usedText.get(key)! });
      faces.push({ family, weight: Number(weight), style, files: Array.isArray(answer) ? [...answer] : [answer] });
    } catch (err) {
      if (!missing.some((m) => m.family === family)) missing.push({ family, reason: 'missing', detail: err instanceof Error ? err.message : String(err) });
    }
    onProgress?.(++done, keys.length);
  }
  return { faces, missing };
}

export interface WordChainInput {
  service: LayoutService;
  clientId: string;
  scope: WordScope;
  chapters: readonly Chapter[];
  activeChapterId: string;
  resources: Resource[];
  /** The configuration the layout runs with (hyphenation locale applied). */
  config: PostextConfig;
  plan: BookPlan;
  onProgress?: (p: WordExportProgress) => void;
}

/** The print chain the PDF tab lays out: the whole book chapter after
 *  chapter, or the active chapter continued after the ones before it. */
export async function layOutWordChain(input: WordChainInput): Promise<{ docs: VDTDocument[]; chapters: WordChapterInput[] }> {
  const { service, clientId, chapters, resources, config, plan } = input;
  await ensureConfigFontsLoaded(config);
  const build = (content: Parameters<LayoutService['build']>[0]['content'], cacheKey: string) =>
    service.build({ clientId, priority: 'pdf', content, config, cacheKey });
  if (input.scope === 'book') {
    const docs = await layOutBookPrint({
      plan,
      chapters,
      resources,
      config,
      build: (content, _config, opts) => build(content, opts.cacheKey),
      onChapter: (index, count) => input.onProgress?.({ phase: 'layout', done: index, total: count }),
    });
    // The chain leaves out a chapter it cannot find: the documents follow
    // the plan's chapters that are in the book.
    const ids = plan.chapters.map((p) => p.chapterId).filter((id) => chapters.some((c) => c.id === id));
    if (ids.length !== docs.length) throw new Error(`the book laid out as ${docs.length} documents for ${ids.length} chapters`);
    return { docs, chapters: ids.map((id) => chapters.find((c) => c.id === id)!).map((c) => ({ id: c.id, title: c.title, markdown: c.markdown })) };
  }
  const chapter = chapters.find((c) => c.id === input.activeChapterId);
  const chapterPlan = chapter ? plan.byId[chapter.id] : undefined;
  if (!chapter || !chapterPlan) throw new Error('the chapter is no longer in the book');
  input.onProgress?.({ phase: 'layout', done: 0, total: 1 });
  const book = composeBookMemo(chapters, chapter.id);
  const doc = await build(
    { markdown: book.markdown, metadata: book.metadata, resources, continuation: chapterPlan.continuation, ...planContent(chapterPlan) },
    layoutCacheKey({
      markdown: book.markdown,
      metadata: book.metadata,
      config,
      resources,
      continuation: chapterPlan.continuation,
      continuationKey: chapterPlan.continuationKey,
      outlineKey: chapterPlan.outlineKey,
    }),
  );
  return { docs: [doc], chapters: [{ id: chapter.id, title: chapter.title, markdown: chapter.markdown }] };
}

export interface WordExportInput extends Omit<WordChainInput, 'onProgress'> {
  variant: WordVariant;
  title?: string;
  /** The PDF tab's provider (`createPdfFontProvider()`): TrueType bytes. */
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
  if (input.variant === 'semantic') {
    const chapters = wordChapters(input.chapters, input.scope, input.activeChapterId);
    const bytes = await wordResourceBytes(input.resources);
    input.onProgress?.({ phase: 'write', done: 0, total: 1 });
    return semanticDocx({
      chapters,
      config: input.config,
      resources: input.resources,
      resourceBytes: (id) => bytes.get(id),
      rasterizeSvg,
      ...(input.title ? { title: input.title } : {}),
      onWarning: content,
    });
  }

  const { docs, chapters } = await layOutWordChain(input);
  let plan: WordFontPlan | undefined;
  if (input.fontProvider) {
    const use = fontUse(docs);
    const { faces, missing } = await sourceFaces(use, input.fontProvider, (done, total) => input.onProgress?.({ phase: 'fonts', done, total }));
    plan = await planWordFonts(faces, { usedText: use.usedText, fontStrings: use.fontStrings, decompressWoff2 });
    for (const w of [...missing, ...plan.warnings]) note(fontNote(w));
  }
  const bytes = await wordResourceBytes(input.resources);
  return formattedDocx({
    docs,
    chapters,
    resources: input.resources,
    resourceBytes: (id) => bytes.get(id),
    rasterizeSvg,
    ...(plan ? { fonts: plan } : {}),
    ...(input.title ? { title: input.title } : {}),
    onWarning: content,
    onProgress: (done, total) => input.onProgress?.({ phase: 'pages', done, total }),
  });
}
