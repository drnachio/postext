import { Figure } from "../Figure";
import { Label, colorTokens } from "../primitives";

export interface BadnessCurveLabels {
  title: string;
  desc?: string;
  caption?: string;
  xAxis: string;
  yAxis: string;
  zero: string;
  tight: string;
  loose: string;
  formula: string;
}

// ── Plot geometry ──────────────────────────────────────────────
// viewBox 0 0 760 320; plot area x:[70,730] y:[40,280]
// x maps r ∈ [-2.2, 2.2]  →  px(r) = 400 + 150·r
// y maps badness ∈ [0, 850] →  py(b) = 280 − b·(240/850)
const PLOT_LEFT = 70;
const PLOT_RIGHT = 730;
const PLOT_TOP = 40;
const PLOT_BOTTOM = 280;
const ZERO_X = 400;
const X_SCALE = 150;
const Y_SCALE = 240 / 850;

const px = (r: number) => ZERO_X + X_SCALE * r;
const py = (b: number) => PLOT_BOTTOM - b * Y_SCALE;
const badness = (r: number) => 100 * Math.abs(r) ** 3;

function curvePath(): string {
  // r ∈ [-2.04, 2.04] keeps badness ≤ 849, just inside the plot top.
  const steps = 120;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const r = -2.04 + (4.08 * i) / steps;
    const cmd = i === 0 ? "M" : "L";
    parts.push(`${cmd}${px(r).toFixed(1)},${py(badness(r)).toFixed(1)}`);
  }
  return parts.join(" ");
}

// Reference points called out in the prose: r=0.5 → 12, r=1 → 100, r=2 → 800.
const refPoints = [
  { r: 0.5, b: 12, label: "12", leader: false },
  { r: 1, b: 100, label: "100", leader: true },
  { r: 2, b: 800, label: "800", leader: true },
];

export function BadnessCurve({ labels }: { labels: BadnessCurveLabels }) {
  const path = curvePath();
  const gridB = [200, 400, 600, 800];
  const xTicks: { r: number; text: string }[] = [
    { r: -2, text: "-2" },
    { r: -1, text: "-1" },
    { r: 0, text: labels.zero },
    { r: 1, text: "1" },
    { r: 2, text: "2" },
  ];

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 320" maxWidth={760}>
      <style>{`
        .bc-runner { display: none; }
        @media (prefers-reduced-motion: no-preference) {
          .bc-runner { display: inline; }
        }
      `}</style>
      <defs>
        <marker id="bc-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0,0.5 L7,4 L0,7.5" fill="none" stroke="var(--svg-stroke)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {/* zone fills: tight (r < 0) vs loose (r > 0) */}
      <rect x={PLOT_LEFT} y={PLOT_TOP} width={ZERO_X - PLOT_LEFT} height={PLOT_BOTTOM - PLOT_TOP} fill={colorTokens.pink.fill} opacity={0.55} />
      <rect x={ZERO_X} y={PLOT_TOP} width={PLOT_RIGHT - ZERO_X} height={PLOT_BOTTOM - PLOT_TOP} fill={colorTokens.blue.fill} opacity={0.55} />

      {/* horizontal gridlines + badness scale */}
      {gridB.map((b) => (
        <g key={b}>
          <line x1={PLOT_LEFT} y1={py(b)} x2={PLOT_RIGHT} y2={py(b)} stroke="var(--svg-grid)" strokeWidth={1} />
          <Label x={PLOT_LEFT - 8} y={py(b) + 3} anchor="end" size={9} color={b === 800 ? "purple" : "light"} bold={b === 800}>
            {b}
          </Label>
        </g>
      ))}

      {/* dashed divider at r = 0 (stops below the formula chip) */}
      <line x1={ZERO_X} y1={100} x2={ZERO_X} y2={PLOT_BOTTOM} stroke="var(--svg-grid)" strokeWidth={1.5} strokeDasharray="4,4" />

      {/* axes */}
      <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={742} y2={PLOT_BOTTOM} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#bc-arrow)" />
      <line x1={PLOT_LEFT} y1={PLOT_BOTTOM} x2={PLOT_LEFT} y2={30} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#bc-arrow)" />

      {/* x ticks */}
      {xTicks.map((t) => (
        <g key={t.r}>
          <line x1={px(t.r)} y1={PLOT_BOTTOM} x2={px(t.r)} y2={PLOT_BOTTOM + 5} stroke="var(--svg-stroke)" strokeWidth={1.5} />
          <Label x={px(t.r)} y={PLOT_BOTTOM + 18} anchor="middle" size={9} color={t.r === 2 ? "purple" : "light"} bold={t.r === 2}>
            {t.text}
          </Label>
        </g>
      ))}

      {/* axis names */}
      <Label x={748} y={PLOT_BOTTOM + 18} anchor="middle" size={11} color="mid" bold>{labels.xAxis}</Label>
      <Label x={PLOT_LEFT - 8} y={27} anchor="end" size={10} color="mid" bold>{labels.yAxis}</Label>

      {/* zone headers above the plot */}
      <Label x={(PLOT_LEFT + ZERO_X) / 2} y={28} anchor="middle" size={10} bold color="pink">{labels.tight}</Label>
      <Label x={(ZERO_X + PLOT_RIGHT) / 2} y={28} anchor="middle" size={10} bold color="blue">{labels.loose}</Label>

      {/* the cubic curve */}
      <path d={path} fill="none" stroke={colorTokens.purple.stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* reference points from the prose: cheap at r=0.5, explosive at r=2 */}
      {refPoints.map((p) => (
        <g key={p.r}>
          {p.leader ? (
            <line
              x1={px(p.r)}
              y1={py(p.b)}
              x2={px(p.r)}
              y2={PLOT_BOTTOM}
              stroke={colorTokens.purple.stroke}
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.45}
            />
          ) : null}
          <circle cx={px(p.r)} cy={py(p.b)} r={3.5} fill={colorTokens.purple.stroke} />
        </g>
      ))}
      <Label x={px(0.5)} y={py(12) - 12} anchor="middle" size={9.5} bold color="purple">12</Label>
      <Label x={px(1) + 9} y={py(100) + 13} anchor="start" size={9.5} bold color="purple">100</Label>
      <Label x={px(2) - 10} y={py(800) - 7} anchor="end" size={9.5} bold color="purple">800</Label>

      {/* formula chip, centered over the flat valley of the curve */}
      <rect x={303} y={62} width={194} height={30} rx={6} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1} />
      <text x={ZERO_X} y={81} fontSize={11} fontWeight="bold" textAnchor="middle" fill={colorTokens.purple.text}>
        {labels.formula}
      </text>

      {/* animated cursor gliding along the curve (decorative; hidden when reduced motion) */}
      <g className="bc-runner">
        <circle cx={0} cy={0} r={5} fill="none" stroke={colorTokens.purple.stroke} strokeWidth={2}>
          <animateMotion
            dur="14s"
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;1;0"
            keyTimes="0;0.5;1"
            path={path}
          />
        </circle>
      </g>
    </Figure>
  );
}
