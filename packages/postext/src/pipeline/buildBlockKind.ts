import { flattenTitleBreaks, flattenTitleBreakSpans } from '../parse/inlineFormatting';
/**
 * Resolve a parsed markdown block into its placement-ready metadata:
 * style, VDT type, heading/list attributes, and a `contentBlock` that may
 * differ from `rawBlock` when a heading numbering prefix has been prepended.
 */

import type { ContentBlock, InlineSpan, ListKind } from '../parse';
import type { Resource, ResourceType } from '../types';
import type { ResolvedConfig, VDTBlock } from '../vdt';
import { dimensionToPx } from '../units';
import type { BlockStyle } from './styles';
import { resolveHeadingStyle, resolveMathDisplayStyle, resolveParagraphStyle } from './styles';
import type { ListBulletStyle, ListItemResolved, OrderedListMetrics } from './lists';
import type { HeadingLevelResolver } from './headingStyles';
import { lengthAttr } from './verse';
import { verseLinesSettings, versesLineByLine } from './verseLines';
import {
  resolveOrderedListItemStyle,
  resolveUnorderedListItemStyle,
} from './lists';

export interface BlockKind {
  style: BlockStyle;
  vdtType: VDTBlock['type'];
  headingLevel?: number;
  numberPrefix?: string;
  /** What joins the number to the title, when it is not one space (see
   *  `VDTBlock.numberSeparator`). */
  numberSeparator?: string;
  /** A numbered heading's counter value (see `VDTBlock.headingNumber`). */
  headingNumber?: number;
  contentBlock: ContentBlock;
  listBullet?: ListBulletStyle;
  listDepth?: number;
  listKind?: ListKind;
  bulletXOffsetInColumn: number;
  strikethroughText: boolean;
  /** For `resource` blocks: the resolved `Resource` referenced by the
   *  `::resource{id=…}` directive, or undefined when the id is unknown. */
  resource?: Resource;
  /** For `resource` blocks: the `ResourceType` of the resolved resource. */
  resourceType?: ResourceType;
  /** For `resource` blocks: the computed number string (e.g. `"1.7"`). */
  resourceNumber?: string;
}

export interface BlockKindContext {
  resolved: ResolvedConfig;
  bodyStyle: BlockStyle;
  blockquoteStyle: BlockStyle;
  headingPrefixes: Array<string | undefined>;
  /** Counter value of every numbered heading, by block index. */
  headingNumbers?: Array<number | undefined>;
  blockIdx: number;
  listLevelIndentsPx: number[];
  orderedLevelIndentsPx: number[];
  orderedMetrics: OrderedListMetrics;
  /** Resource lookup by id (for resolving `::resource{id=…}` blocks). */
  resourceById: Map<string, Resource>;
  /** Resource-type lookup by id. */
  resourceTypeById: Map<string, ResourceType>;
  /** Computed resource number strings keyed by resource id. */
  resourceNumberById: Map<string, string>;
  /** Style forced onto `paragraph` blocks by an enclosing `:::paragraphs`
   *  container; the body style applies when unset. */
  paragraphStyleOverride?: BlockStyle;
  /** Level configs with heading-style overrides merged in; the plain level
   *  lookup applies when unset. */
  headingLevels?: HeadingLevelResolver;
}

/** A heading's own `{indent=N}` (字下げ, #467) over its level's or style's
 *  `indent`: counted in body characters as the level's is (JLReq §4.1.3
 *  sets headings 4, 6 or 8 字 down by level, and Aozora records each
 *  heading's own: ［＃５字下げ］一), so a bare number and `em` are body
 *  ems; `0` sets the heading at the line start.
 *  Anything that is not a length leaves the level's indent as it is. */
export function withHeadingIndentAttr(style: BlockStyle, value: string | undefined, resolved: ResolvedConfig): BlockStyle {
  if (value === undefined) return style;
  const dpi = resolved.page.dpi;
  const indentPx = lengthAttr(value, dpi, dimensionToPx(resolved.bodyText.fontSize, dpi));
  if (indentPx === undefined || !Number.isFinite(indentPx)) return style;
  if (indentPx > 0) return { ...style, indentPx };
  if (style.indentPx === undefined) return style;
  const { indentPx: _cleared, ...rest } = style;
  void _cleared;
  return rest;
}

