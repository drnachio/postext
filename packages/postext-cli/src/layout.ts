// Lay a book out the way the Sandbox does: chapter by chapter, each one
// continuing the last (`buildBundle`), with the maths and citation engines
// loaded only when the text needs them. Problems the engine reports are
// collected with the chapter file and line they come from.

import {
  createMeasurementCache,
  formatWarning,
  glyphFallbacks,
  initMathEngine,
  initMusicEngine,
  markdownHasScore,
  parseMarkdownWithIssues,
  type ContentWarning,
  type MeasurementCache,
  type VDTDocument,
} from 'postext';
import { buildBundle, type BundleLayoutCache } from 'postext/bundle';
import type { Options } from './args';
import { fontFallbackWarnings, type FontSet } from './fonts';
import type { Book, BookChapter } from './input';
import { parseChapterList } from './input';
import type { Reporter } from './log';

export interface Layout {
  /** One document per chapter laid out. */
  docs: VDTDocument[];
  /** The chapters laid out (all, or those of --chapters). */
  chapters: BookChapter[];
  pageCount: number;
  /** For each chapter, whether this layout laid it out (false: the
   *  document of an earlier layout stands, from the layout cache). */
  laidOut: boolean[];
}

const MATH_RE = /\$[^$\n]+\$|\$\$/;
/** `[@key]`, `@key` after a space or bracket, or a front-matter bibliography. */
const CITATION_RE = /\[[^\]\n]*@[\p{L}\d_][^\]\n]*\]|^(?:references|bibliography|csl|citation-style)\s*:/mu;

let citeprocLoaded = false;

type ParseIssues = ReturnType<typeof parseMarkdownWithIssues>['issues'];
/** The parse problems of each chapter text of the last layout: --watch
 *  parses again only the chapters that changed. */
let issuesByText = new Map<string, ParseIssues>();

/** "chapters/02.md:14" for an offset in a chapter's Markdown. */
export function sourceAt(chapter: BookChapter | undefined, offset: number | undefined): string | undefined {
  if (!chapter || offset === undefined || offset < 0) return undefined;
  const line = chapter.markdown.slice(0, offset).split('\n').length;
  return `${chapter.file ?? chapter.title}:${line}`;
}

export function selectChapters(book: Book, opts: Options): BookChapter[] {
  const spec = opts.string('chapters');
  if (!spec) return book.chapters;
  return parseChapterList(spec, book.chapters.length).map((i) => book.chapters[i]!);
}

/**
 * `config` as the command line lays it out: with the text shaped in the
 * host's language (`bodyText.shapingLanguage: 'host'`, #764), whatever it
 * names. A browser shapes a document in its own language, the default
 * from postext 1.30 (#770); Skia's canvas takes a language and shapes
 * without it (@napi-rs/canvas 1.0: the widths of Noto Serif SC, of Noto
 * Serif JP and of a face with Catalan and Turkish forms are the same
 * under every `lang`), so what is measured here is the forms of each
 * font's default language. The outputs are told so: a PDF shaped in the
 * document's language would set a Catalan `l·l` or a Turkish `fi` in
 * other glyphs than the ones their places were measured for.
 */
export function shapedBySkia<T extends { bodyText?: object }>(config: T): T {
  return { ...config, bodyText: { ...config.bodyText, shapingLanguage: 'host' } };
}

/** Lay `book` out. With a `layoutCache` (--watch), only the chapters whose
 *  inputs changed since the layout that filled it are laid out again. */
