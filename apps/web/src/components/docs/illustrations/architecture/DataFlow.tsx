import { Figure } from "../Figure";
import { Box, DropShadowDef, Label, colorTokens, type ColorKey } from "../primitives";

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

const innerColors: ColorKey[] = ["blue", "blue", "green", "green", "green"];

export function DataFlow({ labels }: { labels: DataFlowLabels }) {
  const inner = labels.passesInLoop;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 780 310" maxWidth={780}>
      <defs>
        <marker id="dfArrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="var(--svg-stroke)" />
        </marker>
        <marker id="dfArrowYellow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="var(--svg-yellow-stroke)" />
        </marker>
        <DropShadowDef id="dfShadow" />
      </defs>

      <g className="svg-fade-1">
        <Box x={15} y={30} width={140} height={40} color="blue" filter="url(#dfShadow)" />
        <Label x={85} y={47} anchor="middle" size={10} bold color="blue">{labels.input[0]}</Label>
        <Label x={85} y={60} anchor="middle" size={10} bold color="blue">{labels.input[1]}</Label>
      </g>

      <line x1={155} y1={50} x2={175} y2={50} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" className="svg-flow" />

      <g className="svg-fade-2">
        <Box x={177} y={35} width={90} height={30} color="orange" rx={4} filter="url(#dfShadow)" />
        <Label x={222} y={55} anchor="middle" size={10} bold color="orange">{labels.parse}</Label>
      </g>
      <line x1={267} y1={50} x2={287} y2={50} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" className="svg-flow" />

      <g className="svg-fade-3">
        <Box x={289} y={35} width={100} height={30} color="purple" rx={4} filter="url(#dfShadow)" />
        <Label x={339} y={55} anchor="middle" size={10} bold color="purple">{labels.measure}</Label>
      </g>
      <line x1={389} y1={50} x2={409} y2={50} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" className="svg-flow" />

      <rect x={411} y={20} width={355} height={80} fill="none" stroke="var(--svg-yellow-stroke)" strokeWidth={2} rx={8} strokeDasharray="6,3" />
      <Label x={588} y={16} anchor="middle" size={9} bold color="yellow" className="svg-pulse">{labels.loopBadge}</Label>

      {inner.map((p, i) => {
        const widths = [58, 58, 58, 58, 48];
        const xs = [421, 493, 565, 637, 709];
        const x = xs[i] ?? 0;
        const w = widths[i] ?? 58;
        const color = innerColors[i] ?? "blue";
        const t = colorTokens[color];
        return (
          <g key={i} className={`svg-fade-${4 + Math.floor(i / 2)}`}>
            <rect x={x} y={35} width={w} height={30} fill={t.fill} stroke={t.stroke} strokeWidth={2} rx={4} filter="url(#dfShadow)" />
            <text x={x + w / 2} y={55} textAnchor="middle" fontSize="9" fontWeight="bold" fill={t.text}>{p.num}</text>
            <text x={x + w / 2} y={75} textAnchor="middle" fontSize="7" fill={t.text}>{p.name}</text>
            {i < inner.length - 1 ? (
              <line x1={x + w} y1={50} x2={(xs[i + 1] ?? 0)} y2={50} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" className="svg-flow" />
            ) : null}
          </g>
        );
      })}

      <path d="M 733 67 L 733 90 L 450 90 L 450 67" fill="none" stroke="var(--svg-yellow-stroke)" strokeWidth={2} markerEnd="url(#dfArrowYellow)" className="svg-loop-glow" />
      <Label x={591} y={87} anchor="middle" size={8} color="yellow">{labels.loopCondition}</Label>

      <line x1={588} y1={102} x2={588} y2={130} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" className="svg-flow" />
      <Label x={588} y={148} anchor="middle" size={9} color="light">{labels.convergedLabel}</Label>
      <line x1={588} y1={155} x2={588} y2={175} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" className="svg-flow" />

      <Box x={498} y={177} width={180} height={35} color="pink" filter="url(#dfShadow)" />
      <Label x={588} y={199} anchor="middle" size={10} bold color="pink">{labels.backend}</Label>

      <line x1={588} y1={212} x2={588} y2={235} stroke="var(--svg-stroke)" strokeWidth={1.5} markerEnd="url(#dfArrow)" className="svg-flow" />

      <Box x={498} y={237} width={180} height={35} color="teal" filter="url(#dfShadow)" />
      <Label x={588} y={259} anchor="middle" size={11} bold color="teal">{labels.output}</Label>
    </Figure>
  );
}
