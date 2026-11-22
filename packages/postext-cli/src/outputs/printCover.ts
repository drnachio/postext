// The print cover of a version (#1668): `buildCover` turns the book's
// production version, its cover design and its cover Markdown into a page,
// laid out here as any chapter is, then written as a PDF or cut to one of
// its panels (the front cover) as a picture.

import { createCanvas, type Canvas } from '@napi-rs/canvas';
import type { VDTDocument } from 'postext';
import { buildCover, coverZoneBox, type BuildCoverIssue, type BuiltCover, type CoverSheetKind } from 'postext/production';
import { CliError, Options, UsageError } from '../args';
import type { FontSet } from '../fonts';
import type { Book } from '../input';
import { layOut, type Layout } from '../layout';
import type { Reporter } from '../log';
import { paintPage, type PaintOptions } from './images';

export interface LaidOutCover {
  built: BuiltCover;
  /** The cover as a book of one page: its configuration, its resources
   *  and the book's files with the cover's own (barcode, effects). */
  book: Book;
  doc: VDTDocument;
}

const SHEETS: Record<string, CoverSheetKind> = {
  cover: 'cover',
  jacket: 'jacket',
  'endpaper-front': 'endpaperFront',
  'endpaper-back': 'endpaperBack',
};

/** What a cover issue says, in a line. */
export function coverIssueMessage(issue: BuildCoverIssue): string {
  const { kind, ...rest } = issue as { kind: string } & Record<string, unknown>;
  const detail = Object.entries(rest).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(', ');
  return detail || kind;
}

/** The cover of `--print-version` (default: the book's first) on `--sheet`
 *  (default: the cover), laid out from `book` and its `layout` (the spine
 *  is measured from the pages laid out). */
export async function layOutCover(book: Book, layout: Layout, fonts: FontSet, opts: Options, reporter: Reporter): Promise<LaidOutCover> {
  const versions = book.config.production?.versions ?? [];
  const version = opts.string('print-version') ?? versions[0]?.id;
  if (!version) throw new CliError('The book has no print version: add one to its production settings (production.versions)');
  const sheetName = opts.string('sheet', 'cover');
  const sheet = SHEETS[sheetName];
  if (!sheet) throw new UsageError(`--sheet must be ${Object.keys(SHEETS).join(', ')} (got "${sheetName}")`);
  const built = buildCover({
    config: book.config,
    version,
    pages: layout.docs.flatMap((d) => d.pages),
    ...(book.coverMarkdown !== undefined ? { markdown: book.coverMarkdown } : {}),
    ...(layout.docs[0]?.metadata ? { metadata: layout.docs[0].metadata } : {}),
    resources: book.resources,
    sheet,
  });
  if (!('config' in built)) {
    const missing = built.issues.find((i) => i.kind === 'coverVersionMissing' || i.kind === 'coverSheetMissing');
    if (missing?.kind === 'coverVersionMissing') throw new CliError(`The book has no print version "${version}" (it has ${versions.map((v) => v.id).join(', ')})`);
    if (missing?.kind === 'coverSheetMissing') throw new CliError(`Version "${version}" has no ${sheetName} sheet`);
    throw new CliError(`No ${sheetName} for version "${version}": ${built.issues.map((i) => `${i.kind} (${coverIssueMessage(i)})`).join('; ')}`);
  }
  for (const issue of built.issues) reporter.warn({ kind: `cover.${issue.kind}`, severity: 'warning', message: coverIssueMessage(issue) });
  const files = new Map(book.files);
  for (const [id, bytes] of Object.entries(built.files)) files.set(id, bytes);
  const coverBook: Book = {
    ...book,
    chapters: [{ title: sheetName, file: 'cover.md', markdown: built.content.markdown }],
    config: built.config,
    resources: built.content.resources ?? [],
    files,
  };
  delete coverBook.start;
  const laid = await layOut(coverBook, new Options({}), reporter, undefined, fonts);
  const doc = laid.docs[0];
  if (!doc?.pages[0]) throw new CliError(`The ${sheetName} of version "${version}" laid out no page`);
  reporter.data.cover = { version, sheet: sheetName, widthMm: built.sheet.width, heightMm: built.sheet.height, spineMm: built.sheet.spine };
  return { built, book: coverBook, doc };
}

/** The cover painted, whole (`zone` `'sheet'`) or cut to one of its
 *  panels (`front`, `back`, `spine`, the flaps). */
export async function paintCover(cover: LaidOutCover, zone: string, options: PaintOptions, reporter: Reporter): Promise<Canvas> {
  const { doc } = cover;
  const page = doc.pages[0]!;
  const painted = await paintPage(cover.book, { doc, page, position: 1, label: 'cover', chapter: 1 }, options, reporter);
  if (zone === 'sheet') return painted;
  const box = coverZoneBox(cover.built, zone, doc);
  if (!box) throw new UsageError(`The sheet has no "${zone}" zone (it has ${cover.built.sheet.zones.map((z) => z.name).join(', ')}, or "sheet" for the whole)`);
  const scale = options.dpi / (doc.config.page.dpi || 300);
  const out = createCanvas(Math.max(1, Math.round(box.width * scale)), Math.max(1, Math.round(box.height * scale)));
  const g = out.getContext('2d');
  // On white: a cover without a ground colour is transparent.
  if (options.format !== 'png') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, out.width, out.height);
  }
  g.drawImage(painted, box.x * scale, box.y * scale, box.width * scale, box.height * scale, 0, 0, out.width, out.height);
  return out;
}
