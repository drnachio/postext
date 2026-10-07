'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ColorPaletteEntry, ColorValue, ResolvedBalloonStyleConfig, ResolvedLetteringConfig } from 'postext';
import { resolveColorValue } from 'postext';
import { loadFont } from '../../controls/fontLoader';
import { balloonPreviewGeometry, dimensionToPx, estimateTextWidth } from './balloonPreviewGeometry';

/** Preview px per point: the lettering size (7.5 pt by default) reads at
 *  about 13 px. */
const PX_PER_PT = 1.8;
/** Room around the drawing, px. */
const MARGIN = 6;

const BLACK: ColorValue = { hex: '#000000', model: 'hex' };

let measureCanvas: HTMLCanvasElement | null = null;

/** The widest of `lines` set in `font` (a CSS font shorthand), measured in
 *  a canvas; undefined where there is no canvas (server rendering, tests). */
function measureLines(lines: readonly string[], font: string, tracking: number): number | undefined {
  if (typeof document === 'undefined') return undefined;
  measureCanvas ??= document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.font = font;
  return Math.max(...lines.map((l) => ctx.measureText(l).width + tracking * Math.max(0, [...l].length - 1)));
}

interface BalloonPreviewProps {
  style: ResolvedBalloonStyleConfig;
  lettering: ResolvedLetteringConfig;
  palette?: ColorPaletteEntry[];
  /** The sample text; `\n` breaks a line. */
  text: string;
  /** Accessible name of the drawing. */
  label: string;
}

/** A small drawing of a balloon style: its outline, tail and lettering
 *  around a sample text, on a patch of paper (the look of print, whatever
 *  the interface theme). A sketch, not the lettering engine. */
export function BalloonPreview({ style, lettering, palette, text, label }: BalloonPreviewProps) {
  const family = style.fontFamily ?? lettering.fontFamily;
  // Measure again once the face has loaded.
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    let live = true;
    loadFont(family)
      .then(() => (typeof document !== 'undefined' && document.fonts ? document.fonts.ready : undefined))
      .then(() => { if (live) setFontEpoch((n) => n + 1); })
      .catch(() => {});
    return () => { live = false; };
  }, [family]);

  const fontPx = dimensionToPx(lettering.fontSize, PX_PER_PT, 12) * style.fontScale;
  const bold = style.bold ?? lettering.bold;
  const italic = style.italic ?? lettering.italic;
  const upper = (style.textTransform ?? lettering.textTransform) === 'uppercase';
  const lines = (upper ? text.toLocaleUpperCase() : text).split('\n');
  const lineHeight = fontPx * lettering.lineHeight;
  const letterSpacing = style.letterSpacing ?? lettering.letterSpacing;
  const tracking = dimensionToPx(letterSpacing, PX_PER_PT, fontPx);
  const cssFont = `${italic ? 'italic ' : ''}${bold ? 700 : 400} ${fontPx}px "${family}", sans-serif`;
  const sample = lines.join('\n');
  const measured = useMemo(
    () => measureLines(sample.split('\n'), cssFont, tracking),
    // fontEpoch: the face finished loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sample, cssFont, tracking, fontEpoch],
  );
  const textWidth = measured ?? Math.max(...lines.map((l) => estimateTextWidth(l, fontPx, bold)));
  const textHeight = lineHeight * lines.length;
  const strokeWidth = Math.max(0.6, dimensionToPx(style.strokeWidth, PX_PER_PT, fontPx));
  const geometry = balloonPreviewGeometry({
    shape: style.shape,
    tail: style.tail,
    roundness: style.roundness,
    burstPoints: style.burstPoints,
    burstDepth: style.burstDepth,
    wobble: style.wobble,
    padding: dimensionToPx(style.padding, PX_PER_PT, fontPx),
    tailWidth: dimensionToPx(style.tailWidth, PX_PER_PT, fontPx),
    tailReach: style.tailReach,
    textWidth,
    textHeight,
  });

  const fill = resolveColorValue(style.fill, palette, { hex: '#ffffff', model: 'hex' }).hex;
  const stroke = resolveColorValue(style.stroke, palette, BLACK).hex;
  const color = resolveColorValue(style.color ?? lettering.color, palette, BLACK).hex;
  const halo = style.halo ? dimensionToPx(style.halo, PX_PER_PT, fontPx) : 0;
  const haloColor = resolveColorValue(style.haloColor, palette, { hex: '#ffffff', model: 'hex' }).hex;

  // Stroke all the marks, then fill them, so the tail merges into the body
  // (a double outline is three strokes: line, gap, line).
  const outlinePaths = [geometry.body, geometry.tail].filter((d): d is string => !!d);
  const strokes = style.shape === 'none' ? [] : style.double
    ? [{ w: strokeWidth * 6, c: stroke }, { w: strokeWidth * 4, c: fill }, { w: strokeWidth * 2, c: stroke }]
    : [{ w: strokeWidth * 2, c: stroke }];
  const dash = style.dash ? `${strokeWidth * 5} ${strokeWidth * 3.5}` : undefined;

  const pad = MARGIN + strokeWidth * (style.double ? 3 : 1) + halo;
  const { bounds } = geometry;
  const rotate = style.rotate || 0;
  const vb = { x: bounds.x - pad, y: bounds.y - pad, w: bounds.width + pad * 2, h: bounds.height + pad * 2 };
  const align = style.align === 'start' && style.shape !== 'none';
  const x0 = align ? geometry.cx - textWidth / 2 : geometry.cx;
  const firstBaseline = geometry.cy - textHeight / 2 + lineHeight * 0.5 + fontPx * 0.35;

  return (
    <div className="mb-2 flex justify-center rounded border border-(--rule) bg-[#f6f3ec] p-1.5">
      <svg
        role="img"
        aria-label={label}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        width={Math.min(vb.w, 240)}
        style={{ maxWidth: '100%', height: 'auto', overflow: 'visible' }}
      >
        <g transform={rotate ? `rotate(${rotate} ${geometry.cx} ${geometry.cy})` : undefined}>
          {strokes.map((s, i) => (
            <g key={i} fill="none" stroke={s.c} strokeWidth={s.w} strokeLinejoin="round" strokeDasharray={i === strokes.length - 1 ? dash : undefined}>
              {outlinePaths.map((d, j) => <path key={j} d={d} />)}
              {geometry.bubbles.map((b, j) => <circle key={`b${j}`} cx={b.cx} cy={b.cy} r={b.r} />)}
            </g>
          ))}
          {style.shape !== 'none' && (
            <g fill={fill} stroke="none">
              {outlinePaths.map((d, j) => <path key={j} d={d} />)}
              {geometry.bubbles.map((b, j) => <circle key={`b${j}`} cx={b.cx} cy={b.cy} r={b.r} />)}
            </g>
          )}
          <text
            x={x0}
            y={firstBaseline}
            textAnchor={align ? 'start' : 'middle'}
            fill={color}
            stroke={halo > 0 ? haloColor : undefined}
            strokeWidth={halo > 0 ? halo * 2 : undefined}
            strokeLinejoin="round"
            paintOrder="stroke"
            fontFamily={`"${family}", sans-serif`}
            fontSize={fontPx}
            fontWeight={bold ? 700 : 400}
            fontStyle={italic ? 'italic' : 'normal'}
            letterSpacing={tracking || undefined}
            direction="ltr"
            style={{ unicodeBidi: 'plaintext' }}
          >
            {lines.map((l, i) => (
              <tspan key={i} x={x0} dy={i === 0 ? 0 : lineHeight}>{l}</tspan>
            ))}
          </text>
        </g>
      </svg>
    </div>
  );
}
