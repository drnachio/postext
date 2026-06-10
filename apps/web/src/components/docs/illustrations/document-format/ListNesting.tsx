import { Figure } from "../Figure";
import { Label } from "../primitives";

export interface ListNestingLabels {
  title: string;
  desc?: string;
  caption?: string;
  level1: string;
  level2: string;
  level3: string;
  indentNote: string;
}

/* ── Geometry ──────────────────────────────────────────────
   Panel      : 24,20 → 736,260 (712 × 240), editor-style
   Depth gutter: numbers at x=41, divider at x=58
   Column 0   : X0 = 76; one indent cell = 16 px = two spaces
   Boundaries : x = 76 / 92 / 108 / 124 / 140 (cols 0,2,4,6,8)
   Rows       : cy = 72 + i*38 → 72,110,148,186,224 (levels 1–5)
   Note       : centred at y = 288
─────────────────────────────────────────────────────────── */

const X0 = 76;
const CELL = 16; // two spaces (8 px per space)
const ROW0 = 72;
const ROW_STEP = 38;
const GUIDE_COLS = [0, 1, 2, 3, 4]; // boundaries at 0,2,4,6,8 spaces

interface Row {
  level: number;
  text: string;
  faint?: boolean;
}

/** One 16-px indent cell = exactly two source spaces (shown as two dots). */
function IndentCell({ x, cy, isNew, level }: { x: number; cy: number; isNew: boolean; level: number }) {
  const cell = (
    <>
      <rect
        x={x + 1}
        y={cy - 8}
        width={14}
        height={16}
        rx={3}
        fill={isNew ? "var(--svg-blue-fill)" : "var(--svg-grid)"}
        stroke={isNew ? "var(--svg-blue-stroke)" : "none"}
        strokeWidth={1.2}
      />
      <circle cx={x + 5.5} cy={cy} r={1.4} fill={isNew ? "var(--svg-blue-text)" : "var(--svg-faint-text)"} />
      <circle cx={x + 10.5} cy={cy} r={1.4} fill={isNew ? "var(--svg-blue-text)" : "var(--svg-faint-text)"} />
    </>
  );
  return isNew ? <g className={`ln-newcell ln-d${level}`}>{cell}</g> : <g>{cell}</g>;
}

export function ListNesting({ labels }: { labels: ListNestingLabels }) {
  const rows: Row[] = [
    { level: 1, text: labels.level1 },
    { level: 2, text: labels.level2 },
    { level: 3, text: labels.level3 },
    { level: 4, text: "···", faint: true },
    { level: 5, text: "···", faint: true },
  ];

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 304" maxWidth={760}>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .ln-newcell {
            transform-box: fill-box;
            transform-origin: center;
            animation: ln-pop 6s ease-in-out infinite;
          }
          .ln-d2 { animation-delay: 0.4s; }
          .ln-d3 { animation-delay: 1.2s; }
          .ln-d4 { animation-delay: 2s; }
          .ln-d5 { animation-delay: 2.8s; }
          @keyframes ln-pop {
            0%, 14%, 100% { transform: scale(1); }
            7% { transform: scale(1.2); }
          }
        }
      `}</style>

      {/* Editor panel */}
      <rect x={24} y={20} width={712} height={240} rx={8} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1} />
      <line x1={58} y1={30} x2={58} y2={250} stroke="var(--svg-grid)" strokeWidth={1} />

      {/* Column ruler (space counts 0,2,4,6,8) + indent guides */}
      {GUIDE_COLS.map((c) => {
        const x = X0 + c * CELL;
        return (
          <g key={c}>
            <Label x={x} y={42} anchor="middle" size={8} color="faint">{c * 2}</Label>
            <line x1={x} y1={46} x2={x} y2={52} stroke="var(--svg-light-text)" strokeWidth={1} />
            <line x1={x} y1={54} x2={x} y2={246} stroke="var(--svg-grid)" strokeWidth={1} strokeDasharray="2,4" />
          </g>
        );
      })}

      {/* List rows, levels 1–5 */}
      {rows.map(({ level, text, faint }) => {
        const cy = ROW0 + (level - 1) * ROW_STEP;
        const markerX = X0 + (level - 1) * CELL + 3;
        return (
          <g key={level}>
            {/* depth number in the gutter; level 5 ringed = maximum */}
            {level === 5 ? (
              <circle cx={41} cy={cy} r={9} fill="none" stroke="var(--svg-orange-stroke)" strokeWidth={1.5} />
            ) : null}
            <Label x={41} y={cy + 4} anchor="middle" size={10} color={level === 5 ? "orange" : "mid"} bold={level === 5}>
              {level}
            </Label>

            {/* one cell per nesting step; the newest (deepest) one is highlighted */}
            {Array.from({ length: level - 1 }, (_, k) => (
              <IndentCell key={k} x={X0 + k * CELL} cy={cy} isNew={k === level - 2} level={level} />
            ))}

            {/* markdown source line: "- item" */}
            <text x={markerX} y={cy + 4} fontSize={11}>
              <tspan fill="var(--svg-blue-text)" fontWeight="bold">-</tspan>
              <tspan dx={6} fill={faint ? "var(--svg-faint-text)" : "var(--svg-dark-text)"}>{text}</tspan>
            </text>
          </g>
        );
      })}

      <Label x={380} y={288} anchor="middle" size={10} color="mid">{labels.indentNote}</Label>
    </Figure>
  );
}
