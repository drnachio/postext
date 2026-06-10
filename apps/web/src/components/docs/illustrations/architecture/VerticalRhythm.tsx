import { Figure } from "../Figure";
import { DropShadowDef, Label } from "../primitives";

export interface VerticalRhythmLabels {
  title: string;
  desc?: string;
  caption?: string;
  column1: string;
  column2: string;
  bodyLine: string;
  bodyBaseline: string;
  heading: string;
  adjustment: string;
  backOnGrid: string;
  aligned: string;
  legendTitle: string;
  legendSteps: string[];
}

const GRID = 24;
const TOP = 48; // first grid line
const ROWS = 7; // body-line rows per column
const C1X = 64; // column 1 left
const C2X = 436; // column 2 left
const CW = 260; // column width
const BOTTOM = TOP + ROWS * GRID; // 216

/** A 24px body-text line box, optionally labelled, otherwise with a faux text bar. */
function BodyLine({ x, y, text, barW }: { x: number; y: number; text?: string; barW?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={CW} height={GRID} rx={3} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} />
      {text ? (
        <Label x={x + 10} y={y + 16} size={10} color="blue">{text}</Label>
      ) : (
        <rect x={x + 10} y={y + 10} width={barW ?? 160} height={4} rx={2} fill="var(--svg-blue-half)" />
      )}
    </g>
  );
}

export function VerticalRhythm({ labels }: { labels: VerticalRhythmLabels }) {
  const legendY = BOTTOM + 34; // 250
  const legendH = 45 + labels.legendSteps.length * 17;
  const height = legendY + legendH + 16;
  const headY = TOP + 2 * GRID; // heading top: 96
  const bandY = headY + 36; // 132 — heading is 36px tall, 12px past the grid
  const fixedY = bandY + 12; // 144 — first body line back on the grid

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox={`0 0 760 ${height}`} maxWidth={760}>
      <defs>
        <DropShadowDef id="vr-shadow" />
        <pattern id="vr-hatch" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={6} stroke="var(--svg-pink-stroke)" strokeWidth={1} opacity={0.3} />
        </pattern>
      </defs>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .vr-shift { animation: vr-shift 8s ease-in-out infinite; }
          .vr-fade { animation: vr-fade 8s ease-in-out infinite; }
        }
        @keyframes vr-shift {
          0%, 42% { transform: translateY(0); }
          54%, 72% { transform: translateY(-12px); }
          84%, 100% { transform: translateY(0); }
        }
        @keyframes vr-fade {
          0%, 46% { opacity: 1; }
          54%, 76% { opacity: 0; }
          88%, 100% { opacity: 1; }
        }
      `}</style>

      {/* ── baseline grid ── */}
      {Array.from({ length: ROWS + 1 }, (_, i) => {
        const y = TOP + i * GRID;
        return (
          <g key={i}>
            <line x1={C1X} y1={y} x2={C2X + CW} y2={y} stroke="var(--svg-grid)" strokeWidth={1} strokeDasharray="4 4" />
            <text x={C1X - 8} y={y + 3} fontSize={8} textAnchor="end" fill="var(--svg-faint-text)">{i * GRID}</text>
          </g>
        );
      })}

      {/* ── column headers ── */}
      <Label x={C1X + CW / 2} y={34} anchor="middle" size={11} bold color="dark">{labels.column1}</Label>
      <Label x={C2X + CW / 2} y={34} anchor="middle" size={11} bold color="dark">{labels.column2}</Label>

      {/* ── column 1: two body lines, then the grid-breaking heading ── */}
      <BodyLine x={C1X} y={TOP} text={labels.bodyBaseline} />
      <BodyLine x={C1X} y={TOP + GRID} text={labels.bodyLine} />
      <rect x={C1X} y={headY} width={CW} height={36} rx={3} fill="var(--svg-orange-fill)" stroke="var(--svg-orange-stroke)" strokeWidth={1.5} />
      <Label x={C1X + 10} y={headY + 22} size={12} bold color="orange">{labels.heading}</Label>

      {/* +12px adjustment band — fades out when the lines drift off-grid */}
      <g className="vr-fade">
        <rect x={C1X} y={bandY} width={CW} height={12} fill="var(--svg-pink-fill)" />
        <rect x={C1X} y={bandY} width={CW} height={12} fill="url(#vr-hatch)" />
        <rect x={C1X} y={bandY} width={CW} height={12} fill="none" stroke="var(--svg-pink-stroke)" strokeWidth={1} strokeDasharray="3 2" />
        <Label x={C1X + CW / 2} y={bandY + 9.5} anchor="middle" size={9} bold color="pink">{labels.adjustment}</Label>
      </g>

      {/* lines after the heading — animate between drifted (-12px) and corrected (on grid) */}
      <g className="vr-shift">
        <BodyLine x={C1X} y={fixedY} text={labels.backOnGrid} />
        <BodyLine x={C1X} y={fixedY + GRID} barW={180} />
        <BodyLine x={C1X} y={fixedY + 2 * GRID} barW={124} />
      </g>

      {/* ── column 2: uninterrupted rhythm ── */}
      {Array.from({ length: ROWS }, (_, i) => (
        <BodyLine
          key={i}
          x={C2X}
          y={TOP + i * GRID}
          text={i === 0 ? labels.bodyLine : undefined}
          barW={[0, 178, 142, 165, 150, 172, 112][i]}
        />
      ))}

      {/* ── cross-column alignment markers (visible only when corrected) ── */}
      <g className="vr-fade">
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1={C1X + CW + 4}
            y1={fixedY + i * GRID}
            x2={C2X - 4}
            y2={fixedY + i * GRID}
            stroke="var(--svg-green-stroke)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        ))}
        <Label x={(C1X + CW + C2X) / 2} y={fixedY - 6} anchor="middle" size={9} bold color="green">{labels.aligned}</Label>
      </g>

      {/* ── algorithm legend ── */}
      <rect x={C1X} y={legendY} width={C2X + CW - C1X} height={legendH} rx={6} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1} filter="url(#vr-shadow)" />
      <Label x={C1X + 20} y={legendY + 23} size={11} bold color="dark">{labels.legendTitle}</Label>
      {labels.legendSteps.map((step, i) => (
        <text
          key={i}
          x={C1X + 20}
          y={legendY + 45 + i * 17}
          fontSize={10}
          fill="var(--svg-mid-text)"
          style={{ whiteSpace: "pre" }}
        >
          {step}
        </text>
      ))}
    </Figure>
  );
}