/** Upper-case `text` one UTF-16 code unit at a time, keeping any character
 *  whose upper-case form is not exactly one code unit (`ß` → `SS`, ligatures)
 *  so the result has the same length as the input and per-character source
 *  maps remain valid. */
export function uppercasePreservingLength(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const up = ch.toLocaleUpperCase();
    out += up.length === 1 ? up : ch;
  }
  return out;
}

/** A span in capitals for a paragraph style's `textTransform`, the words
 *  of a chip included; maths as it is. */
function uppercaseSpan(span: InlineSpan): InlineSpan {
  if (span.math) return span;
  return {
    ...span,
    text: uppercasePreservingLength(span.text),
    ...(span.chip ? { chip: { ...span.chip, spans: span.chip.spans.map(uppercaseSpan) } } : {}),
  };
}

export function resolveBlockKind(
  rawBlock: ContentBlock,
  ctx: BlockKindContext,
): BlockKind {
  const { resolved, bodyStyle, blockquoteStyle, headingPrefixes, blockIdx,
    listLevelIndentsPx, orderedLevelIndentsPx, orderedMetrics,
    resourceById, resourceTypeById, resourceNumberById, paragraphStyleOverride } = ctx;

  switch (rawBlock.type) {
    case 'resourceBlock': {
      const resource = rawBlock.resourceId ? resourceById.get(rawBlock.resourceId) : undefined;
      const resourceType = resource ? resourceTypeById.get(resource.typeId) : undefined;
      const resourceNumber = rawBlock.resourceId ? resourceNumberById.get(rawBlock.resourceId) : undefined;
      return {
        style: bodyStyle,
        vdtType: 'resource',
        contentBlock: rawBlock,
        bulletXOffsetInColumn: 0,
        strikethroughText: false,
        resource,
        resourceType,
        resourceNumber: resourceNumber ?? '',
      };
    }
    case 'heading': {
      const level = rawBlock.level ?? 1;
      const levelCfg = ctx.headingLevels?.forBlock(rawBlock) ?? resolved.headings.levels.find((l) => l.level === level);
      const style = withHeadingIndentAttr(
        resolveHeadingStyle(level, resolved, levelCfg, rawBlock.spans.some((s) => s.bold)),
        rawBlock.attrs?.indent, resolved,
      );
      const numberPrefix = headingPrefixes[blockIdx];
      const headingNumber = ctx.headingNumbers?.[blockIdx];
      let contentBlock: ContentBlock = rawBlock;
      // Letter-case transform on the title text (the numbering prefix, added
      // below, is kept as written). Length-preserving so `sourceMap` stays 1:1.
      if (levelCfg?.textTransform === 'uppercase') {
        contentBlock = {
          ...contentBlock,
          text: uppercasePreservingLength(contentBlock.text),
          spans: contentBlock.spans.map((s) => (s.math ? s : { ...s, text: uppercasePreservingLength(s.text) })),
        };
      }
      // Forced title breaks render as spaces in the column; opener designs
      // re-insert them from `titleBreaks` (see flattenTitleBreaks).
      if (contentBlock.titleBreaks && contentBlock.titleBreaks.length > 0) {
        contentBlock = {
          ...contentBlock,
          text: flattenTitleBreaks(contentBlock.text),
          spans: flattenTitleBreakSpans(contentBlock.text, contentBlock.spans),
        };
      }
      const numberSeparator = levelCfg?.numberSeparator ?? ' ';
      // The number standing for the title (`numberPosition: 'replace'`): the
      // heading's text, set like a title, not a prefix (#401).
      if (numberPrefix && rawBlock.numberIsTitle) {
        return {
          style,
          vdtType: 'heading',
          headingLevel: rawBlock.level,
          ...(headingNumber !== undefined ? { headingNumber } : {}),
          contentBlock: { ...contentBlock, text: numberPrefix, spans: [{ text: numberPrefix, bold: false, italic: false }] },
          bulletXOffsetInColumn: 0,
          strikethroughText: false,
        };
      }
      if (numberPrefix) {
        const sep = `${numberPrefix}${numberSeparator}`;
        const firstSpan = contentBlock.spans[0];
        // A title that opens with a marked run (EF-122) keeps the number in
        // the heading's own style: the number is a span of its own.
        const marked = firstSpan && (firstSpan.bold || firstSpan.italic || firstSpan.script || firstSpan.smallCaps || firstSpan.links);
        const newSpans = !firstSpan
          ? [{ text: sep, bold: false, italic: false }]
          : marked
            ? [{ text: sep, bold: false, italic: false }, ...contentBlock.spans]
            : [{ ...firstSpan, text: sep + firstSpan.text }, ...contentBlock.spans.slice(1)];
        contentBlock = { ...contentBlock, text: sep + contentBlock.text, spans: newSpans };
      }
      return {
        style,
        vdtType: 'heading',
        headingLevel: rawBlock.level,
        numberPrefix,
        ...(numberPrefix && numberSeparator !== ' ' ? { numberSeparator } : {}),
        ...(headingNumber !== undefined ? { headingNumber } : {}),
        contentBlock,
        bulletXOffsetInColumn: 0,
        strikethroughText: false,
      };
    }
    case 'blockquote':
      return {
        style: blockquoteStyle,
        vdtType: 'blockquote',
        contentBlock: rawBlock,
        bulletXOffsetInColumn: 0,
        strikethroughText: false,
      };
    case 'mathDisplay':
      return {
        style: resolveMathDisplayStyle(resolved),
        vdtType: 'mathDisplay',
        contentBlock: rawBlock,
        bulletXOffsetInColumn: 0,
        strikethroughText: false,
      };
    case 'listItem': {
      const depth = rawBlock.depth ?? 1;
      const kind: ListKind = rawBlock.listKind ?? 'unordered';
      let resolvedList: ListItemResolved;
      if (kind === 'ordered') {
        const metric =
          orderedMetrics.perBlock.get(blockIdx) ??
          { numberText: '', numberWidthPx: 0, maxNumberWidthPx: 0 };
        resolvedList = resolveOrderedListItemStyle(depth, resolved, orderedLevelIndentsPx, metric);
      } else {
        resolvedList = resolveUnorderedListItemStyle(
          depth,
          resolved,
          listLevelIndentsPx,
          rawBlock.checked ?? false,
          kind === 'task',
        );
      }
      return {
        style: resolvedList.text,
        vdtType: 'listItem',
        contentBlock: rawBlock,
        listBullet: resolvedList.bullet,
        listDepth: depth,
        listKind: kind,
        bulletXOffsetInColumn: resolvedList.bulletXOffsetInColumn,
        strikethroughText: resolvedList.strikethroughText,
      };
    }
    default: {
      const base = rawBlock.type === 'paragraph' && paragraphStyleOverride ? paragraphStyleOverride : bodyStyle;
      // A poem (#378): its fence's paragraph style (`{style=…}`) gives its
      // face, size and leading; its lines are set by `pipeline/verse.ts`,
      // flush left with final widths, never indented or hyphenated.
      // A poem in the line layout (#620) keeps the style's indent, and each
      // stanza takes the poem's margins or the space between stanzas.
      const verseStyle = rawBlock.verse ? verseStyleOf(rawBlock.verse.attrs.style, resolved) ?? base : undefined;
      const style = !rawBlock.verse || !verseStyle ? base
        : versesLineByLine(rawBlock, resolved) ? verseStanzaStyle(verseStyle, rawBlock, resolved)
          : stanzaMargins(verseBlockStyle(verseStyle), rawBlock, 0);
      // A paragraph style's `textTransform` (EF-173), length-preserving as
      // a heading's, so the source map stays 1:1. Maths is left alone; the
      // words of a chip are set in capitals too (a `:ref` label is, once
      // resolved, in `measureContentBlock`).
      const contentBlock: ContentBlock = style.uppercase
        ? {
            ...rawBlock,
            text: uppercasePreservingLength(rawBlock.text),
            spans: rawBlock.spans.map(uppercaseSpan),
          }
        : rawBlock;
      return {
        style,
        vdtType: 'paragraph',
        contentBlock,
        bulletXOffsetInColumn: 0,
        strikethroughText: false,
      };
    }
  }
}

