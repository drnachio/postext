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
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 800 196" maxWidth={800}>
      <defs>
        <ArrowMarker id="lp-arrow" />
        <DropShadowDef id="lp-shadow" />
      </defs>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .lp-dot { animation: lp-travel 4.8s ease-in-out infinite; }
          .lp-dot--late { animation-delay: 2.4s; }
          .lp-iter { animation: lp-iterate 3.2s linear infinite; }
          @keyframes lp-travel {
            0% { transform: translateX(0); opacity: 0; }
            8% { opacity: 1; }
            38% { transform: translateX(60px); opacity: 1; }
            46%, 100% { transform: translateX(60px); opacity: 0; }
          }
          @keyframes lp-iterate { to { stroke-dashoffset: -22; } }
        }
      `}</style>

      {/* stage markers */}
      <circle cx={112} cy={24} r={10} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1.5} />
      <Label x={112} y={27.5} anchor="middle" size={10} bold color="blue">1</Label>
      <circle cx={400} cy={24} r={10} fill="var(--svg-orange-fill)" stroke="var(--svg-orange-stroke)" strokeWidth={1.5} />
      <Label x={400} y={27.5} anchor="middle" size={10} bold color="orange">2</Label>
      <circle cx={688} cy={24} r={10} fill="var(--svg-teal-fill)" stroke="var(--svg-teal-stroke)" strokeWidth={1.5} />
      <Label x={688} y={27.5} anchor="middle" size={10} bold color="teal">3</Label>

      {/* stage 1 — input: a markdown document */}
      <g>
        <Box x={22} y={57} width={180} height={108} color="blue" rx={8} strokeWidth={1.5} />
        {/* faux markdown lines */}
        <text x={36} y={80} fontSize={10} fontWeight="bold" fill="var(--svg-blue-text)" opacity={0.55}>#</text>
        <rect x={50} y={72} width={82} height={4.5} rx={2.25} fill="var(--svg-blue-text)" opacity={0.3} />
        <rect x={36} y={82} width={128} height={4.5} rx={2.25} fill="var(--svg-blue-text)" opacity={0.3} />
        <rect x={36} y={92} width={100} height={4.5} rx={2.25} fill="var(--svg-blue-text)" opacity={0.3} />
        <Label x={112} y={128} anchor="middle" size={11} bold color="blue">{labels.inputTitle}</Label>
        <Label x={112} y={146} anchor="middle" size={10} color="mid">{labels.inputSubtitle}</Label>
      </g>

      {/* parse arrow */}
      <g>
        <line x1={206} y1={111} x2={272} y2={111} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#lp-arrow)" />
        <Label x={239} y={101} anchor="middle" size={9} color="light">{labels.parse}</Label>
        <circle className="lp-dot" cx={208} cy={111} r={3.5} fill="var(--svg-blue-stroke)" opacity={0} />
      </g>

      {/* stage 2 — the engine, the focal point */}
      <g>
        <Box x={276} y={46} width={248} height={130} color="orange" rx={8} filter="url(#lp-shadow)" />
        <Label x={400} y={76} anchor="middle" size={12} bold color="orange">{labels.engineTitle}</Label>
        {/* Pretext measurement inside */}
        <rect x={294} y={92} width={212} height={26} rx={6} fill="var(--svg-purple-fill)" stroke="var(--svg-purple-stroke)" strokeWidth={1.5} />
        <Label x={400} y={109} anchor="middle" size={10} color="purple">{labels.engineSub1}</Label>
        {/* multi-pass layout: dashed border cycles to suggest iteration */}
        <rect
          className="lp-iter"
          x={294}
          y={126}
          width={212}
          height={26}
          rx={6}
          fill="var(--svg-legend-fill)"
          stroke="var(--svg-orange-stroke)"
          strokeWidth={1.5}
          strokeDasharray="6 5"
        />
        <Label x={400} y={143} anchor="middle" size={10} color="orange">{labels.engineSub2}</Label>
      </g>

      {/* render arrow */}
      <g>
        <line x1={528} y1={111} x2={594} y2={111} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#lp-arrow)" />
        <Label x={561} y={101} anchor="middle" size={9} color="light">{labels.render}</Label>
        <circle className="lp-dot lp-dot--late" cx={530} cy={111} r={3.5} fill="var(--svg-teal-stroke)" opacity={0} />
      </g>

      {/* stage 3 — output: a rendered two-column page */}
      <g>
        <Box x={598} y={57} width={180} height={108} color="teal" rx={8} strokeWidth={1.5} />
        {/* faux justified two-column geometry */}
        <rect x={614} y={72} width={68} height={4.5} rx={2.25} fill="var(--svg-teal-text)" opacity={0.3} />
        <rect x={614} y={82} width={68} height={4.5} rx={2.25} fill="var(--svg-teal-text)" opacity={0.3} />
        <rect x={614} y={92} width={68} height={4.5} rx={2.25} fill="var(--svg-teal-text)" opacity={0.3} />
        <rect x={690} y={72} width={68} height={4.5} rx={2.25} fill="var(--svg-teal-text)" opacity={0.3} />
        <rect x={690} y={82} width={68} height={4.5} rx={2.25} fill="var(--svg-teal-text)" opacity={0.3} />
        <rect x={690} y={92} width={44} height={4.5} rx={2.25} fill="var(--svg-teal-text)" opacity={0.3} />
        <Label x={688} y={128} anchor="middle" size={11} bold color="teal">{labels.outputTitle}</Label>
        <Label x={688} y={146} anchor="middle" size={10} color="mid">{labels.outputSubtitle}</Label>
      </g>
    </Figure>
  );
}
