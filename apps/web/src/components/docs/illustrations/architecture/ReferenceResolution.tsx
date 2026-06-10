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
  // Split the :ref token (everything up to and including "}") from the trailing text.
  const braceIdx = labels.markdownLine3.indexOf("}");
  const refToken = braceIdx >= 0 ? labels.markdownLine3.slice(0, braceIdx + 1) : labels.markdownLine3;
  const refRest = braceIdx >= 0 ? labels.markdownLine3.slice(braceIdx + 1) : "";
  const tokenPillW = refToken.length * 6.2 + 10;

  // Split the quoted id out of the resource line: { id: 'printing-press', … }
  const q1 = labels.resourceLine.indexOf("'");
  const q2 = q1 >= 0 ? labels.resourceLine.indexOf("'", q1 + 1) : -1;
  const resPre = q2 >= 0 ? labels.resourceLine.slice(0, q1) : labels.resourceLine;
  const resId = q2 >= 0 ? labels.resourceLine.slice(q1, q2 + 1) : "";
  const resPost = q2 >= 0 ? labels.resourceLine.slice(q2 + 1) : "";

  // Highlight pill behind the resolved number in the running text.
  const numberPillW = labels.outputFootnote.length * 5.9 + 16;

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 714 352" maxWidth={714}>
      <defs>
        <ArrowMarker id="rrArrowBlue" color={colorTokens.blue.stroke} />
        <ArrowMarker id="rrArrowOrange" color={colorTokens.orange.stroke} />
        <DropShadowDef id="rrShadow" />
      </defs>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .rr-flow { animation: rr-dash 3s linear infinite; }
          @keyframes rr-dash { to { stroke-dashoffset: -24; } }
        }
      `}</style>

      {/* ── markdown source ── */}
      <Box x={24} y={44} width={294} height={104} color="blue" filter="url(#rrShadow)" />
      <Label x={40} y={66} size={11} bold color="blue">{labels.markdownTitle}</Label>
      <text x={40} y={88} fontSize={10} fill="var(--svg-mid-text)">{labels.markdownLine1}</text>
      <text x={40} y={106} fontSize={10} fill="var(--svg-mid-text)">{labels.markdownLine2}</text>
      <rect x={35} y={114} width={tokenPillW} height={15} rx={3} fill="var(--svg-orange-fill)" stroke={colorTokens.orange.stroke} strokeWidth={1} />
      <text x={40} y={125} fontSize={10} xmlSpace="preserve">
        <tspan fill={colorTokens.orange.text} fontWeight="bold">{refToken}</tspan>
        <tspan fill="var(--svg-mid-text)">{refRest}</tspan>
      </text>

      {/* id match: token → resource entry */}
      <line x1={80} y1={133} x2={80} y2={170} stroke={colorTokens.orange.stroke} strokeWidth={1.5} strokeDasharray="4 4" markerEnd="url(#rrArrowOrange)" className="rr-flow" />

      {/* ── resources[] ── */}
      <Box x={24} y={176} width={294} height={62} color="orange" filter="url(#rrShadow)" />
      <Label x={40} y={198} size={11} bold color="orange">{labels.resourcesTitle}</Label>
      <text x={40} y={220} fontSize={9} xmlSpace="preserve">
        <tspan fill="var(--svg-mid-text)">{resPre}</tspan>
        <tspan fill={colorTokens.orange.text} fontWeight="bold">{resId}</tspan>
        <tspan fill="var(--svg-mid-text)">{resPost}</tspan>
      </text>

      {/* ── optional ::resource block embed ── */}
      <rect x={24} y={266} width={294} height={56} rx={6} fill="var(--svg-green-fill)" stroke={colorTokens.green.stroke} strokeWidth={1.5} strokeDasharray="5 4" />
      <Label x={40} y={287} size={10} bold color="green">{labels.notesTitle}</Label>
      <text x={40} y={307} fontSize={9} fill="var(--svg-mid-text)">{labels.noteLine}</text>

      {/* ── resolution flows (drawn under the resolve chip) ── */}
      {/* the :ref token becomes a number in the running text */}
      <path d="M 318 120 C 365 120 385 205 442 205" fill="none" stroke={colorTokens.blue.stroke} strokeWidth={1.5} strokeDasharray="6 6" markerEnd="url(#rrArrowBlue)" className="rr-flow" />
      {/* the resource content floats up to a band */}
      <path d="M 318 207 C 365 207 385 99 442 99" fill="none" stroke={colorTokens.orange.stroke} strokeWidth={1.5} strokeDasharray="6 6" markerEnd="url(#rrArrowOrange)" className="rr-flow" />

      {/* resolve chip sits on the crossing point */}
      <rect x={345} y={151} width={74} height={28} rx={14} fill="var(--svg-legend-fill)" stroke="var(--svg-stroke)" strokeWidth={1.5} filter="url(#rrShadow)" />
      <Label x={382} y={169} anchor="middle" size={10} bold color="dark">{labels.resolveLabel}</Label>

      {/* ── laid-out page ── */}
      <Label x={570} y={32} anchor="middle" size={11} bold color="dark">{labels.outputTitle}</Label>
      <rect x={450} y={44} width={240} height={286} rx={6} fill="var(--svg-legend-fill)" stroke="var(--svg-stroke)" strokeWidth={1.5} filter="url(#rrShadow)" />

      {/* float band at the top of the page */}
      <rect x={462} y={58} width={216} height={82} rx={4} fill="var(--svg-orange-fill)" stroke={colorTokens.orange.stroke} strokeWidth={1.5} />
      <rect x={540} y={70} width={60} height={38} rx={3} fill="none" stroke={colorTokens.orange.stroke} strokeWidth={1.5} />
      <circle cx={556} cy={80} r={4} fill="none" stroke={colorTokens.orange.stroke} strokeWidth={1.5} />
      <path d="M 545 106 L 560 88 L 570 98 L 578 90 L 595 106" fill="none" stroke={colorTokens.orange.stroke} strokeWidth={1.5} strokeLinejoin="round" />
      <Label x={570} y={130} anchor="middle" size={9} color="orange">{labels.outputFigure}</Label>

      {/* running text, with the resolved number inline */}
      <rect x={462} y={156} width={216} height={5} rx={2.5} fill="var(--svg-grid)" />
      <rect x={462} y={170} width={216} height={5} rx={2.5} fill="var(--svg-grid)" />
      <rect x={462} y={184} width={196} height={5} rx={2.5} fill="var(--svg-grid)" />
      <rect x={462} y={196} width={numberPillW} height={18} rx={3} fill="var(--svg-blue-fill)" stroke={colorTokens.blue.stroke} strokeWidth={1} />
      <text x={470} y={209} fontSize={9.5} fill="var(--svg-dark-text)">{labels.outputFootnote}</text>
      <rect x={462} y={228} width={216} height={5} rx={2.5} fill="var(--svg-grid)" />
      <rect x={462} y={242} width={216} height={5} rx={2.5} fill="var(--svg-grid)" />
      <rect x={462} y={256} width={216} height={5} rx={2.5} fill="var(--svg-grid)" />
      <rect x={462} y={270} width={216} height={5} rx={2.5} fill="var(--svg-grid)" />
      <rect x={462} y={284} width={216} height={5} rx={2.5} fill="var(--svg-grid)" />
      <rect x={462} y={298} width={140} height={5} rx={2.5} fill="var(--svg-grid)" />
    </Figure>
  );
}
