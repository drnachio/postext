import { Figure } from "../Figure";
import { Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface CssGapLabels {
  title: string;
  desc?: string;
  caption?: string;
  cssTitle: string;
  cssLead: string;
  cssMore: string;
  cssCons: string[];
  gap: string;
  editorialTitle: string;
  editorialPros: string[];
  equals: string;
}

export function CssGapVsEditorial({ labels }: { labels: CssGapLabels }) {
  const pink = colorTokens.pink;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 280" maxWidth={760}>
      <defs>
        <DropShadowDef id="gapShadow" />
      </defs>
      <Box x={20} y={30} width={320} height={220} color="pink" filter="url(#gapShadow)" />
      <Label x={180} y={55} anchor="middle" size={12} bold color="pink">{labels.cssTitle}</Label>
      <line x1={40} y1={65} x2={320} y2={65} stroke={pink.stroke} strokeWidth={1} opacity={0.3} />
      <Label x={50} y={92} color="pink">{labels.cssLead}</Label>
      <Label x={50} y={112} color="pink">{labels.cssMore}</Label>
      {labels.cssCons.map((c, i) => (
        <Label key={i} x={50} y={142 + i * 20} color="mid">{`\u2717  ${c}`}</Label>
      ))}

      <path d="M360,134 L390,134" stroke="var(--svg-stroke)" strokeWidth={2} fill="none" />
      <polygon points="390,129 400,134 390,139" fill="var(--svg-stroke)" />
      <Label x={380} y={162} anchor="middle" size={10} bold color="stroke">{labels.gap}</Label>

      <Box x={420} y={30} width={320} height={220} color="green" filter="url(#gapShadow)" />
      <Label x={580} y={55} anchor="middle" size={12} bold color="green">{labels.editorialTitle}</Label>
      <line x1={440} y1={65} x2={720} y2={65} stroke={colorTokens.green.stroke} strokeWidth={1} opacity={0.3} />
      {labels.editorialPros.map((p, i) => (
        <Label key={i} x={450} y={92 + i * 22} color="green">{`\u2713  ${p}`}</Label>
      ))}
      <Label x={450} y={232} bold color="green">{labels.equals}</Label>
    </Figure>
  );
}