/** Paragraph styles resolved for poems, by config (`{style=…}` on a
 *  `:::verse` fence). */
const verseStyles = new WeakMap<ResolvedConfig, Map<string, BlockStyle | null>>();

/** The paragraph style a poem's fence names, or undefined when it names
 *  none or one the config does not have (the poem keeps the text's). Its
 *  `marginTop` and `marginBottom` are the space above and below the poem. */
function verseStyleOf(id: string | undefined, resolved: ResolvedConfig): BlockStyle | undefined {
  const key = id?.trim();
  if (!key) return undefined;
  let byId = verseStyles.get(resolved);
  if (!byId) verseStyles.set(resolved, byId = new Map());
  let style = byId.get(key);
  if (style === undefined) {
    const cfg = resolved.paragraphStyles.find((s) => s.id === key);
    if (cfg) {
      // A poem is one block: the style's container margins are its own,
      // above and below (as a `:::paragraphs` group of one entry).
      const base = resolveParagraphStyle(cfg, resolved);
      const dpi = resolved.page.dpi;
      const marginBottomPx = dimensionToPx(cfg.marginBottom, dpi, base.fontSizePx);
      style = {
        ...base,
        marginTopPx: dimensionToPx(cfg.marginTop, dpi, base.fontSizePx),
        marginBottomPx: marginBottomPx < 0 ? marginBottomPx : Math.max(base.marginBottomPx, marginBottomPx),
      };
    } else {
      style = null;
    }
    byId.set(key, style);
  }
  return style ?? undefined;
}

