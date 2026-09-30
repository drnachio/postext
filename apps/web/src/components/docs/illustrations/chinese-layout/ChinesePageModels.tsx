import { Figure } from "../Figure";
import { ArrowMarker, Label } from "../primitives";

export interface ChinesePageModelsLabels {
  title: string;
  desc?: string;
  caption?: string;
  horizontalTitle: string;
  verticalTitle: string;
  spine: string;
  lineDirection: string;
  columnDirection: string;
  pageOrder: string;
  /** Traditional Chinese text shown at the start of the first page. */
  sample: string;
}

/*
 * Layout (viewBox 760 x 318)
 *
 * Two panels, each a spread of two 124 x 172 pages meeting at the spine.
 *   left panel   x 24..364   horizontal book, bound on the left: [2 | 3]
 *   right panel  x 396..736  vertical book, bound on the right:  [3 | 2]
 * Pages y 52..224; page numbers y 244; order arrow y 262; direction note y 296.
 * Text area: 14 px inset. Lines and columns on a 12 px pitch; the first line
 * or column of page 2 shows real characters at 10 px, one per 12 px cell.
 */

const PAGE_W = 124;
const PAGE_H = 172;
const TOP = 52;
const INSET = 14;
const PITCH = 12;
const CHAR = 10;
const HAN_FONT = '"Noto Serif TC", "Source Han Serif TC", "Noto Serif CJK TC", "Songti TC", "PMingLiU", serif';
const BAR = "var(--svg-mid-text)";

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

/** Horizontal lines on a page, the first one set with characters when `chars` is given. */
function HorizontalLines({ x, chars }: { x: number; chars?: string[] }) {
  const left = x + INSET;
  const width = PAGE_W - 2 * INSET;
  const perLine = Math.floor(width / PITCH);
  const rows = Math.floor((PAGE_H - 2 * INSET) / PITCH);
  const out: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const y = TOP + INSET + r * PITCH;
    if (r === 0 && chars) {
      chars.slice(0, perLine).forEach((c, i) => {
        out.push(
          <text key={`c${i}`} x={left + i * PITCH + PITCH / 2} y={y + CHAR * 0.88} fontSize={CHAR} textAnchor="middle" fill="var(--svg-dark-text)" fontFamily={HAN_FONT}>
            {c}
          </text>,
        );
      });
      continue;
    }
    // A paragraph indent of two characters every few lines; the last line of a paragraph runs short.
    const indent = r % 5 === 1 ? 2 * PITCH : 0;
    const short = r % 5 === 0 ? width * 0.55 : width;
    const w = Math.min(width - indent, short);
    out.push(<rect key={`l${r}`} x={left + indent} y={y + 2} width={w} height={6} rx={1} fill={BAR} opacity={0.45} />);
  }
  return <g>{out}</g>;
}

/** Vertical columns on a page, filled from the right, the first one set with characters when `chars` is given. */
function VerticalColumns({ x, chars }: { x: number; chars?: string[] }) {
  const top = TOP + INSET;
  const height = PAGE_H - 2 * INSET;
  const perCol = Math.floor(height / PITCH);
  const cols = Math.floor((PAGE_W - 2 * INSET) / PITCH);
  const right = x + PAGE_W - INSET;
  const out: React.ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    const cx = right - (c + 1) * PITCH;
    if (c === 0 && chars) {
      chars.slice(0, perCol).forEach((ch, i) => {
        out.push(
          <text key={`c${i}`} x={cx + PITCH / 2} y={top + i * PITCH + CHAR * 0.88} fontSize={CHAR} textAnchor="middle" fill="var(--svg-dark-text)" fontFamily={HAN_FONT}>
            {ch}
          </text>,
        );
      });
      continue;
    }
    const indent = c % 5 === 1 ? 2 * PITCH : 0;
    const short = c % 5 === 0 ? height * 0.55 : height;
    const h = Math.min(height - indent, short);
    out.push(<rect key={`l${c}`} x={cx + 2} y={top + indent} width={6} height={h} rx={1} fill={BAR} opacity={0.45} />);
  }
  return <g>{out}</g>;
}

