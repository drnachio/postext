import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label } from "../primitives";

export interface SandboxSyncFlowLabels {
  title: string;
  desc?: string;
  caption?: string;
  markdownLabel: string;
  configLabel: string;
  vdtTitle: string;
  vdtSubtitle: string;
  canvasLabel: string;
  htmlLabel: string;
  pdfLabel: string;
  singleSource: string;
}

export function SandboxSyncFlow({ labels }: { labels: SandboxSyncFlowLabels }) {
  return (
    <Figure
      title={labels.title}
      desc={labels.desc}
      caption={labels.caption}
      viewBox="0 0 760 260"
      maxWidth={760}
    >
      <defs>
        <ArrowMarker id="ssfArrow" />
        <DropShadowDef id="ssfShadow" />
      </defs>

      {/* Input: markdown + config */}
      <Box x={20} y={50} width={150} height={50} color="blue" filter="url(#ssfShadow)" />
      <Label x={95} y={80} anchor="middle" size={11} bold color="blue">{labels.markdownLabel}</Label>

      <Box x={20} y={150} width={150} height={50} color="blue" filter="url(#ssfShadow)" />
      <Label x={95} y={180} anchor="middle" size={11} bold color="blue">{labels.configLabel}</Label>

      {/* Arrows to VDT */}
      <line x1={170} y1={75} x2={290} y2={115} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#ssfArrow)" />
      <line x1={170} y1={175} x2={290} y2={135} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#ssfArrow)" />

      {/* Central VDT */}
      <Box x={290} y={90} width={180} height={80} color="green" filter="url(#ssfShadow)" />
      <Label x={380} y={120} anchor="middle" size={12} bold color="green">{labels.vdtTitle}</Label>
      <Label x={380} y={140} anchor="middle" size={9} color="green">{labels.vdtSubtitle}</Label>
      <Label x={380} y={157} anchor="middle" size={9} color="green">{labels.singleSource}</Label>

      {/* Arrows from VDT to three outputs */}
      <line x1={470} y1={110} x2={580} y2={60} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#ssfArrow)" />
      <line x1={470} y1={130} x2={580} y2={130} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#ssfArrow)" />
      <line x1={470} y1={150} x2={580} y2={200} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#ssfArrow)" />

      {/* Three outputs */}
      <Box x={585} y={35} width={150} height={50} color="teal" filter="url(#ssfShadow)" />
      <Label x={660} y={65} anchor="middle" size={11} bold color="teal">{labels.canvasLabel}</Label>

      <Box x={585} y={105} width={150} height={50} color="orange" filter="url(#ssfShadow)" />
      <Label x={660} y={135} anchor="middle" size={11} bold color="orange">{labels.htmlLabel}</Label>

      <Box x={585} y={175} width={150} height={50} color="pink" filter="url(#ssfShadow)" />
      <Label x={660} y={205} anchor="middle" size={11} bold color="pink">{labels.pdfLabel}</Label>
    </Figure>
  );
}
