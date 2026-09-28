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

import type { ContentBlock } from '../parse';
import { KNOWN_CONTAINERS, KNOWN_DIRECTIVES, parseInlineSnippetSpans, parseMarkdownMemo } from '../parse';
import { extractFrontmatter } from '../frontmatter';
import { tableGridIssues } from '../table/model';
import type { PostextConfig, Resource } from '../types';
import type { ConfigWarning, ContentWarning, LayoutWarning, RenderWarning, VDTDocument } from '../vdt';
import type { HeadingDesignCut } from './headingDesignCuts';
import { DEFAULT_CHIP_STYLES } from '../defaults/chipStyles';
import { DEFAULT_PARAGRAPH_STYLES } from '../defaults/paragraphStyles';
import { DEFAULT_HEADING_STYLES } from '../defaults/headingStyles';

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
  const paragraphStyles = new Set((config?.paragraphStyles ?? DEFAULT_PARAGRAPH_STYLES).map((s) => s.id));
  // With no callout style configured every type is the built-in plain box:
  // a type is only wrong once there are styles to pick from.
  const calloutStyles = new Set((config?.calloutStyles ?? []).map((s) => s.id));
  const chipStyles = new Set((config?.chipStyles ?? DEFAULT_CHIP_STYLES).map((s) => s.id));
  const headingStyles = new Set((config?.headingStyles ?? DEFAULT_HEADING_STYLES).map((s) => s.id));
  const tableStyles = new Set((config?.tableStyles ?? []).map((s) => s.id));

  /** First embed or reference of every known resource, in reading order. */
  const firstUse = new Map<string, SourceRange>();
  const use = (id: string, range: SourceRange): void => {
    if (byId.has(id) && !firstUse.has(id)) firstUse.set(id, range);
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
        use(span.ref.resourceId, range);
        if (!byId.has(span.ref.resourceId)) {
          out.push({ kind: 'unknownResourceId', resourceId: span.ref.resourceId, usage: 'ref', ...abs(range) });
        }
      }
      const style = span.chip?.style;
      if (style !== undefined && !chipStyles.has(style)) {
        out.push({ kind: 'unknownChipStyle', style, ...abs(inlineRange(body, at, b.sourceEnd)) });
      }
      plain += span.text.length;
    }
  };

  for (const b of blocks) {
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
    case 'malformedEmbed':
      text = `The embed line "::${w.name}" is set as text — write ::resource{id="…"} alone on its line, after a blank line`;
      break;
    case 'unknownParagraphStyle':
      text = `Unknown paragraph style "${w.style}" — the paragraphs are set as body text`;
      break;
    case 'unknownCalloutType':
      text = `Unknown callout type "${w.type}" — the box takes the first callout style`;
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
    case 'unknownHeadingStyle':
      text = `Unknown heading style "${w.style}" on an H${w.level} — the level's own settings apply`;
      break;
    case 'unknownTableStyle':
      text = `Unknown table style "${w.styleId}" on table "${w.resourceId}" — the document's table style applies`;
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
    default:
      // A kind this build does not know (a VDT from a newer engine).
      text = `Warning "${(w as { kind: string }).kind}"`;
  }
  return text + where(w);
}
