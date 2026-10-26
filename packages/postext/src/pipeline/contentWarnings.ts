/**
 * Content warnings — references and markup the source names wrongly, which
 * the layout sets in a fallback without failing: an unknown `:ref` prints
 * `?`, an unknown `:::name` line prints as text, an unknown style id falls
 * back to a default, a ragged table grid shifts its cells. They are read
 * from the source and the configuration alone (no layout), so an editor can
 * list them while the document is still being laid out; the build lists
 * them in `VDTDocument.contentWarnings`, located on the page each construct
 * landed on.
 */

import { parseVideoUrl } from '../video/url.js';
import { resourceRefId, unprefixedId } from './references/crossRefs.js';
import { citationIssues } from './references/citations.js';
import { bookCitationContexts, needsCitationContext } from '../citations/context.js';
import { duplicateAnchors } from './references/anchors.js';
import { figureWordConflicts } from './resources/figureWords.js';
import { computeChapterTitles } from './pages/placeholders.js';
import type { ContentBlock } from '../parse/index.js';
import { KNOWN_CONTAINERS, KNOWN_DIRECTIVES, parseInlineSnippetSpans, parseMarkdownMemo } from '../parse/index.js';
import { invalidAttributeKeys } from '../parse/attrs.js';
import { MARK_OPENER, directiveAttrRanges, readMarkAt } from '../parse/inlineFormatting.js';
import { parsePaperAttrs } from './pages/paper.js';
import { extractFrontmatter } from '../frontmatter.js';
import { tableGridIssues } from '../table/model.js';
import { isGenericFamily } from '../fonts/faces.js';
import type { PostextConfig, Resource } from '../types.js';
import type { ConfigWarning, ContentWarning, LayoutWarning, RenderWarning, VDTDesignSlot, VDTDocument } from '../vdt.js';
import type { HeadingDesignCut } from './sections/headingDesignCuts.js';
import { DEFAULT_CHIP_STYLES } from '../defaults/chipStyles.js';
import { DEFAULT_MARK_STYLES } from '../defaults/markStyles.js';
import { DEFAULT_PARAGRAPH_STYLES } from '../defaults/paragraphStyles.js';
import { DEFAULT_HEADING_STYLES } from '../defaults/headingStyles.js';
import { resolveAllConfig } from './config.js';
import { needsExerciseExpansion } from '../exercises/build.js';
import { exerciseContentWarnings } from '../exercises/warnings.js';
import { codeParseOptions } from './code/codeBlocks.js';
import { planHeadingSections, sectionWritingMode } from './sections/headingStyles.js';
import { comicSourceWarnings } from '../comics/warnings.js';
import { comicFrameSourceWarnings, comicTextPanelsSupported } from '../comics/textPanels.js';
import { resolvedComics } from '../defaults/comics.js';
import { effectiveResourceTypes } from '../defaults/resourceTypes.js';
import { composedPages } from '../composed/document.js';
import { composedFrameBlockIds } from '../composed/paint.js';
import { bitmapLayoutSize, bitmapResolutionFor } from '../bitmapResolution.js';
import { checkComposedSlots, checkFrameLookNames } from '../composed/slotChecks.js';
import { describeFitStep, describeFrameCoverProposal, describeFrameOutsideProposal, describeFrameOverflowProposal } from '../composed/reflowLog.js';
import type { ComposedPagesConfigKeys } from '../composed/types.js';

/** A `:::name` line: the name starts it, whatever follows (a line the parser
 *  does not take as a fence — an unknown name, or text after the name — is
 *  set as a paragraph). */
const FENCE_LINE_RE = /^:::\s*([a-z][a-z0-9-]*)\b/;
/** A `::name` line that reads as an embed — `::resource` in any form, or
 *  any name followed by its attribute block (`::figure{…}`): one the parser
 *  took as a `::resource` embed never reaches a paragraph, so any left in
 *  one printed as text. Prose that merely opens with `::` (`::before and
 *  ::after…`) is not an embed. */
