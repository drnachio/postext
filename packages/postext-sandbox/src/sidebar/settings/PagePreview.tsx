'use client';

import { useId } from 'react';
import type { ResolvedLayoutConfig, ResolvedPageConfig } from 'postext';
import { toPt } from '../../controls/units';

export type PagePreviewHighlight = 'top' | 'bottom' | 'inner' | 'outer' | 'gutter' | null;

interface PagePreviewProps {
  /** The page, its `binding` resolved (`resolvePageConfig` with the
   *  document's writing mode). */
  page: ResolvedPageConfig;
  /** The columns, and `writingMode`: a vertical page draws its text as
   *  vertical lines filled from the right, its columns as tiers. */
  layout: ResolvedLayoutConfig;
  /** Leading of the body text, in pt: spacing of the drawn text lines. */
  lineHeightPt: number;
  /** Colour of the drawn text lines (the body text colour). */
  inkHex: string;
  /** Height of the drawing in CSS px; the width follows the page shape. */
  height?: number;
  /** Tint one margin (or the gutter) while its field is being edited. */
  highlight?: PagePreviewHighlight;
  /** Number the pages of a spread (large drawings only: a thumbnail's
   *  folios would be specks). */
  folios?: boolean;
  className?: string;
}

/** Schematic of the page as configured: true proportions, margins, columns
 *  and gutter, drawn in the page's own background and text colours. A
 *  two-page spread when margins mirror (inner margins meeting at the
 *  spine), with its folios: 2 | 3 in a book bound on the left, 3 | 2 in one
 *  bound on the right, whose odd page is the left one. Vertical text is
 *  drawn as vertical lines from the right, its columns as tiers stacked
 *  top to bottom. Decorative for screen readers — every number it shows is
 *  a field. */
export function PagePreview({ page, layout, lineHeightPt, inkHex, height = 120, highlight = null, folios = false, className }: PagePreviewProps) {
  // A plain-ASCII id: it goes into a `url(#…)` reference.
  const patternId = `pp${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const w = Math.max(toPt(page.width), 1);
  const h = Math.max(toPt(page.height), 1);
  const m = {
    top: toPt(page.margins.top),
    bottom: toPt(page.margins.bottom),
    // With mirroring off, "left"/"right" are fixed sides; drawn as the
    // inner/outer of a page whose spine is on its left.
    inner: toPt(page.margins.left),
    outer: toPt(page.margins.right),
  };
  const mirror = page.margins.mirror ?? false;
  const vertical = layout.writingMode === 'vertical-rl';
  const rightBound = page.binding === 'right';
  const gap = w * 0.04;
  const totalW = mirror ? w * 2 + gap : w;
  // Real leading when the drawing is large; never more than ~36 lines a
  // page, or the lines blur into a grey block at thumbnail size.
  const lead = Math.max(lineHeightPt, (vertical ? w : h) / 36);
  const paper = page.backgroundColor.hex && page.backgroundColor.hex !== 'transparent' ? page.backgroundColor.hex : '#ffffff';
  const hl = 'color-mix(in srgb, var(--brand) 38%, transparent)';
  const folioSize = Math.min(Math.max(m.bottom * 0.42, h * 0.018), h * 0.032);

  /** One page at `x`; `spineLeft`: its spine (inner margin) is on its left. */
  const drawPage = (x: number, spineLeft: boolean, folio?: number) => {
    const left = spineLeft ? m.inner : m.outer;
    const right = spineLeft ? m.outer : m.inner;
    const tx = x + left;
    const ty = m.top;
    const tw = Math.max(w - left - right, 1);
    const th = Math.max(h - m.top - m.bottom, 1);
    const innerX = spineLeft ? x : x + w - m.inner;
    const outerX = spineLeft ? x + w - m.outer : x;
    // Columns across the type area; in vertical text, tiers down it.
    const cols = vertical ? tiersOf(layout, th) : columnsOf(layout, tw, spineLeft);
    const rects = cols.map((c) => (vertical
      ? { x: tx, y: ty + c.x, w: tw, h: c.w, side: c.side }
      : { x: tx + c.x, y: ty, w: c.w, h: th, side: c.side }));
    const first = rects[0];
    const second = rects[1];
    // Vertical lines start at the right edge of the type area.
    const fill = vertical ? `${patternId}${spineLeft ? 'r' : 'l'}` : patternId;
    return (
      <g key={x}>
        {vertical && (
          <defs>
            <pattern id={fill} width={lead} height={h} patternUnits="userSpaceOnUse" patternTransform={`translate(${(tx + tw) % lead} 0)`}>
              <rect x={lead * 0.29} y={0} width={lead * 0.42} height={h} fill={inkHex} opacity={0.32} />
            </pattern>
          </defs>
        )}
        <rect x={x} y={0} width={w} height={h} fill={paper} stroke="var(--rule-strong, var(--slate))" strokeWidth={w / 180} />
        {highlight === 'top' && <rect x={x} y={0} width={w} height={m.top} fill={hl} />}
        {highlight === 'bottom' && <rect x={x} y={h - m.bottom} width={w} height={m.bottom} fill={hl} />}
        {highlight === 'inner' && <rect x={innerX} y={0} width={m.inner} height={h} fill={hl} />}
        {highlight === 'outer' && <rect x={outerX} y={0} width={m.outer} height={h} fill={hl} />}
        {rects.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#${fill})`} opacity={r.side ? 0.45 : 1} />
        ))}
        {highlight === 'gutter' && first && second && (vertical
          ? <rect x={tx} y={first.y + first.h} width={tw} height={second.y - first.y - first.h} fill={hl} />
          : <rect x={first.x + first.w} y={ty} width={second.x - first.x - first.w} height={th} fill={hl} />)}
        {layout.columnRule.enabled && first && second && (vertical ? (
          <line
            x1={tx}
            x2={tx + tw}
            y1={(first.y + first.h + second.y) / 2}
            y2={(first.y + first.h + second.y) / 2}
            stroke={inkHex}
            strokeOpacity={0.5}
            strokeWidth={w / 300}
          />
        ) : (
          <line
            x1={(first.x + first.w + second.x) / 2}
            x2={(first.x + first.w + second.x) / 2}
            y1={ty}
            y2={ty + th}
            stroke={inkHex}
            strokeOpacity={0.5}
            strokeWidth={w / 300}
          />
        ))}
        {folios && folio !== undefined && (
          <text
            x={spineLeft ? x + w - m.outer : x + m.outer}
            y={h - m.bottom / 2 + folioSize * 0.35}
            fontSize={folioSize}
            textAnchor={spineLeft ? 'end' : 'start'}
            fill={inkHex}
            fillOpacity={0.6}
            fontFamily="system-ui, sans-serif"
          >
            {folio}
          </text>
        )}
      </g>
    );
  };

  // The left page of a spread has its spine on its right. It is the even
  // page (the verso) of a book bound on the left, the odd one (the recto)
  // of a book bound on the right.
  const pages = mirror
    ? [drawPage(0, false, rightBound ? 3 : 2), drawPage(w + gap, true, rightBound ? 2 : 3)]
    : drawPage(0, true);

  return (
    <svg
      viewBox={`0 0 ${totalW} ${h}`}
      height={height}
      width={(height * totalW) / h}
      aria-hidden="true"
      className={className}
      style={{ overflow: 'visible', display: 'block' }}
    >
      {!vertical && (
        <defs>
          <pattern id={patternId} width={w} height={lead} patternUnits="userSpaceOnUse">
            <rect x={0} y={lead * 0.3} width={w} height={lead * 0.42} fill={inkHex} opacity={0.32} />
          </pattern>
        </defs>
      )}
      {pages}
    </svg>
  );
}

