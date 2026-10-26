// The build's drivers: the entry points (sync, async, generator) and the
// rounds of passes for contents labels, citing-page floats and footnote
// numbers (#1276: split out of build.ts).
import type { PostextContent, PostextConfig, LayoutContinuation, OutlineEntry } from '../../types.js';
import { parseMarkdownMemo, type ContentBlock } from '../../parse/index.js';
import type { VDTDocument, VDTBlock, ContentWarning, ResolvedConfig } from '../../vdt.js';
import { figureLabelWarnings } from '../../composed/labels.js';
import { extractFrontmatter } from '../../frontmatter.js';
import { collectConfigWarnings } from '../../configWarnings.js';
import type { MeasurementCache } from '../../measure/index.js';
import { markTurnedBoxes, nameExerciseAnchors, exerciseOutline } from '../../exercises/build.js';
import { hasExercises } from '../../exercises/model.js';
import { validateConfigCache, resolveAllConfig } from '../config.js';
import { resolveDebugConfig } from '../../defaults/debug.js';
import { defaultFontSet, fontFallbacks, documentFontFaces, faceRequestKey } from '../../fonts/faces.js';
import { glyphFallbacks } from '../../fonts/glyphFallback.js';
import { syncFontSet } from '../../fonts/fontSet.js';
import { hasAnchorRefs, printsAnchorPages, anchorTargetsOf } from '../references/crossRefs.js';
import { anchorOutline, hasTocDirective, hasIndexDirective, outlineFromDoc, sameOutline, computeOutline } from '../contents/outline.js';
import { comicPageLayoutWarnings } from '../../comics/layoutPage.js';
import { numberFootnotesByPlacement, footnoteFormatOf, sameFootnoteNumbers } from '../references/footnotes.js';
import { codeParseOptions } from '../code/codeBlocks.js';
import { codeOverflowWarnings } from '../code/codeLines.js';
import { lineNumberWarnings } from '../text/lineNumbers.js';
import { connectorAnchorUnknownWarnings, pageFurnitureWarnings } from '../pages/headerFooter.js';
import { drainPasses } from '../columns/bandCaps.js';
import { collectContentWarnings, locateContentWarnings, cjkLooseLineWarnings, raggedLineWarnings, wordOverflowWarnings, designTruncationWarnings } from '../contentWarnings.js';
import { annotateDocument } from '../../cjkMarks.js';
import { annotateArabicMarks } from '../../arabicMarks.js';
import { overlineEmphasis } from '../../emphasisOverline.js';
import { highlightDocument } from '../../highlightMarks.js';
import { buildDocumentBalanced } from './balanced.js';
import { withIndexMarks } from './pageMarks.js';
import { type CitingPageSlot, type BuildDocumentOptions, BuildCancelledError } from './passTypes.js';
import { indexWarnings, joiningSpacingWarnings, dropCapWarningsByDoc, floatShrinkWarningsByDoc, textWrapWarningsByDoc, compositionWarningsByDoc, composedWarningsByDoc, afterTextWarnings, unplacedByDoc } from './warnings.js';

/** Passes a document printing its own contents gets at most, beyond the
 *  first, for the page labels it prints to settle. */
const MAX_TOC_ROUNDS = 3;

/** Rounds of proposals for floats heading their citing page (#633), each a
 *  placement pass, before the band caps run. */
export const MAX_CITING_PAGE_ROUNDS = 3;

/** The floats heading their citing page a build has settled so far (#633):
 *  the slots kept and the floats refused for good. */
export interface CitingPageState {
  hints: Map<string, CitingPageSlot>;
  refused: Set<string>;
}

export function buildDocument(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
): VDTDocument {
  return drainPasses(buildDocumentGen(content, config, cache, options));
}

/** Let the event loop turn: `scheduler.yield()` where it exists, else a
 *  message-channel hop (a `setTimeout(0)` is clamped to 4 ms once nested). */
