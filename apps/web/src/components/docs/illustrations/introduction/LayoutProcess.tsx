import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label } from "../primitives";

export interface LayoutProcessLabels {
  title: string;
  desc?: string;
  caption?: string;
  inputTitle: string;
  inputSubtitle: string;
  parse: string;
  engineTitle: string;
  engineSub1: string;
  engineSub2: string;
  render: string;
  outputTitle: string;
  outputSubtitle: string;
}

export function LayoutProcess({ labels }: { labels: LayoutProcessLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 120" maxWidth={760}>
      <defs>
        <ArrowMarker id="pipeArrow" />
        <DropShadowDef id="pipeShadow" />
      </defs>
      <g className="svg-fade-1">
        <Box x={20} y={25} width={170} height={70} color="blue" filter="url(#pipeShadow)" />
        <Label x={105} y={55} anchor="middle" size={11} bold color="blue">{labels.inputTitle}</Label>
        <Label x={105} y={73} anchor="middle" color="blue">{labels.inputSubtitle}</Label>
      </g>
      <g className="svg-fade-2">
        <line x1={190} y1={60} x2={270} y2={60} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#pipeArrow)" className="svg-flow" />
        <Label x={230} y={52} anchor="middle" size={8} color="light">{labels.parse}</Label>
      </g>
      <g className="svg-fade-3">
        <Box x={270} y={20} width={220} height={80} color="orange" filter="url(#pipeShadow)" />
        <Label x={380} y={48} anchor="middle" size={12} bold color="orange">{labels.engineTitle}</Label>
        <Label x={380} y={66} anchor="middle" color="purple">{labels.engineSub1}</Label>
        <Label x={380} y={84} anchor="middle" size={9} color="orange">{labels.engineSub2}</Label>
      </g>
      <g className="svg-fade-4">
        <line x1={490} y1={60} x2={570} y2={60} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#pipeArrow)" className="svg-flow" />
        <Label x={530} y={52} anchor="middle" size={8} color="light">{labels.render}</Label>
      </g>
      <g className="svg-fade-5">
        <Box x={570} y={25} width={170} height={70} color="teal" filter="url(#pipeShadow)" />
        <Label x={655} y={55} anchor="middle" size={11} bold color="teal">{labels.outputTitle}</Label>
        <Label x={655} y={73} anchor="middle" color="teal">{labels.outputSubtitle}</Label>
      </g>
    </Figure>
  );
}