interface Col { x: number; w: number; side?: boolean }

function columnsOf(layout: ResolvedLayoutConfig, tw: number, spineLeft: boolean): Col[] {
  const g = toPt(layout.gutterWidth);
  if (layout.layoutType === 'double') {
    const cw = Math.max((tw - g) / 2, 1);
    return [{ x: 0, w: cw }, { x: cw + g, w: cw }];
  }
  if (layout.layoutType === 'oneAndHalf') {
    const sw = Math.max(((tw - g) * layout.sideColumnPercent) / 100, 1);
    const mw = Math.max(tw - g - sw, 1);
    const sideOnRight =
      layout.sideColumnSide === 'right' ||
      (layout.sideColumnSide === 'outer' && spineLeft) ||
      (layout.sideColumnSide === 'inner' && !spineLeft);
    return sideOnRight
      ? [{ x: 0, w: mw }, { x: mw + g, w: sw, side: true }]
      : [{ x: 0, w: sw, side: true }, { x: sw + g, w: mw }];
  }
  return [{ x: 0, w: tw }];
}

/** The columns of a vertical page are tiers down the type area (`x` and
 *  `w` along its height). A tier has no outer edge: the side column's
 *  `'left'` and `'inner'` put it in the top tier, `'right'` and `'outer'`
 *  in the bottom one, as the engine reads them. */
function tiersOf(layout: ResolvedLayoutConfig, th: number): Col[] {
  const g = toPt(layout.gutterWidth);
  if (layout.layoutType === 'double') {
    const cw = Math.max((th - g) / 2, 1);
    return [{ x: 0, w: cw }, { x: cw + g, w: cw }];
  }
  if (layout.layoutType === 'oneAndHalf') {
    const sw = Math.max(((th - g) * layout.sideColumnPercent) / 100, 1);
    const mw = Math.max(th - g - sw, 1);
    const sideBelow = layout.sideColumnSide === 'right' || layout.sideColumnSide === 'outer';
    return sideBelow
      ? [{ x: 0, w: mw }, { x: mw + g, w: sw, side: true }]
      : [{ x: 0, w: sw, side: true }, { x: sw + g, w: mw }];
  }
  return [{ x: 0, w: th }];
}