const EMBED_LINE_RE = /^::(?!:)\s*([a-z][a-z0-9-]*)\s*(\{|$)?/;

/** The name of the embed a text line was meant to be, or undefined. */
function embedLineName(line: string): string | undefined {
  const m = EMBED_LINE_RE.exec(line);
  if (!m) return undefined;
  return m[1] === 'resource' || m[2] !== undefined ? m[1] : undefined;
}

/** Markup typed with fullwidth characters (a Chinese or Japanese input
 *  method), each with the ASCII form the parser reads (#181). A match
 *  holding no fullwidth character is ordinary markup and is skipped. */
const FULLWIDTH_MARKUP: readonly { re: RegExp; ascii: (typed: string) => string }[] = [
  // A fence: `：：：callout{…}`, a closing `：：：`.
  { re: /^[:：]{3,}(?=[a-z]|\s*$|\s*[{｛])/u, ascii: () => ':::' },
  // A heading: `＃ 第一回`, `＃＃　回目`.
  { re: /^[#＃]{1,6}(?=[ \t\u3000])/u, ascii: (t) => '#'.repeat(t.length) },
  // A footnote marker: `［＾1］`.
  { re: /[［[][＾^][^［[\]］\s]+[］\]]/u, ascii: () => '[^…]' },
  // Bold: `＊＊强调＊＊`.
  { re: /＊＊[^＊\n]+＊＊/u, ascii: () => '**…**' },
];
/** Fullwidth braces at the end of a heading line or after a fence's name. */
const FULLWIDTH_ATTRS_RE = /｛[^｛｝\n]*｝\s*$|(?<=^[:：]{3}\s*[a-z][a-z0-9-]*\s*)｛[^｛｝\n]*｝/u;
const HAS_FULLWIDTH_RE = /[\uFF00-\uFFEF]/u;

/** The fullwidth markup of one source line — the first on the line — or
 *  undefined. `at` is its offset in the line. */
export function fullwidthMarkupIn(line: string): { typed: string; ascii: string; at: number } | undefined {
  if (!/[：＃［＾］＊｛]/u.test(line)) return undefined;
  const lead = line.length - line.trimStart().length;
  const text = line.slice(lead);
  let found: { typed: string; ascii: string; at: number } | undefined;
  for (const { re, ascii } of FULLWIDTH_MARKUP) {
    // The first match that holds a fullwidth character (`[^1]` before a
    // `［＾2］` is ordinary markup).
    const all = new RegExp(re.source, 'gu');
    let m: RegExpExecArray | null;
    while ((m = all.exec(text)) !== null && !HAS_FULLWIDTH_RE.test(m[0])) {
      if (m[0].length === 0) all.lastIndex++;
    }
    if (m && (!found || m.index < found.at)) found = { typed: m[0], ascii: ascii(m[0]), at: m.index };
  }
  if (!found && /^(?:[#＃]{1,6}[ \t\u3000]|[:：]{3})/u.test(text)) {
    const m = FULLWIDTH_ATTRS_RE.exec(text);
    if (m) found = { typed: m[0].trimEnd(), ascii: '{…}', at: m.index };
  }
  return found ? { ...found, at: found.at + lead } : undefined;
}

/** The `{…}` attribute blobs of a source line — a fence's, a heading's
 *  trailing block and those of the inline directives — with their offsets
 *  in the line. */
function attributeBlobs(line: string): { blob: string; at: number }[] {
  const out: { blob: string; at: number }[] = [];
  const fence = /^\s*:::\s*[a-z][a-z0-9-]*\s*\{([^}]*)\}/.exec(line);
  if (fence) out.push({ blob: fence[1]!, at: fence[0].length - 1 - fence[1]!.length });
  const heading = /^\s*#{1,6}\s.*?\{([^{}]*)\}\s*$/.exec(line);
  if (heading) out.push({ blob: heading[1]!, at: line.lastIndexOf('{') + 1 });
  // `:ref{…}`, `:swatch{…}`, `:index{…}`, `:chip[…]{…}`, `:index[…]{…}`.
  for (const [start, end] of directiveAttrRanges(line, ['ref', 'swatch', 'index'], ['chip', 'index'], true)) {
    out.push({ blob: line.slice(start, end), at: start });
  }
  return out;
}

/** Every `:::name` the parser understands: leaf directives plus containers. */
const KNOWN_FENCE_NAMES: ReadonlySet<string> = new Set<string>([...KNOWN_DIRECTIVES, ...KNOWN_CONTAINERS]);

type SourceRange = { start: number; end: number };

/** The source range of an inline construct opening at `start` (`:ref{…}`,
 *  `:chip[…]{…}`): up to its closing brace, kept inside the block. */
function inlineRange(text: string, start: number, blockEnd: number): SourceRange {
  const close = text.indexOf('}', start);
  return { start, end: close >= 0 && close < blockEnd ? close + 1 : blockEnd };
}

/**
 * Warnings for the references and markup of `markdown` that the build cannot
 * resolve as written: unknown resource ids (embeds, inline `:ref`s, cell
 * images — in the text and in the captions, notes and cells of the
 * resources it uses), unknown `:::name` lines, `::name` embed lines set as
 * text, unknown paragraph, callout, chip, heading and table style ids, and
 * table grids that are not rectangular once their merges are counted (see
 * `tableGridIssues`).
 *
 * Offsets are absolute in `markdown` (frontmatter included); resource-level
 * warnings point at the resource's first embed or reference. The result
 * has no `pageIndex` — the build adds it.
 */
export function collectContentWarnings(
  markdown: string,
  config?: PostextConfig,
  resources: readonly Resource[] = [],
  /** The anchor ids of the whole book (#262), when the document is one of
   *  its chapters; its own anchors count either way. */
  bookAnchors?: ReadonlySet<string>,
  /** The reference keys of the whole book (#268), when the document is one
   *  of its chapters; its own references count either way. */
  bookCitationKeys?: ReadonlySet<string>,
): ContentWarning[] {
  const fm = extractFrontmatter(markdown);
  const body = fm.content;
  const offset = fm.contentOffset;
  const blocks = parseMarkdownMemo(body, codeParseOptions(resolveAllConfig(config)));
  const out: ContentWarning[] = [];
  // Front matter that does not parse: the document is set without its
  // metadata.
  if (fm.error) out.push({ kind: 'invalidFrontmatter', message: fm.error.message, sourceStart: fm.error.sourceStart, sourceEnd: fm.error.sourceEnd });
  const abs = (r: SourceRange) => ({ sourceStart: r.start + offset, sourceEnd: r.end + offset });

  const byId = new Map<string, Resource>();
  for (const r of resources) if (!byId.has(r.id)) byId.set(r.id, r);
  const anchors = new Set(bookAnchors);
  // A comic strip counted in a resource type (`:::strip{id=… type=…
  // caption=…}`, #590) is named by a `:ref` as a figure is.
  const resourceTypeIds = new Set(effectiveResourceTypes(config, resources).map((t) => t.id));
  for (const b of blocks) {
    if (b.type === 'heading' && b.attrs?.id) anchors.add(b.attrs.id);
    for (const m of b.anchorMarks ?? []) anchors.add(m.anchorId);
    const strip = b.type === 'directive' && b.directiveName === 'strip' ? b.comic?.attrs : undefined;
    const stripId = strip?.id?.trim();
    if (stripId && strip!.caption?.trim() && resourceTypeIds.has(strip!.type?.trim() ?? '')) anchors.add(stripId);
  }
  const isAnchor = (id: string): boolean => anchors.has(id) || (unprefixedId(id) !== undefined && anchors.has(unprefixedId(id)!));
  // An identifier set twice: a reference reaches the first one only.
  for (const d of duplicateAnchors(blocks)) out.push({ kind: 'duplicateAnchor', anchorId: d.id, ...abs({ start: d.start, end: d.end }) });
  const paragraphStyles = new Set((config?.paragraphStyles ?? DEFAULT_PARAGRAPH_STYLES).map((s) => s.id));
  // With no callout style configured every type is the built-in plain box:
  // a type is only wrong once there are styles to pick from.
  const calloutStyles = new Set((config?.calloutStyles ?? []).map((s) => s.id));
  const chipStyles = new Set((config?.chipStyles ?? DEFAULT_CHIP_STYLES).map((s) => s.id));
  const markStyles = new Set((config?.markStyles ?? DEFAULT_MARK_STYLES).map((s) => s.id));
  /** The style ids the highlight marks of a span name that no style
   *  declares (#888). */
  const unknownMarks = (span: { links?: { start: number; mark?: { style: string; id: number } }[] }): { style: string; id: number; start: number }[] =>
    (span.links ?? []).flatMap((l) => (l.mark && l.mark.style !== '' && !markStyles.has(l.mark.style) ? [{ style: l.mark.style, id: l.mark.id, start: l.start }] : []));
  /** The source of the `:mark[…]{…}` whose first character is at `at`. */
  const markRange = (at: number, fallback: SourceRange): SourceRange => {
    const open = body.lastIndexOf(MARK_OPENER, at);
    const read = open >= 0 ? readMarkAt(body, open) : undefined;
    return read && read.end > at ? { start: open, end: read.end } : fallback;
  };
  const markReported = new Set<string>();
  const headingStyles = new Set((config?.headingStyles ?? DEFAULT_HEADING_STYLES).map((s) => s.id));
  const tableStyles = new Set((config?.tableStyles ?? []).map((s) => s.id));
  // Whether a content block is laid out in a vertical flow: the document's
  // writing mode, or its styled section's (a horizontal appendix of a
  // vertical book, a vertical chapter of a horizontal one).
  const anyVertical = config?.layout?.writingMode === 'vertical-rl'
    || (config?.headingStyles ?? []).some((s) => s.layout?.writingMode === 'vertical-rl');
  let verticalAt: (blockIdx: number) => boolean = () => false;
  if (anyVertical) {
    const resolved = resolveAllConfig(config);
    const sections = planHeadingSections(blocks, resolved);
    verticalAt = (blockIdx) => sectionWritingMode(sections, resolved, blockIdx) === 'vertical-rl';
  }

  /** First embed or reference of every known resource, in reading order,
   *  and the content block it sits in. */
  const firstUse = new Map<string, SourceRange>();
  const firstUseBlock = new Map<string, number>();
  let blockIdx = -1;
  const use = (id: string, range: SourceRange): void => {
    if (byId.has(id) && !firstUse.has(id)) {
      firstUse.set(id, range);
      firstUseBlock.set(id, blockIdx);
    }
  };

  /** Footnote markers (first one of each id) and definitions. */
  const footnoteCites = new Map<string, SourceRange>();
  const footnoteDefs = new Map<string, SourceRange>();

  /** Refs, chips and footnote markers of a block's spans. */
  const scanSpans = (b: ContentBlock): void => {
    let plain = 0;
    for (const span of b.spans) {
      const at = b.sourceMap[plain] ?? b.sourceStart;
      if (span.footnote && !footnoteCites.has(span.footnote.id)) {
        footnoteCites.set(span.footnote.id, { start: at, end: at + span.footnote.id.length + 3 });
      }
      if (span.ref) {
        const range = inlineRange(body, at, b.sourceEnd);
        const id = resourceRefId(span.ref.resourceId, (x) => byId.has(x));
        use(id, range);
        // A reference naming no resource may name an anchor (#262): of
        // this document, or of the book (`knownAnchors`).
        if (!byId.has(id) && !isAnchor(span.ref.resourceId)) {
          out.push({ kind: 'unknownResourceId', resourceId: span.ref.resourceId, usage: 'ref', ...abs(range) });
        }
      }
      // An exercise's answer (`[[…]]`, #1225) is a chip the engine styles.
      const style = span.chip?.gap ? undefined : span.chip?.style;
      if (style !== undefined && !chipStyles.has(style)) {
        out.push({ kind: 'unknownChipStyle', style, ...abs(inlineRange(body, at, b.sourceEnd)) });
      }
      for (const mark of unknownMarks(span)) {
        // Once per mark: its words may lie in several spans.
        const key = `${b.sourceStart}:${mark.id}`;
        if (markReported.has(key)) continue;
        markReported.add(key);
        const first = b.sourceMap[plain + mark.start] ?? at;
        out.push({ kind: 'unknownMarkStyle', style: mark.style, ...abs(markRange(first, { start: b.sourceStart, end: b.sourceEnd })) });
      }
      // A `:tab` down a vertical page is a word space (#622).
      if (span.tab && !span.tab.literal && verticalAt(blockIdx)) {
        const end = body.startsWith(':tab{', at) ? body.indexOf('}', at) + 1 : at + 4;
        out.push({ kind: 'tabInVerticalText', ...abs({ start: at, end: end > at ? end : at + 4 }) });
      }
      plain += span.text.length;
    }
    // Index marks that name no term index nothing.
    for (const mark of b.indexMarks ?? []) {
      if (mark.path.length === 0) out.push({ kind: 'indexMarkInvalid', ...abs({ start: mark.sourceStart, end: mark.sourceEnd }) });
    }
  };

  // Two figures of one resource that say different words (#986): the pages
  // show the first figure's.
  for (const c of figureWordConflicts(blocks)) {
    out.push({ kind: 'figureWordsShared', resourceId: c.resourceId, words: c.words, ...abs({ start: c.start, end: c.end }) });
  }

  let comics: ReturnType<typeof resolvedComics> | undefined;
  for (const b of blocks) {
    blockIdx++;
    const range = { start: b.sourceStart, end: b.sourceEnd };
    switch (b.type) {
      case 'resourceBlock': {
        const id = b.resourceId;
        if (id === undefined) break;
        use(id, range);
        if (!byId.has(id)) out.push({ kind: 'unknownResourceId', resourceId: id, usage: 'embed', ...abs(range) });
        break;
      }
      case 'containerStart': {
        const attrs = b.containerAttrs ?? {};
        if (b.containerName === 'paragraphs' && attrs.style !== undefined && !paragraphStyles.has(attrs.style)) {
          out.push({ kind: 'unknownParagraphStyle', style: attrs.style, ...abs(range) });
        } else if (b.containerName === 'callout' && calloutStyles.size > 0 && attrs.type !== undefined && !calloutStyles.has(attrs.type)) {
          out.push({ kind: 'unknownCalloutType', type: attrs.type, ...abs(range) });
        } else if (b.containerName === 'columns' && attrs.flow !== undefined && attrs.flow !== 'snake' && attrs.flow !== 'parallel') {
          out.push({ kind: 'columnsFlowUnknown', value: attrs.flow, ...abs(range) });
        } else if (b.containerName === 'paper') {
          for (const issue of parsePaperAttrs(attrs, config?.colorPalette).issues) {
            out.push({ kind: 'paperAttributeInvalid', key: issue.key, value: issue.value, ...abs(range) });
          }
        }
        break;
      }
      case 'heading': {
        const style = b.attrs?.style;
        if (style !== undefined && style.length > 0 && !headingStyles.has(style)) {
          // The heading line up to the style's value (the attribute block
          // lies past the heading's own range).
          const value = b.attrSources?.style;
          out.push({ kind: 'unknownHeadingStyle', style, level: b.level ?? 1, ...abs({ start: b.sourceStart, end: value?.end ?? b.sourceEnd }) });
        }
        break;
      }
      case 'directive': {
        // `:::page{template=…}`: a composed page written with three colons
        // (#854) is read as a comic page; its fence line is the range.
        if (b.comic && b.directiveName === 'page' && b.comic.attrs.template !== undefined) {
          const fenceEnd = body.indexOf('\n', b.sourceStart);
          out.push({ kind: 'pageFenceLength', ...abs({ start: b.sourceStart, end: fenceEnd < 0 || fenceEnd > b.sourceEnd ? b.sourceEnd : fenceEnd }) });
        }
        // A comic page (#555): its split, panels, script and pictures.
        if (b.comic) {
          comics ??= resolvedComics(resolveAllConfig(config));
          for (const w of comicSourceWarnings(b.comic, comics, byId)) {
            out.push({ ...w, ...abs({ start: w.sourceStart ?? b.sourceStart, end: w.sourceEnd ?? b.sourceEnd }) });
          }
          // Its frames (#885): a `box` style, text panels set in the flow.
          const all = resolveAllConfig(config);
          for (const w of comicFrameSourceWarnings(b.comic, new Set(all.calloutStyles.map((st) => st.id)), comicTextPanelsSupported(all))) {
            out.push({ ...w, ...abs({ start: w.sourceStart ?? b.sourceStart, end: w.sourceEnd ?? b.sourceEnd }) });
          }
        }
        break;
      }
      case 'paragraph': {
        // A poem's `{style=…}` names a paragraph style (#378): its fence
        // line is the range.
        // A poem set line by line (#620) is a block a stanza: its first
        // reports it.
        const verseStyle = (b.verse?.stanza?.index ?? 0) === 0 ? b.verse?.attrs.style : undefined;
        if (verseStyle !== undefined && !paragraphStyles.has(verseStyle)) {
          const fenceEnd = body.indexOf('\n', b.sourceStart);
          out.push({ kind: 'unknownParagraphStyle', style: verseStyle, ...abs({ start: b.sourceStart, end: fenceEnd < 0 ? b.sourceEnd : fenceEnd }) });
        }
        if (b.footnoteDef !== undefined && !footnoteDefs.has(b.footnoteDef)) {
          // The definition's `[^id]:` sits before its text, on its line.
          const lineStart = body.lastIndexOf('\n', b.sourceStart - 1) + 1;
          footnoteDefs.set(b.footnoteDef, { start: lineStart, end: b.sourceEnd });
        }
        // A `:::name` line the parser did not take as a directive or a
        // container is set as text: it opens its paragraph, or sits in one
        // when text follows the name on the line. So is a `::name` line that
        // is no well-formed embed, or one glued under a paragraph line.
        let lineStart = b.sourceStart;
        for (const line of body.slice(b.sourceStart, b.sourceEnd).split('\n')) {
          const lead = line.length - line.trimStart().length;
          const at = { start: lineStart + lead, end: lineStart + line.trimEnd().length };
          const m = FENCE_LINE_RE.exec(line.trim());
          if (m && !KNOWN_FENCE_NAMES.has(m[1]!)) out.push({ kind: 'unknownDirective', name: m[1]!, ...abs(at) });
          const embed = embedLineName(line.trim());
          if (embed !== undefined) out.push({ kind: 'malformedEmbed', name: embed, ...abs(at) });
          lineStart += line.length + 1;
        }
        break;
      }
      default:
        break;
    }
    scanSpans(b);
  }

  // Composed pages (#854): templates, slots and frames left empty, and a
  // fence that disagrees with its template about spreads (#861).
  for (const w of checkComposedSlots(composedPages(blocks), config as ComposedPagesConfigKeys | undefined)) {
    out.push({ ...w, ...abs({ start: w.sourceStart ?? 0, end: w.sourceEnd ?? 0 }) });
  }
  // Frame pieces that name a look `frameLooks` lacks (#1089).
  for (const w of checkFrameLookNames(blocks, config as ComposedPagesConfigKeys | undefined)) {
    out.push({ ...w, ...abs({ start: w.sourceStart ?? 0, end: w.sourceEnd ?? 0 }) });
  }

  // Markup typed with fullwidth characters, and attribute keys outside
  // ASCII (#181): read line by line from the source, outside display
  // maths.
  {
    const lines = body.split('\n');
    const starts: number[] = [];
    let acc = 0;
    for (const line of lines) {
      starts.push(acc);
      acc += line.length + 1;
    }
    const lineOf = (offset: number): number => {
      let lo = 0;
      let hi = starts.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid]! <= offset) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    };
    const mathLines = new Set<number>();
    for (const b of blocks) {
      if (b.type !== 'mathDisplay') continue;
      for (let k = lineOf(b.sourceStart); k <= lineOf(b.sourceEnd); k++) mathLines.add(k);
    }
    lines.forEach((line, k) => {
      if (mathLines.has(k)) return;
      const lineStart = starts[k]!;
      const fw = fullwidthMarkupIn(line);
      if (fw) {
        out.push({ kind: 'fullwidthMarkup', typed: fw.typed, ascii: fw.ascii, ...abs({ start: lineStart + fw.at, end: lineStart + fw.at + fw.typed.length }) });
      }
      if (!line.includes('{')) return;
      for (const { blob, at } of attributeBlobs(line)) {
        for (const key of invalidAttributeKeys(blob)) {
          const start = lineStart + at + key.start;
          out.push({ kind: 'attributeKeyInvalid', key: key.key, ...abs({ start, end: start + key.key.length }) });
        }
      }
    });
  }

  // Footnotes cited with no definition, and definitions never cited.
  for (const [id, at] of footnoteCites) {
    if (!footnoteDefs.has(id)) out.push({ kind: 'undefinedFootnote', id, ...abs(at) });
  }
  for (const [id, at] of footnoteDefs) {
    if (!footnoteCites.has(id)) out.push({ kind: 'unusedFootnote', id, ...abs(at) });
  }

  // The resources the text uses: their style ids, grids, and the refs and
  // chips of their captions, notes and cells. They point at the first use.
  for (const [id, at] of firstUse) {
    const r = byId.get(id)!;
    const where = abs(at);
    // All of a resource's warnings point at the same place: one per id.
    const seen = new Set<string>();
    const once = (key: string): boolean => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };
    const scanSnippet = (text: string | undefined): void => {
      if (!text) return;
      for (const span of parseInlineSnippetSpans(text)) {
        if (span.ref && !byId.has(span.ref.resourceId) && once(`ref:${span.ref.resourceId}`)) {
          out.push({ kind: 'unknownResourceId', resourceId: span.ref.resourceId, usage: 'ref', inResource: id, ...where });
        }
        const style = span.chip?.style;
        if (style !== undefined && !chipStyles.has(style) && once(`chip:${style}`)) {
          out.push({ kind: 'unknownChipStyle', style, inResource: id, ...where });
        }
        for (const mark of unknownMarks(span)) {
          if (once(`mark:${mark.style}`)) out.push({ kind: 'unknownMarkStyle', style: mark.style, inResource: id, ...where });
        }
      }
    };
    scanSnippet(r.caption);
    scanSnippet(r.note);
    // A vertical flow sets every resource upright: a turn asked for it is
    // not applied where the resource is first used in one (#188).
    if (r.placement?.rotate && r.placement.position !== 'here' && verticalAt(firstUseBlock.get(id) ?? -1)) {
      out.push({ kind: 'rotateIgnoredVertical', resourceId: id, ...where });
    }
    if (r.kind === 'video') {
      const v = r.video;
      if (!v?.poster) out.push({ kind: 'videoWithoutPoster', resourceId: id, ...where });
      if ((v?.source ?? 'file') === 'file') {
        if (!/^https?:\/\/\S+$/i.test(v?.url?.trim() ?? '')) out.push({ kind: 'videoWithoutUrl', resourceId: id, ...where });
      } else if (parseVideoUrl(v?.url)?.source !== v?.source) {
        out.push({ kind: 'videoUrlInvalid', resourceId: id, url: v?.url ?? '', ...where });
      }
    }
    if (r.kind !== 'table' || !r.table) continue;
    const styleId = r.table.styleId;
    // JSON documents may carry `styleId: null` for "no named style".
    if (typeof styleId === 'string' && styleId.length > 0 && !tableStyles.has(styleId)) {
      out.push({ kind: 'unknownTableStyle', styleId, resourceId: id, ...where });
    }
    const model = r.table.model;
    const issues = tableGridIssues(model);
    if (issues.length > 0) {
      const first = issues[0]!;
      out.push({ kind: 'raggedTableGrid', resourceId: id, reason: first.kind, row: first.row, col: first.col, count: issues.length, ...where });
    }
    for (const row of model.rows) {
      for (const cell of row) {
        if (cell.hiddenBy) continue;
        scanSnippet(cell.content);
        const image = cell.image?.resourceId;
        if (image !== undefined && !byId.has(image) && once(`image:${image}`)) {
          out.push({ kind: 'unknownResourceId', resourceId: image, usage: 'cellImage', inResource: id, ...where });
        }
      }
    }
  }

  // Exercises (#1225): what their fences and items say that the engine
  // cannot read.
  if (needsExerciseExpansion(blocks)) out.push(...exerciseContentWarnings(blocks, config).map((w) => ({ ...w, sourceStart: w.sourceStart + offset, sourceEnd: w.sourceEnd + offset })));
  // Citations (#268): keys no reference defines, data that cannot be read.
  const metadata = fm.metadata as Record<string, unknown>;
  if (needsCitationContext(blocks, metadata)) {
    const ctx = bookCitationContexts([{ metadata, blocks }])[0]!;
    const keys = bookCitationKeys ? new Set([...bookCitationKeys, ...ctx.items.map((i) => i.id)]) : undefined;
    for (const issue of citationIssues(blocks, ctx, keys)) {
      const range = abs({ start: issue.sourceStart, end: issue.sourceEnd });
      if (issue.kind === 'unknownCitationKey') out.push({ kind: 'unknownCitationKey', key: issue.key ?? '', ...range });
      else if (issue.kind === 'citationsUnavailable') out.push({ kind: 'citationsUnavailable', ...range });
      else out.push({ kind: 'referencesUnreadable', message: issue.message ?? '', ...range });
    }
  }
  // Reading order: a resource's warnings sit at its first use.
  return out
    .map((w, i) => ({ w, i }))
    .sort((a, b) => (a.w.sourceStart ?? 0) - (b.w.sourceStart ?? 0) || a.i - b.i)
    .map(({ w }) => w);
}

/**
 * The page each content warning's construct was placed on: the first placed
 * block of the resource a resource-level warning names, else the first
 * block whose source range holds the warning's start. Warnings whose
 * construct put nothing on a page keep no `pageIndex`.
 */
export function locateContentWarnings(doc: VDTDocument, warnings: readonly ContentWarning[]): ContentWarning[] {
  if (warnings.length === 0) return [];
  const placed = [...doc.blocks];
  for (const page of doc.pages) if (page.floats) placed.push(...page.floats);
  const pageOfResource = new Map<string, number>();
  for (const b of placed) {
    const id = b.resourceBlock?.resource.id;
    if (id !== undefined && b.pageIndex >= 0) {
      const prev = pageOfResource.get(id);
      if (prev === undefined || b.pageIndex < prev) pageOfResource.set(id, b.pageIndex);
    }
  }
  /** The page of the first block holding `offset`, else — a container's
   *  fence line places nothing itself — of the first block after it. */
  const pageAt = (offset: number): number | undefined => {
    let holder: number | undefined;
    let next: { start: number; page: number } | undefined;
    for (const b of placed) {
      if (b.pageIndex < 0 || b.sourceStart === undefined || b.sourceEnd === undefined) continue;
      if (offset >= b.sourceStart && offset <= b.sourceEnd) {
        if (holder === undefined || b.pageIndex < holder) holder = b.pageIndex;
      } else if (b.sourceStart > offset && (!next || b.sourceStart < next.start || (b.sourceStart === next.start && b.pageIndex < next.page))) {
        next = { start: b.sourceStart, page: b.pageIndex };
      }
    }
    // A comic page holds no block: its whole source range is its page.
    for (const page of doc.pages) {
      const c = page.comic;
      if (!c) continue;
      if (offset >= c.sourceStart && offset <= c.sourceEnd) {
        if (holder === undefined || page.index < holder) holder = page.index;
      } else if (c.sourceStart > offset && (!next || c.sourceStart < next.start)) {
        next = { start: c.sourceStart, page: page.index };
      }
    }
    return holder ?? next?.page;
  };
  return warnings.map((w) => {
    const owner = w.kind === 'unknownTableStyle' || w.kind === 'raggedTableGrid'
      ? w.resourceId
      : 'inResource' in w ? w.inResource : undefined;
    const page = (owner !== undefined ? pageOfResource.get(owner) : undefined)
      ?? (w.kind === 'unknownResourceId' && w.usage === 'embed' ? undefined : w.sourceStart !== undefined ? pageAt(w.sourceStart) : undefined);
    return page !== undefined ? { ...w, pageIndex: page } : w;
  });
}

/** A `cjkLooseLine` warning for each justified CJK line set short with the
 *  capped tracking (`VDTLine.cjkLoose`), on the page it was placed on. */
export function cjkLooseLineWarnings(doc: VDTDocument): ContentWarning[] {
  const out: ContentWarning[] = [];
  for (const block of doc.blocks) {
    for (const line of block.lines) {
      if (!line.cjkLoose) continue;
      out.push({
        kind: 'cjkLooseLine',
        text: line.text,
        ...(line.sourceStart !== undefined ? { sourceStart: line.sourceStart } : {}),
        ...(line.sourceEnd !== undefined ? { sourceEnd: line.sourceEnd } : {}),
        ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
      });
    }
  }
  return out;
}

/** A `raggedLine` warning for each line of a justified paragraph set
 *  ragged because its word spaces would have stretched past 3×
 *  (`VDTLine.raggedSpaceRatio`, #732), on the page it was placed on: the
 *  running text, the paragraphs of a box and the notes at a column foot
 *  (all of them blocks of the document). */
export function raggedLineWarnings(doc: VDTDocument): ContentWarning[] {
  const out: ContentWarning[] = [];
  for (const block of doc.blocks) {
    for (const line of block.lines) {
      if (line.raggedSpaceRatio === undefined) continue;
      out.push({
        kind: 'raggedLine',
        text: line.text,
        ratio: line.raggedSpaceRatio,
        ...(line.sourceStart !== undefined ? { sourceStart: line.sourceStart } : {}),
        ...(line.sourceEnd !== undefined ? { sourceEnd: line.sourceEnd } : {}),
        ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
      });
    }
  }
  return out;
}

/** The warning of a word cut to fit its line (#1150), by how it was cut. */
function dividedKind(cut: 'syllable' | 'character' | undefined): 'wordDividedByCharacter' | 'wordDividedBySyllable' | undefined {
  return cut === 'character' ? 'wordDividedByCharacter' : cut === 'syllable' ? 'wordDividedBySyllable' : undefined;
}

/** A `wordDividedByCharacter` warning (a `wordDividedBySyllable` note) for
 *  each line ending in a piece of a word wider than its whole measure that
 *  the breaker cut to fit (`VDTLine.wordDivided`, #1150), in the flow, a
 *  composed page's frames and design texts alike. And an
 *  `unbreakableWordOverflow` warning for each line holding a word of a
 *  joining script wider than the line (`VDTLine.wordOverflow`), on the page
 *  it was placed on; and once per text for a design text line that does
 *  (`VDTDesignTextLine.wordOverflow`: a running head repeats it on every
 *  page), on the first page that shows it. */
export function wordOverflowWarnings(doc: VDTDocument): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<string>();
  const slot = (s: VDTDesignSlot | undefined, pageIndex: number): void => {
    for (const b of s?.blocks ?? []) {
      if (b.kind !== 'text') continue;
      for (const line of b.lines) {
        const kind = line.wordOverflow ? 'unbreakableWordOverflow' : dividedKind(line.wordDivided);
        if (!kind || seen.has(`${kind}\u0000${line.text}`)) continue;
        seen.add(`${kind}\u0000${line.text}`);
        out.push({
          kind,
          text: line.text,
          ...(b.sourceStart !== undefined ? { sourceStart: b.sourceStart } : {}),
          ...(b.sourceEnd !== undefined ? { sourceEnd: b.sourceEnd } : {}),
          pageIndex,
        });
      }
    }
  };
  doc.pages.forEach((page, i) => {
    slot(page.header, i);
    slot(page.openerBand, i);
    for (const col of page.columns) for (const block of col.blocks) slot(block.designOverlay, i);
    for (const block of page.floats ?? []) slot(block.designOverlay, i);
    slot(page.footer, i);
  });
  for (const block of doc.blocks) {
    for (const line of block.lines) {
      const kind = line.wordOverflow ? 'unbreakableWordOverflow' : dividedKind(line.wordDivided);
      if (!kind) continue;
      out.push({
        kind,
        text: line.text,
        ...(line.sourceStart !== undefined ? { sourceStart: line.sourceStart } : {}),
        ...(line.sourceEnd !== undefined ? { sourceEnd: line.sourceEnd } : {}),
        ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
      });
    }
  }
  return out;
}

/** A `designTextTruncated` warning for each design text cut to fit its
 *  width (`VDTDesignTextBlock.truncated`, #628): one per element and page
 *  for a heading design, a part page or a contents part row; one per
 *  element and chapter for a running head or folio, which repeats the cut
 *  on every page (a chapter title, a folio's page number), on the first
 *  page that shows it. */
export function designTruncationWarnings(doc: VDTDocument): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<string>();
  let chapters: string[] | undefined;
  const slot = (s: VDTDesignSlot | undefined, pageIndex: number): void => {
    for (const b of s?.blocks ?? []) {
      if (b.kind !== 'text' || !b.truncated) continue;
      const t = b.truncated;
      let key: string;
      if (t.slot === 'header' || t.slot === 'footer') {
        chapters ??= computeChapterTitles(doc.blocks, doc.pages.length, doc.pages);
        key = `${t.slot}\u0000${t.elementId}\u0000${chapters[pageIndex] ?? ''}`;
      } else {
        key = `${pageIndex}\u0000${t.slot}\u0000${t.elementId}\u0000${b.sourceStart ?? ''}`;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: 'designTextTruncated',
        slot: t.slot,
        elementId: t.elementId,
        text: t.text,
        mode: t.mode,
        ...(b.sourceStart !== undefined ? { sourceStart: b.sourceStart } : {}),
        ...(b.sourceEnd !== undefined ? { sourceEnd: b.sourceEnd } : {}),
        pageIndex,
      });
    }
  };
  doc.pages.forEach((page, i) => {
    slot(page.header, i);
    slot(page.openerBand, i);
    for (const col of page.columns) for (const block of col.blocks) slot(block.designOverlay, i);
    for (const block of page.floats ?? []) slot(block.designOverlay, i);
    slot(page.footer, i);
  });
  return out;
}

