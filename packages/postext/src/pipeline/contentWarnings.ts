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

import { parseVideoUrl } from '../video/url';
import { resourceRefId, unprefixedId } from './crossRefs';
import { citationIssues } from './citations';
import { bookCitationContexts, needsCitationContext } from '../citations/context';
import { duplicateAnchors } from './anchors';
import type { ContentBlock } from '../parse';
import { KNOWN_CONTAINERS, KNOWN_DIRECTIVES, parseInlineSnippetSpans, parseMarkdownMemo } from '../parse';
import { invalidAttributeKeys } from '../parse/attrs';
import { parsePaperAttrs } from './paper';
import { extractFrontmatter } from '../frontmatter';
import { tableGridIssues } from '../table/model';
import type { PostextConfig, Resource } from '../types';
import type { ConfigWarning, ContentWarning, LayoutWarning, RenderWarning, VDTDesignSlot, VDTDocument } from '../vdt';
import type { HeadingDesignCut } from './headingDesignCuts';
import { DEFAULT_CHIP_STYLES } from '../defaults/chipStyles';
import { DEFAULT_PARAGRAPH_STYLES } from '../defaults/paragraphStyles';
import { DEFAULT_HEADING_STYLES } from '../defaults/headingStyles';
import { resolveAllConfig } from './config';
import { planHeadingSections, sectionWritingMode } from './headingStyles';

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
  const inline = /:(?:ref|swatch|index)\{([^}\n]*)\}|:(?:chip|index)\[(?:\\.|[^\]\\\n])*\]\{([^}\n]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = inline.exec(line)) !== null) {
    const blob = m[1] ?? m[2]!;
    out.push({ blob, at: m.index + m[0].length - 1 - blob.length });
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
  let body = markdown;
  let offset = 0;
  try {
    const fm = extractFrontmatter(markdown);
    body = fm.content;
    offset = fm.contentOffset;
  } catch {
    // Malformed frontmatter: the build reports it; scan the text as is.
  }
  const blocks = parseMarkdownMemo(body);
  const out: ContentWarning[] = [];
  const abs = (r: SourceRange) => ({ sourceStart: r.start + offset, sourceEnd: r.end + offset });

  const byId = new Map<string, Resource>();
  for (const r of resources) if (!byId.has(r.id)) byId.set(r.id, r);
  const anchors = new Set(bookAnchors);
  for (const b of blocks) {
    if (b.type === 'heading' && b.attrs?.id) anchors.add(b.attrs.id);
    for (const m of b.anchorMarks ?? []) anchors.add(m.anchorId);
  }
  const isAnchor = (id: string): boolean => anchors.has(id) || (unprefixedId(id) !== undefined && anchors.has(unprefixedId(id)!));
  // An identifier set twice: a reference reaches the first one only.
  for (const d of duplicateAnchors(blocks)) out.push({ kind: 'duplicateAnchor', anchorId: d.id, ...abs({ start: d.start, end: d.end }) });
  const paragraphStyles = new Set((config?.paragraphStyles ?? DEFAULT_PARAGRAPH_STYLES).map((s) => s.id));
  // With no callout style configured every type is the built-in plain box:
  // a type is only wrong once there are styles to pick from.
  const calloutStyles = new Set((config?.calloutStyles ?? []).map((s) => s.id));
  const chipStyles = new Set((config?.chipStyles ?? DEFAULT_CHIP_STYLES).map((s) => s.id));
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
      const style = span.chip?.style;
      if (style !== undefined && !chipStyles.has(style)) {
        out.push({ kind: 'unknownChipStyle', style, ...abs(inlineRange(body, at, b.sourceEnd)) });
      }
      plain += span.text.length;
    }
    // Index marks that name no term index nothing.
    for (const mark of b.indexMarks ?? []) {
      if (mark.path.length === 0) out.push({ kind: 'indexMarkInvalid', ...abs({ start: mark.sourceStart, end: mark.sourceEnd }) });
    }
  };

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
      case 'paragraph': {
        // A poem's `{style=…}` names a paragraph style (#378): its fence
        // line is the range.
        const verseStyle = b.verse?.attrs.style;
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

  // Citations (#268): keys no reference defines, data that cannot be read.
  let metadata: Record<string, unknown> | undefined;
  try {
    metadata = extractFrontmatter(markdown).metadata as Record<string, unknown>;
  } catch {
    metadata = undefined;
  }
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

/** An `unbreakableWordOverflow` warning for each line holding a word of a
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
        if (!line.wordOverflow || seen.has(line.text)) continue;
        seen.add(line.text);
        out.push({
          kind: 'unbreakableWordOverflow',
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
      if (!line.wordOverflow) continue;
      out.push({
        kind: 'unbreakableWordOverflow',
        text: line.text,
        ...(line.sourceStart !== undefined ? { sourceStart: line.sourceStart } : {}),
        ...(line.sourceEnd !== undefined ? { sourceEnd: line.sourceEnd } : {}),
        ...(block.pageIndex >= 0 ? { pageIndex: block.pageIndex } : {}),
      });
    }
  }
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
    case 'paperAttributeInvalid':
      text = `:::paper ${w.key}="${w.value}" is not a value it reads — dropped, the pages keep the document's paper for it`;
      break;
    case 'unknownChipStyle':
      text = `Unknown chip style "${w.style}"${inRes} — the chip takes the first chip style`;
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
    case 'raggedTableGrid':
      text = w.reason === 'spanOverlap'
        ? `Table "${w.resourceId}": the cell at row ${w.row + 1}, column ${w.col + 1} sits under a merged cell — keep covered cells with hiddenBy (mergeCells) or the cells shift`
        : `Table "${w.resourceId}": row ${w.row + 1} has no cell from column ${w.col + 1} on — the grid has a hole`;
      if (w.count > 1) text += ` (${w.count} issues)`;
      break;
    case 'missingImage':
      text = `No image for file "${w.fileId}"${w.resourceId !== undefined ? ` (resource "${w.resourceId}")` : ''} — painted as a placeholder`;
      break;
    case 'cjkLooseLine':
      text = `The justified line "${w.text}" needs more space between its characters than the cap allows — it is set short of the measure`;
      break;
    case 'unbreakableWordOverflow':
      text = `The line "${w.text}" holds an Arabic-script word wider than the line — such a word is never divided, so it runs past the measure`;
      break;
    case 'joiningScriptLetterSpacing':
      text = `"${w.text}": its style sets letter-spacing, which Arabic-script words do not take (it breaks their joins) — they are set without it`;
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
    case 'cjkGridClamped':
      text = `${w.path}: ${w.value} ${w.path.endsWith('charsPerLine') ? 'characters per line' : 'lines'} do not fit inside the margins — the grid is set with ${w.used}`;
      break;
    default:
      // A kind this build does not know (a VDT from a newer engine).
      text = `Warning "${(w as { kind: string }).kind}"`;
  }
  return text + where(w);
}
