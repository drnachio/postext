import { Figure } from "../Figure";
import { colorTokens, type ColorKey } from "../primitives";

export interface PageSizesLabels {
  title: string;
  desc?: string;
  caption?: string;
  sizes: { name: string; dims: string; wmm: number; hmm: number }[];
}

const PALETTE: ColorKey[] = ["blue", "green", "orange", "purple", "teal", "pink", "yellow"];

function cm(mm: number): string {
  return `${mm % 10 === 0 ? mm / 10 : (mm / 10).toFixed(1)} cm`;
}

/**
 * Nested page-size comparison, in the style of the classic ISO paper-size
 * diagram: every preset shares the same bottom-left corner so relative
 * proportions are immediately readable. Each preset is identified by a
 * coloured top+right edge, a corner dot and a label hanging off that corner.
 * The outer extents carry explicit cm dimension callouts.
 */
export function PageSizes({ labels }: { labels: PageSizesLabels }) {
  // Assign a stable colour per preset (document order), then draw largest
  // first so smaller pages stack on top.
  const items = labels.sizes.map((s, i) => ({ ...s, color: PALETTE[i % PALETTE.length] }));
  const sorted = [...items].sort((a, b) => b.wmm * b.hmm - a.wmm * a.hmm);

  const maxWmm = Math.max(...items.map((s) => s.wmm));
  const maxHmm = Math.max(...items.map((s) => s.hmm));
  // ~1px per mm for typical book formats; clamps larger inputs to the same canvas.
  const k = Math.min(210 / maxWmm, 280 / maxHmm);

  const x0 = 40; // shared left edge
  const topPad = 30; // room for the tallest page's corner label
  const y0 = topPad + maxHmm * k; // shared baseline (bottom edge)
  const plotRight = x0 + maxWmm * k;
  const dimX = plotRight + 18; // height dimension line
  const dimY = y0 + 16; // width dimension line
  const vbW = dimX + 46;
  const vbH = y0 + 46;

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox={`0 0 ${vbW} ${vbH}`} maxWidth={380}>
      {/* Page fills, largest first so each smaller sheet reads as a layer on top */}
      {sorted.map((s, i) => {
        const w = s.wmm * k;
        const h = s.hmm * k;
        return <rect key={`f${i}`} x={x0} y={y0 - h} width={w} height={h} fill={colorTokens[s.color].fill} />;
      })}

      {/* Shared left + bottom edges, drawn once in neutral ink */}
      <path
        d={`M ${x0} ${y0 - maxHmm * k} V ${y0} H ${plotRight}`}
        fill="none"
        stroke="var(--svg-stroke)"
        strokeWidth={2}
        strokeLinecap="square"
      />

      {/* Per-preset coloured top + right edges, corner dot, corner label */}
      {sorted.map((s, i) => {
        const t = colorTokens[s.color];
        const right = x0 + s.wmm * k;
        const top = y0 - s.hmm * k;
        return (
          <g key={`p${i}`}>
            <path
              d={`M ${x0} ${top} H ${right} V ${y0}`}
              fill="none"
              stroke={t.stroke}
              strokeWidth={2}
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
            <circle cx={right} cy={top} r={3} fill={t.stroke} />
            <text x={right - 8} y={top - 7} textAnchor="end" fontSize={10}>
              <tspan fill={t.text} fontWeight="bold">{s.name}</tspan>
              <tspan fill="var(--svg-mid-text)">{` · ${s.dims}`}</tspan>
            </text>
          </g>
        );
      })}

      {/* Width dimension of the outer extent */}
      <g stroke="var(--svg-stroke)" strokeWidth={1}>
        <line x1={x0} y1={dimY - 4} x2={x0} y2={dimY + 4} />
        <line x1={x0} y1={dimY} x2={plotRight} y2={dimY} />
        <line x1={plotRight} y1={dimY - 4} x2={plotRight} y2={dimY + 4} />
      </g>
      <text x={(x0 + plotRight) / 2} y={dimY + 16} textAnchor="middle" fontSize={9} fill="var(--svg-mid-text)">
        {cm(maxWmm)}
      </text>

      {/* Height dimension of the outer extent */}
      <g stroke="var(--svg-stroke)" strokeWidth={1}>
        <line x1={dimX - 4} y1={y0 - maxHmm * k} x2={dimX + 4} y2={y0 - maxHmm * k} />
        <line x1={dimX} y1={y0 - maxHmm * k} x2={dimX} y2={y0} />
        <line x1={dimX - 4} y1={y0} x2={dimX + 4} y2={y0} />
      </g>
      <text x={dimX + 8} y={y0 - (maxHmm * k) / 2 + 3} textAnchor="start" fontSize={9} fill="var(--svg-mid-text)">
        {cm(maxHmm)}
      </text>
    </Figure>
  );
}
