import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label, colorTokens, type ColorKey } from "../primitives";

export interface ContributionWorkflowLabels {
  title: string;
  desc?: string;
  caption?: string;
  steps: { name: string; sub: string }[]; // four entries
  branchLabel: string;
  branchSub: string;
}

const CARD_W = 156;
const CARD_H = 78;
const CARD_Y = 18;
const GAP = 40;
const START_X = 18;
const PITCH = CARD_W + GAP; // 196

export function ContributionWorkflow({ labels }: { labels: ContributionWorkflowLabels }) {
  const steps = labels.steps.slice(0, 4);
  const colors: ColorKey[] = ["blue", "purple", "orange", "green"];
  const chipX = START_X;
  const chipY = 148;
  const chipW = CARD_W;
  const chipH = 44;

  return (
    <Figure
      title={labels.title}
      desc={labels.desc}
      caption={labels.caption}
      viewBox="0 0 780 210"
      maxWidth={780}
    >
      <defs>
        <ArrowMarker id="cwArrow" />
        <ArrowMarker id="cwArrowEntry" color="var(--svg-yellow-stroke)" />
        <DropShadowDef id="cwShadow" />
      </defs>

      <style>{`
        .cw-flow {
          stroke-dasharray: 5 6;
        }
        @media (prefers-reduced-motion: no-preference) {
          .cw-flow {
            animation: cw-dash 1.8s linear infinite;
          }
        }
        @keyframes cw-dash {
          to { stroke-dashoffset: -11; }
        }
      `}</style>

      {/* Flow connectors between stages */}
      {steps.slice(0, -1).map((_, i) => {
        const x1 = START_X + CARD_W + i * PITCH;
        return (
          <line
            key={i}
            className="cw-flow"
            x1={x1}
            y1={CARD_Y + CARD_H / 2}
            x2={x1 + GAP - 2}
            y2={CARD_Y + CARD_H / 2}
            stroke="var(--svg-stroke)"
            strokeWidth={1.8}
            markerEnd="url(#cwArrow)"
          />
        );
      })}

      {/* Stage cards with numbered badges */}
      {steps.map((s, i) => {
        const x = START_X + i * PITCH;
        const cx = x + CARD_W / 2;
        const color = colors[i] ?? "blue";
        const t = colorTokens[color];
        return (
          <g key={i}>
            <Box x={x} y={CARD_Y} width={CARD_W} height={CARD_H} color={color} rx={8} strokeWidth={1.5} filter="url(#cwShadow)" />
            <circle cx={cx} cy={CARD_Y + 17} r={9} fill={t.fill} stroke={t.stroke} strokeWidth={1.2} />
            <Label x={cx} y={CARD_Y + 20.5} anchor="middle" size={9} bold color={color}>{i + 1}</Label>
            <Label x={cx} y={CARD_Y + 46} anchor="middle" size={12} bold color={color}>{s.name}</Label>
            <Label x={cx} y={CARD_Y + 64} anchor="middle" size={9} color="mid">{s.sub}</Label>
          </g>
        );
      })}

      {/* Entry point: good-first-issue chip feeding into the first stage */}
      <line
        className="cw-flow"
        x1={chipX + chipW / 2}
        y1={chipY}
        x2={chipX + chipW / 2}
        y2={CARD_Y + CARD_H + 4}
        stroke="var(--svg-yellow-stroke)"
        strokeWidth={1.5}
        markerEnd="url(#cwArrowEntry)"
      />
      <rect
        x={chipX}
        y={chipY}
        width={chipW}
        height={chipH}
        fill="var(--svg-yellow-fill)"
        stroke="var(--svg-yellow-stroke)"
        strokeWidth={1.5}
        rx={8}
      />
      <Label x={chipX + chipW / 2} y={chipY + 18} anchor="middle" size={10} bold color="yellow">{labels.branchLabel}</Label>
      <Label x={chipX + chipW / 2} y={chipY + 34} anchor="middle" size={8.5} color="mid">{labels.branchSub}</Label>
    </Figure>
  );
}