/** A `joiningScriptLetterSpacing` warning for the first placed part of
 *  each block (by content index, `blocks`) whose style tracks words of a
 *  joining script, which are set untracked. */
export function joiningLetterSpacingWarnings(doc: VDTDocument, blocks: ReadonlySet<number>): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<number>();
  for (const block of doc.blocks) {
    const idx = block.contentIndex;
    if (idx === undefined || !blocks.has(idx) || seen.has(idx)) continue;
    seen.add(idx);
    out.push({
      kind: 'joiningScriptLetterSpacing',
      text: block.lines[0]?.text ?? '',
      ...(block.sourceStart !== undefined ? { sourceStart: block.sourceStart } : {}),
      ...(block.sourceEnd !== undefined ? { sourceEnd: block.sourceEnd } : {}),
      ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
    });
  }
  return out;
}

/** A `floatShrunk` warning for each floated picture the layout set smaller
 *  to fit the room of its slot (`placement.shrink`, #626), with how far it
 *  still runs past the text block's foot when even its smallest scale did
 *  not fit. `sourceRangeOf` gives the range of the content block that first
 *  cites it. */
export function floatShrinkWarnings(
  doc: VDTDocument,
  sourceRangeOf?: (contentIndex: number) => { start: number; end: number } | undefined,
): ContentWarning[] {
  const out: ContentWarning[] = [];
  for (const page of doc.pages) {
    for (const block of page.floats ?? []) {
      const rb = block.resourceBlock;
      if (!rb || rb.shrinkScale === undefined) continue;
      const foot = page.contentArea.y + page.contentArea.height;
      const overflowPx = Math.round(block.bbox.y + block.bbox.height - foot);
      const range = block.contentIndex !== undefined ? sourceRangeOf?.(block.contentIndex) : undefined;
      out.push({
        kind: 'floatShrunk',
        resourceId: rb.resource.id,
        scale: Math.round(rb.shrinkScale * 1000) / 1000,
        ...(overflowPx > 0 ? { overflowPx } : {}),
        ...(range ? { sourceStart: range.start, sourceEnd: range.end } : {}),
        pageIndex: page.index,
      });
    }
  }
  return out;
}

