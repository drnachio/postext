import { Figure } from "../Figure";
import { Label } from "../primitives";

export interface ComicSplitLabels {
  title: string;
  desc?: string;
  caption?: string;
  /** The split value drawn above the tree, as written in the Markdown. */
  split: string;
  /** What `/` does: "rows, top to bottom". */
  rows: string;
  /** What `|` does: "columns, from the start side". */
  columns: string;
  /** What `*` takes: "the rest". */
  rest: string;
  /** Names the numbers in the cells: "reading order". */
  order: string;
  /** Names the room between two cells: "gutter". */
  gutter: string;
}

/*
 * Layout (viewBox 600 x 330)
 *
 * Left: the frame of a page, 200 x 270 at (64, 36), split by
 * `30 [30 | 20 | *] / *`: a top tier 30 % of the height, cut into three
 * panels 30 %, 20 % and the rest of its width, and a bottom tier holding the
 * rest of the page. Gutters straddle the split lines (8 px between tiers,
 * 4 px between panels). Sizes are marked outside the frame: across the top
 * for the panels of the tier, down the left for the tiers.
 *
 * Right: the split tree. The root list (`/`) has two items; the first one
 * holds a bracketed list (`|`) of three. Leaves carry the panel numbers.
 */

const FX = 64;
const FY = 36;
const FW = 200;
const FH = 270;
const ROW_GUT = 8;
const COL_GUT = 4;
const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

function Panel({ x, y, w, h, n }: { x: number; y: number; w: number; h: number; n: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--svg-legend-fill)" stroke="var(--svg-dark-text)" strokeWidth={1.5} />
      <circle cx={x + 12} cy={y + 12} r={8} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} />
      <Label x={x + 12} y={y + 15.5} anchor="middle" size={9} bold color="blue">
        {String(n)}
      </Label>
    </g>
  );
}

/** A dimension mark: a thin line with end ticks and its value in the middle. */
function Dim({ x1, y1, x2, y2, text, vertical }: { x1: number; y1: number; x2: number; y2: number; text: string; vertical?: boolean }) {
  const tick = 4;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--svg-light-text)" strokeWidth={1} />
      {vertical ? (
        <>
          <line x1={x1 - tick} y1={y1} x2={x1 + tick} y2={y1} stroke="var(--svg-light-text)" strokeWidth={1} />
          <line x1={x2 - tick} y1={y2} x2={x2 + tick} y2={y2} stroke="var(--svg-light-text)" strokeWidth={1} />
          <Label x={x1 - 6} y={(y1 + y2) / 2 + 3} anchor="end" size={9} color="orange">
            {text}
          </Label>
        </>
      ) : (
        <>
          <line x1={x1} y1={y1 - tick} x2={x1} y2={y1 + tick} stroke="var(--svg-light-text)" strokeWidth={1} />
          <line x1={x2} y1={y2 - tick} x2={x2} y2={y2 + tick} stroke="var(--svg-light-text)" strokeWidth={1} />
          <Label x={(x1 + x2) / 2} y={y1 - 5} anchor="middle" size={9} color="orange">
            {text}
          </Label>
        </>
      )}
    </g>
  );
}

function Node({ x, y, text, color }: { x: number; y: number; text: string; color: "purple" | "orange" | "blue" }) {
  const w = Math.max(26, text.length * 7 + 12);
  const fill = color === "purple" ? "var(--svg-purple-fill)" : color === "orange" ? "var(--svg-orange-fill)" : "var(--svg-blue-fill)";
  const stroke = color === "purple" ? "var(--svg-purple-stroke)" : color === "orange" ? "var(--svg-orange-stroke)" : "var(--svg-blue-stroke)";
  return (
    <g>
      <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={4} fill={fill} stroke={stroke} strokeWidth={1.2} />
      <Label x={x} y={y + 4} anchor="middle" size={10} bold color={color}>
        {text}
      </Label>
    </g>
  );
}

function Edge({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--svg-stroke)" strokeWidth={1.2} />;
}