function Spine({ x, label }: { x: number; label: string }) {
  return (
    <g>
      <line x1={x} y1={TOP - 6} x2={x} y2={TOP + PAGE_H + 6} stroke="var(--svg-stroke)" strokeWidth={1.5} strokeDasharray="3 3" />
      <Label x={x} y={TOP - 12} anchor="middle" size={9} color="light">
        {label}
      </Label>
    </g>
  );
}

function OrderArrow({ from, to, label, markerId }: { from: number; to: number; label: string; markerId: string }) {
  const y = 264;
  const mid = (from + to) / 2;
  return (
    <g>
      <path d={`M${from} ${y} Q${mid} ${y + 14} ${to} ${y}`} fill="none" stroke="var(--svg-blue-stroke)" strokeWidth={1.5} markerEnd={`url(#${markerId})`} />
      <Label x={mid} y={y + 24} anchor="middle" size={9} color="blue">
        {label}
      </Label>
    </g>
  );
}

export function ChinesePageModels({ labels }: { labels: ChinesePageModelsLabels }) {
  const chars = Array.from(labels.sample);
  // Horizontal panel: page 2 on the left, page 3 (recto) on the right.
  const hSpine = 194;
  const hVerso = hSpine - PAGE_W;
  const hRecto = hSpine;
  // Vertical panel: page 3 (recto) on the left, page 2 on the right.
  const vSpine = 566;
  const vRecto = vSpine - PAGE_W;
  const vVerso = vSpine;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 318" maxWidth={760}>
      <defs>
        <ArrowMarker id="cpm-arrow" color="var(--svg-blue-stroke)" />
      </defs>

      <Label x={hSpine} y={22} anchor="middle" size={12} bold>
        {labels.horizontalTitle}
      </Label>
      <PageRect x={hVerso} recto={false} />
      <PageRect x={hRecto} recto />
      <g lang="zh-Hant">
        <HorizontalLines x={hVerso} chars={chars} />
        <HorizontalLines x={hRecto} />
      </g>
      <Spine x={hSpine} label={labels.spine} />
      <Label x={hVerso + PAGE_W / 2} y={244} anchor="middle" size={11} bold color="mid">2</Label>
      <Label x={hRecto + PAGE_W / 2} y={244} anchor="middle" size={11} bold color="blue">3</Label>
      <OrderArrow from={hVerso + PAGE_W / 2 + 12} to={hRecto + PAGE_W / 2 - 12} label={labels.pageOrder} markerId="cpm-arrow" />
      <Label x={hSpine} y={306} anchor="middle" size={10} color="mid">
        {labels.lineDirection}
      </Label>

      <Label x={vSpine} y={22} anchor="middle" size={12} bold>
        {labels.verticalTitle}
      </Label>
      <PageRect x={vRecto} recto />
      <PageRect x={vVerso} recto={false} />
      <g lang="zh-Hant">
        <VerticalColumns x={vVerso} chars={chars} />
        <VerticalColumns x={vRecto} />
      </g>
      <Spine x={vSpine} label={labels.spine} />
      <Label x={vRecto + PAGE_W / 2} y={244} anchor="middle" size={11} bold color="blue">3</Label>
      <Label x={vVerso + PAGE_W / 2} y={244} anchor="middle" size={11} bold color="mid">2</Label>
      <OrderArrow from={vVerso + PAGE_W / 2 - 12} to={vRecto + PAGE_W / 2 + 12} label={labels.pageOrder} markerId="cpm-arrow" />
      <Label x={vSpine} y={306} anchor="middle" size={10} color="mid">
        {labels.columnDirection}
      </Label>
    </Figure>
  );
}
