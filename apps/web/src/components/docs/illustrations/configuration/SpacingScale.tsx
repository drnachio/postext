import { Figure } from "../Figure";
import { Label, colorTokens } from "../primitives";

export interface SpacingScaleLabels {
  title: string;
  desc?: string;
  caption?: string;
  steps: { name: string; value: string; px: number }[];
}

const BAR_X = 110; // left edge of all bars / grid origin
const BAR_MAX_W = 384; // rendered width of the largest step
const ROW_H = 32;
const BAR_H = 18;
const TOP_Y = 34;
const MULT_X = 614; // right-aligned multiplier column

export function SpacingScale({ labels }: { labels: SpacingScaleLabels }) {
  const steps = labels.steps;
  const base = steps[0]?.px || 1;
  const maxPx = steps.length > 0 ? Math.max(...steps.map((s) => s.px)) : 1;
  const k = maxPx > 0 ? BAR_MAX_W / maxPx : 1;
  const unit = base * k; // one base-unit cell on the grid
  const gridN = Math.min(64, Math.max(1, Math.round(maxPx / base)));

  const gridTop = TOP_Y - 8;
  const gridBottom = TOP_Y + Math.max(0, steps.length - 1) * ROW_H + BAR_H + 8;
  const bracketY = gridBottom + 12;
  const height = bracketY + 26;

  const teal = colorTokens.teal;

  return (
    <Figure
      title={labels.title}
      desc={labels.desc}
      caption={labels.caption}
      viewBox={`0 0 640 ${height}`}
      maxWidth={640}
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .ss-bar {
            transform-box: fill-box;
            transform-origin: left center;
            animation: ss-grow 9s ease-out infinite backwards;
          }
          @keyframes ss-grow {
            0%   { transform: scaleX(0); opacity: 0; }
            2%   { transform: scaleX(0); opacity: 1; }
            9%   { transform: scaleX(1); }
            90%  { transform: scaleX(1); opacity: 1; }
            96%  { transform: scaleX(1); opacity: 0; }
            97%  { transform: scaleX(0); opacity: 0; }
            100% { transform: scaleX(0); opacity: 0; }
          }
        }
      `}</style>

      {/* step bars */}
      {steps.map((s, i) => {
        const y = TOP_Y + i * ROW_H;
        return (
          <rect
            key={`bar-${i}`}
            className="ss-bar"
            style={{ animationDelay: `${i * 0.35}s` }}
            x={BAR_X}
            y={y}
            width={Math.max(2, s.px * k)}
            height={BAR_H}
            fill={teal.fill}
            stroke={teal.stroke}
            strokeWidth={1.5}
            rx={2}
          />
        );
      })}

      {/* base-unit grid, drawn over the bars so each step reads as N cells */}
      {Array.from({ length: gridN + 1 }, (_, j) => (
        <line
          key={`grid-${j}`}
          x1={BAR_X + j * unit}
          y1={gridTop}
          x2={BAR_X + j * unit}
          y2={gridBottom}
          stroke="var(--svg-grid)"
          strokeWidth={1}
        />
      ))}

      {/* labels: step name, real value, multiplier of the base unit */}
      {steps.map((s, i) => {
        const y = TOP_Y + i * ROW_H;
        const mult = Math.round(s.px / base);
        return (
          <g key={`lbl-${i}`}>
            <Label x={BAR_X - 14} y={y + 13} anchor="end" size={10} bold color="mid">
              {s.name}
            </Label>
            <Label x={BAR_X + Math.max(2, s.px * k) + 10} y={y + 13} size={9} color="teal">
              {s.value}
            </Label>
            <Label x={MULT_X} y={y + 13} anchor="end" size={9} color="faint">
              {`×${mult}`}
            </Label>
          </g>
        );
      })}

      {/* base-unit bracket under the first grid cell */}
      <g stroke="var(--svg-light-text)" strokeWidth={1}>
        <line x1={BAR_X} y1={bracketY - 4} x2={BAR_X} y2={bracketY + 4} />
        <line x1={BAR_X} y1={bracketY} x2={BAR_X + unit} y2={bracketY} />
        <line x1={BAR_X + unit} y1={bracketY - 4} x2={BAR_X + unit} y2={bracketY + 4} />
      </g>
      <Label x={BAR_X + unit / 2} y={bracketY + 16} anchor="middle" size={9} color="light">
        {steps[0]?.value ?? ""}
      </Label>
    </Figure>
  );
}