export async function layOut(
  book: Book,
  opts: Options,
  reporter: Reporter,
  cache?: MeasurementCache,
  fonts?: FontSet,
  layoutCache?: BundleLayoutCache,
): Promise<Layout> {
  const chapters = selectChapters(book, opts);
  const text = chapters.map((c) => c.markdown);
  if (text.some((t) => MATH_RE.test(t))) await reporter.time('math', () => initMathEngine());
  if (text.some((t) => markdownHasScore(t)) || book.resources.some((r) => r.kind === 'score')) await reporter.time('music', () => initMusicEngine());
  if (!citeprocLoaded && text.some((t) => CITATION_RE.test(t))) {
    await reporter.time('citations', () => import('postext-citeproc/register'));
    citeprocLoaded = true;
  }
  const issues = new Map<string, ParseIssues>();
  for (const [i, chapter] of chapters.entries()) {
    const found = issues.get(chapter.markdown) ?? issuesByText.get(chapter.markdown) ?? parseMarkdownWithIssues(chapter.markdown).issues;
    issues.set(chapter.markdown, found);
    for (const issue of found ?? []) {
      reporter.warn({ kind: issue.kind, severity: 'warning', message: describeIssue(issue), at: sourceAt(chapters[i], issue.sourceStart) });
    }
  }
  issuesByText = issues;
  // Where the book starts (`preset.json`'s `start`) is where its first
  // chapter does: a selection that leaves that chapter out (--chapters) is
  // laid out from page 1, as it always was.
  const start = chapters[0] === book.chapters[0] ? book.start : undefined;
  const docs = reporter.time('layout', () => buildBundle(
    { chapters, config: shapedBySkia(book.config), resources: book.resources, ...(start ? { start } : {}) },
    {
      cache: cache ?? createMeasurementCache(),
      ...(layoutCache ? { layoutCache } : {}),
    },
  ));
  const laidOut = layoutCache ? layoutCache.stats.laidOut : docs.map(() => true);
  docs.forEach((doc, i) => reporter.detail(`  ${laidOut[i] ? 'laid out' : 'kept'} ${chapters[i]!.file ?? chapters[i]!.title}: ${doc.pages.length} pages`));
  docs.forEach((doc, i) => reportDocWarnings(doc, chapters[i]!, reporter));
  // A weight the family ships, set in another face (#741).
  if (fonts) for (const warning of fontFallbackWarnings(docs, fonts)) reporter.warn(warning);
  // Characters a face lacks (#1105): each chapter's build found its own,
  // reported once per face for the book.
  if (docs.some((doc) => doc.contentWarnings?.some((w) => w.kind === 'glyphFallback'))) {
    // What the book's symbol font draws needs no advice (#1460).
    for (const g of glyphFallbacks(docs, { symbolFont: book.config.symbolFont?.trim() || undefined })) {
      reporter.warn({
        kind: 'glyphFallback',
        severity: 'warning',
        message: formatWarning({ kind: 'glyphFallback', ...g }),
        data: { family: g.family, weight: g.weight, style: g.style, characters: g.characters, count: g.count, ...(g.supplier ? { supplier: g.supplier } : {}) },
      });
    }
  }
  const pageCount = docs.reduce((n, d) => n + d.pages.length, 0);
  reporter.data.pages = pageCount;
  return { docs, chapters, pageCount, laidOut };
}

function describeIssue(issue: { kind: string; containerName?: string; directiveName?: string }): string {
  switch (issue.kind) {
    case 'strayFence':
      // #1125: one-line directives take no closing fence.
      return `a bare ::: after :::${issue.directiveName ?? 'directive'} closes nothing (the directive is one line): the fence is dropped, delete it`;
    case 'unclosedMath':
      return 'a $ opens maths that never closes';
    case 'unclosedContainer':
      // A composed page closes with a bare fence of as many colons (#854).
      if (issue.containerName === 'composedPage') return 'a ::::page is never closed by a fence of as many colons';
      return 'a ::: block is never closed';
    default:
      return issue.kind;
  }
}

/** The page a book-absolute page index prints as. */
export function pageLabelOf(doc: VDTDocument, pageIndex: number | undefined): string | undefined {
  if (pageIndex === undefined) return undefined;
  const local = pageIndex - (doc.pageIndexOffset ?? 0);
  const page = doc.pages[local] ?? doc.pages[pageIndex];
  return page ? String(page.pageLabel ?? page.pageNumberValue ?? local + 1) : undefined;
}

/** A `frameOverflow`'s data for `--json` (#858): where, the steps of the
 *  reflow ladder it tried, and the proposals with their values. */
function frameOverflowData(w: Extract<ContentWarning, { kind: 'frameOverflow' }>): Record<string, unknown> {
  return {
    template: w.template,
    frame: w.frame,
    fenceIndex: w.fenceIndex,
    ...(w.locale ? { locale: w.locale } : {}),
    overflowMm: w.overflowMm,
    configPath: w.configPath,
    stepsTried: w.stepsTried,
    scale: w.scale,
    ...(w.imageScale !== undefined ? { imageScale: w.imageScale } : {}),
    proposals: w.proposals,
  };
}