/** The space a poem's paragraph style asks above it (0 without one). */
export function verseMarginTopPx(styleId: string | undefined, resolved: ResolvedConfig): number {
  return verseStyleOf(styleId, resolved)?.marginTopPx ?? 0;
}

/** A stanza's margins (#620): the poem's above the first and below the
 *  last, `betweenPx` between two. A poem in the bayt layout is one block,
 *  which keeps both. */
function stanzaMargins(style: BlockStyle, raw: ContentBlock, betweenPx: number): BlockStyle {
  const stanza = raw.verse?.stanza;
  if (!stanza) return style;
  return {
    ...style,
    marginTopPx: stanza.index === 0 ? style.marginTopPx : 0,
    marginBottomPx: stanza.last ? style.marginBottomPx : betweenPx,
  };
}

/** A stanza's block style in the line layout (#620): flush left (its lines
 *  carry their own geometry), the style's `indent` and `endIndent` kept,
 *  no first-line or hanging indent (`pipeline/verseLines.ts` sets the
 *  turnovers), hyphenated only when the poem's paragraph style sets
 *  `hyphenation: true` itself. */
function verseStanzaStyle(style: BlockStyle, raw: ContentBlock, resolved: ResolvedConfig): BlockStyle {
  const { hyphenationZonePx: _zone, hangingIndentPx: _hang, ...rest } = style;
  void _zone;
  void _hang;
  const id = raw.verse?.attrs.style?.trim();
  const own = !!id && resolved.paragraphStyles.find((s) => s.id === id)?.ownHyphenation === true;
  const zone = own ? Math.max(0, dimensionToPx(resolved.bodyText.hyphenation.zone, resolved.page.dpi, style.fontSizePx)) : undefined;
  const settings = verseLinesSettings(raw.verse!.attrs, style, resolved, false);
  return stanzaMargins({
    ...rest,
    textAlign: 'left',
    hyphenate: own,
    ...(zone !== undefined ? { hyphenationZonePx: zone } : {}),
    firstLineIndentPx: 0,
    hangingIndent: false,
  }, raw, settings.stanzaSpacePx);
}

/** A poem's block style: flush left (its lines carry their own geometry),
 *  no indent, no hyphenation. */
function verseBlockStyle(style: BlockStyle): BlockStyle {
  const { hyphenationZonePx: _zone, indentPx: _indent, endIndentPx: _endIndent, ...rest } = style;
  void _zone;
  void _indent;
  void _endIndent;
  return { ...rest, textAlign: 'left', hyphenate: false, firstLineIndentPx: 0, hangingIndent: false };
}
