import { Figure } from "../Figure";
import { Box, DropShadowDef, Label, colorTokens } from "../primitives";

export interface GreedyVsKnuthPlassLabels {
  title: string;
  desc?: string;
  caption?: string;
  greedyTitle: string;
  greedyLead: string;
  greedyCons: string[];
  greedyEquals: string;
  kpTitle: string;
  kpLead: string;
  kpPros: string[];
  kpEquals: string;
}

/**
 * One mock line of justified text: word blocks flush to both margins,
 * with the inter-word gap computed from the leftover space. The gap
 * size IS the message: greedy lines oscillate tight/loose, Knuth-Plass
 * lines are uniform.
 */
function JustifiedLine({
  x0,
  y,
  width,
  words,
  fill,
  lastLine = false,
  markGaps = false,
}: {
  x0: number;
  y: number;
  width: number;
  words: number[];
  fill: string;
  lastLine?: boolean;
  markGaps?: boolean;
}) {
  const sum = words.reduce((a, b) => a + b, 0);
  const gap = lastLine ? 8 : (width - sum) / (words.length - 1);
  const rects = [];
  let x = x0;
  for (let i = 0; i < words.length; i++) {
    rects.push(<rect key={`w${i}`} x={x} y={y} width={words[i]} height={6} rx={1.5} fill={fill} opacity={0.5} />);
    x += words[i];
    if (markGaps && i < words.length - 1) {
      rects.push(<rect key={`g${i}`} x={x} y={y} width={gap} height={6} fill="var(--svg-pink-half)" />);
    }
    x += gap;
  }
  return <>{rects}</>;
}

// Word-width sets chosen so the computed gaps tell the story.
// Greedy (width 304): gaps 4 (tight) -> 26 (poisoned, loose) -> 10 -> 6 -> last
const GREEDY_LINES: number[][] = [
  [44, 30, 52, 38, 46, 34, 36], // gap 4: grabbed one word too many
  [40, 36, 44, 38, 42], //          gap 26: the next line pays for it
  [48, 36, 54, 40, 46, 30], //      gap 10
  [50, 40, 46, 52, 44, 42], //      gap 6
  [44, 38, 50], //                  last line, ragged
];
// Knuth-Plass (width 304): gaps 9.2 / 9.2 / 8.8 / 9.2 / last — uniform
const KP_LINES: number[][] = [
  [46, 38, 52, 40, 48, 34],
  [50, 34, 44, 46, 38, 46],
  [42, 52, 36, 48, 40, 42],
  [48, 40, 46, 36, 50, 38],
  [46, 40, 44],
];

const LINE_STEP = 13;
const PARA_TOP = 72;
const PARA_X = 50;
const PARA_W = 304;

export function GreedyVsKnuthPlass({ labels }: { labels: GreedyVsKnuthPlassLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 780 300" maxWidth={780}>
      <defs>
        <DropShadowDef id="gvkp-shadow" />
      </defs>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .gvkp-seq { animation: gvkp-pulse 6.4s ease-in-out infinite; }
          .gvkp-glob { animation: gvkp-pulse-all 6.4s ease-in-out infinite; }
        }
        @keyframes gvkp-pulse {
          0% { opacity: 0.55; }
          4% { opacity: 1; }
          12%, 100% { opacity: 0.55; }
        }
        @keyframes gvkp-pulse-all {
          0%, 56% { opacity: 0.55; }
          63%, 76% { opacity: 1; }
          86%, 100% { opacity: 0.55; }
        }
      `}</style>

      {/* ── Greedy panel ───────────────────────────────────────────── */}
      <Box x={20} y={24} width={350} height={256} color="pink" filter="url(#gvkp-shadow)" />
      <Label x={195} y={46} anchor="middle" size={12} bold color="pink">{labels.greedyTitle}</Label>
      <line x1={36} y1={56} x2={354} y2={56} stroke={colorTokens.pink.stroke} strokeWidth={1} opacity={0.3} />

      {/* paragraph mock: decided line by line — sequential chevrons in the gutter */}
      {GREEDY_LINES.map((words, i) => {
        const y = PARA_TOP + i * LINE_STEP;
        const last = i === GREEDY_LINES.length - 1;
        return (
          <g key={i} className="gvkp-seq" style={{ animationDelay: `${i * 0.7}s` }}>
            <polygon
              points={`33,${y} 33,${y + 6} 40,${y + 3}`}
              fill={colorTokens.pink.text}
              opacity={0.7}
            />
            <JustifiedLine
              x0={PARA_X}
              y={y}
              width={PARA_W}
              words={words}
              fill={colorTokens.pink.text}
              lastLine={last}
              markGaps={i === 1}
            />
          </g>
        );
      })}

      <Label x={36} y={152} color="pink">{labels.greedyLead}</Label>
      {labels.greedyCons.map((c, i) => (
        <g key={i}>
          <Label x={36} y={173 + i * 18} color="pink">{"✗"}</Label>
          <Label x={50} y={173 + i * 18} color="mid">{c}</Label>
        </g>
      ))}
      <rect x={115} y={244} width={160} height={20} rx={4} fill={colorTokens.pink.fill} stroke={colorTokens.pink.stroke} strokeWidth={1} />
      <Label x={195} y={257} anchor="middle" color="pink">{labels.greedyEquals}</Label>

      {/* ── vs arrow ───────────────────────────────────────────────── */}
      <line x1={376} y1={150} x2={398} y2={150} stroke="var(--svg-stroke)" strokeWidth={2} />
      <polygon points="398,145 406,150 398,155" fill="var(--svg-stroke)" />

      {/* ── Knuth-Plass panel ──────────────────────────────────────── */}
      <Box x={410} y={24} width={350} height={256} color="green" filter="url(#gvkp-shadow)" />
      <Label x={585} y={46} anchor="middle" size={12} bold color="green">{labels.kpTitle}</Label>
      <line x1={426} y1={56} x2={744} y2={56} stroke={colorTokens.green.stroke} strokeWidth={1} opacity={0.3} />

      {/* paragraph mock: evaluated globally — one bracket spans every line */}
      <g className="gvkp-glob">
        <path
          d={`M434,${PARA_TOP} H430 V${PARA_TOP + 4 * LINE_STEP + 6} H434`}
          fill="none"
          stroke={colorTokens.green.stroke}
          strokeWidth={1.5}
          opacity={0.7}
        />
        {KP_LINES.map((words, i) => (
          <JustifiedLine
            key={i}
            x0={390 + PARA_X}
            y={PARA_TOP + i * LINE_STEP}
            width={PARA_W}
            words={words}
            fill={colorTokens.green.text}
            lastLine={i === KP_LINES.length - 1}
          />
        ))}
      </g>

      <Label x={426} y={152} color="green">{labels.kpLead}</Label>
      {labels.kpPros.map((p, i) => (
        <g key={i}>
          <Label x={426} y={173 + i * 18} color="green">{"✓"}</Label>
          <Label x={440} y={173 + i * 18} color="mid">{p}</Label>
        </g>
      ))}
      <rect x={505} y={244} width={160} height={20} rx={4} fill={colorTokens.green.fill} stroke={colorTokens.green.stroke} strokeWidth={1} />
      <Label x={585} y={257} anchor="middle" color="green">{labels.kpEquals}</Label>
    </Figure>
  );
}
