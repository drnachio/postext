import { Figure } from "../Figure";
import { Label, colorTokens } from "../primitives";

export interface ListNestingLabels {
  title: string;
  desc?: string;
  caption?: string;
  level1: string;
  level2: string;
  level3: string;
  indentNote: string;
}

export function ListNesting({ labels }: { labels: ListNestingLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 260" maxWidth={760}>
      <rect x={20} y={20} width={720} height={220} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1} rx={6} />

      {[0, 1, 2].map((i) => {
        const y = 60 + i * 50;
        const x = 60 + i * 40;
        const color = [colorTokens.blue, colorTokens.orange, colorTokens.green][i]!;
        const label = [labels.level1, labels.level2, labels.level3][i]!;
        return (
          <g key={i} className={`svg-fade-${i + 1}`}>
            <circle cx={x - 12} cy={y + 4} r={4} fill={color.stroke} />
            <rect x={x} y={y} width={500 - i * 40} height={14} rx={2} fill={color.fill} stroke={color.stroke} strokeWidth={1.2} />
            <Label x={x + 520 - i * 40} y={y + 10} size={9} color="mid">{label}</Label>
          </g>
        );
      })}

      <line x1={40} y1={220} x2={720} y2={220} stroke="var(--svg-grid)" strokeDasharray="3,3" />
      <Label x={380} y={235} anchor="middle" size={9} color="light">{labels.indentNote}</Label>
    </Figure>
  );
}
