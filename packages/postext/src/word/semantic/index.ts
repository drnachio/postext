// The semantic .docx (#1390): an editable Word document built from the
// engine parser — real styles mirroring the book's design, Word lists,
// footnotes, boxes as content controls, figures and tables, OMML maths,
// sections and columns from the config — with every text fragment wrapped
// in a hidden `_ptx_` bookmark and described in the export map, so edits
// made in Word re-import into the exact Markdown and resource positions
// (#1395). What Word cannot express travels as exact source text in
// `ptx:raw` content controls.
//
// Two designs (#1458). `book`: the book's own, as far as flowing text
// holds it. `plain`: content only, on an A4 page in Arial, the same parts
// in the same styles and the same map; the writer is the same, set from a
// neutral config (`plain/config.ts`), and the modules that draw a design
// check `WriterContext.plain` where they start.

import { resolveAllConfig } from '../../pipeline/config.js';
import { CONFIG_VERSION } from '../../bundle/configVersion/rules.js';
import { resolvedCodeStyle } from '../../defaults/text/codeStyle.js';
import type { PostextConfig, Resource } from '../../types.js';
import type { BookStart } from './context.js';
import { hashText } from '../anchors/hash.js';
import { exportTrace, traceProps, type ExportTrace } from '../anchors/trace.js';
import type { ExportMap } from '../anchors/types.js';
import type { WordFontPlan } from '../fonts/types.js';
import { initTexToOmml } from '../ommlWrite/index.js';
import { createDocxPackage } from '../ooxml/package.js';
import type { DocxPackageInput } from '../ooxml/types.js';
import { bookNumbers } from './engineNumbers.js';
import { parseChapter, renderChapter } from './chapter.js';
import type { SemanticWarning, WriterContext } from './context.js';
import { prepareMedia } from './media/figures.js';
import { designMediaIds } from './design/pictures.js';
import { composedMediaIds } from './media/pageOpener.js';
import { prepareExercises } from './exercises/exercises.js';
import { floatedResources } from './media/floated.js';
import { prepareScores } from './media/scores.js';
import { prepareCitations } from './prose/citations.js';
import { FragmentLog } from './fragments.js';
import { Numbering } from './numbering.js';
import { pageSettings } from './page/settings.js';
import { chapterLook, chapterStyleIds, enterLook, lookState, settleLooks, type ChapterLook, type WrittenChapter } from './chapterStyles/looks.js';
import { plainConfig, plainResourceTypes } from './plain/config.js';
import { multiColumn, pageGeometry } from './sections.js';
import { StyleRegistry } from './styles.js';
import { tablePictureIds } from './tables.js';
import type { WordChapterInput } from './types.js';
import { px, type Units } from './wml.js';

export type { WordChapterInput } from './types.js';
export type { SemanticWarning } from './context.js';
export { STYLE as SEMANTIC_STYLE } from './styles.js';
export { preferredWordVariant } from './media/pages.js';

/** Options of `semanticDocx`: the chapters, design, resources, fonts and
 *  metadata. */
export interface SemanticDocxOptions {
  chapters: WordChapterInput[];
  config: PostextConfig;
  /** How the document looks (#1458). `book` (default): the book's design
   *  as far as Word allows: page, columns, fonts, openers, boxes, running
   *  heads. `plain`: content only, a neutral page and neutral styles whose
   *  names still say what each paragraph is, for correcting the words. */
  design?: SemanticDesign;
  resources?: Resource[];
  resourceBytes?: (fileId: string) => Uint8Array | undefined;
  rasterizeSvg?: (svg: string, widthPx: number, heightPx: number) => Promise<Uint8Array | undefined>;
  fonts?: WordFontPlan;
  title?: string;
  author?: string;
  /** ISO timestamp: a fixed value makes the output byte-identical. */
  date?: string;
  exportId?: string;
  /** Where the book starts when it continues a longer one (`preset.json`'s
   *  `start`): the heading counters its first chapter counts on from and
   *  the page numbering in effect. */
  start?: BookStart;
  onWarning?: (w: SemanticWarning) => void;
}

/** The look of the flow document: the book's design, or content only. */
export type SemanticDesign = 'book' | 'plain';

/** The map's `engine`: the writer and the configuration version it reads. */
export const SEMANTIC_ENGINE = `postext-word-semantic/1 config/${CONFIG_VERSION}`;

/** Write a book as a `.docx` with native Word structures: styles, lists,
 *  tables, notes and fields. */
export async function semanticDocx(options: SemanticDocxOptions): Promise<Uint8Array> {
  const written = await writeSemantic(options);
  return written.build();
}

/** What the writer leaves of an export besides the file: its map, and the
 *  trace the file's custom properties carry (`anchors/trace.ts`). */
export interface SemanticExportMap {
  map: ExportMap;
  trace: ExportTrace;
  /** The XML of the text parts as written: the body's content, each
   *  note, the style definitions. */
  parts: { body: string; footnotes: readonly string[]; styles: string };
}

