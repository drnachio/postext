import { Figure } from "../Figure";
import { DropShadowDef, Label, colorTokens } from "../primitives";

export interface BoxGluePenaltyLabels {
  title: string;
  desc?: string;
  caption?: string;
  box: string;
  glue: string;
  penalty: string;
  boxDesc: string;
  glueDesc: string;
  penaltyDesc: string;
  exampleLabel: string;
}

type Item = { type: "box" | "glue" | "penalty"; label: string; width: number };

const example: Item[] = [
  { type: "box", label: "The", width: 36 },
  { type: "glue", label: "·", width: 12 },
  { type: "box", label: "art", width: 28 },
  { type: "glue", label: "·", width: 12 },
  { type: "box", label: "of", width: 24 },
  { type: "glue", label: "·", width: 12 },
  { type: "box", label: "typog", width: 48 },
  { type: "penalty", label: "-", width: 6 },
  { type: "box", label: "raphy", width: 44 },
  { type: "glue", label: "·", width: 12 },
  { type: "box", label: "is", width: 18 },
  { type: "glue", label: "·", width: 12 },
  { type: "box", label: "old.", width: 34 },
];

export function BoxGluePenalty({ labels }: { labels: BoxGluePenaltyLabels }) {
  let x = 60;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 240" maxWidth={760}>
      <defs>
        <DropShadowDef id="bgpShadow" />
      </defs>

      {/* Legend */}
      <g className="svg-fade-1">
        <rect x={60} y={30} width={20} height={20} fill={colorTokens.blue.fill} stroke={colorTokens.blue.stroke} strokeWidth={1.5} rx={3} />
        <Label x={90} y={45} size={10} bold color="blue">{labels.box}</Label>
        <Label x={135} y={45} size={10} color="mid">— {labels.boxDesc}</Label>

        <rect x={320} y={30} width={20} height={20} fill={colorTokens.yellow.fill} stroke={colorTokens.yellow.stroke} strokeWidth={1.5} rx={3} strokeDasharray="3,2" />
        <Label x={350} y={45} size={10} bold color="yellow">{labels.glue}</Label>
        <Label x={395} y={45} size={10} color="mid">— {labels.glueDesc}</Label>

        <rect x={540} y={30} width={20} height={20} fill={colorTokens.pink.fill} stroke={colorTokens.pink.stroke} strokeWidth={1.5} rx={3} />
        <Label x={570} y={45} size={10} bold color="pink">{labels.penalty}</Label>
        <Label x={650} y={45} size={9} color="mid">— {labels.penaltyDesc}</Label>
      </g>

      <Label x={60} y={95} size={10} color="light">{labels.exampleLabel}</Label>

      {/* Example */}
      <g className="svg-fade-2">
        {example.map((it, i) => {
          const cx = x;
          x += it.width + 4;
          const color = it.type === "box" ? "blue" : it.type === "glue" ? "yellow" : "pink";
          const t = colorTokens[color];
          return (
            <g key={i}>
              <rect x={cx} y={110} width={it.width} height={30} fill={t.fill} stroke={t.stroke} strokeWidth={1.5} rx={3} strokeDasharray={it.type === "glue" ? "3,2" : undefined} />
              <text x={cx + it.width / 2} y={130} textAnchor="middle" fontSize="10" fontFamily="monospace" fill={t.text}>{it.label}</text>
            </g>
          );
        })}
      </g>

      {/* Break points hint */}
      <g className="svg-fade-3">
        <line x1={60} y1={170} x2={x - 4} y2={170} stroke="var(--svg-stroke)" strokeWidth={1} strokeDasharray="2,3" />
        <Label x={60} y={190} size={9} color="light">breakpoints ⇄ glue and penalty positions</Label>
      </g>
    </Figure>
  );
}
