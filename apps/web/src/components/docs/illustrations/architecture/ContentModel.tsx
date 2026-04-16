import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface ContentModelLabels {
  title: string;
  desc?: string;
  caption?: string;
  contentTitle: string;
  markdown: string;
  markdownSub: string;
  resources: string;
  resourcesSub: string;
  notes: string;
  notesSub: string;
  resolveMarker: string;
  engineLabel: string;
  vdtLabel: string;
}

export function ContentModel({ labels }: { labels: ContentModelLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 280" maxWidth={760}>
      <defs>
        <ArrowMarker id="cmArrow" />
        <DropShadowDef id="cmShadow" />
      </defs>

      <rect x={20} y={20} width={360} height={220} fill="none" stroke="var(--svg-legend-stroke)" strokeWidth={1} rx={8} strokeDasharray="6,4" />
      <Label x={200} y={40} anchor="middle" size={12} bold color="dark">{labels.contentTitle}</Label>

      <Box x={40} y={58} width={320} height={60} color="blue" filter="url(#cmShadow)" />
      <Label x={200} y={80} anchor="middle" size={11} bold color="blue">{labels.markdown}</Label>
      <Label x={200} y={100} anchor="middle" color="blue">{labels.markdownSub}</Label>

      <Box x={40} y={128} width={155} height={52} color="orange" filter="url(#cmShadow)" />
      <Label x={117} y={148} anchor="middle" size={10} bold color="orange">{labels.resources}</Label>
      <Label x={117} y={164} anchor="middle" size={9} color="orange">{labels.resourcesSub}</Label>

      <Box x={205} y={128} width={155} height={52} color="green" filter="url(#cmShadow)" />
      <Label x={282} y={148} anchor="middle" size={10} bold color="green">{labels.notes}</Label>
      <Label x={282} y={164} anchor="middle" size={9} color="green">{labels.notesSub}</Label>

      <path d="M 200 118 Q 150 125 120 128" stroke={colorTokens.orange.stroke} strokeWidth={1.5} fill="none" strokeDasharray="3,3" markerEnd="url(#cmArrow)" />
      <path d="M 200 118 Q 250 125 282 128" stroke={colorTokens.green.stroke} strokeWidth={1.5} fill="none" strokeDasharray="3,3" markerEnd="url(#cmArrow)" />
      <Label x={200} y={206} anchor="middle" size={9} color="light">{labels.resolveMarker}</Label>

      <line x1={380} y1={130} x2={430} y2={130} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#cmArrow)" className="svg-flow" />

      <Box x={440} y={90} width={140} height={80} color="orange" filter="url(#cmShadow)" />
      <Label x={510} y={135} anchor="middle" size={12} bold color="orange">{labels.engineLabel}</Label>

      <line x1={580} y1={130} x2={630} y2={130} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#cmArrow)" className="svg-flow" />

      <Box x={640} y={90} width={100} height={80} color="green" filter="url(#cmShadow)" />
      <Label x={690} y={135} anchor="middle" size={12} bold color="green">{labels.vdtLabel}</Label>
    </Figure>
  );
}
