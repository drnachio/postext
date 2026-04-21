import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface PretextPostextLabels {
  title: string;
  desc?: string;
  caption?: string;
  pretextTitle: string;
  pretextSubtitle: string;
  pretextBullets: string[];
  bridge: string[];
  postextTitle: string;
  postextSubtitle: string;
  postextBullets: string[];
}

export function PretextPostextPipeline({ labels }: { labels: PretextPostextLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 160" maxWidth={760}>
      <defs>
        <ArrowMarker id="relArrow" />
        <DropShadowDef id="relShadow" />
      </defs>
      <Box x={20} y={20} width={280} height={120} color="purple" filter="url(#relShadow)" />
      <Label x={160} y={45} anchor="middle" size={13} bold color="purple">{labels.pretextTitle}</Label>
      <Label x={160} y={63} anchor="middle" color="purple">{labels.pretextSubtitle}</Label>
      <line x1={40} y1={72} x2={280} y2={72} stroke={colorTokens.purple.stroke} strokeWidth={1} opacity={0.3} />
      {labels.pretextBullets.map((b, i) => (
        <Label key={i} x={40} y={92 + i * 18} color="purple">{b}</Label>
      ))}

      <line x1={300} y1={80} x2={400} y2={80} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#relArrow)" />
      {labels.bridge.map((b, i) => (
        <Label key={i} x={350} y={72 + i * 23} anchor="middle" size={9} color="light">{b}</Label>
      ))}

      <Box x={400} y={20} width={340} height={120} color="orange" filter="url(#relShadow)" />
      <Label x={570} y={45} anchor="middle" size={13} bold color="orange">{labels.postextTitle}</Label>
      <Label x={570} y={63} anchor="middle" color="orange">{labels.postextSubtitle}</Label>
      <line x1={420} y1={72} x2={720} y2={72} stroke={colorTokens.orange.stroke} strokeWidth={1} opacity={0.3} />
      {labels.postextBullets.map((b, i) => (
        <Label key={i} x={420} y={92 + i * 18} color="orange">{b}</Label>
      ))}
    </Figure>
  );
}