/** Under this share of its print size a picture is reported. */
const PRINT_SIZE_SCALE = 0.5;
/** …when the text block is at least this much wider than its column. */
const WIDER_PAGE = 1.25;

/** A `pictureBelowPrintSize` warning (#901) for each bitmap with a print
 *  size that its column holds at under half of it, on a page whose text
 *  block is wider than the column: a picture meant to fill a page, set in
 *  one of its two default columns. A print size is the resource's own
 *  `bitmap.resolution` or a number in `layout.bitmapResolution` (a
 *  resolution read from the file under `'file'` is no statement of the
 *  author's). A picture narrowed on purpose (`placement.width`), shrunk to
 *  its slot (`floatShrunk`), turned, or set in a composed page's frame is
 *  left alone. `resources` are the document's, as given (before the
 *  layout stamps its policy on them). Once per picture, where it is first
 *  placed; `sourceRangeOf` gives the range of the content block citing it. */
export function pictureBelowPrintSizeWarnings(
  doc: VDTDocument,
  resources: readonly Resource[] | undefined,
  sourceRangeOf?: (contentIndex: number) => { start: number; end: number } | undefined,
): ContentWarning[] {
  if (!resources || resources.length === 0) return [];
  const own = new Map(resources.map((r) => [r.id, r]));
  const policy = doc.config.layout.bitmapResolution;
  const dpi = doc.config.page.dpi;
  const out: ContentWarning[] = [];
  const seen = new Set<string>();
  for (const page of doc.pages) {
    const inFrames = page.composed ? composedFrameBlockIds(page) : undefined;
    const blocks = [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? []).filter((b) => !inFrames?.has(b.id))];
    for (const block of blocks) {
      const rb = block.resourceBlock;
      if (!rb || rb.kind !== 'bitmap' || rb.rotation || rb.shrinkScale !== undefined || block.comic) continue;
      const id = rb.resource.id;
      if (seen.has(id)) continue;
      const resource = own.get(id) ?? rb.resource;
      const bitmap = resource.bitmap;
      if (!bitmap) continue;
      const ppi = bitmapResolutionFor({ resolution: bitmap.resolution }, typeof policy === 'number' ? policy : 'document');
      if (ppi === undefined) continue;
      const frac = resource.placement?.width;
      if (typeof frac === 'number' && frac > 0 && frac < 1) continue;
      const printWidthPx = bitmapLayoutSize({ ...bitmap, resolution: ppi }, dpi).width;
      const widthPx = rb.bodyRect.width;
      if (!(printWidthPx > 0) || widthPx / printWidthPx >= PRINT_SIZE_SCALE) continue;
      // The column caps it (no other fit set it smaller), and spanning the
      // page would give it more room.
      const slotPx = block.bbox.width;
      if (widthPx < slotPx - 1) continue;
      const pageWidthPx = page.contentArea.width;
      if (pageWidthPx < slotPx * WIDER_PAGE) continue;
      seen.add(id);
      const range = block.contentIndex !== undefined ? sourceRangeOf?.(block.contentIndex) : undefined;
      out.push({
        kind: 'pictureBelowPrintSize',
        resourceId: id,
        scale: Math.round((widthPx / printWidthPx) * 1000) / 1000,
        printWidthPx: Math.round(printWidthPx),
        widthPx: Math.round(widthPx),
        pageWidthPx: Math.round(pageWidthPx),
        ...(range ? { sourceStart: range.start, sourceEnd: range.end } : {}),
        pageIndex: page.index,
      });
    }
  }
  return out;
}

