import { Figure } from "../Figure";
import { Label, colorTokens } from "../primitives";

export interface SpacingScaleLabels {
  title: string;
  desc?: string;
  caption?: string;
  steps: { name: string; value: string; px: number }[];
}

export function SpacingScale({ labels }: { labels: SpacingScaleLabels }) {
  const startX = 120;
  const startY = 40;
  const rowH = 30;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 260" maxWidth={760}>
      {labels.steps.map((s, i) => {
        const y = startY + i * rowH;
        return (
          <g key={i} className={`svg-fade-${Math.min(i + 1, 7)}`}>
            <Label x={100} y={y + 12} anchor="end" size={10} bold color="mid">{s.name}</Label>
            <rect x={startX} y={y} width={s.px} height={16} fill={colorTokens.teal.fill} stroke={colorTokens.teal.stroke} strokeWidth={1.5} rx={2} />
            <Label x={startX + s.px + 8} y={y + 12} size={9} color="teal">{s.value}</Label>
          </g>
        );
      })}
    </Figure>
  );
}
