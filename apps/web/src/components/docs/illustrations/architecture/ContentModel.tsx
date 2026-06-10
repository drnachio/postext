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

/** Plain "text" lines inside the markdown card. */
const proseLines: Array<[x1: number, x2: number, y: number]> = [
  [58, 318, 120],
  [58, 296, 136],
  [58, 226, 152], // leads into the :ref chip
  [58, 318, 168],
  [58, 276, 184],
  [58, 194, 202], // leads into the ::resource chip
  [58, 318, 220],
  [58, 200, 236],
];

const resourceRows = [
  { y: 112, id: "fig-1", kind: "bitmap" },
  { y: 136, id: "svg-1", kind: "svg" },
  { y: 160, id: "tbl-1", kind: "table" },
] as const;

export function ContentModel({ labels }: { labels: ContentModelLabels }) {
  const orange = colorTokens.orange;
  const blue = colorTokens.blue;

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 900 360" maxWidth={900}>
      <defs>
        <ArrowMarker id="cmArrow" />
        <ArrowMarker id="cmArrowOrange" color={orange.stroke} />
        <ArrowMarker id="cmArrowBlue" color={blue.stroke} />
        <DropShadowDef id="cmShadow" />
      </defs>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .cm-link { animation: cm-dash 2.4s linear infinite; }
          .cm-link-b { animation-delay: -1.2s; }
          .cm-pair-a { animation: cm-pulse 6s ease-in-out infinite; }
          .cm-pair-b { animation: cm-pulse 6s ease-in-out infinite; animation-delay: -3s; }
          @keyframes cm-dash { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }
          @keyframes cm-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        }
      `}</style>

      {/* ── PostextContent container ── */}
      <rect
        x={20}
        y={24}
        width={560}
        height={300}
        rx={10}
        fill="var(--svg-legend-fill)"
        stroke="var(--svg-legend-stroke)"
        strokeWidth={1.5}
        strokeDasharray="7,5"
      />
      <Label x={300} y={48} anchor="middle" size={12} bold color="dark">{labels.contentTitle}</Label>

      {/* ── markdown card (owns the reading order) ── */}
      <Box x={36} y={64} width={296} height={200} color="blue" filter="url(#cmShadow)" />
      <Label x={50} y={86} size={11} bold color="blue">{labels.markdown}</Label>
      <Label x={50} y={102} size={9} color="blue">{labels.markdownSub}</Label>

      {/* reading-order arrow down the left margin */}
      <line
        x1={48} y1={116} x2={48} y2={246}
        stroke={blue.stroke}
        strokeWidth={1.5}
        opacity={0.45}
        markerEnd="url(#cmArrowBlue)"
      />

      {/* prose placeholder lines */}
      {proseLines.map(([x1, x2, y]) => (
        <line
          key={`${x1}-${y}`}
          x1={x1} y1={y} x2={x2} y2={y}
          stroke="var(--svg-faint-text)"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.4}
        />
      ))}

      {/* inline :ref chip (pairs with fig-1) */}
      <g className="cm-pair-a">
        <rect x={234} y={144} width={84} height={16} rx={4} fill={blue.fill} stroke={orange.stroke} strokeWidth={1.25} />
        <text x={276} y={155.5} fontSize={8.5} textAnchor="middle" fill={orange.text}>:ref{"{id=fig-1}"}</text>
      </g>

      {/* inline ::resource chip (pairs with tbl-1) */}
      <g className="cm-pair-b">
        <rect x={202} y={194} width={116} height={16} rx={4} fill={blue.fill} stroke={orange.stroke} strokeWidth={1.25} />
        <text x={260} y={205.5} fontSize={8.5} textAnchor="middle" fill={orange.text}>::resource{"{id=tbl-1}"}</text>
      </g>

      {/* ── resources[] card (owns the visual data) ── */}
      <Box x={396} y={64} width={168} height={124} color="orange" filter="url(#cmShadow)" />
      <Label x={410} y={86} size={11} bold color="orange">{labels.resources}</Label>
      <Label x={410} y={102} size={9} color="orange">{labels.resourcesSub}</Label>

      {resourceRows.map(({ y, id, kind }) => (
        <g key={id}>
          {/* kind icon */}
          <rect x={410} y={y} width={20} height={16} rx={2} fill="none" stroke={orange.stroke} strokeWidth={1.2} />
          {kind === "bitmap" && (
            <>
              <path d={`M 412 ${y + 13} L 417 ${y + 7} L 420 ${y + 10} L 424 ${y + 5} L 428 ${y + 13}`} fill="none" stroke={orange.stroke} strokeWidth={1.2} strokeLinejoin="round" />
              <circle cx={415.5} cy={y + 4.5} r={1.4} fill={orange.stroke} />
            </>
          )}
          {kind === "svg" && (
            <path
              d={`M 417 ${y + 12} L 413 ${y + 8} L 417 ${y + 4} M 423 ${y + 4} L 427 ${y + 8} L 423 ${y + 12}`}
              fill="none"
              stroke={orange.stroke}
              strokeWidth={1.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {kind === "table" && (
            <path
              d={`M 410 ${y + 5} H 430 M 417 ${y + 5} V ${y + 16} M 423 ${y + 5} V ${y + 16}`}
              fill="none"
              stroke={orange.stroke}
              strokeWidth={1.2}
            />
          )}
          {/* id pill */}
          <g className={id === "fig-1" ? "cm-pair-a" : id === "tbl-1" ? "cm-pair-b" : undefined}>
            <rect x={438} y={y} width={46} height={16} rx={4} fill={orange.fill} stroke={orange.stroke} strokeWidth={1.25} />
            <text x={461} y={y + 11.5} fontSize={8.5} textAnchor="middle" fill={orange.text}>{id}</text>
          </g>
          <text x={492} y={y + 11.5} fontSize={8} fill="var(--svg-faint-text)">{kind}</text>
        </g>
      ))}

      {/* ── metadata card ── */}
      <Box x={396} y={204} width={168} height={60} color="purple" filter="url(#cmShadow)" />
      <Label x={410} y={226} size={11} bold color="purple">{labels.notes}</Label>
      <Label x={410} y={244} size={9} color="purple">{labels.notesSub}</Label>

      {/* ── id-resolution links: chip → resource entry ── */}
      <path
        className="cm-link"
        d="M 322 152 C 350 152, 360 124, 388 120"
        fill="none"
        stroke={orange.stroke}
        strokeWidth={1.5}
        strokeDasharray="5 5"
        markerEnd="url(#cmArrowOrange)"
      />
      <path
        className="cm-link cm-link-b"
        d="M 322 202 C 352 202, 358 172, 388 168"
        fill="none"
        stroke={orange.stroke}
        strokeWidth={1.5}
        strokeDasharray="5 5"
        markerEnd="url(#cmArrowOrange)"
      />

      {/* resolution legend, bottom of the container */}
      <line className="cm-link" x1={158} y1={290} x2={178} y2={290} stroke={orange.stroke} strokeWidth={1.5} strokeDasharray="5 5" />
      <Label x={188} y={293} size={9} color="light">{labels.resolveMarker}</Label>

      {/* ── pipeline: content → engine → VDT ── */}
      <line x1={588} y1={174} x2={624} y2={174} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#cmArrow)" />

      <rect x={632} y={139} width={112} height={70} rx={6} fill="var(--svg-legend-fill)" stroke="var(--svg-stroke)" strokeWidth={2} filter="url(#cmShadow)" />
      <Label x={688} y={178} anchor="middle" size={12} bold color="dark">{labels.engineLabel}</Label>

      <line x1={752} y1={174} x2={788} y2={174} stroke="var(--svg-stroke)" strokeWidth={2} markerEnd="url(#cmArrow)" />

      <Box x={794} y={139} width={82} height={70} color="green" filter="url(#cmShadow)" />
      <Label x={835} y={178} anchor="middle" size={12} bold color="green">{labels.vdtLabel}</Label>
    </Figure>
  );
}
