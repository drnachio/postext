import { Figure } from "../Figure";
import { ArrowMarker, DropShadowDef, Label, colorTokens, type ColorKey } from "../primitives";

export interface ConvergenceLoopLabels {
  title: string;
  desc?: string;
  caption?: string;
  passBadges: { num: string; name: string }[]; // 7 entries
  loopBadge: string;
  loopCondition: string;
}

// Geometry (all derived from a 112px pitch grid)
const BOX_W = 88;
const BOX_H = 46;
const PITCH = 112; // box + 24px arrow gap
const START_X = 20;
const BOX_Y = 44;
const LOOP_START = 2; // index of the first pass inside the convergence loop (Pass 3)

export function ConvergenceLoop({ labels }: { labels: ConvergenceLoopLabels }) {
  const n = labels.passBadges.length;
  const boxX = (i: number) => START_X + i * PITCH;
  const boxCx = (i: number) => boxX(i) + BOX_W / 2;

  // Loop container wraps passes LOOP_START..n-1 with 14px side padding
  const loopX = boxX(LOOP_START) - 14;
  const loopRight = boxX(n - 1) + BOX_W + 14;
  const loopW = loopRight - loopX;
  const loopCx = (loopX + loopRight) / 2;

  const vbW = loopRight + 20;
  const vbH = 160;

  // Return path: down from last pass, back under the row, up into Pass 3
  const returnY = 116;
  const returnPath = `M ${boxCx(n - 1)} ${BOX_Y + BOX_H} V ${returnY} H ${boxCx(LOOP_START)} V ${BOX_Y + BOX_H + 4}`;

  return (
    <Figure
      title={labels.title}
      desc={labels.desc}
      caption={labels.caption}
      viewBox={`0 0 ${vbW} ${vbH}`}
      maxWidth={vbW}
    >
      <defs>
        <ArrowMarker id="clArrow" />
        <ArrowMarker id="clArrowLoop" color="var(--svg-yellow-stroke)" />
        <DropShadowDef id="clShadow" />
      </defs>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .cl-flowline {
            stroke-dasharray: 9 6;
            animation: cl-flow 2.8s linear infinite;
          }
          .cl-pulse {
            animation: cl-pulse-k 5.6s linear infinite;
          }
          @keyframes cl-flow {
            to { stroke-dashoffset: -30; }
          }
          @keyframes cl-pulse-k {
            0%, 100% { opacity: 0; }
            4% { opacity: 0.28; }
            10% { opacity: 0; }
          }
        }
      `}</style>

      {/* Convergence-loop container around passes 3..7 */}
      <rect
        x={loopX}
        y={12}
        width={loopW}
        height={136}
        fill="var(--svg-yellow-fill)"
        stroke="var(--svg-yellow-stroke)"
        strokeWidth={1.5}
        strokeDasharray="5,4"
        rx={6}
      />
      <Label x={loopCx} y={30} anchor="middle" size={10} bold color="yellow">
        {labels.loopBadge}
      </Label>

      {/* Pass boxes: purple = run once (parse, measure); blue = inside the loop */}
      {labels.passBadges.map((p, i) => {
        const x = boxX(i);
        const inLoop = i >= LOOP_START;
        const color: ColorKey = inLoop ? "blue" : "purple";
        const t = colorTokens[color];
        return (
          <g key={i}>
            <rect
              x={x}
              y={BOX_Y}
              width={BOX_W}
              height={BOX_H}
              fill={t.fill}
              stroke={t.stroke}
              strokeWidth={1.5}
              rx={6}
              filter="url(#clShadow)"
            />
            {inLoop ? (
              <rect
                x={x}
                y={BOX_Y}
                width={BOX_W}
                height={BOX_H}
                fill={t.stroke}
                opacity={0}
                rx={6}
                className="cl-pulse"
                style={{ animationDelay: `${(i - LOOP_START) * 0.7}s` }}
              />
            ) : null}
            <text x={x + BOX_W / 2} y={63} textAnchor="middle" fontSize="10" fontWeight="bold" fill={t.text}>
              {p.num}
            </text>
            <text x={x + BOX_W / 2} y={79} textAnchor="middle" fontSize="9" fill={t.text}>
              {p.name}
            </text>
            {i < n - 1 ? (
              <line
                x1={x + BOX_W}
                y1={67}
                x2={x + PITCH}
                y2={67}
                stroke="var(--svg-stroke)"
                strokeWidth={1.5}
                markerEnd="url(#clArrow)"
              />
            ) : null}
          </g>
        );
      })}

      {/* Loop-back: Pass 7 → Pass 3 while dirty blocks remain */}
      <path
        d={returnPath}
        fill="none"
        stroke="var(--svg-yellow-stroke)"
        strokeWidth={2}
        markerEnd="url(#clArrowLoop)"
        className="cl-flowline"
      />
      <Label x={loopCx} y={136} anchor="middle" size={9.5} color="yellow">
        {labels.loopCondition}
      </Label>
    </Figure>
  );
}