/** An `emptyCaption` warning (#1151) for each resource whose type gives a
 *  caption prefix and whose own caption is empty: its caption line prints
 *  the label and number alone. Once per resource, where it is first
 *  placed (a page's columns, then its floats); `sourceRangeOf` gives the
 *  range of the content block citing or embedding it. */
export function emptyCaptionWarnings(
  doc: VDTDocument,
  sourceRangeOf?: (contentIndex: number) => { start: number; end: number } | undefined,
): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<string>();
  for (const page of doc.pages) {
    for (const block of [...page.columns.flatMap((c) => c.blocks), ...(page.floats ?? [])]) {
      const rb = block.resourceBlock;
      if (!rb || block.hidden || block.comic || seen.has(rb.resource.id)) continue;
      if (rb.captionPrefix.trim().length === 0 || (rb.resource.caption ?? '').trim().length > 0) continue;
      if (rb.captionLines.length === 0) continue;
      seen.add(rb.resource.id);
      const range = block.contentIndex !== undefined ? sourceRangeOf?.(block.contentIndex) : undefined;
      out.push({
        kind: 'emptyCaption',
        resourceId: rb.resource.id,
        label: rb.captionLines.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim(),
        ...(range ? { sourceStart: range.start, sourceEnd: range.end } : {}),
        pageIndex: page.index,
      });
    }
  }
  return out;
}

/** A `dropCap` warning for the first placed part of each paragraph (by
 *  content index) whose drop cap could not be set as configured (#623). */
export function dropCapWarnings(
  doc: VDTDocument,
  notes: ReadonlyMap<number, { reason: Extract<ContentWarning, { kind: 'dropCap' }>['reason']; handling?: 'reserve' | 'shrink' | 'skip'; lines?: number }>,
): ContentWarning[] {
  const out: ContentWarning[] = [];
  const seen = new Set<number>();
  /** Paragraphs set in more than one piece. */
  const pieces = new Map<number, number>();
  for (const block of doc.blocks) {
    if (block.type === 'paragraph' && block.contentIndex !== undefined) pieces.set(block.contentIndex, (pieces.get(block.contentIndex) ?? 0) + 1);
  }
  for (const block of doc.blocks) {
    const idx = block.contentIndex;
    if (idx === undefined || seen.has(idx) || block.type !== 'paragraph') continue;
    // A box or a frame chain that had to cut a paragraph before its drop
    // cap's sink line (#947) shows it on the piece holding the initial.
    const cutBeforeSink = block.dropCap !== undefined && block.lines.length < block.dropCap.sink && (pieces.get(idx) ?? 0) > 1;
    const note = notes.get(idx) ?? (cutBeforeSink ? { reason: 'split' as const } : undefined);
    if (!note) continue;
    seen.add(idx);
    const start = block.dropCap?.sourceStart ?? block.sourceStart;
    out.push({
      kind: 'dropCap',
      reason: note.reason,
      ...(note.handling ? { handling: note.handling } : {}),
      ...(note.lines !== undefined ? { lines: note.lines } : {}),
      text: (block.dropCap?.text ?? '') + (block.lines[0]?.text ?? ''),
      ...(start !== undefined ? { sourceStart: start } : {}),
      ...(block.sourceEnd !== undefined ? { sourceEnd: block.sourceEnd } : {}),
      ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
    });
  }
  return out;
}

/** Where a warning sits, for a message: `page 3` / `offset 120`. A
 *  configuration warning names its setting in the text instead. */
