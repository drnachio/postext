/**
 * Resolve a parsed markdown block into its placement-ready metadata:
 * style, VDT type, heading/list attributes, and a `contentBlock` that may
 * differ from `rawBlock` when a heading numbering prefix has been prepended.
 */

import type { ContentBlock, ListKind } from '../parse';
import type { Resource, ResourceType } from '../types';
import type { ResolvedConfig, VDTBlock } from '../vdt';
import type { BlockStyle } from './styles';
import { resolveHeadingStyle, resolveMathDisplayStyle } from './styles';
import type { ListBulletStyle, ListItemResolved, OrderedListMetrics } from './lists';
import {
  resolveOrderedListItemStyle,
  resolveUnorderedListItemStyle,
} from './lists';

export interface BlockKind {
  style: BlockStyle;
  vdtType: VDTBlock['type'];
  headingLevel?: number;
  numberPrefix?: string;
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
}

export function resolveBlockKind(
  rawBlock: ContentBlock,
  ctx: BlockKindContext,
): BlockKind {
  const { resolved, bodyStyle, blockquoteStyle, headingPrefixes, blockIdx,
    listLevelIndentsPx, orderedLevelIndentsPx, orderedMetrics,
    resourceById, resourceTypeById, resourceNumberById } = ctx;

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
      const style = resolveHeadingStyle(rawBlock.level ?? 1, resolved);
      const numberPrefix = headingPrefixes[blockIdx];
      let contentBlock: ContentBlock = rawBlock;
      if (numberPrefix) {
        const sep = `${numberPrefix} `;
        const firstSpan = rawBlock.spans[0];
        const newSpans = firstSpan
          ? [{ text: sep + firstSpan.text, bold: firstSpan.bold, italic: firstSpan.italic }, ...rawBlock.spans.slice(1)]
          : [{ text: sep, bold: false, italic: false }];
        contentBlock = { ...rawBlock, text: sep + rawBlock.text, spans: newSpans };
      }
      return {
        style,
        vdtType: 'heading',
        headingLevel: rawBlock.level,
        numberPrefix,
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
    default:
      return {
        style: bodyStyle,
        vdtType: 'paragraph',
        contentBlock: rawBlock,
        bulletXOffsetInColumn: 0,
        strikethroughText: false,
      };
  }
}
