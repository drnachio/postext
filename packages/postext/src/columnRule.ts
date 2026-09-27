import type { VDTColumn, VDTColumnRule, VDTDocument, VDTPage } from './vdt';
import { dimensionToPx } from './units';

/** The column rule `page` draws: its own (a styled section's, see
 *  `VDTPage.columnRule`), else the document's `layout.columnRule`. Shared
 *  by the canvas and PDF backends. */
export function pageColumnRule(page: Pick<VDTPage, 'columnRule'>, doc: Pick<VDTDocument, 'config'>): VDTColumnRule {
  if (page.columnRule) return page.columnRule;
  const rule = doc.config.layout.columnRule;
  return { enabled: rule.enabled, color: rule.color.hex, lineWidthPx: dimensionToPx(rule.lineWidth, doc.config.page.dpi) };
}

/** One vertical rule segment between two adjacent text columns of a band. */
export interface ColumnRuleSegment {
  /** Horizontal centre of the gutter. */
  x: number;
  top: number;
  bottom: number;
}

/** Where the rule of a column starts: its top, or the foot of the band a
 *  page-span heading holds at its head. That heading stays in the first
 *  column as a hidden block as tall as its band (the opener band paints
 *  it), while the other columns start under the band (EF-101). A
 *  structural heading is hidden too, but takes no room. */
function ruleTop(col: VDTColumn): number {
  let top = col.bbox.y;
  for (const block of col.blocks) {
    if (block.type !== 'heading' || !block.hidden) break;
    top = Math.max(top, block.bbox.y + block.bbox.height);
  }
  return top;
}

/**
 * Compute the column-rule segments of a page: one per gutter between
 * adjacent text columns of the same band, spanning the taller of the two
 * columns. Full-width `kind: 'span'` columns (page-span blocks) and
 * zero-height columns (bands closed before any text landed) never take
 * part, so the rule stops at a span block and resumes with the next band
 * — the ruling a compositor would draw. Under a page-span heading's opener
 * band it starts where the text does. Bands are visited in column order,
 * which is band order because bands are always appended.
 */
export function columnRuleSegments(columns: readonly VDTColumn[]): ColumnRuleSegment[] {
  const byBand = new Map<number, VDTColumn[]>();
  for (const col of columns) {
    if (col.kind === 'span' || col.bbox.height <= 0.5) continue;
    const band = col.band ?? 0;
    const list = byBand.get(band);
    if (list) list.push(col);
    else byBand.set(band, [col]);
  }
  const segments: ColumnRuleSegment[] = [];
  for (const cols of byBand.values()) {
    // Reading order is not always geometric order (a side column at the
    // left of the main column): rule the gutters from left to right.
    cols.sort((a, b) => a.bbox.x - b.bbox.x);
    for (let i = 0; i < cols.length - 1; i++) {
      const left = cols[i]!.bbox;
      const right = cols[i + 1]!.bbox;
      segments.push({
        x: (left.x + left.width + right.x) / 2,
        top: Math.min(ruleTop(cols[i]!), ruleTop(cols[i + 1]!)),
        bottom: Math.max(left.y + left.height, right.y + right.height),
      });
    }
  }
  return segments;
}