/** A `frameCovered` / `frameOutsideArea`'s data for `--json` (#1053). */
function overlapData(w: Extract<ContentWarning, { kind: 'frameCovered' | 'frameOutsideArea' }>): Record<string, unknown> {
  const { kind: _kind, sourceStart: _start, sourceEnd: _end, pageIndex: _page, ...data } = w;
  return data;
}

function reportDocWarnings(doc: VDTDocument, chapter: BookChapter, reporter: Reporter): void {
  type Any = Parameters<typeof formatWarning>[0] & { sourceStart?: number; pageIndex?: number };
  // A face's missing characters are reported once for the book (see layOut).
  const all: Any[] = [...(doc.warnings ?? []), ...(doc.contentWarnings ?? []).filter((w) => w.kind !== 'glyphFallback'), ...(doc.configWarnings ?? [])] as Any[];
  for (const w of all) {
    const local = w.pageIndex !== undefined ? doc.pages[w.pageIndex] : undefined;
    reporter.warn({
      kind: w.kind,
      // A template frame left empty is a note (#854): a page may leave a
      // frame unused on purpose; so is an anchor this edition leaves
      // without a word (#860), a word too long for its line divided at a
      // syllable (#1150), and a caption that prints its label alone (#1151):
      // a numbered plate may want no more.
      severity: w.kind === 'slotEmpty' || w.kind === 'anchorUnlabelled' || w.kind === 'wordDividedBySyllable' || w.kind === 'emptyCaption' ? 'info' : 'warning',
      // A resource set in the text that moved on (#1151): which, and the
      // room it left.
      ...(w.kind === 'resourceMoved' ? { data: { resourceId: w.resourceId, emptyMm: w.emptyMm } } : {}),
      // A composed page that draws no folio or running head its siblings
      // draw (#1163): the template, the element and how many draw it.
      ...(w.kind === 'folioMissing' ? { data: { template: w.template, elementId: w.elementId, slot: w.slot, folio: w.folio, side: w.side, drawnOn: w.drawnOn, siblings: w.siblings } } : {}),
      message: formatWarning(w),
      at: sourceAt(chapter, w.sourceStart),
      ...(local ? { page: String(local.pageLabel ?? local.pageNumberValue) } : {}),
      ...(w.kind === 'frameOverflow' ? { data: frameOverflowData(w) } : {}),
      // How far a frame's content went on (#859).
      ...(w.kind === 'continueTargetMissing' ? { data: { template: w.template, frame: w.frame, fenceIndex: w.fenceIndex, target: w.target, ...(w.before ? { before: true } : {}), ...(w.fromChapter !== undefined ? { fromChapter: w.fromChapter } : {}), configPath: w.configPath } } : {}),
      ...(w.kind === 'frameContinuationLimit' ? { data: { template: w.template, frame: w.frame, fenceIndex: w.fenceIndex, pages: w.pages, overflowMm: w.overflowMm, configPath: w.configPath } } : {}),
      // A frame under another, or past what holds it (#1053): where, which
      // frames, how much, and the fixes with their values.
      ...(w.kind === 'frameCovered' || w.kind === 'frameOutsideArea' ? { data: overlapData(w) } : {}),
      // A figure's label and its anchor (#860): where, in which locale.
      ...(w.kind === 'labelAnchorUnknown' || w.kind === 'anchorUnlabelled'
        ? { data: { resourceId: w.resourceId, anchor: w.anchor, ...(w.kind === 'labelAnchorUnknown' ? { known: w.known, ...(w.connector !== undefined ? { connector: w.connector, frame: w.frame } : {}) } : { style: w.style }), ...(w.locale ? { locale: w.locale } : {}) } }
        : {}),
      // Words on a picture that do not fit or that meet (#902).
      ...(w.kind === 'labelOverflow'
        ? { data: { resourceId: w.resourceId, text: w.text, ...(w.anchor !== undefined ? { anchor: w.anchor } : {}), widthPct: w.widthPct, scale: w.scale, ...(w.locale ? { locale: w.locale } : {}) } }
        : {}),
      ...(w.kind === 'labelOverlap'
        ? { data: { resourceId: w.resourceId, text: w.text, ...(w.anchor !== undefined ? { anchor: w.anchor } : {}), with: w.with, ...(w.withAnchor !== undefined ? { withAnchor: w.withAnchor } : {}), ...(w.withSymbol !== undefined ? { withSymbol: w.withSymbol } : {}), count: w.count, ...(w.locale ? { locale: w.locale } : {}) } }
        : {}),
    });
  }
}
