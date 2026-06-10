import { Figure } from "../Figure";
import { Label } from "../primitives";

export interface TypographyScaleLabels {
  title: string;
  desc?: string;
  caption?: string;
  rows: { role: string; sample: string; size: string }[];
}

/**
 * Type-scale specimen: each row shows the role tag, the sample rendered at its
 * real size sitting on a shared dashed baseline, and a proportional size bar
 * so the numeric scale is readable as data too.
 *
 * Layout (x):  28..94 role pill | 116.. sample on baseline ..556 | 580..700 bar track | size label →746
 */
/** Pure layout pass: stacks rows vertically, row height growing with the sample's font size. */
function placeRows(rows: { role: string; sample: string; size: string; px: number }[]) {
  let cursor = 26;
  const placed = rows.map((r) => {
    const h = Math.max(r.px + 16, 30);
    const top = cursor;
    cursor += h;
    return { ...r, top, baseline: top + h - 12 };
  });
  return { placed, height: cursor + 16 };
}

export function TypographyScale({ labels }: { labels: TypographyScaleLabels }) {
  const rows = labels.rows.map((r) => ({ ...r, px: parseInt(r.size, 10) || 12 }));
  const maxPx = Math.max(1, ...rows.map((r) => r.px));

  const { placed, height } = placeRows(rows);
  const firstTop = placed.length > 0 ? placed[0].top : 26;
  const lastBaseline = placed.length > 0 ? placed[placed.length - 1].baseline : 26;

  const trackX = 580;
  const trackW = 120;

  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox={`0 0 760 ${height}`} maxWidth={760}>
      {/* left alignment guide for the specimen column */}
      <line x1={116} y1={firstTop - 4} x2={116} y2={lastBaseline + 6} stroke="var(--svg-grid)" strokeDasharray="2,4" />

      {placed.map((r, i) => {
        const isHeading = r.px >= 18;
        const barW = Math.max(6, Math.round((r.px / maxPx) * trackW));
        return (
          <g key={i}>
            {/* role pill */}
            <rect x={28} y={r.baseline - 13} width={66} height={18} rx={9} fill="var(--svg-legend-fill)" stroke="var(--svg-legend-stroke)" strokeWidth={1.5} />
            <Label x={61} y={r.baseline} size={9} color="mid" anchor="middle">{r.role}</Label>

            {/* shared baseline the sample sits on */}
            <line x1={110} y1={r.baseline + 2} x2={556} y2={r.baseline + 2} stroke="var(--svg-grid)" strokeDasharray="4,3" />

            {/* the specimen itself, at true size */}
            <text
              x={116}
              y={r.baseline}
              fontSize={r.px}
              fontFamily="Georgia, 'Times New Roman', serif"
              fontWeight={isHeading ? "bold" : "normal"}
              fill={isHeading ? "var(--svg-blue-text)" : "var(--svg-dark-text)"}
            >
              {r.sample}
            </text>

            {/* size bar: length encodes font size relative to the largest step */}
            <rect x={trackX} y={r.baseline - 9} width={trackW} height={10} rx={5} fill="var(--svg-grid)" />
            <rect x={trackX} y={r.baseline - 9} width={barW} height={10} rx={5} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1.5} />
            <Label x={746} y={r.baseline} size={10} color="mid" anchor="end">{r.size}</Label>
          </g>
        );
      })}
    </Figure>
  );
}
