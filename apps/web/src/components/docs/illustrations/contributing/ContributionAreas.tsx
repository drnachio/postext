import { Figure } from "../Figure";
import { Box, DropShadowDef, Label, type ColorKey } from "../primitives";

export interface ContributionAreasLabels {
  title: string;
  desc?: string;
  caption?: string;
  areas: { name: string; items: string[] }[]; // four entries
}

const colors: ColorKey[] = ["blue", "orange", "green", "purple"];

export function ContributionAreas({ labels }: { labels: ContributionAreasLabels }) {
  const areas = labels.areas.slice(0, 4);
  const cellW = 340;
  const cellH = 140;
  const gap = 20;
  return (
    <Figure
      title={labels.title}
      desc={labels.desc}
      caption={labels.caption}
      viewBox="0 0 760 320"
      maxWidth={760}
    >
      <defs>
        <DropShadowDef id="caShadow" />
      </defs>

      {areas.map((area, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 20 + col * (cellW + gap);
        const y = 20 + row * (cellH + gap);
        const color = colors[i] ?? "blue";
        return (
          <g key={i}>
            <Box x={x} y={y} width={cellW} height={cellH} color={color} filter="url(#caShadow)" />
            <Label x={x + 16} y={y + 26} size={12} bold color={color}>{area.name}</Label>
            {area.items.slice(0, 4).map((item, j) => (
              <Label key={j} x={x + 20} y={y + 52 + j * 20} size={10} color={color}>{`• ${item}`}</Label>
            ))}
          </g>
        );
      })}
    </Figure>
  );
}
