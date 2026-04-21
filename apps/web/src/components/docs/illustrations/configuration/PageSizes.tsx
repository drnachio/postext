import { Figure } from "../Figure";
import { DropShadowDef, Label, colorTokens } from "../primitives";

export interface PageSizesLabels {
  title: string;
  desc?: string;
  caption?: string;
  sizes: { name: string; dims: string; wmm: number; hmm: number }[];
}

export function PageSizes({ labels }: { labels: PageSizesLabels }) {
  // Scale: find max w, h across all, fit to 120x160 cells
  const maxW = Math.max(...labels.sizes.map((s) => s.wmm));
  const maxH = Math.max(...labels.sizes.map((s) => s.hmm));
  const cellW = 160;
  const cellH = 200;
  const gap = 20;
  const startX = 40;
  const startY = 40;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox={`0 0 ${startX * 2 + labels.sizes.length * (cellW + gap) - gap} 300`} maxWidth={760}>
      <defs>
        <DropShadowDef id="psShadow" />
      </defs>
      {labels.sizes.map((s, i) => {
        const w = (s.wmm / maxW) * (cellW - 20);
        const h = (s.hmm / maxH) * (cellH - 40);
        const cx = startX + i * (cellW + gap);
        return (
          <g key={i}>
            <rect x={cx + (cellW - w) / 2} y={startY + (cellH - 40 - h)} width={w} height={h} fill={colorTokens.blue.fill} stroke={colorTokens.blue.stroke} strokeWidth={2} rx={4} filter="url(#psShadow)" />
            <Label x={cx + cellW / 2} y={startY + cellH - 15} anchor="middle" size={11} bold color="blue">{s.name}</Label>
            <Label x={cx + cellW / 2} y={startY + cellH} anchor="middle" size={9} color="mid">{s.dims}</Label>
          </g>
        );
      })}
    </Figure>
  );
}
