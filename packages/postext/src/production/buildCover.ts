/**
 * A book's cover as a document Postext lays out (#1667): from the book's
 * configuration (its `production` versions and its `cover` design), its
 * laid-out pages (for the spine), its metadata and the cover's Markdown,
 * the configuration, content and files that `buildDocument` and the PDF
 * take, the same for every host: the CLI, Folio, EPUB and the Sandbox.
 */

import type { PostextConfig } from '../types.js';
import type { DocumentMetadata, PostextContent } from '../types/content.js';
import type { Resource } from '../types/resources/resources.js';
import type { FolioPaperConfig } from '../types/output/folio.js';
import type { ProductionVersion } from '../types/output/production.js';
import { resolvePageConfig } from '../defaults/page.js';
import { dimensionToPx } from '../units.js';
import { pageRunsOf } from './spine.js';
import { versionSheets, type ProductionWarning, type VersionSheets } from './version.js';
import type { ProductionSheet } from './geometry.js';
import { coverPage, type CoverIssue, type MirrorPicture } from './compose.js';
import { coverParagraphStyles, coverSource, type CoverSourceIssue } from './coverSource.js';
import { workIsbnCaption } from './coverLabels.js';

/** Which sheet of a version: its cover (a softcover's, a case's covering),
 *  its dust jacket, or one of its endpapers. */
export type CoverSheetKind = 'cover' | 'jacket' | 'endpaperFront' | 'endpaperBack';

export interface BuildCoverInput {
  /** The book's configuration, its language's layers merged. */
  config: PostextConfig;
  /** The version (`production.versions[].id`), or the version itself. */
  version: string | ProductionVersion;
  /** The book's laid-out pages (`VDTPage[]`, each with its `:::paper`), or
   *  how many pages it has, all on the book's paper: the spine is worked
   *  out from them. */
  pages: readonly { paper?: FolioPaperConfig }[] | number;
  /** The cover's Markdown: a `:::frame{slot="…"}` per zone or text box. */
  markdown?: string;
  /** The book's metadata: title, subtitle and author for the front and
   *  the spine the Markdown leaves empty. */
  metadata?: DocumentMetadata;
  /** The book's resources: the cover's pictures are among them. */
  resources?: readonly Resource[];
  /** Default `'cover'`. */
  sheet?: CoverSheetKind;
  /** See `CoverPageOptions.mirrorPictures`. */
  mirrorPictures?: Readonly<Record<string, MirrorPicture>>;
}

export type BuildCoverIssue = CoverIssue | CoverSourceIssue | ProductionWarning | { kind: 'coverVersionMissing'; version: string } | { kind: 'coverSheetMissing'; sheet: CoverSheetKind };

export interface BuiltCover {
  /** The cover's configuration: the book's typography, the sheet as its
   *  page, the cover's template, the metadata styles. */
  config: PostextConfig;
  /** The cover's content: its Markdown inside the cover's page fence, the
   *  book's metadata and resources and the cover's own. */
  content: PostextContent;
  /** The bytes of the cover's own resources (barcode, effects, mirror),
   *  by `fileId`, for the PDF's `resourceBytes` and the canvas's images. */
  files: Record<string, Uint8Array>;
  sheets: VersionSheets;
  sheet: ProductionSheet;
  issues: BuildCoverIssue[];
}

const MM_PER_IN = 25.4;

/** The book's trim in mm, from its page size. */
function trimOf(config: PostextConfig): { width: number; height: number } {
  const page = resolvePageConfig(config.page);
  const toMm = (d: Parameters<typeof dimensionToPx>[0]) => (dimensionToPx(d, 96) / 96) * MM_PER_IN;
  return { width: toMm(page.width), height: toMm(page.height) };
}

function sheetOf(sheets: VersionSheets, kind: CoverSheetKind): ProductionSheet | undefined {
  if (kind === 'jacket') return sheets.jacket;
  if (kind === 'endpaperFront') return sheets.endpapers?.front;
  if (kind === 'endpaperBack') return sheets.endpapers?.back;
  return sheets.cover;
}

/** Settings of the book that never reach its cover: the book's own page
 *  templates stay (a cover may not use them, but they cost nothing), its
 *  running heads and page furniture do not. */
const DROPPED: readonly (keyof PostextConfig)[] = ['header', 'footer', 'lineNumbers', 'dieCuts', 'production', 'cover'];

/**
 * The cover of one version of a book, ready to lay out:
 * `buildDocument(cover.content, cover.config)`, then the PDF with
 * `cover.files` among its resource bytes. Undefined config when the
 * version, its binding profile or the sheet asked for is missing (see
 * `issues`).
 */
export function buildCover(input: BuildCoverInput): BuiltCover | { issues: BuildCoverIssue[] } {
  const { config } = input;
  const production = config.production;
  const version = typeof input.version === 'string' ? production?.versions?.find((v) => v.id === input.version) : input.version;
  if (!version) return { issues: [{ kind: 'coverVersionMissing', version: String(input.version) }] };
  const pages = typeof input.pages === 'number' ? Array.from({ length: Math.max(0, Math.floor(input.pages)) }, () => ({})) : input.pages;
  const read = versionSheets(version, trimOf(config), pageRunsOf(pages, config.folio?.paper), {
    library: production?.bindings ?? [],
    rtl: config.direction === 'rtl',
  });
  if (!('cover' in read)) return { issues: read.warnings };
  const kind = input.sheet ?? 'cover';
  const sheet = sheetOf(read, kind);
  if (!sheet) return { issues: [...read.warnings, { kind: 'coverSheetMissing', sheet: kind }] };
  const onCover = kind === 'cover' || kind === 'jacket';
  const isbn = onCover && read.isbn13 ? version.isbn : undefined;
  const work = onCover && version.workIsbn ? workIsbnCaption(version.workIsbn, config.locale) : undefined;
  const made = coverPage(sheet, {
    ...(config.cover ? { cover: config.cover } : {}),
    ...(version.spineText ? { spineText: version.spineText } : {}),
    ...(isbn ? { isbn } : {}),
    ...(isbn && version.isbnAddOn ? { isbnAddOn: version.isbnAddOn } : {}),
    ...(isbn && work ? { workIsbnCaption: work } : {}),
    resources: input.resources ?? [],
    ...(input.mirrorPictures ? { mirrorPictures: input.mirrorPictures } : {}),
  });
  const source = coverSource(input.markdown, made.slots, input.metadata);
  const own: PostextConfig = { ...config };
  for (const key of DROPPED) delete own[key];
  const bodySize = config.bodyText?.fontSize;
  const bodyPt = bodySize ? (dimensionToPx(bodySize, 72, 16)) : 10;
  const coverConfig: PostextConfig = {
    ...own,
    page: { ...(config.page ?? {}), ...made.page, binding: config.page?.binding },
    pageTemplates: [...(config.pageTemplates ?? []).filter((t) => t.id !== made.template.id), made.template],
    paragraphStyles: coverParagraphStyles(config.paragraphStyles, bodyPt),
    header: { elements: [] },
    footer: { elements: [] },
  };
  if (coverConfig.page?.binding === undefined) delete coverConfig.page!.binding;
  const content: PostextContent = {
    markdown: source.markdown,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    resources: [...(input.resources ?? []).filter((r) => !made.resources.some((m) => m.id === r.id)), ...made.resources],
  };
  return {
    config: coverConfig,
    content,
    files: made.files,
    sheets: read,
    sheet,
    issues: [...read.warnings, ...made.issues, ...source.issues],
  };
}