export function yieldToEventLoop(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (scheduler?.yield) return scheduler.yield();
  if (typeof MessageChannel !== 'undefined') {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        resolve();
      };
      channel.port2.postMessage(null);
    });
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * {@link buildDocument}, yielding to the event loop between placement
 * passes. A build is several passes (band caps, column balancing, contents
 * rounds), each a synchronous re-placement of the document; in a worker
 * this lets a `cancel` posted mid-build be observed at the next pass
 * boundary — `shouldCancel` is polled there as well as inside a pass —
 * instead of after the whole build.
 */
export async function buildDocumentAsync(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions & { yieldBetweenPasses?: () => Promise<void> },
): Promise<VDTDocument> {
  const gen = buildDocumentGen(content, config, cache, options);
  const pause = options?.yieldBetweenPasses ?? yieldToEventLoop;
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
    await pause();
    if (options?.shouldCancel?.()) throw new BuildCancelledError();
  }
}

/** The build as a generator: one `yield` after every placement pass. */
export function* buildDocumentGen(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
): Generator<void, VDTDocument, void> {
  // Faces that arrived since the last build drop what was measured in
  // their families, and a config changed in place resolves again (#629).
  const fontSet = options?.fontSet === undefined ? defaultFontSet() : options.fontSet;
  if (fontSet) syncFontSet(fontSet);
  validateConfigCache(config);
  const doc = yield* buildDocumentRounds(content, config, cache, options);
  // Boxes printed upside down (#1229): their blocks learn the point they
  // turn about.
  markTurnedBoxes(doc);
  // References and markup the source names wrongly: read from the source
  // once, located on the pages of the finished layout. Kept apart from
  // `doc.warnings`, whose entries keep their postext 1.4 shape.
  const bookAnchors = content.outline ? new Set(anchorOutline(content.outline).map((e) => e.anchorId!)) : undefined;
  const bookCitationKeys = content.citations ? new Set(content.citations.items.map((i) => i.id)) : undefined;
  const found = [...collectContentWarnings(content.markdown, config, content.resources ?? [], bookAnchors, bookCitationKeys), ...(indexWarnings.get(doc) ?? [])];
  const located = found.length > 0 ? locateContentWarnings(doc, found) : [];
  // Justified CJK lines the composer could not fill within its tracking
  // cap; words of a joining script that run past their line, and styles
  // whose letter-spacing such words do not take.
  // Line numbers set over a float of the side column (#621).
  const loose = [...cjkLooseLineWarnings(doc), ...raggedLineWarnings(doc), ...wordOverflowWarnings(doc), ...(joiningSpacingWarnings.get(doc) ?? []), ...(dropCapWarningsByDoc.get(doc) ?? []), ...lineNumberWarnings(doc), ...codeOverflowWarnings(doc), ...(floatShrinkWarningsByDoc.get(doc) ?? []), ...(textWrapWarningsByDoc.get(doc) ?? []), ...(compositionWarningsByDoc.get(doc) ?? []), ...(composedWarningsByDoc.get(doc) ?? [])];
  // Side boxes and side floats set on pages after the text, and what the
  // layout could place nowhere (#639).
  loose.push(...afterTextWarnings(doc), ...(unplacedByDoc.get(doc) ?? []));
  // Design texts cut to fit their width (#628).
  loose.push(...designTruncationWarnings(doc));
  // Figure labels at anchors their picture lacks, anchors left without a
  // word in this locale (#860).
  loose.push(...figureLabelWarnings(doc, (b) => (b.sourceStart !== undefined && b.sourceEnd !== undefined ? { start: b.sourceStart, end: b.sourceEnd } : undefined)));
  // Connectors' ends at an anchor their frame's picture lacks (#1057).
  loose.push(...connectorAnchorUnknownWarnings(doc));
  // Composed pages that draw no folio or running head their siblings of
  // the same template and side draw (#1163).
  loose.push(...pageFurnitureWarnings(doc));
  // Comic panels whose cell cannot hold their picture's safe area (#556).
  for (const page of doc.pages) {
    if (page.comic) loose.push(...comicPageLayoutWarnings(page.comic));
    // Strips (#566), reported on the page they landed on.
    const strips = new Set<VDTBlock>();
    for (const col of page.columns) for (const b of col.blocks) if (b.comic) strips.add(b);
    for (const b of page.floats ?? []) if (b.comic) strips.add(b);
    for (const b of strips) loose.push(...comicPageLayoutWarnings(b.comic!).map((w) => ({ ...w, pageIndex: page.index })));
  }
  // Chinese marks placed where the lines are painted (#193), and the
  // paragraphs whose leading is too tight for their marks or readings.
  const annotations = annotateDocument(doc, doc.config?.cjk);
  // Arabic vowel marks (#376): how far each vocalised line's ink reaches,
  // for the column clip, and the paragraphs whose marks meet a
  // neighbouring line.
  const harakat = annotateArabicMarks(doc);
  // The rules over `*…*` runs under `bodyText.emphasis: 'overline'`.
  overlineEmphasis(doc);
  // The bands of the highlight marks (`:mark[…]`, #888).
  highlightDocument(doc);
  // Faces the text was set in that the font set could not give (#629).
  const checkFonts = resolveDebugConfig(config?.debug).warnings.missingFont;
  const fallbacks: ContentWarning[] = fontSet && checkFonts
    ? fontFallbacks(documentFontFaces(doc), fontSet).map((f) => ({ kind: 'fontFallback', family: f.family, weight: f.weight, style: f.style, reason: f.reason }))
    : [];
  // Characters a face lacks, which another face drew (#1105). A face
  // missing altogether is a `fontFallback` above, not one per character.
  if (checkFonts) {
    const skip = new Set(fallbacks.flatMap((f) => (f.kind === 'fontFallback' && f.reason === 'missing' ? [faceRequestKey(f)] : [])));
    for (const g of glyphFallbacks(doc, { skip })) fallbacks.push({ kind: 'glyphFallback', ...g });
  }
  if (located.length > 0 || loose.length > 0 || annotations.length > 0 || harakat.length > 0 || fallbacks.length > 0) {
    doc.contentWarnings = [...located, ...loose, ...annotations, ...harakat, ...fallbacks];
  }
  // Config values the build replaced (an unknown number format, a font
  // stack, a side column no column width can take): walked once per build,
  // not per pass — they belong to no page.
  const configWarnings = collectConfigWarnings(config, { resources: content.resources, metadata: doc.metadata });
  if (configWarnings.length > 0) doc.configWarnings = configWarnings;
  return doc;
}

