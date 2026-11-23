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
import { resolveAllConfig } from '../pipeline/config.js';
import { dimensionToPx } from '../units.js';
import { pageRunsOf } from './spine.js';
import { versionSheets, type ProductionWarning, type VersionSheets } from './version.js';
import type { ProductionSheet } from './geometry.js';
import { COVER_SLOT_ZONES, coverPage, type CoverIssue, type MirrorPicture } from './compose.js';
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
const ZONE_SLOTS: ReadonlySet<string> = new Set(COVER_SLOT_ZONES);

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
  const resolved = resolveAllConfig(config);
  const vertical = resolved.layout.writingMode === 'vertical-rl';
  const read = versionSheets(version, trimOf(config), pageRunsOf(pages, config.folio?.paper), {
    library: production?.bindings ?? [],
    // Bound on the right as the pages are: Arabic and Hebrew books
    // (`direction` rtl or auto), vertical Chinese and Japanese ones, a manga.
    rtl: resolved.page.binding === 'right',
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
    // A right-to-left book's cover page is laid out as its pages are; a
    // vertical book's is a horizontal page with vertical frames, its
    // pictures and boxes placed on the sheet as drawn.
    ...(vertical ? { vertical: true } : resolved.direction === 'rtl' ? { mirrored: true } : {}),
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
    ...(vertical ? { layout: { ...(config.layout ?? {}), writingMode: 'horizontal-tb' } } : {}),
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
    // One cover Markdown serves every sheet: a zone this sheet has not (the
    // back cover on an endpaper) belongs to another, and is no mistake.
    issues: [...read.warnings, ...made.issues, ...source.issues.filter((i) => !(i.kind === 'coverSlotUnknown' && ZONE_SLOTS.has(i.slot)))],
  };
}

/** A box on the laid-out cover page, px. */
export interface CoverPageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a zone of the cover (`'front'`, `'spine'`, `'back'`…) lies on its
 * laid-out page, in the page's pixels: the zone's trimmed panel, past the
 * bleed and the marks round it. What the CLI cuts the front cover's
 * picture from, and the EPUB its cover. Undefined when the sheet has no
 * such zone.
 */
export function coverZoneBox(
  cover: Pick<BuiltCover, 'sheet'>,
  zone: string,
  doc: { trimOffset: number; config: { page: { dpi: number } } },
): CoverPageBox | undefined {
  const z = cover.sheet.zones.find((s) => s.name === zone);
  if (!z) return undefined;
  const px = (doc.config.page.dpi || 300) / MM_PER_IN;
  const off = Math.max(0, doc.trimOffset);
  const x0 = Math.max(z.rect.x, cover.sheet.trim.x);
  const y0 = Math.max(z.rect.y, cover.sheet.trim.y);
  const x1 = Math.min(z.rect.x + z.rect.width, cover.sheet.trim.x + cover.sheet.trim.width);
  const y1 = Math.min(z.rect.y + z.rect.height, cover.sheet.trim.y + cover.sheet.trim.height);
  if (x1 <= x0 || y1 <= y0) return undefined;
  return { x: off + (x0 - cover.sheet.trim.x) * px, y: off + (y0 - cover.sheet.trim.y) * px, width: (x1 - x0) * px, height: (y1 - y0) * px };
}
