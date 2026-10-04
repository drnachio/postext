import { Figure } from "../Figure";
import { ArrowMarker, Label } from "../primitives";

export interface ArabicSpreadLabels {
  title: string;
  desc?: string;
  caption?: string;
  spine: string;
  pageOrder: string;
  /** Says where the first column of a page is (the columns are numbered 1 and 2). */
  columnOrder: string;
  lineDirection: string;
  inner: string;
  outer: string;
  /** Arabic text shown at the start of the first line of page 2. */
  sample: string;
}

/*
 * Layout (viewBox 600 x 330)
 *
 * One spread of two 200 x 220 pages meeting at the spine (x 300), bound on
 * the right: page 3 (the recto) on the left, page 2 on the right.
 * Pages y 48..268; page numbers y 288; order arrow y 300; direction note y 324.
 * Each page has two columns. The inner margin (next to the spine) is 22 px,
 * the outer one 12 px, the gutter 10 px. Lines on a 10 px pitch, flush with
 * the right edge of their column; the last line of a paragraph runs short
 * from the right.
 */

const PAGE_W = 200;
const PAGE_H = 220;
const TOP = 48;
const INNER = 22;
const OUTER = 12;
const HEAD = 16;
const GUTTER = 10;
const PITCH = 10;
const SPINE = 300;
const BAR = "var(--svg-mid-text)";
const ARABIC_FONT = '"Amiri", "Noto Naskh Arabic", "Geeza Pro", "Arial", serif';

function PageRect({ x, recto }: { x: number; recto: boolean }) {
  return (
    <rect
      x={x}
      y={TOP}
      width={PAGE_W}
      height={PAGE_H}
      rx={2}
      fill="var(--svg-legend-fill)"
      stroke={recto ? "var(--svg-blue-stroke)" : "var(--svg-legend-stroke)"}
      strokeWidth={1.5}
    />
  );
}

/** One column of lines, flush right; the first line set in Arabic when `sample` is given. */
function Column({ left, width, sample }: { left: number; width: number; sample?: string }) {
  const rows = Math.floor((PAGE_H - 2 * HEAD) / PITCH);
  const right = left + width;
  const out: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const y = TOP + HEAD + r * PITCH;
    if (r === 0 && sample) {
      out.push(
        <text key="s" x={right} y={y + 7.5} fontSize={8.5} textAnchor="start" direction="rtl" fill="var(--svg-dark-text)" fontFamily={ARABIC_FONT}>
          {sample}
        </text>,
      );
      continue;
    }
    // A first-line indent on the right every few lines; the line before it ends short on the left.
    const indent = r % 7 === 1 ? 8 : 0;
    const w = r % 7 === 0 ? width * 0.5 : width - indent;
    out.push(<rect key={r} x={right - indent - w} y={y + 2} width={w} height={5} rx={1} fill={BAR} opacity={0.45} />);
  }
  return <g>{out}</g>;
}

/** The two columns of a page; `innerOnRight` puts the spine margin on the page's right. */
function Columns({ x, innerOnRight, sample }: { x: number; innerOnRight: boolean; sample?: string }) {
  const left = x + (innerOnRight ? OUTER : INNER);
  const width = PAGE_W - INNER - OUTER;
  const col = (width - GUTTER) / 2;
  return (
    <g>
      <Column left={left + col + GUTTER} width={col} sample={sample} />
      <Column left={left} width={col} />
      <Label x={left + col + GUTTER + col / 2} y={TOP + 11} anchor="middle" size={8} bold color="blue">1</Label>
      <Label x={left + col / 2} y={TOP + 11} anchor="middle" size={8} bold color="mid">2</Label>
    </g>
  );
}

export function ArabicSpread({ labels }: { labels: ArabicSpreadLabels }) {
  const recto = SPINE - PAGE_W; // page 3, left of the spine
  const verso = SPINE; // page 2, right of the spine
  const arrowY = 300;
  const from = verso + PAGE_W / 2 - 14;
  const to = recto + PAGE_W / 2 + 14;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 600 330" maxWidth={600}>
      <defs>
        <ArrowMarker id="asp-arrow" color="var(--svg-blue-stroke)" />
      </defs>

      <PageRect x={recto} recto />
      <PageRect x={verso} recto={false} />
      <g lang="ar">
        <Columns x={verso} innerOnRight={false} sample={labels.sample} />
        <Columns x={recto} innerOnRight />
      </g>

      <line x1={SPINE} y1={TOP - 8} x2={SPINE} y2={TOP + PAGE_H + 8} stroke="var(--svg-stroke)" strokeWidth={1.5} strokeDasharray="3 3" />
      <Label x={SPINE} y={TOP - 14} anchor="middle" size={9} color="light">
        {labels.spine}
      </Label>
      <Label x={verso + 6} y={TOP - 4} size={8} color="light">
        {labels.inner}
      </Label>
      <Label x={verso + PAGE_W - 4} y={TOP - 4} anchor="end" size={8} color="light">
        {labels.outer}
      </Label>
      <Label x={recto + PAGE_W - 6} y={TOP - 4} anchor="end" size={8} color="light">
        {labels.inner}
      </Label>
      <Label x={recto + 4} y={TOP - 4} size={8} color="light">
        {labels.outer}
      </Label>

      <Label x={recto + PAGE_W / 2} y={288} anchor="middle" size={11} bold color="blue">3</Label>
      <Label x={verso + PAGE_W / 2} y={288} anchor="middle" size={11} bold color="mid">2</Label>
      <path d={`M${from} ${arrowY} Q${SPINE} ${arrowY + 12} ${to} ${arrowY}`} fill="none" stroke="var(--svg-blue-stroke)" strokeWidth={1.5} markerEnd="url(#asp-arrow)" />
      <Label x={SPINE} y={arrowY - 4} anchor="middle" size={9} color="blue">
        {labels.pageOrder}
      </Label>

      <Label x={SPINE} y={324} anchor="middle" size={10} color="mid">
        {`${labels.columnOrder} — ${labels.lineDirection}`}
      </Label>
    </Figure>
  );
}
