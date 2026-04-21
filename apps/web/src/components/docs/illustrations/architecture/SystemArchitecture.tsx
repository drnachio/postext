import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface SystemArchitectureLabels {
  title: string;
  desc?: string;
  caption?: string;
  markdown: string;
  configTitle: string;
  configSubtitle: string;
  engine: string;
  parser: string;
  pass1: string;
  vdtLine1: string;
  vdtLine2: string;
  vdtAttr1: string;
  vdtAttr2: string;
  vdtAttr3: string;
  vdtAttr4: string;
  pretext: string;
  pretextSubtitle: string;
  passesTitle: string;
  passes: { num: string; name: string }[];
  convergence: string;
  backend: string;
  backendSubtitle: string;
  backendItems: string[];
  output: string;
  outputSubtitle: string;
}

export function SystemArchitecture({ labels }: { labels: SystemArchitectureLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 900 420" maxWidth={900}>
      <defs>
        <ArrowMarker id="archArrow" />
        <ArrowMarker id="archArrowPurple" color={colorTokens.purple.stroke} />
        <ArrowMarker id="archArrowYellow" color="var(--svg-yellow-stroke)" />
        <DropShadowDef id="archShadow" />
      </defs>

      <Box x={20} y={40} width={150} height={60} color="blue" filter="url(#archShadow)" />
      <Label x={95} y={65} anchor="middle" size={11} bold color="blue">{labels.markdown.split(" ")[0] ?? labels.markdown}</Label>
      <Label x={95} y={80} anchor="middle" size={11} bold color="blue">{labels.markdown.split(" ").slice(1).join(" ") || " "}</Label>

      <Box x={20} y={120} width={150} height={60} color="blue" filter="url(#archShadow)" />
      <Label x={95} y={145} anchor="middle" size={11} bold color="blue">{labels.configTitle}</Label>
      <Label x={95} y={162} anchor="middle" size={8} color="blue">{labels.configSubtitle}</Label>

      <line x1={170} y1={70} x2={210} y2={70} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#archArrow)" />
      <line x1={170} y1={150} x2={210} y2={150} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#archArrow)" />

      <rect x={210} y={15} width={480} height={390} fill="none" stroke="var(--svg-dark-text)" strokeWidth={2} rx={8} strokeDasharray="8,4" />
      <Label x={450} y={35} anchor="middle" size={12} bold color="dark">{labels.engine}</Label>

      <Box x={230} y={55} width={110} height={50} color="orange" filter="url(#archShadow)" />
      <Label x={285} y={78} anchor="middle" size={11} bold color="orange">{labels.parser}</Label>
      <Label x={285} y={93} anchor="middle" size={9} color="orange">{labels.pass1}</Label>

      <line x1={340} y1={80} x2={360} y2={80} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#archArrow)" />

      <Box x={360} y={50} width={200} height={130} color="green" filter="url(#archShadow)" />
      <Label x={460} y={75} anchor="middle" size={12} bold color="green">{labels.vdtLine1}</Label>
      <Label x={460} y={93} anchor="middle" size={12} bold color="green">{labels.vdtLine2}</Label>
      <Label x={460} y={115} anchor="middle" size={9} color="green">{labels.vdtAttr1}</Label>
      <Label x={460} y={132} anchor="middle" size={9} color="green">{labels.vdtAttr2}</Label>
      <Label x={460} y={149} anchor="middle" size={9} color="green">{labels.vdtAttr3}</Label>
      <Label x={460} y={166} anchor="middle" size={9} color="green">{labels.vdtAttr4}</Label>

      <Box x={230} y={130} width={110} height={50} color="purple" filter="url(#archShadow)" />
      <Label x={285} y={152} anchor="middle" size={11} bold color="purple">{labels.pretext}</Label>
      <Label x={285} y={167} anchor="middle" size={9} color="purple">{labels.pretextSubtitle}</Label>

      <line x1={340} y1={140} x2={360} y2={140} stroke={colorTokens.purple.stroke} strokeWidth={2} markerEnd="url(#archArrowPurple)" />
      <line x1={360} y1={160} x2={340} y2={160} stroke={colorTokens.purple.stroke} strokeWidth={2} markerEnd="url(#archArrowPurple)" />

      <Box x={230} y={210} width={420} height={170} color="yellow" filter="url(#archShadow)" />
      <Label x={440} y={232} anchor="middle" size={11} bold color="yellow">{labels.passesTitle}</Label>
      {labels.passes.map((p, i) => (
        <g key={i}>
          <text x={250} y={255 + i * 20} fontSize="10" fill="var(--svg-brown-text)">{p.num}</text>
          <text x={300} y={255 + i * 20} fontSize="10" fill="var(--svg-brown-text)">{p.name}</text>
        </g>
      ))}

      <path d="M 655 355 C 675 355, 675 250, 655 250" fill="none" stroke="var(--svg-yellow-stroke)" strokeWidth={2} markerEnd="url(#archArrowYellow)" />
      <text x={680} y={302} fontSize="8" fill="var(--svg-yellow-text)" textAnchor="middle" transform="rotate(90, 680, 302)">{labels.convergence}</text>

      <line x1={460} y1={182} x2={460} y2={208} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#archArrow)" />
      <line x1={560} y1={115} x2={720} y2={115} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#archArrow)" />

      <Box x={720} y={55} width={150} height={130} color="pink" filter="url(#archShadow)" />
      <Label x={795} y={80} anchor="middle" size={11} bold color="pink">{labels.backend}</Label>
      <Label x={795} y={98} anchor="middle" color="pink">{labels.backendSubtitle}</Label>
      {labels.backendItems.map((b, i) => (
        <Label key={i} x={795} y={125 + i * 17} anchor="middle" color="pink">{b}</Label>
      ))}

      <line x1={795} y1={187} x2={795} y2={220} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#archArrow)" />

      <Box x={720} y={222} width={150} height={50} color="teal" filter="url(#archShadow)" />
      <Label x={795} y={245} anchor="middle" size={11} bold color="teal">{labels.output}</Label>
      <Label x={795} y={260} anchor="middle" color="teal">{labels.outputSubtitle}</Label>
    </Figure>
  );
}