function where(w: LayoutWarning | ContentWarning | ConfigWarning | RenderWarning | HeadingDesignCut): string {
  const parts: string[] = [];
  if ('documentIndex' in w && w.documentIndex !== undefined) parts.push(`document ${w.documentIndex + 1}`);
  if ('pageIndex' in w && w.pageIndex !== undefined) parts.push(`page ${w.pageIndex + 1}`);
  if ('sourceStart' in w && w.sourceStart !== undefined) parts.push(`offset ${w.sourceStart}`);
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

/**
 * A one-line English description of a build, configuration or render
 * warning, for logs and simple diagnostics panels:
 *
 * ```ts
 * const all = [...(doc.warnings ?? []), ...(doc.contentWarnings ?? []), ...(doc.configWarnings ?? [])];
 * for (const w of all) console.warn(formatWarning(w));
 * // Unknown resource id "fig-map" in :ref — it prints "?" (page 2, offset 314)
 * // bodyText.fontFamily: font stack "Georgia, serif" — set in "Georgia"
 * ```
 *
 * It describes the results of `collectHeadingDesignCuts(doc)` too.
 * Hosts that localise their messages switch on `kind` instead.
 */
export function formatWarning(w: LayoutWarning | ContentWarning | ConfigWarning | RenderWarning | HeadingDesignCut): string {
  const inRes = 'inResource' in w && w.inResource !== undefined ? ` in resource "${w.inResource}"` : '';
  let text: string;
  switch (w.kind) {
    case 'calloutOverflow':
      text = `A box fits no column and overflows its column by ${Math.round(w.overflowPx)}px`;
      break;
    case 'unknownResourceId':
      text = w.usage === 'embed'
        ? `Unknown resource id "${w.resourceId}" in ::resource — nothing is embedded`
        : w.usage === 'cellImage'
          ? `Unknown resource id "${w.resourceId}" for a table cell image${inRes} — the cell stays text-only`
          : `Unknown resource id "${w.resourceId}" in :ref${inRes} — it prints "?" (or its text= label), with no number or link`;
      break;
    case 'invalidFrontmatter':
      text = `The front matter cannot be read: ${w.message} — the document is set without its metadata`;
      break;
    case 'unknownDirective':
      text = `Unknown directive ":::${w.name}" — the line is set as text`;
      break;
    case 'unknownCitationKey':
      text = `No reference defines "@${w.key}" — the citation prints without it`;
      break;
    case 'citationsUnavailable':
      text = 'Citations need a citation engine (import "postext-citeproc/register") — they print as written';
      break;
    case 'referencesUnreadable':
      text = `A :::references block cannot be read: ${w.message}`;
      break;
    case 'malformedEmbed':
      text = `The embed line "::${w.name}" is set as text — write ::resource{id="…"} alone on its line, after a blank line`;
      break;
    case 'unknownParagraphStyle':
      text = `Unknown paragraph style "${w.style}" — the paragraphs are set as body text`;
      break;
    case 'unknownCalloutType':
      text = `Unknown callout type "${w.type}" — the box takes the first callout style`;
      break;
    case 'exerciseUnknownType':
      text = `Unknown exercise type "${w.type}" — the exercise takes the kind its content tells`;
      break;
    case 'exerciseUnknownStyle':
      text = `Unknown exercise style "${w.style}" — the exercise takes the first exercise style`;
      break;
    case 'exerciseNoAnswer':
      text = `A ${w.exerciseKind} exercise has no right answer to check — tick an option with [x], or write the answers as [[…]]`;
      break;
    case 'exerciseUnreadItem':
      text = `An item the exercise cannot read is set as written: "${w.text}"`;
      break;
    case 'exerciseNested':
      text = 'An exercise inside another exercise is set as part of the outer one';
      break;
    case 'exerciseWordUnplaced':
      text = `"${w.word}" does not fit the grid and is left out — a crossword word needs a letter in common with another`;
      break;
    case 'solutionOutside':
      text = 'A :::solution or :::hint outside an exercise prints nothing';
      break;
    case 'templateUnknown':
      text = w.template === ''
        ? '::::page names no template — write ::::page{template="…"}; its content is set in the flow'
        : `Unknown page template "${w.template}" — no pageTemplates entry has this id; the page's content is set in the flow`;
      break;
    case 'slotUnknown':
      text = `Slot "${w.slot}" is no frame of template "${w.template}" — the content goes to the flow frame${w.frame ? ` "${w.frame}"` : ''}`;
      break;
    case 'repeatOverflow':
      text = `Grid "${w.group}" of template "${w.template}" holds ${w.max} item${w.max === 1 ? '' : 's'} — item ${w.item} of "${w.frame}" goes to ${w.flowFrame ? `the flow frame "${w.flowFrame}"` : 'the flow after the page'}; raise repeat.max or move the item to another page`;
      break;
    case 'lookUnknown':
      text = `Frame "${w.frame}" of template "${w.template}" names the look "${w.look}", which frameLooks does not have${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the frame wears its style and its template look`;
      break;
    case 'moduleUnknown':
      text = w.reason === 'unknown'
        ? (w.module === '' ? `:::module names no template — write :::module{template="…"}; its content goes to the flow frame` : `Unknown module "${w.module}" — no pageTemplates entry has this id; the module's content goes to the flow frame`)
        : w.reason === 'notModule'
          ? `Template "${w.module}" is no module — give it role: "module" to stack it in a page; the module's content goes to the flow frame`
          : `Template "${w.template}" has no modules group — give one of its groups modules: true; module "${w.name}" is not laid and its content goes to the flow frame`;
      break;
    case 'moduleAsPage':
      text = `Template "${w.template}" is a module — a module is stacked in a page with :::module{template="${w.template}"}, never laid as a page; the page's content is set in the flow`;
      break;
    case 'moduleNested':
      text = `Module "${w.module}" inside a module of template "${w.template}" — a module does not hold modules; its content is the outer module's`;
      break;
    case 'moduleNameRejected':
      text = w.reason === 'taken'
        ? `Another module of the page is named "${w.name}" — this one is named "${w.used}"; give each module its own name`
        : `Module name "${w.name}" holds a space, ".", "#", "[" or "]" — the module is named "${w.used}"`;
      break;
    case 'slotEmpty':
      text = `Frame "${w.frame}" of template "${w.template}" receives no content — give it a slot="${w.frame}" piece, or mark the frame optional`;
      break;
    case 'frameOverflow': {
      // The steps the reflow ladder tried and what would make it fit (#858).
      const steps = (w.stepsTried ?? []).map((st) => describeFitStep(st, { scale: w.scale, imageScale: w.imageScale }));
      const fixes = (w.proposals ?? []).map(describeFrameOverflowProposal);
      text = `Frame "${w.frame}" of template "${w.template}"${w.locale ? ` (${w.locale})` : ''} is ${w.overflowMm} mm short of its content`
        + `${steps.length > 0 ? ` after ${steps.join(', ')}` : ''} — the rest is cut at the frame's foot`
        + (fixes.length > 0 ? `; to fit: ${fixes.join('; or ')}` : '; give it more height (height, maxHeight), chain it to another frame with next, or shorten the text');
      break;
    }
    case 'frameCovered': {
      // Ink under a frame painted over it (#1053).
      const what = w.text !== undefined ? `"${w.text}"` : w.picture !== undefined ? `the picture "${w.picture}"` : 'its ink';
      const fixes = (w.proposals ?? []).map(describeFrameCoverProposal);
      text = `Frame "${w.frame}" of template "${w.template}"${w.locale ? ` (${w.locale})` : ''} lies under frame "${w.coveredBy}" (${w.overlapMm2} mm² of ${what} hidden)`
        + (fixes.length > 0 ? `; to uncover it: ${fixes.join('; or ')}` : '')
        + `; or set overlap: 'allow' on either frame if the art is meant to sit over it`;
      break;
    }
    case 'frameOutsideArea': {
      // Ink past the trim, the bleed or the box it is anchored inside (#1053).
      const past = w.past === 'trim' ? 'the trim (its text is cut there)' : w.past === 'bleed' ? 'the bleed' : `the ${w.past} "${w.target ?? ''}" it is anchored inside`;
      const sides = (['top', 'right', 'bottom', 'left'] as const).filter((k) => w.sides?.[k] !== undefined).map((k) => `${k} ${w.sides[k]} mm`);
      const fixes = (w.proposals ?? []).map(describeFrameOutsideProposal);
      text = `Frame "${w.frame}" of template "${w.template}"${w.locale ? ` (${w.locale})` : ''} runs ${w.excessMm} mm past ${past}${sides.length > 0 ? ` (${sides.join(', ')})` : ''}`
        + (fixes.length > 0 ? `; to bring it in: ${fixes.join('; or ')}` : '; move or shrink the frame')
        + `; or set overlap: 'allow' on the frame if it hangs out on purpose`;
      break;
    }
    case 'frameContinuationLimit':
      text = `Frame "${w.frame}" of template "${w.template}" went on to ${w.pages} added pages, the most a composed page may add, and is still ${w.overflowMm} mm short — the rest is cut at the frame's foot; give the frame there more room, or shorten the text`;
      break;
    case 'continueTargetMissing':
      text = w.fromChapter !== undefined
        ? `A story of chapter ${w.fromChapter + 1} jumps to page "${w.target}" (frame "${w.frame}" of template "${w.template}"), and this chapter has no ::::page{id="${w.target}"} fence with a known template — the rest is not set; give the page its fence back, or fix the name in the chapter that sends the story`
        : w.before
        ? `Frame "${w.frame}" of template "${w.template}" jumps to page "${w.target}", which comes before it — the rest goes on on the next page; move the ::::page{id="${w.target}"} fence after this page, or name a later one`
        : `Frame "${w.frame}" of template "${w.template}" jumps to page "${w.target}", and no ::::page{id="${w.target}"} fence follows — the rest goes on on the next page; give a later page fence that id, or fix the name`;
      break;
    case 'spreadMismatch':
      text = w.templateSpread
        ? `Template "${w.template}" is a spread — the page is laid over two facing pages; write ::::page{template="${w.template}" spread}`
        : `Template "${w.template}" is a single page — the page is laid on one page; drop spread from the fence, or use a template with spread: true`;
      break;
    case 'labelAnchorUnknown':
      if (w.connector !== undefined) {
        // A connector's end at an anchor of its frame's picture (#1057).
        text = `Connector "${w.connector}" ends at anchor "${w.anchor}" of the picture in frame "${w.frame ?? ''}"${w.locale ? ` (${w.locale})` : ''}: ${w.resourceId ? `"${w.resourceId}" has no such anchor` : 'the frame holds no picture on this page'} — that end is left out${w.known.length > 0 ? `; use one of ${w.known.slice(0, 6).map((a) => `"${a}"`).join(', ')}${w.known.length > 6 ? '…' : ''}` : ''}`;
        break;
      }
      text = `Label at anchor "${w.anchor}" of "${w.resourceId}"${w.locale ? ` (${w.locale})` : ''}: the resource has no such anchor — the label is not drawn; ${w.known.length > 0 ? `use one of ${w.known.slice(0, 6).map((a) => `"${a}"`).join(', ')}${w.known.length > 6 ? '…' : ''}, add the anchor to the resource,` : 'add the anchor to the resource'} or place it with at="x% y%"`;
      break;
    case 'anchorUnlabelled':
      text = `Anchor "${w.anchor}" of "${w.resourceId}" names the label style "${w.style}" but no label of the figure stands at it${w.locale ? ` in ${w.locale}` : ''} — add ::label[…]{at="${w.anchor}"}, or drop the anchor's style`;
      break;
    case 'labelOverflow':
      text = `Label "${w.text}"${w.anchor ? ` at anchor "${w.anchor}"` : ''} of "${w.resourceId}"${w.locale ? ` (${w.locale})` : ''} is wider than its measure${w.widthPct > 0 ? ` (${w.widthPct}% of the picture)` : ''} even at ${Math.round(w.scale * 100)}% — it runs past it; widen the anchor's width, shorten the label, or lower the style's minScale`;
      break;
    case 'labelOverlap':
      text = w.withSymbol !== undefined
        ? `Label "${w.text}"${w.anchor ? ` at anchor "${w.anchor}"` : ''} of "${w.resourceId}"${w.locale ? ` (${w.locale})` : ''} runs onto symbol ${w.withSymbol} of the picture (an avoid zone)${w.count > 1 ? ` and ${w.count - 1} more` : ''} — move the anchor, narrow the label's width, shorten the words in this edition, or set overlap: 'allow' on the anchor if the source prints it so`
        : `Label "${w.text}"${w.anchor ? ` at anchor "${w.anchor}"` : ''} of "${w.resourceId}"${w.locale ? ` (${w.locale})` : ''} runs into "${w.with}"${w.withAnchor ? ` at "${w.withAnchor}"` : ''}${w.count > 1 ? ` and ${w.count - 1} more` : ''} — move an anchor, narrow the label's width or shorten the words in this edition`;
      break;
    case 'pageFenceLength':
      text = 'A composed page needs four colons (::::page{template="…"} … ::::) — this :::page is read as a comic page';
      break;
    case 'columnsFlowUnknown':
      text = `Unknown flow "${w.value}" for :::columns — the group fills its columns in turn ("snake"), or stream by stream ("parallel") when it sets breaks`;
      break;
    case 'paperAttributeInvalid':
      text = `:::paper ${w.key}="${w.value}" is not a value it reads — dropped, the pages keep the document's paper for it`;
      break;
    case 'headingClaimsColumn':
      text = w.element !== undefined
        ? `The design of an H${w.level} reserves its whole column: the element "${w.element}" reaches the foot of it, so the text after the heading starts in the next column — set reserve: false on the element if it is decoration, or span: 'page' on the level if the page is meant to be the heading's`
        : `The design of an H${w.level} reserves its whole column: its minHeight is as tall as the column, so the text after the heading starts in the next column — lower minHeight, or set span: 'page' on the level if the page is meant to be the heading's`;
      break;
    case 'figureWordsShared':
      text = `Figure of "${w.resourceId}" gives its ${w.words.map((k) => (k === 'alt' ? 'alt text' : k)).join(' and ')} to a resource an earlier figure of this chapter already worded — the pages show the first figure's words and drop these; give this figure a resource of its own (a second entry for the same file) to keep both`;
      break;
    case 'unknownChipStyle':
      text = `Unknown chip style "${w.style}"${inRes} — the chip takes the first chip style`;
      break;
    case 'unknownMarkStyle':
      text = `Unknown highlight style "${w.style}"${inRes} — the mark takes the first highlight style`;
      break;
    case 'undefinedFootnote':
      text = `Footnote [^${w.id}] has no definition — write [^${w.id}]: text on a line of its own`;
      break;
    case 'unusedFootnote':
      text = `Footnote definition [^${w.id}]: is never cited — it is not set`;
      break;
    case 'indexMarkInvalid':
      text = 'An index mark names no term — write :index[word] or :index{term="…"}; it indexes nothing';
      break;
    case 'indexSeeUnknown':
      text = `The index${w.index ? ` "${w.index}"` : ''} has no entry "${w.target}" for a see / see also reference — the reference still prints`;
      break;
    case 'indexRangeUnclosed':
      text = `The index range of "${w.term}" has no range="${w.missing}" mark — it prints a single page`;
      break;
    case 'indexReadingMissing':
      text = `The index entry "${w.term}" has a kanji and no reading — add yomi="…" in kana to its mark; it files after the kana entries`;
      break;
    case 'unknownHeadingStyle':
      text = `Unknown heading style "${w.style}" on an H${w.level} — the level's own settings apply`;
      break;
    case 'unknownTableStyle':
      text = `Unknown table style "${w.styleId}" on table "${w.resourceId}" — the document's table style applies`;
      break;
    case 'fullwidthMarkup':
      text = `Markup typed in fullwidth characters "${w.typed}" is set as text — type ${w.ascii} instead`;
      break;
    case 'attributeKeyInvalid':
      text = `The attribute key "${w.key}" is not read — keys are written in ASCII letters, digits, _ and -`;
      break;
    case 'tabInVerticalText':
      text = 'A :tab in vertical text is set as a word space — tab stops are set in horizontal text only';
      break;
    case 'raggedTableGrid':
      text = w.reason === 'spanOverlap'
        ? `Table "${w.resourceId}": the cell at row ${w.row + 1}, column ${w.col + 1} sits under a merged cell — keep covered cells with hiddenBy (mergeCells) or the cells shift`
        : `Table "${w.resourceId}": row ${w.row + 1} has no cell from column ${w.col + 1} on — the grid has a hole`;
      if (w.count > 1) text += ` (${w.count} issues)`;
      break;
    case 'missingImage':
      text = `No image for file "${w.fileId}"${w.resourceId !== undefined ? ` (resource "${w.resourceId}")` : ''} — painted as a placeholder`;
      break;
    case 'svgFontUnavailable':
      text = `The SVG "${w.fileId}"${w.resourceId !== undefined ? ` (resource "${w.resourceId}")` : ''} sets text in "${w.family}" ${w.weight}${w.style === 'italic' ? ' italic' : ''}, which has no face to embed — the image sets it in a fallback face`;
      break;
    case 'svgFontsTooLarge':
      text = `The fonts of the SVG "${w.fileId}"${w.resourceId !== undefined ? ` (resource "${w.resourceId}")` : ''} come to ${Math.round(w.bytes / 1024)} KB, over the ${Math.round(w.maxBytes / 1024)} KB cap — none was embedded`;
      break;
    case 'cjkLooseLine':
      text = `The justified line "${w.text}" needs more space between its characters than the cap allows — it is set short of the measure`;
      break;
    case 'raggedLine':
      text = `The justified line "${w.text.trim()}" would need its word spaces at ${Math.round(w.ratio * 10) / 10}× their width: it is set ragged`;
      break;
    case 'fontFallback': {
      const face = `"${w.family}" ${w.weight}${w.style === 'italic' ? ' italic' : ''}`;
      text = w.reason === 'missing'
        ? `The face ${face} was not loaded when the document was laid out — its text was measured with a fallback face; load it first (prepareFonts, buildDocumentWithFonts)`
        : `The face ${face} has no file of its own — the browser draws it from another weight or slant of the family; load that face or set a weight the family has`;
      break;
    }
    case 'glyphFallback': {
      const face = `"${w.family}" ${w.weight}${w.style === 'italic' ? ' italic' : ''}`;
      const more = w.count > w.characters.length ? ` and ${w.count - w.characters.length} more` : '';
      const by = w.supplier ? `the face of ${isGenericFamily(w.supplier) ? w.supplier : `"${w.supplier}"`}` : 'a face the system picks';
      text = `The face ${face} has no glyph for ${w.count === 1 ? '1 character' : `${w.count} characters`} (${w.characters.join(' ')}${more}); ${by} draws them instead — choose a family that covers them or name one after it`;
      break;
    }
    case 'designTextTruncated':
      text = w.mode === 'clip'
        ? `The ${w.slot} text "${w.text}" (element "${w.elementId}") is wider than its box and clipped`
        : `The ${w.slot} text "${w.text}" (element "${w.elementId}") does not fit its width and ends in an ellipsis — set overflow: 'wrap' to break it onto more lines, or give it more room`;
      break;
    case 'unbreakableWordOverflow':
      text = `The line "${w.text}" holds an Arabic-script word wider than the line — such a word is never divided, so it runs past the measure`;
      break;
    case 'wordDividedByCharacter':
      text = `The line "${w.text}" ends in a word wider than the whole line, cut between two of its letters with no hyphen to fit — give the text more room or a smaller size`;
      break;
    case 'wordDividedBySyllable':
      text = `The line "${w.text}" ends in a word wider than the whole line, divided at a syllable to fit`;
      break;
    case 'joiningScriptLetterSpacing':
      text = `"${w.text}": its style sets letter-spacing, which Arabic-script words do not take (it breaks their joins) — they are set without it`;
      break;
    case 'dropCap':
      text = w.reason === 'shortParagraph'
        ? `"${w.text}": the paragraph has fewer lines than its drop cap sinks — ${w.handling === 'shrink' ? `the initial spans its ${w.lines ?? 1} line${(w.lines ?? 1) === 1 ? '' : 's'}` : w.handling === 'skip' ? 'it is set without one' : 'the room under the initial is kept'}`
        : w.reason === 'split'
          ? `"${w.text}": the paragraph breaks before the last line of its drop cap — alone in a column too short for the initial`
          : w.reason === 'joiningScript'
            ? `"${w.text}": its first letter joins the next — the drop cap is not set`
            : w.reason === 'verticalText'
              ? `"${w.text}": drop caps are set in horizontal text only — the paragraph is set without one`
              : w.reason === 'inBox'
                ? `"${w.text}": a paragraph inside a box takes no drop cap — it is set without one; set the paragraphs outside the :::callout, or in a frame of a composed page`
              : `"${w.text}": the paragraph opens with no letter to set as a drop cap — it is set without one`;
      break;
    case 'codeOverflow': {
      const what = `${w.lines === 1 ? 'A line' : `${w.lines} lines`} of a${w.lang ? ` ${w.lang}` : ''} code listing ${w.lines === 1 ? 'is' : 'are'} wider than its box`;
      text = w.mode === 'wrap'
        ? `${what} — turned over`
        : w.mode === 'clip'
          ? `${what} — cut at the box's edge`
          : `${what} — the listing is set at ${Math.round((w.scale ?? 1) * 100)} % of its size, and what still does not fit is turned over`;
      break;
    }
    case 'columnsTooNarrow':
      text = `The ${w.columns} columns of a :::columns group are ${Math.round(w.widthPx)} px wide, narrower than six ems of their text — few words fit a line; set fewer columns or a smaller gap`;
      break;
    case 'afterText':
      text = `${w.resourceId !== undefined ? `The resource "${w.resourceId}"` : 'A side box'} stands in the side column of a page with no text — the text ended before the side column had room for it; fence it earlier or make it shorter`;
      break;
    case 'unplaced':
      text = `${w.resourceId !== undefined ? `The resource "${w.resourceId}"` : 'A box'} found no slot before the layout ended — it is on no page`;
      break;
    case 'tocGroupSplit':
      text = `The contents block "${w.title}" is cut between ${w.columns} columns — it is taller than a full column, or its column is too short to hold it; list fewer levels (:::toc{levels="1"}), head the blocks with a lower level (toc.groups.head) or make the rows smaller`;
      break;
    case 'shortListSplit':
      text = `A list of ${w.items} ${w.items === 1 ? 'item' : 'items'} is cut between two columns — bodyText.shortListSplit: "avoid" sets a short list whole when a column can hold it`;
      break;
    case 'openerFloat':
      text = `${w.resourceId !== undefined ? `The resource "${w.resourceId}"` : 'A floated box'} is set on an opener page — layout.openerFloats: "avoid" moves it to the first slot after that page`;
      break;
    case 'textWrap': {
      const what = w.resourceId !== undefined ? `The resource "${w.resourceId}"` : `A "${w.box ?? 'callout'}" box`;
      text = w.reason === 'moved'
        ? `${what} wraps text round it but is too tall for the room left in its column — it moved on to the next column with its anchor`
        : w.reason === 'tooNarrow'
          ? `${what} would leave the text beside it narrower than layout.wrap.minTextWidth — it takes its band whole, with no text beside it`
          : w.reason === 'verticalText'
            ? `${what} asks for text wrap, which is set in horizontal text only — in vertical text it takes its band whole`
            : w.reason === 'noContour'
              ? `${what} wraps text round its contour, but its shape is not known (no contour.points, no transparency, or an alpha channel the host did not trace) — the text runs round its box`
              : `${what} is shorter than layout.wrap.minLinesBeside lines — it takes its band whole, with no text beside it`;
      break;
    }
    case 'pictureBelowPrintSize':
      text = `The picture "${w.resourceId}" is set at ${Math.round(w.scale * 100)} % of its print size: its column is ${w.widthPx} px wide, the picture ${w.printWidthPx} px at its resolution, the text block ${w.pageWidthPx} px. A picture in the flow is never wider than its column, and the default page has two. Span the page (placement.span: 'page'), set the page in one column (layout.layoutType: 'single'), or give the picture a higher resolution if this size is the one you want`;
      break;
    case 'emptyCaption':
      text = `The resource "${w.resourceId}" has no caption, so its caption line prints "${w.label}" alone — write its caption, or leave it as a numbered label if that is meant`;
      break;
    case 'folioMissing':
      text = `This page of the template "${w.template}" draws no ${w.folio ? 'folio' : w.slot === 'header' ? 'running head' : w.slot === 'footer' ? 'running foot' : 'running text'} "${w.elementId}" (${w.slot}), which ${w.drawnOn} of the other ${w.siblings} ${w.side} pages of the template draw — check what the element reads on this page (an {attr.x} the page fence leaves unset, a name empty here), or switch it off on purpose with when / unless on the element and an attribute on the page fence`;
      break;
    case 'resourceMoved':
      text = `The resource "${w.resourceId}" set in the text is too tall for the room left in its column and moved on to the next, leaving ${w.emptyMm} mm of the column empty — make it smaller, move its ::resource line, or float it (placement.position: 'auto')`;
      break;
    case 'floatShrunk':
      text = w.overflowPx !== undefined
        ? `The picture "${w.resourceId}" is set at its smallest scale, ${Math.round(w.scale * 100)} % of its size, and still runs ${w.overflowPx} px past the foot of the page's text block`
        : `The picture "${w.resourceId}" is set at ${Math.round(w.scale * 100)} % of its size to fit the room left on its page`;
      break;
    case 'cjkMarksExceedLeading':
      text = `The paragraph "${w.text}" has emphasis dots or name and title lines in a line gap of ${w.gapEm} em — they need ${w.neededEm} em; set it with more leading`;
      break;
    case 'rubyExceedsLeading':
      text = `The paragraph "${w.text}" has ruby readings ${w.neededEm} em high in a line gap of ${w.gapEm} em — they touch the next line; set it with more leading`;
      break;
    case 'kuntenExceedsLeading':
      text = `The kanbun "${w.text}" has reading marks ${w.neededEm} em out of its lines in a line gap of ${w.gapEm} em — they touch the next line; set it with more leading`;
      break;
    case 'arabicMarksExceedLeading':
      text = `The vowel marks of "${w.text}" meet the next line: the two lines' ink takes ${w.neededEm} em, and their baselines are ${w.lineHeightEm} em apart; set the paragraph with more leading`;
      break;
    case 'unknownNumberFormat':
      text = `${w.path}: unknown number format "${w.value}" — numbered as ${w.used}`;
      break;
    case 'fontFamilyStack':
      text = `${w.path}: font stack "${w.value}" — set in "${w.used}"`;
      break;
    case 'unknownConfigKey':
      text = `${w.path}: unknown setting "${w.value}" — ignored${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''}`;
      break;
    case 'headingDesignCut':
      text = `The design of an H${w.level} runs ${Math.round(w.overflowPx)}px past the foot of its ${w.where} — that part is cut off`;
      break;
    case 'sideColumnPercentClamped':
      text = w.value.trim() !== '' && Number.isFinite(Number(w.value))
        ? `${w.path}: a side column of ${w.value}% leaves a column with no width — cut at ${w.used}%`
        : `${w.path}: "${w.value}" is not a percentage — the side column is cut at ${w.used}%`;
      break;
    case 'columnCountClamped':
      text = `${w.path}: ${w.value} is not a column count from 3 to 8 — the page is cut into ${w.used} columns`;
      break;
    case 'comicSplitSyntax':
      text = `A comic page's split cannot be read as written: ${w.message}`;
      break;
    case 'comicSplitOverflow':
      text = `The sizes of a comic page's split add up to ${w.total} % — they are scaled down to fit`;
      break;
    case 'comicPanelCount':
      text = w.panels > w.cells
        ? `A comic page has ${w.panels} panels and its split ${w.cells} cells — the last ${w.panels - w.cells} are not set`
        : `A comic page has ${w.panels} panels and its split ${w.cells} cells — the last ${w.cells - w.panels} cells stay empty`;
      break;
    case 'comicStrayText':
      text = `"${w.text}" is not a script line (key: text) or sits before the first ::panel — it is lettered as a caption`;
      break;
    case 'comicUnknownBalloonStyle':
      text = `Unknown balloon style "${w.style}" — the line takes the default style of its key`;
      break;
    case 'comicUnknownArt':
      text = `A comic panel names "${w.resourceId}", which is no picture resource — the panel is set empty`;
      break;
    case 'comicPanelLetterbox':
      text = `Panel ${w.panel + 1} cannot hold the safe area of "${w.resourceId}" under a crop — the picture is shown whole within bands of the panel background`;
      break;
    case 'comicBalloonOverflow':
      text = `A balloon of panel ${w.panel + 1} does not fit cleanly (${w.reasons.join(', ') || 'crowded'}) — shorten the line, enlarge the panel or pin it with at=`;
      break;
    case 'comicUnknownSpeaker':
      text = `No picture of this comic page marks the speaker "${w.speaker}" and no cast entry names it — its tails point off the panel`;
      break;
    case 'comicPanelFrame':
      text = w.reason === 'unknownBox'
        ? `Panel ${w.panel + 1} names the box style "${w.style ?? ''}", which no callout style defines — the panel keeps its panel style`
        : w.reason === 'textOverflow'
          ? `The text of panel ${w.panel + 1} does not fit its frame (${w.overflowMm ?? 0} mm over) — the rest is clipped; shorten it or give the panel a larger cell`
          : `Panel ${w.panel + 1} is a text panel ${w.reason === 'strip' ? 'of a strip' : w.reason === 'spread' ? 'of a spread' : 'in a vertical or right-to-left document'} — its frame takes no text there, and the text is set in the flow after the comic`;
      break;
    case 'comicAnchorOutsideSafeArea':
      text = `The anchor "${w.anchorId}" of "${w.resourceId}" lies outside the picture's safe area — a crop may cut it off`;
      break;
    case 'wrapUnsupported':
      text = `${w.path}: text wraps in horizontal text only — in this vertical document "${w.value}" is ignored and the figures keep their bands whole`;
      break;
    case 'contentInConfig': {
      const n = w.count ?? 1;
      text = `${w.path}${w.ownerId ? ` (${w.ownerId})` : ''}: ${n} design text${n === 1 ? '' : 's'} hold${n === 1 ? 's' : ''} ${w.chars ?? 0} characters of content ("${w.value}") — move the text into the Markdown and keep only placeholders in the design`;
      break;
    }
    case 'cjkGridClamped':
      text = `${w.path}: ${w.value} ${w.path.endsWith('charsPerLine') ? 'characters per line' : 'lines'} do not fit inside the margins — the grid is set with ${w.used}`;
      break;
    // Box styles based on another (#905).
    case 'calloutStyleExtendsUnknown':
      text = `${w.path}: no box style has the id "${w.value}"${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the style stands alone`;
      break;
    case 'calloutStyleExtendsCycle':
      text = `${w.path}: the box styles extend each other in a loop (${w.value}) — the style stands alone`;
      break;
    // Page templates (#853): `path` is a JSON pointer.
    case 'templateDuplicate':
      text = `${w.path}: another template already has the id "${w.value}" — this one is ignored`;
      break;
    case 'templateExtendsCycle':
      text = `${w.path}: the templates extend each other in a loop (${w.value}) — the template is dropped`;
      break;
    case 'templateExtendsUnknown':
      text = `${w.path}: no template has the id "${w.value}"${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the template stands alone`;
      break;
    case 'frameDuplicate':
      text = `${w.path}: the name "${w.value}" is already taken by a frame or group of this template — this one is ignored`;
      break;
    case 'frameStyleUnknown':
      text = `${w.path}: no callout style has the id "${w.value}"${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the frame is drawn without a box`;
      break;
    case 'frameAnchorUnknown':
      text = w.value.includes(' → ')
        ? `${w.path}: the frames are anchored to each other in a loop (${w.value}) — this anchor reads as the area`
        : `${w.path}: the template has no frame, group or element "${w.value}"${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the anchor reads as the area`;
      break;
    case 'frameMinMax':
      text = `${w.path}: ${w.value} — the frame takes ${w.used}`;
      break;
    case 'groupFrameUnknown':
      text = `${w.path}: the template has no frame "${w.value}"${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the group skips it`;
      break;
    case 'groupFrameTwice':
      text = `${w.path}: the frame "${w.value}" is already in a group — a frame belongs to one group, this listing is skipped`;
      break;
    case 'frameChainLoop':
      text = `${w.path}: the frames continue into each other in a loop (${w.value}) — this link is dropped`;
      break;
    case 'overflowTargetUnknown':
      text = `${w.path}: "${w.value}" names no frame or template${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — the content does not continue there`;
      break;
    case 'labelStyleUnknown':
      text = `${w.path}: an anchor of "${w.resourceId ?? ''}" names the label style "${w.value}", which labelStyles does not have${w.suggestion ? ` (did you mean "${w.suggestion}"?)` : ''} — its labels take the default look`;
      break;
    default:
      // A kind this build does not know (a VDT from a newer engine).
      text = `Warning "${(w as { kind: string }).kind}"`;
  }
  return text + where(w);
}
