import { Figure } from "../Figure";
import { DropShadowDef, Label } from "../primitives";

export interface VerticalRhythmLabels {
  title: string;
  desc?: string;
  caption?: string;
  column1: string;
  column2: string;
  bodyLine: string;
  bodyBaseline: string;
  heading: string;
  adjustment: string;
  backOnGrid: string;
  aligned: string;
  legendTitle: string;
  legendSteps: string[];
}

export function VerticalRhythm({ labels }: { labels: VerticalRhythmLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 600 400" maxWidth={600}>
      <defs>
        <DropShadowDef id="rhythmShadow" />
      </defs>

      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => (
        <line key={i} x1={20} y1={30 + i * 24} x2={580} y2={30 + i * 24} stroke="var(--svg-grid)" strokeWidth={1} strokeDasharray="4,4" />
      ))}

      <Label x={145} y={22} anchor="middle" size={11} bold color="dark">{labels.column1}</Label>

      <rect x={40} y={30} width={210} height={24} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} />
      <Label x={50} y={47} color="blue">{labels.bodyBaseline}</Label>
      <rect x={40} y={54} width={210} height={24} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} />
      <Label x={50} y={71} color="blue">{labels.bodyLine}</Label>

      <rect x={40} y={78} width={210} height={36} fill="var(--svg-orange-fill)" stroke="var(--svg-orange-stroke)" strokeWidth={2} rx={3} />
      <Label x={50} y={100} size={12} bold color="orange">{labels.heading}</Label>

      <rect x={40} y={114} width={210} height={12} fill="var(--svg-pink-fill)" stroke="var(--svg-pink-stroke)" strokeWidth={1} strokeDasharray="3,2" />
      <Label x={260} y={124} size={9} color="pink" bold>{labels.adjustment}</Label>

      <rect x={40} y={126} width={210} height={24} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} />
      <Label x={50} y={143} color="blue">{labels.backOnGrid}</Label>
      <rect x={40} y={150} width={210} height={24} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} />
      <Label x={50} y={167} color="blue">{labels.bodyLine}</Label>
      <rect x={40} y={174} width={210} height={24} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} />
      <Label x={50} y={191} color="blue">{labels.bodyLine}</Label>

      <Label x={445} y={22} anchor="middle" size={11} bold color="dark">{labels.column2}</Label>
      {[30, 54, 78, 102, 126, 150, 174].map((y, i) => (
        <g key={i}>
          <rect x={340} y={y} width={210} height={24} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} />
          <Label x={350} y={y + 17} color="blue">{labels.bodyLine}</Label>
        </g>
      ))}

      <line x1={252} y1={126} x2={338} y2={126} stroke="var(--svg-green-stroke)" strokeWidth={2} strokeDasharray="4,2" />
      <Label x={295} y={138} anchor="middle" size={8} color="green" bold>{labels.aligned}</Label>
      <line x1={252} y1={150} x2={338} y2={150} stroke="var(--svg-green-stroke)" strokeWidth={2} strokeDasharray="4,2" />
      <line x1={252} y1={174} x2={338} y2={174} stroke="var(--svg-green-stroke)" strokeWidth={2} strokeDasharray="4,2" />

      <rect x={40} y={230} width={520} height={150} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1} rx={6} filter="url(#rhythmShadow)" />
      <Label x={60} y={252} size={11} bold color="dark">{labels.legendTitle}</Label>
      {labels.legendSteps.map((s, i) => (
        <Label key={i} x={60} y={272 + i * 18} color="mid">{s}</Label>
      ))}

      {[0, 24, 48, 72, 96, 120, 144, 168].map((v, i) => (
        <text key={i} x={v < 100 ? 15 : 10} y={34 + i * 24} fontSize="8" fill="var(--svg-faint-text)">{v}</text>
      ))}
    </Figure>
  );
}
