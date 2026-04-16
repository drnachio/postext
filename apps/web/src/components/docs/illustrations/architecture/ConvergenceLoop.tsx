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

const passColors: ColorKey[] = ["orange", "purple", "blue", "blue", "green", "green", "green"];

export function ConvergenceLoop({ labels }: { labels: ConvergenceLoopLabels }) {
  const boxW = 80;
  const startX = 20;
  const gap = 20;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 140" maxWidth={760}>
      <defs>
        <ArrowMarker id="clArrow" />
        <marker id="clArrowYellow" markerWidth="8" markerHeight="6" refX="4" refY="0" orient="auto">
          <polygon points="0 6, 4 0, 8 6" fill="var(--svg-yellow-stroke)" />
        </marker>
        <DropShadowDef id="clShadow" />
      </defs>

      {/* loop bracket */}
      <rect x={218} y={25} width={530} height={70} fill="none" stroke="var(--svg-yellow-stroke)" strokeWidth={2} rx={6} strokeDasharray="6,3" />
      <Label x={485} y={20} anchor="middle" size={10} bold color="yellow" className="svg-pulse">{labels.loopBadge}</Label>

      {labels.passBadges.map((p, i) => {
        const x = startX + i * (boxW + gap);
        const color = passColors[i] ?? "blue";
        const t = colorTokens[color];
        return (
          <g key={i} className={`svg-fade-${Math.min(i + 1, 7)}`}>
            <rect x={x} y={40} width={boxW} height={40} fill={t.fill} stroke={t.stroke} strokeWidth={2} rx={4} filter="url(#clShadow)" />
            <text x={x + boxW / 2} y={58} textAnchor="middle" fontSize="10" fontWeight="bold" fill={t.text}>{p.num}</text>
            <text x={x + boxW / 2} y={70} textAnchor="middle" fontSize="8" fill={t.text}>{p.name}</text>
            {i < labels.passBadges.length - 1 ? (
              <line x1={x + boxW} y1={60} x2={x + boxW + gap} y2={60} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#clArrow)" className="svg-flow" />
            ) : null}
          </g>
        );
      })}

      {/* Loop-back arrow — curves above the row from pass 7 back to pass 3 */}
      <path d="M 680 82 L 680 115 L 270 115 L 270 82" fill="none" stroke="var(--svg-yellow-stroke)" strokeWidth={2} markerEnd="url(#clArrowYellow)" className="svg-loop-glow" />
      <Label x={475} y={128} anchor="middle" size={9} color="yellow">{labels.loopCondition}</Label>
    </Figure>
  );
}
