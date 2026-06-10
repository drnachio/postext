import { Figure } from "../Figure";
import { ArrowMarker, Box, DropShadowDef, Label, type ColorKey } from "../primitives";

export interface FitnessClassesLabels {
  title: string;
  desc?: string;
  caption?: string;
  classes: { name: string; range: string; example: string }[]; // 4 entries
  adjacentNote: string;
}

/* Semantic severity ordering along the r axis:
   tight (compressed) → normal (ideal) → loose → very loose */
const palette: ColorKey[] = ["blue", "green", "orange", "pink"];

/* Glue width per class — the one variable that changes across the four
   specimens. Same word pattern everywhere, only the gaps grow. */
const glueGap = [2, 5, 10, 18] as const;

/* Word-width proportions for the three specimen lines (justified to the
   same measure in every box, so wider glue ⇒ narrower words). */
const lineProportions: number[][] = [
  [0.3, 0.21, 0.28, 0.21],
  [0.36, 0.3, 0.34],
  [0.24, 0.3, 0.2, 0.26],
];

const BOX_W = 170;
const BOX_GAP = 12;
const START_X = 22; // (760 - (4*170 + 3*12)) / 2
const BOX_Y = 48;
const BOX_H = 124;
const PITCH = BOX_W + BOX_GAP;

/* r-axis boundary values between the four classes (fixed algorithm constants) */
const boundaries = ["-0.5", "0.5", "1.0"];

function specimenRects(x: number, width: number, gap: number, props: number[]) {
  const wordsTotal = width - gap * (props.length - 1);
  const out: { x: number; w: number }[] = [];
  let cursor = x;
  for (const p of props) {
    const w = p * wordsTotal;
    out.push({ x: cursor, w });
    cursor += w + gap;
  }
  return out;
}

export function FitnessClasses({ labels }: { labels: FitnessClassesLabels }) {
  const centers = [0, 1, 2, 3].map((i) => START_X + i * PITCH + BOX_W / 2);
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 268" maxWidth={760}>
      <defs>
        <DropShadowDef id="fc-shadow" />
        <ArrowMarker id="fc-arrow" />
      </defs>

      {/* r axis running above the four class bands */}
      <line x1={34} y1={28} x2={726} y2={28} stroke="var(--svg-stroke)" strokeOpacity={0.5} strokeWidth={1} markerEnd="url(#fc-arrow)" />
      <Label x={740} y={31} size={10} color="light" anchor="start">r</Label>
      {boundaries.map((b, i) => {
        const tx = START_X + (i + 1) * PITCH - BOX_GAP / 2;
        return (
          <g key={b}>
            <line x1={tx} y1={24} x2={tx} y2={32} stroke="var(--svg-stroke)" strokeOpacity={0.6} strokeWidth={1} />
            <Label x={tx} y={16} size={9} color="faint" anchor="middle">{b}</Label>
          </g>
        );
      })}

      {/* the four fitness classes */}
      {labels.classes.slice(0, 4).map((c, i) => {
        const x = START_X + i * PITCH;
        const cx = x + BOX_W / 2;
        const color = palette[i]!;
        const gap = glueGap[i]!;
        return (
          <g key={i}>
            <Box x={x} y={BOX_Y} width={BOX_W} height={BOX_H} color={color} filter="url(#fc-shadow)" strokeWidth={1.5} />
            <Label x={cx} y={70} anchor="middle" size={11} bold color={color}>{c.name}</Label>
            <Label x={cx} y={88} anchor="middle" size={10} color="mid">{c.range}</Label>
            {/* three justified specimen lines — identical words, growing glue */}
            {lineProportions.map((props, li) => (
              <g key={li}>
                {specimenRects(x + 20, BOX_W - 40, gap, props).map((r, wi) => (
                  <rect
                    key={wi}
                    x={r.x}
                    y={100 + li * 11}
                    width={r.w}
                    height={5}
                    rx={1.5}
                    fill={`var(--svg-${color}-text)`}
                    opacity={li === 1 ? 0.62 : 0.45}
                  />
                ))}
              </g>
            ))}
            <Label x={cx} y={154} anchor="middle" size={10} color={color}>{c.example}</Label>
          </g>
        );
      })}

      {/* adjacency rule: one step apart is fine, two steps incurs the demerit */}
      <path
        d={`M ${centers[0]} 180 Q ${(centers[0]! + centers[1]!) / 2} 208 ${centers[1]} 180`}
        fill="none"
        stroke="var(--svg-green-stroke)"
        strokeWidth={1.5}
      />
      <circle cx={centers[0]} cy={180} r={3} fill="var(--svg-green-stroke)" />
      <circle cx={centers[1]} cy={180} r={3} fill="var(--svg-green-stroke)" />
      <Label x={(centers[0]! + centers[1]!) / 2} y={210} anchor="middle" size={9} color="green">Δ = 1 ✓</Label>

      <path
        d={`M ${centers[1]} 184 Q ${(centers[1]! + centers[3]!) / 2} 236 ${centers[3]} 184`}
        fill="none"
        stroke="var(--svg-pink-stroke)"
        strokeWidth={1.5}
        strokeDasharray="5 3"
      />
      <circle cx={centers[1]} cy={184} r={3} fill="var(--svg-pink-stroke)" />
      <circle cx={centers[3]} cy={184} r={3} fill="var(--svg-pink-stroke)" />
      <Label x={(centers[1]! + centers[3]!) / 2} y={230} anchor="middle" size={9} color="pink">Δ = 2 ✕</Label>

      <Label x={380} y={256} anchor="middle" size={10} color="light">{labels.adjacentNote}</Label>
    </Figure>
  );
}
