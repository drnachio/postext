import { Figure } from "../Figure";
import { Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface CssGapLabels {
  title: string;
  desc?: string;
  caption?: string;
  cssTitle: string;
  cssLead: string;
  cssMore: string;
  cssCons: string[];
  gap: string;
  editorialTitle: string;
  editorialPros: string[];
  equals: string;
}

export function CssGapVsEditorial({ labels }: { labels: CssGapLabels }) {
  const pink = colorTokens.pink;
  const green = colorTokens.green;

  // Left column geometry
  const lx = 24;
  const lw = 320;
  const lcx = lx + lw / 2; // 184

  // Right column geometry
  const rx = 416;
  const rw = 320;
  const rcx = rx + rw / 2; // 576

  // `column-count` chip sized to its content (~6.82px/char at 11px mono)
  const chipW = Math.max(110, Math.round(labels.cssLead.length * 6.82) + 24);
  const chipX = lcx - chipW / 2;

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 308" maxWidth={760}>
      <defs>
        <DropShadowDef id="cgve-shadow" />
      </defs>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .cgve-flow {
            stroke-dasharray: 6 6;
            animation: cgve-dash 6s linear infinite;
          }
          @keyframes cgve-dash {
            to { stroke-dashoffset: -48; }
          }
        }
      `}</style>

      {/* ── Left: what CSS gives you — a deliberately small card ── */}
      <Box x={lx} y={28} width={lw} height={110} color="pink" filter="url(#cgve-shadow)" />
      <Label x={lcx} y={52} anchor="middle" size={11} bold color="pink">{labels.cssTitle}</Label>
      <line x1={lx + 16} y1={62} x2={lx + lw - 16} y2={62} stroke={pink.stroke} strokeWidth={1} opacity={0.3} />
      <rect
        x={chipX}
        y={74}
        width={chipW}
        height={24}
        rx={4}
        fill="var(--svg-legend-fill)"
        stroke={pink.stroke}
        strokeWidth={1.5}
      />
      <Label x={lcx} y={90} anchor="middle" size={11} bold color="pink">{labels.cssLead}</Label>
      <Label x={lcx} y={124} anchor="middle" size={10} color="mid">{labels.cssMore}</Label>

      {/* ── The void below the small card: everything CSS does not provide ── */}
      <rect
        x={lx}
        y={150}
        width={lw}
        height={144}
        rx={6}
        fill="none"
        stroke="var(--svg-stroke)"
        strokeWidth={1.5}
        strokeDasharray="5 5"
        opacity={0.55}
      />
      {labels.cssCons.map((c, i) => (
        <text key={i} x={lx + 20} y={176 + i * 22} fontSize={10}>
          <tspan fill={pink.text}>{"✗"}</tspan>
          <tspan fill="var(--svg-mid-text)" dx={8}>{c}</tspan>
        </text>
      ))}

      {/* ── The gap: the missing capabilities map onto the editorial column ── */}
      <Label x={380} y={208} anchor="middle" size={10} bold color="stroke">{labels.gap}</Label>
      <line className="cgve-flow" x1={350} y1={222} x2={404} y2={222} stroke="var(--svg-stroke)" strokeWidth={2} />
      <polygon points="404,217 414,222 404,227" fill="var(--svg-stroke)" />

      {/* ── Right: what editorial layout needs — a full-height card ── */}
      <Box x={rx} y={28} width={rw} height={266} color="green" filter="url(#cgve-shadow)" />
      <Label x={rcx} y={52} anchor="middle" size={11} bold color="green">{labels.editorialTitle}</Label>
      <line x1={rx + 16} y1={62} x2={rx + rw - 16} y2={62} stroke={green.stroke} strokeWidth={1} opacity={0.3} />
      {labels.editorialPros.map((p, i) => (
        <text key={i} x={rx + 20} y={88 + i * 24} fontSize={10}>
          <tspan fill="var(--svg-green-check)">{"✓"}</tspan>
          <tspan fill="var(--svg-dark-text)" dx={8}>{p}</tspan>
        </text>
      ))}
      <line x1={rx + 16} y1={230} x2={rx + rw - 16} y2={230} stroke={green.stroke} strokeWidth={1} opacity={0.3} />
      <rect x={rcx - 55} y={246} width={110} height={28} rx={6} fill={green.fill} stroke={green.stroke} strokeWidth={1.5} />
      <Label x={rcx} y={264} anchor="middle" size={11} bold color="green">{labels.equals}</Label>
    </Figure>
  );
}