/** {@link buildDocumentGen} before the document-wide warnings: the
 *  contents rounds around the balanced build. */
function* buildDocumentRounds(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
): Generator<void, VDTDocument, void> {
  // The floats heading their citing page (#633) carry over from one round
  // of the contents or of the note numbers to the next: the layout barely
  // moves between them, and each round would otherwise settle them again.
  const citing: CitingPageState = { hints: new Map(), refused: new Set() };
  // A document printing its own table of contents (`:::toc` with no
  // host-supplied outline) is laid out with the page labels of the previous
  // build until they no longer change: the contents' own length moves what
  // follows, and a numbering restart after the front matter usually settles
  // it in one extra round.
  if (content.outline === undefined) {
    const parsed = parseMarkdownMemo(extractFrontmatter(content.markdown).content, codeParseOptions(resolveAllConfig(config)));
    // A reference printing an anchor's page (#263) settles the same way.
    const pageRefs = (): boolean => {
      if (!hasAnchorRefs(parsed, new Set((content.resources ?? []).map((r) => r.id)))) return false;
      const resolved = resolveAllConfig(config);
      return printsAnchorPages(parsed, anchorTargetsOf(ownOutline(parsed, resolved, content.continuation)), resolved.crossRefs.defaultStyle);
    };
    if (hasTocDirective(parsed) || hasIndexDirective(parsed) || pageRefs()) {
      let outline = ownOutline(parsed, resolveAllConfig(config), content.continuation);
      let doc = withIndexMarks(yield* buildDocumentNumbered({ ...content, outline }, config, cache, options, 0, citing), content);
      for (let round = 0; round < MAX_TOC_ROUNDS; round++) {
        const after = outlineFromDoc(doc, outline);
        if (sameOutline(after, outline)) break;
        outline = after;
        doc = withIndexMarks(yield* buildDocumentNumbered({ ...content, outline }, config, cache, options, round + 1, citing), content);
      }
      return doc;
    }
  }
  return withIndexMarks(yield* buildDocumentNumbered(content, config, cache, options, 0, citing), content);
}

