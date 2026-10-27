// The warnings read from the source and the configuration alone: unknown
// resource ids, :::name lines, style ids, full-width markup and ragged table
// grids (#1276: split out of contentWarnings.ts).
import { parseVideoUrl } from '../../video/url.js';
import { unprefixedId, resourceRefId } from '../references/crossRefs.js';
import { citationIssues } from '../references/citations.js';
import { needsCitationContext, bookCitationContexts } from '../../citations/context.js';
import { duplicateAnchors } from '../references/anchors.js';
import { figureWordConflicts } from '../resources/figureWords.js';
import { KNOWN_DIRECTIVES, KNOWN_CONTAINERS, parseMarkdownMemo, type ContentBlock, parseInlineSnippetSpans } from '../../parse/index.js';
import { invalidAttributeKeys } from '../../parse/attrs.js';
import { directiveAttrRanges, MARK_OPENER, readMarkAt } from '../../parse/inlineFormatting.js';
import { parsePaperAttrs } from '../pages/paper.js';
import { extractFrontmatter } from '../../parse/frontmatter.js';
import { tableGridIssues } from '../../table/model.js';
import type { PostextConfig, Resource } from '../../types.js';
import type { ContentWarning } from '../../vdt.js';
import { DEFAULT_CHIP_STYLES } from '../../defaults/text/chipStyles.js';
import { DEFAULT_MARK_STYLES } from '../../defaults/text/markStyles.js';
import { DEFAULT_PARAGRAPH_STYLES } from '../../defaults/text/paragraphStyles.js';
import { DEFAULT_HEADING_STYLES } from '../../defaults/structure/headingStyles.js';
import { resolveAllConfig } from '../config.js';
import { needsExerciseExpansion } from '../../exercises/build.js';
import { exerciseContentWarnings } from '../../exercises/warnings.js';
import { codeParseOptions } from '../code/codeBlocks.js';
import { planHeadingSections, sectionWritingMode } from '../sections/headingStyles.js';
import { comicSourceWarnings } from '../../comics/warnings.js';
import { comicFrameSourceWarnings, comicTextPanelsSupported } from '../../comics/textPanels.js';
import { resolvedComics } from '../../defaults/comics.js';
import { effectiveResourceTypes } from '../../defaults/resources/resourceTypes.js';
import { composedPages } from '../../composed/document.js';
import { checkComposedSlots, checkFrameLookNames } from '../../composed/slotChecks.js';
import type { ComposedPagesConfigKeys } from '../../composed/types.js';

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