export function ComicSplit({ labels }: { labels: ComicSplitLabels }) {
  // Split lines: the tier line at 30 % of the height, the panel lines at
  // 30 % and 50 % (30 + 20) of the width.
  const tierLine = FY + 0.3 * FH;
  const c1 = FX + 0.3 * FW;
  const c2 = FX + 0.5 * FW;
  const topH = tierLine - ROW_GUT / 2 - FY;
  const botY = tierLine + ROW_GUT / 2;
  const botH = FY + FH - botY;

  // Tree, right half.
  const tx = 450;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 600 330" maxWidth={600}>
      {/* Laid out left to right in every language: labels anchor where the
          drawing expects them, also on a right-to-left page. */}
      <g direction="ltr">
      {/* The frame and its four panels. */}
      <rect x={FX} y={FY} width={FW} height={FH} fill="none" stroke="var(--svg-legend-stroke)" strokeWidth={1} strokeDasharray="3 3" />
      <Panel x={FX} y={FY} w={c1 - COL_GUT / 2 - FX} h={topH} n={1} />
      <Panel x={c1 + COL_GUT / 2} y={FY} w={c2 - c1 - COL_GUT} h={topH} n={2} />
      <Panel x={c2 + COL_GUT / 2} y={FY} w={FX + FW - c2 - COL_GUT / 2} h={topH} n={3} />
      <Panel x={FX} y={botY} w={FW} h={botH} n={4} />

      {/* Split lines through the middle of the gutters. */}
      <line x1={FX - 6} y1={tierLine} x2={FX + FW + 6} y2={tierLine} stroke="var(--svg-purple-stroke)" strokeWidth={1} strokeDasharray="4 3" />
      <line x1={c1} y1={FY - 4} x2={c1} y2={tierLine} stroke="var(--svg-orange-stroke)" strokeWidth={1} strokeDasharray="4 3" />
      <line x1={c2} y1={FY - 4} x2={c2} y2={tierLine} stroke="var(--svg-orange-stroke)" strokeWidth={1} strokeDasharray="4 3" />

      {/* Sizes of the panels of the first tier, across the top. */}
      <Dim x1={FX} y1={FY - 14} x2={c1} y2={FY - 14} text="30 %" />
      <Dim x1={c1} y1={FY - 14} x2={c2} y2={FY - 14} text="20 %" />
      <Dim x1={c2} y1={FY - 14} x2={FX + FW} y2={FY - 14} text="*" />
      {/* Sizes of the tiers, down the left. */}
      <Dim x1={FX - 24} y1={FY} x2={FX - 24} y2={tierLine} text="30 %" vertical />
      <Dim x1={FX - 24} y1={tierLine} x2={FX - 24} y2={FY + FH} text="*" vertical />

      {/* Gutter callout. */}
      <line x1={FX + FW + 6} y1={tierLine} x2={FX + FW + 22} y2={tierLine + 14} stroke="var(--svg-light-text)" strokeWidth={1} />
      <Label x={FX + FW + 24} y={tierLine + 24} size={9} color="light">
        {labels.gutter}
      </Label>

      {/* The split value. */}
      <text x={tx} y={30} fontSize={12} textAnchor="middle" fontFamily={MONO} fill="var(--svg-dark-text)">
        split=&quot;{labels.split}&quot;
      </text>

      {/* The tree. */}
      <Edge x1={tx} y1={78} x2={tx - 70} y2={140} />
      <Edge x1={tx} y1={78} x2={tx + 80} y2={140} />
      <Node x={tx} y={70} text="/" color="purple" />
      <Label x={tx + 22} y={74} size={9} color="purple">
        {labels.rows}
      </Label>

      <Node x={tx - 70} y={148} text="30" color="orange" />
      <Node x={tx + 80} y={148} text="*" color="orange" />
      <Label x={tx + 96} y={152} size={9} color="light">
        {labels.rest}
      </Label>

      <Edge x1={tx - 70} y1={158} x2={tx - 70} y2={192} />
      <Node x={tx - 70} y={200} text="[ | ]" color="purple" />
      <Label x={tx - 70} y={224} anchor="middle" size={9} color="purple">
        {labels.columns}
      </Label>

      <Edge x1={tx - 70} y1={232} x2={tx - 130} y2={262} />
      <Edge x1={tx - 70} y1={232} x2={tx - 70} y2={262} />
      <Edge x1={tx - 70} y1={232} x2={tx - 10} y2={262} />
      <Node x={tx - 130} y={270} text="30" color="orange" />
      <Node x={tx - 70} y={270} text="20" color="orange" />
      <Node x={tx - 10} y={270} text="*" color="orange" />

      {/* Leaves → panel numbers. */}
      {[
        [tx - 130, 1],
        [tx - 70, 2],
        [tx - 10, 3],
      ].map(([x, n]) => (
        <g key={n}>
          <Edge x1={x!} y1={280} x2={x!} y2={294} />
          <circle cx={x} cy={302} r={8} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} />
          <Label x={x!} y={305.5} anchor="middle" size={9} bold color="blue">
            {String(n)}
          </Label>
        </g>
      ))}
      <Edge x1={tx + 80} y1={158} x2={tx + 80} y2={180} />
      <circle cx={tx + 80} cy={196} r={8} fill="var(--svg-blue-fill)" stroke="var(--svg-blue-stroke)" strokeWidth={1} />
      <Label x={tx + 80} y={199.5} anchor="middle" size={9} bold color="blue">
        4
      </Label>
      <Label x={tx - 70} y={324} anchor="middle" size={9} color="blue">
        {labels.order}
      </Label>
      </g>
    </Figure>
  );
}
