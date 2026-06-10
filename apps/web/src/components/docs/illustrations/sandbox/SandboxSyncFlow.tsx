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

/** Identical mini-document glyph repeated in every output tab: same VDT, same content. */
function DocGlyph({ cy }: { cy: number }) {
  return (
    <g>
      <rect
        x={634}
        y={cy - 13}
        width={20}
        height={26}
        rx={2}
        fill="none"
        stroke="var(--svg-teal-text)"
        strokeWidth={1.5}
      />
      <line x1={638} y1={cy - 6} x2={650} y2={cy - 6} stroke="var(--svg-teal-text)" strokeWidth={1.5} opacity={0.7} />
      <line x1={638} y1={cy - 1} x2={650} y2={cy - 1} stroke="var(--svg-teal-text)" strokeWidth={1.5} opacity={0.7} />
      <line x1={638} y1={cy + 4} x2={646} y2={cy + 4} stroke="var(--svg-teal-text)" strokeWidth={1.5} opacity={0.7} />
    </g>
  );
}

export function SandboxSyncFlow({ labels }: { labels: SandboxSyncFlowLabels }) {
  // Geometry: two inputs merge at a junction, feed ONE central VDT,
  // a single stem leaves it and fans out to three identical output tabs.
  const inPaths = [
    "M190 79 C 232 79, 234 130, 256 130",
    "M190 181 C 232 181, 234 130, 256 130",
  ];
  const inStem = "M264 130 L297 130";
  const outStem = "M500 130 L536 130";
  const outPaths = [
    "M544 130 C 578 130, 572 58, 616 58",
    "M544 130 L616 130",
    "M544 130 C 578 130, 572 202, 616 202",
  ];

  return (
    <Figure
      title={labels.title}
      desc={labels.desc}
      caption={labels.caption}
      viewBox="0 0 790 248"
      maxWidth={790}
    >
      <defs>
        <ArrowMarker id="ssfArrow" />
        <DropShadowDef id="ssfShadow" />
      </defs>

      <style>{`
        .ssf-flow { opacity: 0; }
        @media (prefers-reduced-motion: no-preference) {
          .ssf-flow {
            opacity: 0.85;
            stroke-dasharray: 5 15;
            stroke-dashoffset: 0;
            animation: ssf-dash 4s linear infinite;
          }
          .ssf-flow-out { animation-delay: -1.4s; }
        }
        @keyframes ssf-dash {
          to { stroke-dashoffset: -40; }
        }
      `}</style>

      {/* ── Inputs (blue): the two editable sources ── */}
      <Box x={30} y={56} width={160} height={46} color="blue" strokeWidth={1.5} />
      <Label x={110} y={83} anchor="middle" size={11} bold color="blue">{labels.markdownLabel}</Label>

      <Box x={30} y={158} width={160} height={46} color="blue" strokeWidth={1.5} />
      <Label x={110} y={185} anchor="middle" size={11} bold color="blue">{labels.configLabel}</Label>

      {/* ── Fan-in: both sources merge into a single junction ── */}
      {inPaths.map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--svg-stroke)" strokeWidth={1.5} />
      ))}
      <circle cx={260} cy={130} r={3.5} fill="var(--svg-stroke)" />
      <path d={inStem} fill="none" stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#ssfArrow)" />

      {/* ── Central VDT (green): the single source of truth, only elevated element ── */}
      <Box x={300} y={80} width={200} height={100} color="green" strokeWidth={2} filter="url(#ssfShadow)" />
      <Label x={400} y={124} anchor="middle" size={15} bold color="green">{labels.vdtTitle}</Label>
      <Label x={400} y={146} anchor="middle" size={9} color="green">{labels.vdtSubtitle}</Label>

      {/* tag below the VDT */}
      <line x1={400} y1={180} x2={400} y2={192} stroke="var(--svg-legend-stroke)" strokeWidth={1.5} />
      <rect x={326} y={192} width={148} height={20} rx={10} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1} />
      <Label x={400} y={205} anchor="middle" size={9} color="green">{labels.singleSource}</Label>

      {/* ── Fan-out: ONE stem leaves the VDT, then splits to the three tabs ── */}
      <path d={outStem} fill="none" stroke="var(--svg-stroke)" strokeWidth={1.5} />
      <circle cx={540} cy={130} r={3.5} fill="var(--svg-stroke)" />
      {outPaths.map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#ssfArrow)" />
      ))}

      {/* ── Outputs (teal, all three identical on purpose): same VDT, same result ── */}
      <Box x={620} y={36} width={140} height={44} color="teal" strokeWidth={1.5} />
      <DocGlyph cy={58} />
      <Label x={666} y={62} size={11} bold color="teal">{labels.canvasLabel}</Label>

      <Box x={620} y={108} width={140} height={44} color="teal" strokeWidth={1.5} />
      <DocGlyph cy={130} />
      <Label x={666} y={134} size={11} bold color="teal">{labels.htmlLabel}</Label>

      <Box x={620} y={180} width={140} height={44} color="teal" strokeWidth={1.5} />
      <DocGlyph cy={202} />
      <Label x={666} y={206} size={11} bold color="teal">{labels.pdfLabel}</Label>

      {/* ── Animated flow overlays (hidden for reduced motion) ── */}
      <g fill="none" strokeWidth={2} strokeLinecap="round">
        {[...inPaths, inStem].map((d) => (
          <path key={d} d={d} className="ssf-flow ssf-flow-in" stroke="var(--svg-blue-stroke)" />
        ))}
        {[outStem, ...outPaths].map((d) => (
          <path key={d} d={d} className="ssf-flow ssf-flow-out" stroke="var(--svg-green-stroke)" />
        ))}
      </g>
    </Figure>
  );
}
