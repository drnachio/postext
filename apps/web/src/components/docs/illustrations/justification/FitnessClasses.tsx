import { Figure } from "../Figure";
import { Box, DropShadowDef, Label } from "../primitives";

export interface FitnessClassesLabels {
  title: string;
  desc?: string;
  caption?: string;
  classes: { name: string; range: string; example: string }[]; // 4 entries
  adjacentNote: string;
}

const palette = ["pink", "blue", "orange", "purple"] as const;

export function FitnessClasses({ labels }: { labels: FitnessClassesLabels }) {
  const boxW = 170;
  const gap = 10;
  const totalW = boxW * 4 + gap * 3;
  const startX = (760 - totalW) / 2;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 220" maxWidth={760}>
      <defs>
        <DropShadowDef id="fcShadow" />
      </defs>
      {labels.classes.slice(0, 4).map((c, i) => {
        const x = startX + i * (boxW + gap);
        const color = palette[i]!;
        return (
          <g key={i}>
            <Box x={x} y={30} width={boxW} height={130} color={color} filter="url(#fcShadow)" />
            <Label x={x + boxW / 2} y={52} anchor="middle" size={11} bold color={color}>{c.name}</Label>
            <Label x={x + boxW / 2} y={70} anchor="middle" size={10} color={color}>{c.range}</Label>
            <text x={x + boxW / 2} y={92} textAnchor="middle" fontFamily="monospace" fontSize="10" fill={`var(--svg-${color}-text)`}>{c.example}</text>
            {/* sample line widths illustrating fitness */}
            <rect x={x + 20} y={108} width={boxW - 40} height={4} rx={1} fill={`var(--svg-${color}-text)`} opacity={0.35} />
            <rect x={x + 20} y={118} width={i === 0 ? boxW - 50 : i === 1 ? boxW - 42 : i === 2 ? boxW - 35 : boxW - 25} height={4} rx={1} fill={`var(--svg-${color}-text)`} opacity={0.5} />
            <rect x={x + 20} y={128} width={boxW - 40} height={4} rx={1} fill={`var(--svg-${color}-text)`} opacity={0.35} />
            <rect x={x + 20} y={138} width={i === 0 ? boxW - 55 : i === 1 ? boxW - 42 : i === 2 ? boxW - 30 : boxW - 20} height={4} rx={1} fill={`var(--svg-${color}-text)`} opacity={0.5} />
          </g>
        );
      })}
      <Label x={380} y={190} anchor="middle" size={10} color="light">{labels.adjacentNote}</Label>
    </Figure>
  );
}
