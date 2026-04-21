import { Figure } from "../Figure";
import { DropShadowDef, Label, colorTokens, type ColorKey } from "../primitives";

export interface BlockTypesGalleryLabels {
  title: string;
  desc?: string;
  caption?: string;
  blocks: { name: string; syntax: string; color: string }[];
}

const palette: ColorKey[] = ["blue", "orange", "green", "purple", "pink", "teal", "yellow"];

export function BlockTypesGallery({ labels }: { labels: BlockTypesGalleryLabels }) {
  const cellW = 220;
  const cellH = 70;
  const cols = 3;
  const gap = 20;
  const rows = Math.ceil(labels.blocks.length / cols);
  const totalH = rows * (cellH + gap) + 40;
  const viewW = cols * (cellW + gap) + 40;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox={`0 0 ${viewW} ${totalH}`} maxWidth={760}>
      <defs>
        <DropShadowDef id="btShadow" />
      </defs>
      {labels.blocks.map((b, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const x = 20 + c * (cellW + gap);
        const y = 20 + r * (cellH + gap);
        const color = palette[i % palette.length]!;
        const t = colorTokens[color];
        return (
          <g key={i}>
            <rect x={x} y={y} width={cellW} height={cellH} fill={t.fill} stroke={t.stroke} strokeWidth={2} rx={6} filter="url(#btShadow)" />
            <Label x={x + 12} y={y + 22} size={11} bold color={color}>{b.name}</Label>
            <text x={x + 12} y={y + 48} fontSize="10" fontFamily="monospace" fill={t.text}>{b.syntax}</text>
          </g>
        );
      })}
    </Figure>
  );
}