/**
 * The export map `semanticDocx` would embed for these options, without
 * the file (#1458). The writer is deterministic: the same chapters,
 * config, resources and design give the same fragments under the same
 * bookmark names, so the map of a file whose editor dropped it (Google
 * Docs) is written again from the book.
 */
export async function semanticExportMap(options: SemanticDocxOptions): Promise<SemanticExportMap> {
  const { map, trace, parts } = await writeSemantic(options);
  return { map, trace, parts };
}

async function writeSemantic(options: SemanticDocxOptions): Promise<SemanticExportMap & { build: () => Uint8Array }> {
  // The book's own config, and the one the document is set from: the same,
  // or in the plain design a neutral one that keeps what names and numbers
  // the content.
  const book = resolveAllConfig(options.config);
  const plain = options.design === 'plain';
  const resolved = plain ? plainConfig(book) : book;
  // A plain document names system faces and embeds none.
  const fonts = plain ? undefined : options.fonts;
  const units: Units = { dpi: resolved.page.dpi || 96, basePx: 16 };
  units.basePx = px(units, resolved.bodyText.fontSize) || 16;
  let chapterId: string | undefined;
  const seen = new Set<string>();
  const warn = (code: string, message: string): void => {
    const key = `${chapterId ?? ''}\u0000${code}\u0000${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    options.onWarning?.({ code, message, ...(chapterId ? { chapter: chapterId } : {}) });
  };
  const code = resolvedCodeStyle(resolved);
  const parsed = options.chapters.map((c) => parseChapter(c, { fences: code.blocks, indentedCode: code.indentedCode, ...(resolved.bodyText.plusUnderline ? { plusUnderline: true } : {}) }));
  const needsMath = options.chapters.some((c) => c.markdown.includes('$')) || (options.resources ?? []).some((r) => r.caption?.includes('$') || r.table?.model.rows.some((row) => row.some((cell) => cell.content.includes('$'))));
  if (needsMath) {
    try {
      await initTexToOmml();
    } catch (e) {
      warn('mathUnavailable', `Equations are kept as TeX: ${(e as Error).message}`);
    }
  }
  const pkg = createDocxPackage();
  const geo = pageGeometry(resolved, units);
  const resources = new Map((options.resources ?? []).map((r) => [r.id, r]));
  // Numbers as the engine prints them (captions, `:ref`s, headings).
  // The chapter style each chapter is set in (#1521), and the settings of
  // each style the book uses.
  const styleIds = chapterStyleIds(options.chapters, options.config);
  const looks = new Map<string, ChapterLook>();
  for (const id of styleIds) if (id && !looks.has(id)) looks.set(id, chapterLook(options.config, id, plain, fonts));
  const lookOf = (i: number): ChapterLook | undefined => looks.get(styleIds[i] ?? '');
  const numbers = bookNumbers(parsed, options.config, book, options.resources ?? [], options.start?.headings, (i) => {
    const look = lookOf(i);
    return look ? (look.state.plain?.book ?? look.state.resolved) : book;
  });
  const resourceTypes = plain ? plainResourceTypes(numbers.resourceTypes) : numbers.resourceTypes;
  // Resources shown as blocks or floated by a `:ref`, whose pictures go
  // into the package.
  const floated = floatedResources(parsed, resources, resourceTypes);
  const shown = new Set<string>();
  for (const pc of parsed) {
    for (const b of pc.blocks) {
      if (b.type !== 'resourceBlock' || !b.resourceId || !resources.has(b.resourceId)) continue;
      shown.add(b.resourceId);
    }
  }
  for (const id of floated) shown.add(id);
  // Of the pictures a design places, the plain design keeps the ones the
  // Markdown names.
  for (const id of designMediaIds(parsed, book, resources, plain)) shown.add(id);
  for (const id of composedMediaIds(parsed, book, resources, plain)) shown.add(id);
  // Pictures set inside table cells (a bar chart in a results table).
  for (const id of tablePictureIds(resources, [...shown])) shown.add(id);
  let sdtId = 0;
  let footnoteId = 0;
  const styles = new StyleRegistry(resolved, units, fonts, plain);
  const bookGeo = plain ? pageGeometry(book, units) : geo;
  // A plain document counts its pages from 1, whatever book it continues.
  const start = plain ? (options.start?.headings ? { headings: options.start.headings } : undefined) : options.start;
  const ctx: WriterContext = {
    pkg,
    log: new FragmentLog(pkg),
    config: options.config,
    resolved,
    units,
    styles,
    numbering: new Numbering(resolved, units, (stack, weight, italic) => styles.font(stack, weight, italic)),
    plan: fonts,
    ...(plain ? { plain: { book, columnPx: bookGeo.columnPx, textAreaPx: multiColumn(bookGeo) ? (bookGeo.textTwips * units.dpi) / 1440 : bookGeo.columnPx } } : {}),
    resources,
    resourceTypes,
    resourceBytes: options.resourceBytes,
    rasterizeSvg: options.rasterizeSvg,
    columnPx: geo.columnPx,
    textTwips: Math.round((geo.columnPx * 1440) / units.dpi),
    textAreaPx: multiColumn(geo) ? (geo.textTwips * units.dpi) / 1440 : geo.columnPx,
    usedResources: new Set(),
    numbers,
    footnotes: [],
    headers: {},
    footers: {},
    bookmarkNames: new Set(),
    floated,
    floatedPlaced: new Set(),
    media: new Map(),
    warn,
    nextSdtId: () => ++sdtId,
    nextFootnoteId: () => ++footnoteId,
    book: parsed,
    ...(start ? { start } : {}),
    chapter: { index: 0, input: { id: '', markdown: '' }, markdown: '', offset: 0, defs: new Map(), cited: new Set(), usedDefs: new Set(), headingNumbers: new Map(), blockCounter: 0 },
  };
  const citations = await prepareCitations(parsed, book, options.resources ?? []);
  if (citations) ctx.citations = citations;
  await prepareMedia(ctx, shown);
  await prepareScores(ctx, parsed);
  prepareExercises(ctx, parsed);

  // The fragment each chapter starts at: with it a chapter that did not
  // change since the export is found again whatever the others did.
  const firstFragments: number[] = [];
  // Each chapter in the settings of its chapter style, its section's page
  // and its text's styles (chapterStyles/looks.ts).
  const own = lookState(ctx);
  const written: WrittenChapter[] = [];
  parsed.forEach((pc, i) => {
    chapterId = pc.input.id;
    firstFragments.push(ctx.log.body.length + ctx.log.notes.length);
    const look = lookOf(i);
    enterLook(ctx, own, look);
    const notes = ctx.footnotes.length;
    const xml = renderChapter(ctx, pc, i, look?.geo ?? geo, i === parsed.length - 1);
    written.push({ xml, notes: [notes, ctx.footnotes.length], ...(look ? { look } : {}) });
  });
  enterLook(ctx, own, undefined);
  chapterId = undefined;
  let body = looks.size ? settleLooks(ctx, ctx.styles, [...looks.values()], written) : written.map((c) => c.xml).join('');
  if (!parsed.length) body = `<w:p/>${'<w:sectPr/>'}`;

  const createdAt = options.date ?? new Date().toISOString();
  const exportId = options.exportId ?? `ptx-${hashText(`${createdAt}\u0000${options.chapters.map((c) => `${c.id}\u0000${c.markdown}`).join('\u0001')}`)}`;
  const snapshotResources: Record<string, unknown> = {};
  for (const id of [...ctx.usedResources].sort()) {
    const r = resources.get(id);
    if (r) snapshotResources[id] = r;
  }
  const map: ExportMap = {
    version: 1,
    exportId,
    variant: 'semantic',
    design: plain ? 'plain' : 'book',
    engine: SEMANTIC_ENGINE,
    createdAt,
    chapters: options.chapters.map((c) => ({ id: c.id, ...(c.title !== undefined ? { title: c.title } : {}), hash: hashText(c.markdown) })),
    fragments: ctx.log.all(),
    snapshot: {
      chapters: options.chapters.map((c) => ({ id: c.id, markdown: c.markdown })),
      ...(Object.keys(snapshotResources).length ? { resources: snapshotResources } : {}),
    },
  };
  const trace = exportTrace(map, {
    config: options.config,
    start,
    resources: snapshotResources,
    media: ctx.media.size,
    firstFragments,
  });
  const page = pageSettings(ctx, body);
  const extra = (geo.mirror ? '<w:mirrorMargins/>' : '') + '<w:doNotAutoCompressPictures/>' + page.extra;
  const input: DocxPackageInput = {
    body,
    styles: ctx.styles.xml(),
    docDefaults: ctx.styles.docDefaults(options.config.locale),
    ...(ctx.numbering.empty ? {} : { numbering: ctx.numbering.xml() }),
    ...(ctx.footnotes.length ? { footnotes: ctx.footnotes } : {}),
    ...(page.footnoteSeparator ? { footnoteSeparator: page.footnoteSeparator } : {}),
    ...(page.background ? { background: page.background } : {}),
    headers: ctx.headers,
    footers: ctx.footers,
    core: { title: options.title, author: options.author, language: options.config.locale, date: createdAt },
    settings: {
      autoHyphenation: resolved.bodyText.hyphenation.enabled,
      embedFonts: (fonts?.faces.length ?? 0) > 0,
      evenAndOddHeaders: page.evenAndOddHeaders,
      extra,
    },
    fonts: fonts?.faces,
    exportMap: map,
    // What an editor that drops the map (Google Docs) still keeps: enough
    // to write the map again from the book (#1458).
    customProps: traceProps(trace),
  };
  return { map, trace, parts: { body, footnotes: ctx.footnotes, styles: input.styles ?? '' }, build: () => pkg.build(input) };
}
