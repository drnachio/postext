import { Figure } from "../Figure";
import { Label, DropShadowDef, colorTokens } from "../primitives";

export interface ColumnGutterLabels {
  title: string;
  desc?: string;
  caption?: string;
  pageLabel: string;
  gutterLabel: string;
  columnLabel: string;
  marginLabel: string;
}

/* ── Geometry ──────────────────────────────────────────────
   Page   : 70,50 → 510,340  (440 × 290)
   Margin : 36 on all sides (green frame)
   Content: 106,86 → 474,304 (368 × 218)
   Columns: width 104 at x = 106 / 238 / 370 (blue)
   Gutters: width 28 at x = 210 / 342 (orange)
   Dim row: ticks 346–368, arrows y=360, labels y=382
─────────────────────────────────────────────────────────── */

const PAGE = { x: 70, y: 50, w: 440, h: 290 };
const M = 36; // margin
const COL_W = 104;
const GUT_W = 28;
const CONTENT = { x: PAGE.x + M, y: PAGE.y + M, w: PAGE.w - 2 * M, h: PAGE.h - 2 * M };
const COL_X = [CONTENT.x, CONTENT.x + COL_W + GUT_W, CONTENT.x + 2 * (COL_W + GUT_W)];
const GUT_X = [CONTENT.x + COL_W, CONTENT.x + 2 * COL_W + GUT_W];

/** Even-odd path covering the margin frame (page minus content). */
const marginFramePath = [
  `M${PAGE.x},${PAGE.y} h${PAGE.w} v${PAGE.h} h${-PAGE.w} Z`,
  `M${CONTENT.x},${CONTENT.y} h${CONTENT.w} v${CONTENT.h} h${-CONTENT.w} Z`,
].join(" ");

/** Greeked text line widths, cycled per line (last of each "paragraph" is short). */
const LINE_W = [84, 78, 84, 80, 52];
const LINE_STEP = 12;
const LINE_COUNT = 18; // y = 96 … 300, inside content (86 … 304)

function DimArrow({ x1, x2, y, color }: { x1: number; x2: number; y: number; color: "blue" | "orange" | "green" }) {
  return (
    <line
      x1={x1 + 1}
      y1={y}
      x2={x2 - 1}
      y2={y}
      stroke={colorTokens[color].stroke}
      strokeWidth={1.5}
      markerStart={`url(#cg-arr-${color})`}
      markerEnd={`url(#cg-arr-${color})`}
    />
  );
}

export function ColumnGutter({ labels }: { labels: ColumnGutterLabels }) {
  const dimTop = PAGE.y + PAGE.h + 6; // 346
  const dimBottom = dimTop + 22; // 368
  const dimY = dimTop + 14; // 360
  const labelY = 382;

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 580 400" maxWidth={580}>
      <defs>
        <DropShadowDef id="cg-shadow" />
        {(["blue", "orange", "green"] as const).map((c) => (
          <marker key={c} id={`cg-arr-${c}`} markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto-start-reverse">
            <polygon points="0 0, 7 3, 0 6" fill={colorTokens[c].stroke} />
          </marker>
        ))}
      </defs>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .cg-p1, .cg-p2, .cg-p3 { animation: cg-pulse 9s ease-in-out infinite; }
          .cg-p2 { animation-delay: 3s; }
          .cg-p3 { animation-delay: 6s; }
          @keyframes cg-pulse {
            0% { opacity: 0; }
            8% { opacity: 1; }
            25% { opacity: 1; }
            33% { opacity: 0; }
            100% { opacity: 0; }
          }
        }
      `}</style>

      {/* ── Page ── */}
      <rect
        x={PAGE.x}
        y={PAGE.y}
        width={PAGE.w}
        height={PAGE.h}
        fill="var(--svg-legend-fill)"
        stroke="var(--svg-stroke)"
        strokeWidth={1.5}
        rx={4}
        filter="url(#cg-shadow)"
      />
      <Label x={PAGE.x} y={PAGE.y - 10} size={10} bold color="dark">
        {labels.pageLabel}
      </Label>

      {/* ── Margin frame (page minus content area) ── */}
      <path d={marginFramePath} fillRule="evenodd" fill={colorTokens.green.fill} />
      <rect
        x={CONTENT.x}
        y={CONTENT.y}
        width={CONTENT.w}
        height={CONTENT.h}
        fill="none"
        stroke={colorTokens.green.stroke}
        strokeWidth={1}
        strokeDasharray="4,3"
        opacity={0.6}
      />

      {/* ── Gutters ── */}
      {GUT_X.map((gx) => (
        <rect key={gx} x={gx} y={CONTENT.y} width={GUT_W} height={CONTENT.h} fill={colorTokens.orange.fill} />
      ))}

      {/* ── Columns with greeked text ── */}
      {COL_X.map((cx) => (
        <g key={cx}>
          <rect
            x={cx}
            y={CONTENT.y}
            width={COL_W}
            height={CONTENT.h}
            fill={colorTokens.blue.fill}
            stroke={colorTokens.blue.stroke}
            strokeWidth={1.5}
            rx={2}
          />
          {Array.from({ length: LINE_COUNT }).map((_, j) => (
            <line
              key={j}
              x1={cx + 10}
              y1={CONTENT.y + 10 + j * LINE_STEP}
              x2={cx + 10 + LINE_W[j % LINE_W.length]}
              y2={CONTENT.y + 10 + j * LINE_STEP}
              stroke={colorTokens.blue.stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.3}
            />
          ))}
        </g>
      ))}

      {/* ── Pulse overlays (animation only; invisible when reduced motion) ── */}
      <path className="cg-p1" d={marginFramePath} fillRule="evenodd" fill={colorTokens.green.stroke} fillOpacity={0.14} opacity={0} />
      <g className="cg-p2" opacity={0}>
        {COL_X.map((cx) => (
          <rect key={cx} x={cx} y={CONTENT.y} width={COL_W} height={CONTENT.h} fill={colorTokens.blue.stroke} fillOpacity={0.12} rx={2} />
        ))}
      </g>
      <g className="cg-p3" opacity={0}>
        {GUT_X.map((gx) => (
          <rect key={gx} x={gx} y={CONTENT.y} width={GUT_W} height={CONTENT.h} fill={colorTokens.orange.stroke} fillOpacity={0.16} />
        ))}
      </g>

      {/* ── Dimension row: margin / column / gutter ── */}
      {[PAGE.x, CONTENT.x, CONTENT.x + COL_W, CONTENT.x + COL_W + GUT_W].map((tx) => (
        <line key={tx} x1={tx} y1={dimTop} x2={tx} y2={dimBottom} stroke="var(--svg-stroke)" strokeWidth={1} opacity={0.4} />
      ))}
      <DimArrow x1={PAGE.x} x2={CONTENT.x} y={dimY} color="green" />
      <DimArrow x1={CONTENT.x} x2={CONTENT.x + COL_W} y={dimY} color="blue" />
      <DimArrow x1={CONTENT.x + COL_W} x2={CONTENT.x + COL_W + GUT_W} y={dimY} color="orange" />

      <Label x={PAGE.x + M / 2} y={labelY} anchor="middle" size={10} bold color="green">
        {labels.marginLabel}
      </Label>
      <Label x={CONTENT.x + COL_W / 2} y={labelY} anchor="middle" size={10} bold color="blue">
        {labels.columnLabel}
      </Label>
      <Label x={CONTENT.x + COL_W + GUT_W / 2} y={labelY} anchor="middle" size={10} bold color="orange">
        {labels.gutterLabel}
      </Label>
    </Figure>
  );
}
