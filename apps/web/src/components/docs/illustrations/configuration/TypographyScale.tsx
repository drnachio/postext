import { Figure } from "../Figure";
import { Label, colorTokens } from "../primitives";

export interface TypographyScaleLabels {
  title: string;
  desc?: string;
  caption?: string;
  rows: { role: string; sample: string; size: string }[];
}

export function TypographyScale({ labels }: { labels: TypographyScaleLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 280" maxWidth={760}>
      <line x1={40} y1={30} x2={40} y2={250} stroke="var(--svg-grid)" strokeDasharray="3,3" />
      <line x1={720} y1={30} x2={720} y2={250} stroke="var(--svg-grid)" strokeDasharray="3,3" />

      {labels.rows.map((r, i) => {
        const y = 50 + i * 38;
        const sizePx = parseInt(r.size, 10) || 12;
        return (
          <g key={i}>
            <Label x={55} y={y + 4} size={10} color="mid">{r.role}</Label>
            <text x={170} y={y + sizePx / 3} fontSize={sizePx} fontFamily="serif" fill={colorTokens.blue.text} fontWeight={r.role.toLowerCase().includes("head") ? "bold" : "normal"}>
              {r.sample}
            </text>
            <Label x={705} y={y + 4} size={10} color="light" anchor="end">{r.size}</Label>
          </g>
        );
      })}
    </Figure>
  );
}
