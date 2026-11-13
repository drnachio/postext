'use client';

import type { DieShape } from 'postext';
import { dimensionMm, validPathData } from './dieCutEdits.js';

/** The longest side of a preview, CSS px. */
const SIZE = 72;
/** The die line's colour in the previews: the magenta proofs show it in. */
const DIE = '#e6007e';

/** The box a preview of `w` × `h` (any unit) fills, at most `SIZE` px. */
function fit(w: number, h: number): { width: number; height: number } {
  const ratio = w > 0 && h > 0 ? w / h : 1;
  return ratio >= 1 ? { width: SIZE, height: Math.max(8, SIZE / ratio) } : { width: Math.max(8, SIZE * ratio), height: SIZE };
}

/** A small live drawing of a die shape in its box: what the die cuts, in
 *  the shape's own proportions. Drawn as SVG elements (never markup from
 *  the text typed), and named for assistive technology by `label`. */
export function DieShapePreview({ shape, label }: { shape: DieShape; label: string }) {
  const w = Math.max(0.1, dimensionMm(shape.width));
  const h = Math.max(0.1, dimensionMm(shape.height));
  const box = fit(w, h);
  const stroke = { fill: 'var(--surface)', stroke: DIE, strokeWidth: 1.5, vectorEffect: 'non-scaling-stroke' as const };
  let body;
  switch (shape.shape) {
    case 'circle':
    case 'ellipse':
      body = <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...stroke} />;
      break;
    case 'roundRect': {
      const r = Math.min(w / 2, h / 2, dimensionMm(shape.radius ?? { value: 3, unit: 'mm' }));
      body = <rect x={0} y={0} width={w} height={h} rx={r} ry={r} {...stroke} />;
      break;
    }
    case 'path': {
      const [vw, vh] = shape.viewBox ?? [1, 1];
      const d = shape.d && validPathData(shape.d) ? shape.d : undefined;
      body = d
        ? <g transform={`scale(${w / (vw || 1)} ${h / (vh || 1)})`}><path d={d} {...stroke} /></g>
        : <rect x={0} y={0} width={w} height={h} fill="none" stroke="var(--slate)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />;
      break;
    }
    default:
      body = <rect x={0} y={0} width={w} height={h} {...stroke} />;
  }
  return (
    <div className="mb-2 flex justify-center">
      <svg role="img" aria-label={label} width={box.width} height={box.height} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        {body}
      </svg>
    </div>
  );
}

/** The leaf's outline drawn over the trim (`trimW` × `trimH`, any unit):
 *  the path stretched to the page, as the engine cuts a recto. */
export function OutlinePreview({ d, viewBox, trimW, trimH, label }: { d: string; viewBox: [number, number]; trimW: number; trimH: number; label: string }) {
  const box = fit(trimW, trimH);
  const [vw, vh] = viewBox;
  const ok = validPathData(d);
  return (
    <div className="mb-2 flex justify-center">
      <svg role="img" aria-label={label} width={box.width} height={box.height} viewBox={`0 0 ${vw || 1} ${vh || 1}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <rect x={0} y={0} width={vw || 1} height={vh || 1} fill="none" stroke="var(--slate)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        {ok && <path d={d} fill="var(--surface)" stroke={DIE} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}
