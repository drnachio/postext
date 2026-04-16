import { Figure } from "../Figure";
import { Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface GreedyVsKnuthPlassLabels {
  title: string;
  desc?: string;
  caption?: string;
  greedyTitle: string;
  greedyLead: string;
  greedyCons: string[];
  greedyEquals: string;
  kpTitle: string;
  kpLead: string;
  kpPros: string[];
  kpEquals: string;
}

// Mock ragged vs even lines as visual punchline at top of each column
function raggedLines(x: number, y: number, color: string) {
  const widths = [280, 200, 280, 150, 260];
  return widths.map((w, i) => (
    <rect key={i} x={x} y={y + i * 10} width={w} height={5} rx={1} fill={color} opacity={0.35} />
  ));
}
function evenLines(x: number, y: number, color: string) {
  const widths = [270, 270, 268, 272, 270];
  return widths.map((w, i) => (
    <rect key={i} x={x} y={y + i * 10} width={w} height={5} rx={1} fill={color} opacity={0.45} />
  ));
}

export function GreedyVsKnuthPlass({ labels }: { labels: GreedyVsKnuthPlassLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 280" maxWidth={760}>
      <defs>
        <DropShadowDef id="justShadow" />
      </defs>

      <Box x={20} y={30} width={340} height={230} color="pink" filter="url(#justShadow)" />
      <Label x={190} y={55} anchor="middle" size={12} bold color="pink">{labels.greedyTitle}</Label>
      <line x1={40} y1={65} x2={340} y2={65} stroke={colorTokens.pink.stroke} strokeWidth={1} opacity={0.3} />
      {raggedLines(40, 75, colorTokens.pink.text)}
      <Label x={40} y={145} color="pink">{labels.greedyLead}</Label>
      {labels.greedyCons.map((c, i) => (
        <Label key={i} x={40} y={165 + i * 20} color="mid">{`\u2717  ${c}`}</Label>
      ))}
      <Label x={40} y={245} color="mid">{labels.greedyEquals}</Label>

      <path d="M380,145 L410,145" stroke="var(--svg-stroke)" strokeWidth={2} fill="none" />
      <polygon points="410,140 420,145 410,150" fill="var(--svg-stroke)" />

      <Box x={420} y={30} width={320} height={230} color="green" filter="url(#justShadow)" />
      <Label x={580} y={55} anchor="middle" size={12} bold color="green">{labels.kpTitle}</Label>
      <line x1={440} y1={65} x2={720} y2={65} stroke={colorTokens.green.stroke} strokeWidth={1} opacity={0.3} />
      {evenLines(440, 75, colorTokens.green.text)}
      <Label x={440} y={145} color="green">{labels.kpLead}</Label>
      {labels.kpPros.map((p, i) => (
        <Label key={i} x={440} y={165 + i * 20} color="green">{`\u2713  ${p}`}</Label>
      ))}
      <Label x={440} y={245} color="green">{labels.kpEquals}</Label>
    </Figure>
  );
}
