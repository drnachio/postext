// Word export (`postext/word`, #1387, #1458). Two flow files built from
// the Markdown with no layout, both editable in Word and Google Docs: the
// semantic one (content only, plain styles that name each part) and the
// formatted one (the same text in the book's design, fonts embedded). A
// third, the facsimile, sets the PDF's pages line by line in text boxes
// from the layout the other outputs share. All carry an export map, so
// `postext import-docx` brings the edits made in Word back into the
// chapters and resources.

import { readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { applySingleInkToSvg, extractFrontmatter, metadataText, setCitationEngineLoader } from 'postext';
import { diagramInkHex } from 'postext/bundle';
import {
  facsimileDocx,
  parseTemplate,
  planWordFonts,
  readDocx,
  semanticDocx,
  type FontWarning,
  type SourceFace,
  type WordChapterInput,
  type WordFontPlan,
  type WordTemplate,
} from 'postext/word';
import { CliError, UsageError, type Options } from '../args';
import type { FontSet } from '../fonts';
import type { Book, BookChapter } from '../input';
import { byteLength, writeOut } from '../io';
import type { Layout } from '../layout';
import type { Reporter } from '../log';
import { rasterizeSvg } from '../svgImage';

// The flow files print each citation and the list of works as the
// citation processor formats them: loaded when a book cites.
setCitationEngineLoader(() => import('postext-citeproc/register'));

export const DOCX_VARIANTS = ['semantic', 'formatted', 'facsimile'] as const;
export type DocxVariant = (typeof DOCX_VARIANTS)[number];

/** `postext docx --variant` (`build --docx-variant`) as given, else the
 *  formatted file. */
export function docxVariant(opts: Options, option = 'variant'): DocxVariant {
  return opts.choice(option, DOCX_VARIANTS) ?? 'formatted';
}

/** Whether the variant is written from the laid-out pages. */
export const needsLayout = (variant: DocxVariant): boolean => variant === 'facsimile';

/** Whether the export embeds the book's faces (`--no-embed-fonts`,
 *  `build --no-docx-fonts`). The semantic file never does: it is set in
 *  the reader's own fonts. */
export const embedsFonts = (opts: Options, option = 'embed-fonts', variant?: DocxVariant): boolean => variant !== 'semantic' && opts.flag(option) !== false;

/** A template from a .json file, or from the one a .docx carries (the
 *  import of a Word file postext did not export). */
export function readTemplate(path: string): WordTemplate {
  const bytes = new Uint8Array(readFileSync(path));
  let source: unknown;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) source = readDocx(bytes).embeddedTemplate;
  else {
    try {
      source = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new CliError(`${path} is neither a template (.json) nor a Word file`);
    }
  }
  const template = parseTemplate(source);
  if (!template) throw new CliError(`${path} holds no import template`);
  return template;
}

/**
 * The id each chapter of `book` goes into the export map with, and is
 * found by again on import: its file inside the book. Loose Markdown's
 * files are named from the folder they all sit in, so the same chapters
 * typed from another folder (`ch/02.md`, `./ch/02.md`, an absolute path)
 * keep their ids. A chapter without a file is named by its place in the
 * whole book, never in a `--chapters` selection.
 */
export function chapterIds(book: Pick<Book, 'kind' | 'chapters'>): Map<BookChapter, string> {
  const files = book.chapters.map((c) => (c.file !== undefined && book.kind === 'markdown' ? resolve(c.file) : c.file));
  let root = '';
  const loose = files.filter((f): f is string => f !== undefined && book.kind === 'markdown');
  if (loose.length > 0) {
    root = dirname(loose[0]!);
    for (const f of loose) while (relative(root, f).startsWith('..')) root = dirname(root);
  }
  const ids = new Map<BookChapter, string>();
  book.chapters.forEach((c, i) => {
    const file = files[i];
    const id = file === undefined ? `chapter-${i + 1}` : root ? relative(root, file).split(sep).join('/') : file;
    ids.set(c, id);
  });
  return ids;
}

export function wordChapters(chapters: readonly BookChapter[], ids: ReadonlyMap<BookChapter, string>): WordChapterInput[] {
  return chapters.map((c, i) => ({ id: ids.get(c) ?? `chapter-${i + 1}`, title: c.title, markdown: c.markdown }));
}

const WOFF2 = (b: Uint8Array) => b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x32;

function fontWarningMessage(w: FontWarning): string {
  switch (w.reason) {
    case 'restricted':
      return `"${w.family}" forbids embedding: Word names it without its file`;
    case 'cff':
      return `"${w.family}" has PostScript outlines, which Word does not embed: Word names it without its file`;
    case 'variable':
      return `"${w.family}" is a variable font, which Word does not embed: Word names it without its file`;
    case 'missing':
      return `no file for "${w.family}" to embed${w.detail ? ` (${w.detail})` : ''}`;
    case 'merge-failed':
      return `"${w.family}" could not be prepared for Word${w.detail ? `: ${w.detail}` : ''}`;
    case 'preview-print':
      return `"${w.family}" allows preview and print only: Word shows it but will not let its text be edited`;
  }
}

/**
 * The faces the book sets text in, as Word embeds them. A family the book
 * may not hand on (`redistributable: false`) is left out, and the open
 * family it names as its fallback goes in under its name, as in the EPUB
 * (#993).
 */
