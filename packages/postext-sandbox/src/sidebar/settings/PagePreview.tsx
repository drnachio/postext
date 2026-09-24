'use client';

import { useId } from 'react';
import type { ResolvedLayoutConfig, ResolvedPageConfig } from 'postext';
import { toPt } from '../../controls/units';

export type PagePreviewHighlight = 'top' | 'bottom' | 'inner' | 'outer' | 'gutter' | null;

interface PagePreviewProps {
  page: ResolvedPageConfig;
  layout: ResolvedLayoutConfig;
  /** Leading of the body text, in pt: spacing of the drawn text lines. */
  lineHeightPt: number;
  /** Colour of the drawn text lines (the body text colour). */
  inkHex: string;
  /** Height of the drawing in CSS px; the width follows the page shape. */
  height?: number;
  /** Tint one margin (or the gutter) while its field is being edited. */
  highlight?: PagePreviewHighlight;
  className?: string;
}

/** Schematic of the page as configured: true proportions, margins, columns
 *  and gutter, drawn in the page's own background and text colours. A
 *  two-page spread when margins mirror (inner margins meet at the spine).
 *  Decorative for screen readers — every number it shows is a field. */
export function PagePreview({ page, layout, lineHeightPt, inkHex, height = 120, highlight = null, className }: PagePreviewProps) {
  // A plain-ASCII id: it goes into a `url(#…)` reference.
  const patternId = `pp${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const w = Math.max(toPt(page.width), 1);
  const h = Math.max(toPt(page.height), 1);
  const m = {
    top: toPt(page.margins.top),
    bottom: toPt(page.margins.bottom),
    // With mirroring off, "left"/"right" are fixed sides; drawn as the
    // inner/outer of a recto page.
    inner: toPt(page.margins.left),
    outer: toPt(page.margins.right),
  };
  const mirror = page.margins.mirror ?? false;
  const gap = w * 0.04;
  const totalW = mirror ? w * 2 + gap : w;
  // Real leading when the drawing is large; never more than ~36 lines a
  // page, or the lines blur into a grey block at thumbnail size.
  const lead = Math.max(lineHeightPt, h / 36);
  const paper = page.backgroundColor.hex && page.backgroundColor.hex !== 'transparent' ? page.backgroundColor.hex : '#ffffff';
  const hl = 'color-mix(in srgb, var(--brand) 38%, transparent)';

  const drawPage = (x: number, recto: boolean) => {
    const left = recto ? m.inner : m.outer;
    const right = recto ? m.outer : m.inner;
    const tx = x + left;
    const ty = m.top;
    const tw = Math.max(w - left - right, 1);
    const th = Math.max(h - m.top - m.bottom, 1);
    const cols = columnsOf(layout, tw, recto);
    const innerX = recto ? x : x + w - m.inner;
    const outerX = recto ? x + w - m.outer : x;
    return (
      <g key={recto ? 'recto' : 'verso'}>
        <rect x={x} y={0} width={w} height={h} fill={paper} stroke="var(--rule-strong, var(--slate))" strokeWidth={w / 180} />
        {highlight === 'top' && <rect x={x} y={0} width={w} height={m.top} fill={hl} />}
        {highlight === 'bottom' && <rect x={x} y={h - m.bottom} width={w} height={m.bottom} fill={hl} />}
        {highlight === 'inner' && <rect x={innerX} y={0} width={m.inner} height={h} fill={hl} />}
        {highlight === 'outer' && <rect x={outerX} y={0} width={m.outer} height={h} fill={hl} />}
        {cols.map((c, i) => (
          <rect key={i} x={tx + c.x} y={ty} width={c.w} height={th} fill={`url(#${patternId})`} opacity={c.side ? 0.45 : 1} />
        ))}
        {highlight === 'gutter' && cols.length > 1 && (
          <rect x={tx + cols[0]!.x + cols[0]!.w} y={ty} width={cols[1]!.x - cols[0]!.x - cols[0]!.w} height={th} fill={hl} />
        )}
        {layout.columnRule.enabled && cols.length > 1 && (
          <line
            x1={tx + (cols[0]!.x + cols[0]!.w + cols[1]!.x) / 2}
            x2={tx + (cols[0]!.x + cols[0]!.w + cols[1]!.x) / 2}
            y1={ty}
            y2={ty + th}
            stroke={inkHex}
            strokeOpacity={0.5}
            strokeWidth={w / 300}
          />
        )}
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${totalW} ${h}`}
      height={height}
      width={(height * totalW) / h}
      aria-hidden="true"
      className={className}
      style={{ overflow: 'visible', display: 'block' }}
    >
      <defs>
        <pattern id={patternId} width={w} height={lead} patternUnits="userSpaceOnUse">
          <rect x={0} y={lead * 0.3} width={w} height={lead * 0.42} fill={inkHex} opacity={0.32} />
        </pattern>
      </defs>
      {mirror ? [drawPage(0, false), drawPage(w + gap, true)] : drawPage(0, true)}
    </svg>
  );
}

interface Col { x: number; w: number; side?: boolean }

function columnsOf(layout: ResolvedLayoutConfig, tw: number, recto: boolean): Col[] {
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
      (layout.sideColumnSide === 'outer' && recto) ||
      (layout.sideColumnSide === 'inner' && !recto);
    return sideOnRight
      ? [{ x: 0, w: mw }, { x: mw + g, w: sw, side: true }]
      : [{ x: 0, w: sw, side: true }, { x: sw + g, w: mw }];
  }
  return [{ x: 0, w: tw }];
}