/** A document's own outline, its exercises' anchors named as a reference
 *  prints them ("Exercise 3", #1225). */
function ownOutline(parsed: readonly ContentBlock[], resolved: ResolvedConfig, continuation: LayoutContinuation | undefined): OutlineEntry[] {
  const outline = computeOutline(parsed, resolved, continuation?.headings, continuation?.statementCounters);
  return hasExercises(parsed) ? nameExerciseAnchors(outline, exerciseOutline(parsed, resolved, continuation).records) : outline;
}

/** The number each note's marker prints in `doc` (its first marker). */
function printedFootnoteNumbers(doc: VDTDocument): Map<string, string> {
  const out = new Map<string, string>();
  for (const block of doc.blocks) {
    if (block.footnoteNote !== undefined) continue;
    for (const line of block.lines) {
      for (const seg of line.segments ?? []) {
        if (seg.footnoteId !== undefined && !out.has(seg.footnoteId)) out.set(seg.footnoteId, seg.text);
      }
    }
  }
  return out;
}

/** Builds a document numbering its notes by page (or column) gets at most,
 *  beyond the first, for the numbers to settle. */
const MAX_FOOTNOTE_ROUNDS = 3;

/**
 * {@link buildDocumentBalanced}, with `footnotes.numbering: 'page'`,
 * `'column'` or `'spread'`: a note's number depends on the page the layout
 * sets it on,
 * so the document is numbered by chapter, laid out, numbered again where
 * its notes landed, and laid out with those numbers until they no longer
 * change (as the contents' page labels are). A circled marker is the same
 * width whatever its number, so the second build reflows nothing and the
 * numbers hold; a decimal one may move a line (9 → 10), hence the bound.
 */
function* buildDocumentNumbered(
  content: PostextContent,
  config?: PostextConfig,
  cache?: MeasurementCache,
  options?: BuildDocumentOptions,
  tocRound = 0,
  citing?: CitingPageState,
): Generator<void, VDTDocument, void> {
  let doc = yield* buildDocumentBalanced(content, config, cache, options, tocRound, undefined, citing);
  const f = doc.config.footnotes;
  if ((f.placement !== 'column' && f.placement !== 'spread') || (f.numbering !== 'page' && f.numbering !== 'column' && f.numbering !== 'spread')) return doc;
  for (let round = 0; round < MAX_FOOTNOTE_ROUNDS; round++) {
    const used = printedFootnoteNumbers(doc);
    if (used.size === 0) break;
    // A spread counts its notes in citation order: the order of the first
    // markers, which `used` holds.
    const order = f.numbering === 'spread' ? new Map([...used.keys()].map((id, i) => [id, i])) : undefined;
    const placed = numberFootnotesByPlacement(doc.pages, f.numbering, footnoteFormatOf(f, doc.config.numerals), f.markerTemplate, doc.pageIndexOffset ?? 0, order).numbers;
    // A note the layout set nowhere keeps the number it had.
    const next = new Map(used);
    for (const [id, number] of placed) next.set(id, number);
    if (sameFootnoteNumbers(next, used)) break;
    doc = yield* buildDocumentBalanced(content, config, cache, options, tocRound, next, citing);
  }
  return doc;
}

export const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