export async function wordFontPlan(book: Book, fonts: FontSet, reporter: Reporter): Promise<WordFontPlan> {
  const withheld = new Set((book.config.customFonts ?? []).filter((f) => f.redistributable === false).map((f) => f.name.toLowerCase()));
  const faces: SourceFace[] = [];
  const told = new Set<string>();
  for (const f of fonts.usedFaces()) {
    const key = f.family.toLowerCase();
    if (!withheld.has(key)) {
      faces.push({ family: f.family, weight: f.weight, style: f.style, files: [f.bytes] });
      continue;
    }
    if (told.has(key)) continue;
    told.add(key);
    const stand = await fonts.exportStandIn(f.family);
    if (stand.length > 0) {
      reporter.warn({ kind: 'fontStoodIn', severity: 'info', message: `"${f.family}" may not be copied out of the book: the Word file sets it in ${stand[0]!.standsInFor}, under the same name` });
      for (const s of stand) faces.push({ family: s.family, weight: s.weight, style: s.style, files: [s.bytes] });
    } else {
      reporter.warn({ kind: 'fontWithheld', severity: 'info', message: `"${f.family}" may not be copied out of the book: the Word file names it without its file` });
    }
  }
  // The faces are decoded when they are resolved; a WOFF2 one is decoded
  // by postext-pdf's decompressor, loaded only then.
  const woff2 = faces.some((f) => f.files.some(WOFF2));
  const decompressWoff2 = woff2 ? (await import('postext-pdf')).decompressWoff2 : undefined;
  const plan = await reporter.time('docx fonts', () => planWordFonts(faces, decompressWoff2 ? { decompressWoff2 } : {}));
  for (const w of plan.warnings) {
    reporter.warn({ kind: `docx.font.${w.reason}`, severity: w.reason === 'preview-print' ? 'info' : 'warning', message: fontWarningMessage(w) });
  }
  return plan;
}

/** The pictures' bytes as the book stores them: an SVG stays SVG (Word
 *  takes it with a PNG beside it), recoloured under single ink. */
export function resourceBytes(book: Book): (fileId: string) => Uint8Array | undefined {
  const inkHex = diagramInkHex(book.config);
  const svgs = new Set(book.resources.filter((r) => r.kind === 'svg').map((r) => r.svg?.fileId));
  const recoloured = new Map<string, Uint8Array>();
  return (fileId) => {
    const bytes = book.files.get(fileId);
    if (!bytes || !inkHex || !svgs.has(fileId)) return bytes;
    let out = recoloured.get(fileId);
    if (!out) recoloured.set(fileId, (out = new TextEncoder().encode(applySingleInkToSvg(new TextDecoder().decode(bytes), inkHex))));
    return out;
  };
}

/** An SVG drawn to PNG, for the picture Word shows beside it. */
export const svgPicture = async (svg: string, w: number, h: number): Promise<Uint8Array | undefined> => (await rasterizeSvg(svg, w, h)) ?? undefined;

export interface DocxJob {
  variant: DocxVariant;
  /** The chapters exported (the flow variants). */
  chapters: readonly BookChapter[];
  /** The layout the facsimile is written from. */
  layout?: Layout;
  /** The resolved faces; absent, nothing is embedded. */
  fonts?: FontSet;
}

export async function writeDocx(book: Book, job: DocxJob, reporter: Reporter, out: string): Promise<void> {
  const facsimile = job.variant === 'facsimile';
  const chapters = facsimile ? job.layout?.chapters : job.chapters;
  if (!chapters) throw new UsageError('The facsimile Word file needs a layout');
  const meta = extractFrontmatter(chapters[0]?.markdown ?? '').metadata as Record<string, unknown>;
  const author = metadataText(Array.isArray(meta.author) ? meta.author.join(', ') : meta.author);
  const title = metadataText(meta.title) ?? book.name;
  const ids = chapterIds(book);
  const fonts = job.fonts && job.variant !== 'semantic' ? await wordFontPlan(book, job.fonts, reporter) : undefined;
  const common = {
    chapters: wordChapters(chapters, ids),
    resources: book.resources,
    resourceBytes: resourceBytes(book),
    rasterizeSvg: svgPicture,
    ...(fonts ? { fonts } : {}),
    title,
    ...(author ? { author } : {}),
  };
  const warn = (w: { code: string; message: string; chapter?: string }) => {
    const chapter = w.chapter !== undefined ? chapters.find((c) => ids.get(c) === w.chapter) : undefined;
    reporter.warn({ kind: `docx.${w.code}`, severity: 'warning', message: w.message, ...(chapter ? { at: chapter.file ?? chapter.title } : {}) });
  };
  // Where the book starts (`preset.json`'s `start`): the heading numbers
  // and page numbers its first chapter counts on from, as in the layout.
  const flowStart = !facsimile && chapters[0] === book.chapters[0] ? book.start : undefined;
  const bytes = await reporter.time('docx', () => facsimile
    ? facsimileDocx({
      ...common,
      docs: job.layout!.docs,
      onWarning: warn,
      onProgress: (done, total) => {
        if (done % 50 === 0) reporter.detail(`  docx: ${done}/${total} pages`);
      },
    })
    : semanticDocx({ ...common, config: book.config, design: job.variant === 'semantic' ? 'plain' : 'book', ...(flowStart ? { start: flowStart } : {}), onWarning: warn }));
  await writeOut(out, bytes);
  reporter.output({ kind: 'docx', path: out, bytes: byteLength(bytes), variant: job.variant, ...(facsimile ? { pages: job.layout!.pageCount } : {}) });
}
