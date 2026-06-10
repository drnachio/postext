import type { CSSProperties } from "react";
import { Figure } from "../Figure";
import { Label, colorTokens } from "../primitives";

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

type Item =
  | { kind: "box"; text: string; w: number }
  | { kind: "glue"; w: number }
  | { kind: "penalty"; cost: string; w: number };

const CHAR_W = 6.2; // monospace @ font-size 10
const GLUE_W = 20;
const STRETCH = 6; // how far each glue stretches in the animation
const PEN_W = 12;
const GAP = 5;
const STRIP_X = 40;
const STRIP_Y = 132;
const STRIP_H = 34;

const boxW = (text: string) => text.length * CHAR_W + 12;

/** The example sentence is quoted inside exampleLabel in both locales. */
function parseSentence(exampleLabel: string): string[] {
  const m = exampleLabel.match(/[“"]([^”"]+)[”"]/);
  const sentence = m ? m[1] : "The art of typography is old.";
  return sentence.split(/\s+/).filter(Boolean);
}

/** Boxes separated by glue; the longest word is split by a flagged penalty (cost 50); a forced break (−∞) ends the paragraph. */
function buildItems(words: string[]): Item[] {
  let longest = 0;
  words.forEach((w, i) => {
    if (w.length > words[longest].length) longest = i;
  });
  const items: Item[] = [];
  words.forEach((word, i) => {
    if (i > 0) items.push({ kind: "glue", w: GLUE_W });
    if (i === longest && word.length >= 8) {
      const cut = Math.max(2, Math.ceil(word.length / 2) - 1);
      const a = word.slice(0, cut);
      const b = word.slice(cut);
      items.push({ kind: "box", text: a, w: boxW(a) });
      items.push({ kind: "penalty", cost: "50", w: PEN_W });
      items.push({ kind: "box", text: b, w: boxW(b) });
    } else {
      items.push({ kind: "box", text: word, w: boxW(word) });
    }
  });
  items.push({ kind: "penalty", cost: "−∞", w: PEN_W });
  return items;
}

/** Pure layout pass: assigns each item its left edge and drift offset (glues before it × STRETCH). */
function layoutItems(items: Item[]): (Item & { left: number; dx: number })[] {
  let x = STRIP_X;
  let gluesBefore = 0;
  return items.map((it) => {
    const dx = gluesBefore * STRETCH; // everything after a glue drifts when it stretches
    const left = x;
    x += it.w + GAP;
    if (it.kind === "glue") gluesBefore += 1;
    return { ...it, left, dx };
  });
}

const driftStyle = (dx: number) => ({ "--bgp-dx": `${dx}px` }) as CSSProperties;

const stretchStyle = (w0: number) =>
  ({ "--bgp-w0": `${w0}px`, "--bgp-w1": `${w0 + STRETCH}px` }) as CSSProperties;

/** Small outward double arrow (the "this is elastic" mark), centered on (cx, cy). */
function stretchArrowPath(cx: number, cy: number, half: number): string {
  return [
    `M ${cx - half} ${cy} H ${cx + half}`,
    `M ${cx - half + 4} ${cy - 3.5} L ${cx - half} ${cy} L ${cx - half + 4} ${cy + 3.5}`,
    `M ${cx + half - 4} ${cy - 3.5} L ${cx + half} ${cy} L ${cx + half - 4} ${cy + 3.5}`,
  ].join(" ");
}

function LegendCard({
  x,
  name,
  desc,
  color,
  children,
}: {
  x: number;
  name: string;
  desc: string;
  color: "blue" | "yellow" | "pink";
  children: React.ReactNode;
}) {
  return (
    <g>
      <rect
        x={x}
        y={28}
        width={220}
        height={56}
        rx={8}
        fill="var(--svg-legend-fill)"
        stroke="var(--svg-legend-stroke)"
        strokeWidth={1}
      />
      {children}
      <Label x={x + 54} y={47} size={11} bold color={color}>
        {name}
      </Label>
      <Label x={x + 54} y={65} size={9} color="mid">
        {desc}
      </Label>
    </g>
  );
}

export function BoxGluePenalty({ labels }: { labels: BoxGluePenaltyLabels }) {
  const items = buildItems(parseSentence(labels.exampleLabel));
  const blue = colorTokens.blue;
  const yellow = colorTokens.yellow;
  const pink = colorTokens.pink;

  const tokens = layoutItems(items).map((it, i) => {
    const { left, dx } = it;

    if (it.kind === "box") {
      return (
        <g key={i} className="bgp-drift" style={driftStyle(dx)}>
          <rect
            x={left}
            y={STRIP_Y}
            width={it.w}
            height={STRIP_H}
            rx={4}
            fill={blue.fill}
            stroke={blue.stroke}
            strokeWidth={1.5}
          />
          <text x={left + it.w / 2} y={STRIP_Y + 21} textAnchor="middle" fontSize={10} fill={blue.text}>
            {it.text}
          </text>
        </g>
      );
    }
    if (it.kind === "glue") {
      return (
        <g key={i} className="bgp-drift" style={driftStyle(dx)}>
          <rect
            className="bgp-stretch"
            style={stretchStyle(it.w)}
            x={left}
            y={STRIP_Y + 6}
            width={it.w}
            height={STRIP_H - 12}
            rx={4}
            fill={yellow.fill}
            stroke={yellow.stroke}
            strokeWidth={1.5}
            strokeDasharray="4,3"
          />
          <g className="bgp-drift" style={driftStyle(STRETCH / 2)}>
            <path
              d={stretchArrowPath(left + it.w / 2, STRIP_Y + STRIP_H / 2, 7)}
              fill="none"
              stroke={yellow.text}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      );
    }
    return (
      <g key={i} className="bgp-drift" style={driftStyle(dx)}>
        <rect
          x={left}
          y={STRIP_Y}
          width={it.w}
          height={STRIP_H}
          rx={3}
          fill={pink.fill}
          stroke={pink.stroke}
          strokeWidth={1.5}
        />
        <line
          x1={left + it.w / 2}
          y1={STRIP_Y + 5}
          x2={left + it.w / 2}
          y2={STRIP_Y + STRIP_H - 5}
          stroke={pink.stroke}
          strokeWidth={1.5}
          strokeDasharray="3,2.5"
        />
        <line
          x1={left + it.w / 2}
          y1={STRIP_Y + STRIP_H}
          x2={left + it.w / 2}
          y2={STRIP_Y + STRIP_H + 7}
          stroke={pink.stroke}
          strokeWidth={1}
          opacity={0.6}
        />
        <text x={left + it.w / 2} y={STRIP_Y + STRIP_H + 19} textAnchor="middle" fontSize={9} fill={pink.text}>
          {it.cost}
        </text>
      </g>
    );
  });

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 198" maxWidth={760}>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .bgp-drift { animation: bgp-drift 6s ease-in-out infinite; }
          .bgp-stretch { animation: bgp-stretch 6s ease-in-out infinite; }
          @keyframes bgp-drift {
            0%, 100% { transform: translateX(0); }
            45%, 55% { transform: translateX(var(--bgp-dx, 0px)); }
          }
          @keyframes bgp-stretch {
            0%, 100% { width: var(--bgp-w0); }
            45%, 55% { width: var(--bgp-w1); }
          }
        }
      `}</style>

      {/* ── Legend: one card per primitive ── */}
      <LegendCard x={40} name={labels.box} desc={labels.boxDesc} color="blue">
        <rect x={52} y={45} width={30} height={22} rx={4} fill={blue.fill} stroke={blue.stroke} strokeWidth={1.5} />
      </LegendCard>

      <LegendCard x={280} name={labels.glue} desc={labels.glueDesc} color="yellow">
        <rect
          className="bgp-stretch"
          style={stretchStyle(30)}
          x={292}
          y={45}
          width={30}
          height={22}
          rx={4}
          fill={yellow.fill}
          stroke={yellow.stroke}
          strokeWidth={1.5}
          strokeDasharray="4,3"
        />
        <g className="bgp-drift" style={driftStyle(STRETCH / 2)}>
          <path
            d={stretchArrowPath(307, 56, 7)}
            fill="none"
            stroke={yellow.text}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </LegendCard>

      <LegendCard x={520} name={labels.penalty} desc={labels.penaltyDesc} color="pink">
        <rect x={540} y={45} width={14} height={22} rx={3} fill={pink.fill} stroke={pink.stroke} strokeWidth={1.5} />
        <line x1={547} y1={49} x2={547} y2={63} stroke={pink.stroke} strokeWidth={1.5} strokeDasharray="3,2.5" />
      </LegendCard>

      {/* ── Example paragraph decomposed into the primitive sequence ── */}
      <Label x={STRIP_X} y={116} size={10} color="light">
        {labels.exampleLabel}
      </Label>
      {tokens}
    </Figure>
  );
}
