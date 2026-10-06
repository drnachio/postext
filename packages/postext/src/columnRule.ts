import type { VDTColumn, VDTColumnRule, VDTDocument, VDTFootnoteArea, VDTPage } from './vdt';
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
 * columns. Full-width `kind: 'span'` columns (page-span blocks) never take
 * part, so the rule stops at a span block and resumes with the next band
 * — the ruling a compositor would draw. Under a page-span heading's opener
 * band it starts where the text does. A gutter between two columns that
 * hold nothing (a band closed before any text landed, the empty columns
 * left beside a closing page's text) is not ruled; a zero-height column
 * (one a float filled) still bounds its gutters, which then run the length
 * of its neighbour — beside the float, never through it (#505). Bands are
 * visited in column order, which is band order because bands are always
 * appended.
 */
export function columnRuleSegments(
  columns: readonly VDTColumn[],
  /** The page's footnote areas: the rule runs on beside the notes set at a
   *  column's foot (which the column's box no longer covers). */
  footnoteAreas?: readonly VDTFootnoteArea[],
): ColumnRuleSegment[] {
  const footOf = (col: VDTColumn): number => {
    let bottom = col.bbox.y + col.bbox.height;
    for (const a of footnoteAreas ?? []) {
      if (a.columnIndex === col.index) bottom = Math.max(bottom, a.bbox.y + a.bbox.height);
    }
    return bottom;
  };
  const byBand = new Map<number, VDTColumn[]>();
  for (const col of columns) {
    if (col.kind === 'span') continue;
    const band = col.band ?? 0;
    const list = byBand.get(band);
    if (list) list.push(col);
    else byBand.set(band, [col]);
  }
  const tall = (col: VDTColumn): boolean => col.bbox.height > 0.5;
  // A page with no text at all (a blank page) keeps its rules, as it did.
  const anyText = columns.some((c) => c.kind !== 'span' && c.blocks.length > 0);
  const empty = (col: VDTColumn): boolean => col.kind !== 'side' && col.blocks.length === 0;
  const segments: ColumnRuleSegment[] = [];
  for (const cols of byBand.values()) {
    // Reading order is not always geometric order (a side column at the
    // left of the main column): rule the gutters from left to right.
    cols.sort((a, b) => a.bbox.x - b.bbox.x);
    for (let i = 0; i < cols.length - 1; i++) {
      const a = cols[i]!;
      const b = cols[i + 1]!;
      if (!tall(a) && !tall(b)) continue;
      // Two columns of nothing beside a page's text (a side column of
      // floats, which holds no blocks, still rules its gutter).
      if (anyText && empty(a) && empty(b)) continue;
      const extent = [a, b].filter(tall);
      segments.push({
        x: (a.bbox.x + a.bbox.width + b.bbox.x) / 2,
        top: Math.min(...extent.map(ruleTop)),
        bottom: Math.max(...extent.map(footOf)),
      });
    }
  }
  return segments;
}

/** A horizontal footnote separator rule: its left end, the y of its centre
 *  line, length, thickness (px) and colour. */
export interface FootnoteRuleSegment {
  x: number;
  y: number;
  width: number;
  lineWidthPx: number;
  color: string;
}

/** The footnote separator rules of a page (one per column holding notes). */
export function footnoteRuleSegments(page: Pick<VDTPage, 'footnoteAreas'>): FootnoteRuleSegment[] {
  const out: FootnoteRuleSegment[] = [];
  for (const area of page.footnoteAreas ?? []) if (area.rule) out.push(area.rule);
  return out;
}
