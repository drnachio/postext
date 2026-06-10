import { Figure } from "../Figure";
import { Box, DropShadowDef, Label } from "../primitives";

export interface DataFlowLabels {
  title: string;
  desc?: string;
  caption?: string;
  input: [string, string];
  parse: string;
  measure: string;
  loopBadge: string;
  passesInLoop: { num: string; name: string }[]; // 5 entries (passes 3-7)
  loopCondition: string;
  convergedLabel: string;
  backend: string;
  output: string;
}

// Horizontal positions of the five pass boxes inside the convergence loop.
const INNER_X = [386, 480, 574, 668, 762];
const INNER_W = 72;
const ROW_Y = 80; // vertical center of the main pipeline row
const CX = 610; // center of loop container / vertical exit chain

export function DataFlow({ labels }: { labels: DataFlowLabels }) {
  const inner = labels.passesInLoop;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 868 358" maxWidth={868}>
      <defs>
        <marker id="dfArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="var(--svg-stroke)" />
        </marker>
        <marker id="dfArrowYellow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="var(--svg-yellow-stroke)" />
        </marker>
        <DropShadowDef id="dfShadow" />
      </defs>

      <style>{`
        .df-flow {
          fill: none;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-dasharray: 4 8;
          opacity: 0;
        }
        @media (prefers-reduced-motion: no-preference) {
          .df-flow {
            opacity: 0.85;
            animation: df-dash 3.2s linear infinite;
          }
          @keyframes df-dash {
            to { stroke-dashoffset: -24; }
          }
        }
      `}</style>

      {/* ── Input (data) ── */}
      <Box x={20} y={56} width={96} height={48} color="blue" filter="url(#dfShadow)" />
      <Label x={68} y={75} anchor="middle" size={10} bold color="blue">{labels.input[0]}</Label>
      <Label x={68} y={90} anchor="middle" size={10} bold color="blue">{labels.input[1]}</Label>

      <line x1={116} y1={ROW_Y} x2={146} y2={ROW_Y} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" />

      {/* ── Pass 1: parse ── */}
      <Box x={148} y={62} width={80} height={36} color="green" filter="url(#dfShadow)" />
      <Label x={188} y={84} anchor="middle" size={10} bold color="green">{labels.parse}</Label>

      <line x1={228} y1={ROW_Y} x2={258} y2={ROW_Y} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" />

      {/* ── Pass 2: measure ── */}
      <Box x={260} y={62} width={80} height={36} color="green" filter="url(#dfShadow)" />
      <Label x={300} y={84} anchor="middle" size={10} bold color="green">{labels.measure}</Label>

      <line x1={340} y1={ROW_Y} x2={370} y2={ROW_Y} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" />

      {/* ── Convergence loop container ── */}
      <rect x={372} y={28} width={476} height={140} rx={8} fill="var(--svg-yellow-fill)" stroke="var(--svg-yellow-stroke)" strokeWidth={1.5} strokeDasharray="6 4" />
      <Label x={CX} y={46} anchor="middle" size={10} bold color="yellow">{labels.loopBadge}</Label>

      {/* Passes 3-7 inside the loop */}
      {inner.map((p, i) => {
        const x = INNER_X[i] ?? 386;
        const cx = x + INNER_W / 2;
        return (
          <g key={i}>
            <Box x={x} y={58} width={INNER_W} height={44} color="green" rx={6} filter="url(#dfShadow)" />
            <Label x={cx} y={75} anchor="middle" size={10} bold color="green">{p.num}</Label>
            <Label x={cx} y={91} anchor="middle" size={9} color="green">{p.name}</Label>
            {i < inner.length - 1 ? (
              <line x1={x + INNER_W} y1={ROW_Y} x2={x + INNER_W + 20} y2={ROW_Y} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" />
            ) : null}
          </g>
        );
      })}

      {/* Loop-back: pass 7 returns to pass 3 while dirty */}
      <path d="M 798 102 L 798 128 L 422 128 L 422 106" fill="none" stroke="var(--svg-yellow-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrowYellow)" />
      <Label x={CX} y={148} anchor="middle" size={9} color="yellow">{labels.loopCondition}</Label>

      {/* ── Exit chain: converged VDT → backend → output ── */}
      <line x1={CX} y1={168} x2={CX} y2={190} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" />

      <Box x={540} y={192} width={140} height={30} color="blue" filter="url(#dfShadow)" />
      <Label x={CX} y={211} anchor="middle" size={10} bold color="blue">{labels.convergedLabel}</Label>

      <line x1={CX} y1={222} x2={CX} y2={244} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" />

      <Box x={535} y={246} width={150} height={34} color="pink" filter="url(#dfShadow)" />
      <Label x={CX} y={267} anchor="middle" size={10} bold color="pink">{labels.backend}</Label>

      <line x1={CX} y1={280} x2={CX} y2={302} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" />

      <Box x={535} y={304} width={150} height={34} color="blue" filter="url(#dfShadow)" />
      <Label x={CX} y={326} anchor="middle" size={11} bold color="blue">{labels.output}</Label>

      {/* ── Animated flow overlays (hidden when reduced motion is preferred) ── */}
      <g aria-hidden="true">
        <path className="df-flow" stroke="var(--svg-blue-text)" d="M 119 80 L 140 80" />
        <path className="df-flow" stroke="var(--svg-blue-text)" d="M 231 80 L 252 80" />
        <path className="df-flow" stroke="var(--svg-blue-text)" d="M 343 80 L 364 80" />
        {inner.slice(0, -1).map((_, i) => {
          const x = (INNER_X[i] ?? 386) + INNER_W;
          return <path key={i} className="df-flow" stroke="var(--svg-blue-text)" d={`M ${x + 2} 80 L ${x + 14} 80`} />;
        })}
        <path className="df-flow" stroke="var(--svg-yellow-text)" d="M 798 104 L 798 128 L 422 128 L 422 112" />
        <path className="df-flow" stroke="var(--svg-blue-text)" d="M 610 171 L 610 186" />
        <path className="df-flow" stroke="var(--svg-blue-text)" d="M 610 225 L 610 240" />
        <path className="df-flow" stroke="var(--svg-blue-text)" d="M 610 283 L 610 298" />
      </g>
    </Figure>
  );
}
