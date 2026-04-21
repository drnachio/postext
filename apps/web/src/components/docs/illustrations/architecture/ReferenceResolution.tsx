import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface ReferenceResolutionLabels {
  title: string;
  desc?: string;
  caption?: string;
  markdownTitle: string;
  markdownLine1: string;
  markdownLine2: string;
  markdownLine3: string;
  notesTitle: string;
  noteLine: string;
  resourcesTitle: string;
  resourceLine: string;
  resolveLabel: string;
  outputTitle: string;
  outputFigure: string;
  outputFootnote: string;
}

export function ReferenceResolution({ labels }: { labels: ReferenceResolutionLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 300" maxWidth={760}>
      <defs>
        <ArrowMarker id="rrArrow" />
        <ArrowMarker id="rrArrowOrange" color={colorTokens.orange.stroke} />
        <ArrowMarker id="rrArrowGreen" color={colorTokens.green.stroke} />
        <DropShadowDef id="rrShadow" />
      </defs>

      <Box x={20} y={30} width={240} height={100} color="blue" filter="url(#rrShadow)" />
      <Label x={140} y={50} anchor="middle" size={11} bold color="blue">{labels.markdownTitle}</Label>
      <text x={35} y={75} fontSize="10" fontFamily="monospace" fill="var(--svg-mid-text)">{labels.markdownLine1}</text>
      <text x={35} y={93} fontSize="10" fontFamily="monospace" fill="var(--svg-mid-text)">
        <tspan fill={colorTokens.orange.text} fontWeight="bold">{labels.markdownLine2}</tspan>
      </text>
      <text x={35} y={113} fontSize="10" fontFamily="monospace" fill="var(--svg-mid-text)">
        {labels.markdownLine3.split("[^1]").flatMap((s, i, arr) => i < arr.length - 1 ? [<tspan key={i}>{s}</tspan>, <tspan key={`m${i}`} fill={colorTokens.green.text} fontWeight="bold">[^1]</tspan>] : [<tspan key={i}>{s}</tspan>])}
      </text>

      <Box x={290} y={20} width={220} height={60} color="orange" filter="url(#rrShadow)" />
      <Label x={400} y={42} anchor="middle" size={11} bold color="orange">{labels.resourcesTitle}</Label>
      <text x={305} y={63} fontSize="9" fontFamily="monospace" fill={colorTokens.orange.text}>{labels.resourceLine}</text>

      <Box x={290} y={95} width={220} height={60} color="green" filter="url(#rrShadow)" />
      <Label x={400} y={117} anchor="middle" size={11} bold color="green">{labels.notesTitle}</Label>
      <text x={305} y={138} fontSize="9" fontFamily="monospace" fill={colorTokens.green.text}>{labels.noteLine}</text>

      <path d="M 260 88 Q 275 55 290 50" stroke={colorTokens.orange.stroke} strokeWidth={1.5} fill="none" strokeDasharray="3,3" markerEnd="url(#rrArrowOrange)" />
      <path d="M 260 113 Q 275 120 290 125" stroke={colorTokens.green.stroke} strokeWidth={1.5} fill="none" strokeDasharray="3,3" markerEnd="url(#rrArrowGreen)" />

      <line x1={520} y1={90} x2={570} y2={90} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#rrArrow)" />
      <Label x={545} y={82} anchor="middle" size={9} color="light">{labels.resolveLabel}</Label>

      <Box x={580} y={30} width={160} height={220} color="teal" filter="url(#rrShadow)" />
      <Label x={660} y={50} anchor="middle" size={11} bold color="teal">{labels.outputTitle}</Label>
      <rect x={600} y={65} width={120} height={60} fill="var(--svg-orange-fill)" stroke={colorTokens.orange.stroke} strokeWidth={1.5} rx={4} />
      <Label x={660} y={100} anchor="middle" size={10} bold color="orange">{labels.outputFigure}</Label>
      <rect x={600} y={200} width={120} height={30} fill="var(--svg-green-fill)" stroke={colorTokens.green.stroke} strokeWidth={1.5} rx={4} strokeDasharray="3,2" />
      <Label x={660} y={220} anchor="middle" size={10} color="green">{labels.outputFootnote}</Label>
    </Figure>
  );
}
