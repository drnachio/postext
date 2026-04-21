import { Figure } from "../Figure";
import { Box, DropShadowDef, Label } from "../primitives";

export interface VdtStructureLabels {
  title: string;
  desc?: string;
  caption?: string;
  document: string;
  pageLabels: [string, string, string];
  columnLabels: [string, string];
  blockLabels: [string, string, string];
  lineLabels: [string, string];
  legendHeader: string;
  legendAttrs: string[];
  linesHeader: string;
  linesAttrs: string[];
}

export function VdtStructure({ labels }: { labels: VdtStructureLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 700 320" maxWidth={700}>
      <defs>
        <DropShadowDef id="vdtShadow" />
      </defs>

      <g>
        <Box x={270} y={15} width={160} height={40} color="green" filter="url(#vdtShadow)" />
        <Label x={350} y={40} anchor="middle" size={12} bold color="green">{labels.document}</Label>
      </g>

      <g>
        <line x1={310} y1={55} x2={200} y2={85} stroke="var(--svg-stroke)" strokeWidth={1.5} />
        <line x1={350} y1={55} x2={350} y2={85} stroke="var(--svg-stroke)" strokeWidth={1.5} />
        <line x1={390} y1={55} x2={500} y2={85} stroke="var(--svg-stroke)" strokeWidth={1.5} />
        <Box x={130} y={85} width={140} height={35} color="blue" />
        <Label x={200} y={107} anchor="middle" size={11} bold color="blue">{labels.pageLabels[0]}</Label>
        <Box x={280} y={85} width={140} height={35} color="blue" />
        <Label x={350} y={107} anchor="middle" size={11} bold color="blue">{labels.pageLabels[1]}</Label>
        <rect x={430} y={85} width={140} height={35} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1.5} rx={6} strokeDasharray="4,3" />
        <Label x={500} y={107} anchor="middle" size={11} color="blue">{labels.pageLabels[2]}</Label>
      </g>

      <g>
        <line x1={170} y1={120} x2={100} y2={155} stroke="var(--svg-stroke)" strokeWidth={1.5} />
        <line x1={230} y1={120} x2={250} y2={155} stroke="var(--svg-stroke)" strokeWidth={1.5} />
        <Box x={30} y={155} width={140} height={35} color="purple" />
        <Label x={100} y={177} anchor="middle" size={11} bold color="purple">{labels.columnLabels[0]}</Label>
        <Box x={180} y={155} width={140} height={35} color="purple" />
        <Label x={250} y={177} anchor="middle" size={11} bold color="purple">{labels.columnLabels[1]}</Label>
      </g>

      <g>
        <line x1={70} y1={190} x2={40} y2={220} stroke="var(--svg-stroke)" strokeWidth={1.5} />
        <line x1={100} y1={190} x2={100} y2={220} stroke="var(--svg-stroke)" strokeWidth={1.5} />
        <line x1={130} y1={190} x2={160} y2={220} stroke="var(--svg-stroke)" strokeWidth={1.5} />
        <Box x={5} y={220} width={70} height={30} color="orange" rx={4} strokeWidth={1.5} />
        <Label x={40} y={239} anchor="middle" size={9} color="orange">{labels.blockLabels[0]}</Label>
        <Box x={80} y={220} width={70} height={30} color="orange" rx={4} strokeWidth={1.5} />
        <Label x={115} y={239} anchor="middle" size={9} color="orange">{labels.blockLabels[1]}</Label>
        <Box x={155} y={220} width={70} height={30} color="orange" rx={4} strokeWidth={1.5} />
        <Label x={190} y={239} anchor="middle" size={9} color="orange">{labels.blockLabels[2]}</Label>
      </g>

      <g>
        <line x1={105} y1={250} x2={80} y2={275} stroke="var(--svg-stroke)" strokeWidth={1} />
        <line x1={115} y1={250} x2={115} y2={275} stroke="var(--svg-stroke)" strokeWidth={1} />
        <line x1={125} y1={250} x2={150} y2={275} stroke="var(--svg-stroke)" strokeWidth={1} />
        <Box x={55} y={275} width={50} height={25} color="teal" rx={4} strokeWidth={1.5} />
        <Label x={80} y={292} anchor="middle" size={9} color="teal">{labels.lineLabels[0]}</Label>
        <Box x={110} y={275} width={50} height={25} color="teal" rx={4} strokeWidth={1.5} />
        <Label x={135} y={292} anchor="middle" size={9} color="teal">{labels.lineLabels[1]}</Label>
      </g>

      <g>
        <Label x={420} y={160} color="mid">{labels.legendHeader}</Label>
        {labels.legendAttrs.map((a, i) => (
          <text key={i} x={420} y={178 + i * 18} fontSize="10" fill="var(--svg-mid-text)" fontFamily="monospace">{a}</text>
        ))}
        <Label x={420} y={260} color="light">{labels.linesHeader}</Label>
        {labels.linesAttrs.map((a, i) => (
          <text key={i} x={420} y={278 + i * 18} fontSize="10" fill="var(--svg-light-text)" fontFamily="monospace">{a}</text>
        ))}
      </g>
    </Figure>
  );
}
