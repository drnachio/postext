/**
 * Page role classification. Runs once after placement (at the top of
 * `buildHeadersAndFooters`) and stamps `page.role` so design slots can filter
 * elements per page kind (`DesignElement.pages`).
 *
 * Roles, in precedence order:
 *  - `'blank'`  — parity / force-blank padding pages;
 *  - `'part'`   — part-divider pages (`page.partInfo` set), even when the
 *                 body column is empty (the opener design is the content);
 *  - `'blank'`  — any other page with no content at all (no column blocks
 *                 and no floats);
 *  - `'opener'` — the first block in reading order is a heading whose level
 *                 spans the page or forces a page break before it: the
 *                 first page of a chapter;
 *  - `'body'`   — everything else.
 */

import type { PageRole } from '../types';
import type { ResolvedConfig, VDTBlock, VDTDocument, VDTPage } from '../vdt';
import { buildHeadingLevelMap } from './config';

/** First block of the page in reading order (columns in index order), or
 *  `undefined` when the page holds no column content. */
function firstBlockInReadingOrder(page: VDTPage): VDTBlock | undefined {
  for (const col of page.columns) {
    if (col.blocks.length > 0) return col.blocks[0];
  }
  return undefined;
}

function pageIsEmpty(page: VDTPage): boolean {
  if (page.floats && page.floats.length > 0) return false;
  return page.columns.every((c) => c.blocks.length === 0);
}

/** Classify one page. Pure — does not mutate the page. */
export function classifyPage(page: VDTPage, resolved: ResolvedConfig): PageRole {
  if (page.blankForParity || page.blankForForce) return 'blank';
  if (page.partInfo) return 'part';
  if (pageIsEmpty(page)) return 'blank';
  const first = firstBlockInReadingOrder(page);
  if (first && first.type === 'heading' && first.headingLevel !== undefined) {
    const level = buildHeadingLevelMap(resolved).get(first.headingLevel);
    if (level && (level.span === 'page' || level.breakBefore.enabled)) return 'opener';
  }
  return 'body';
}

/** Stamp `page.role` on every page of `doc`. */
export function classifyPages(doc: VDTDocument, resolved: ResolvedConfig = doc.config): void {
  for (const page of doc.pages) {
    page.role = classifyPage(page, resolved);
  }
}
