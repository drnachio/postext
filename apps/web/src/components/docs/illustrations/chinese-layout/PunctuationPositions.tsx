import { Figure } from "../Figure";
import { Label } from "../primitives";

export interface PunctuationPositionsLabels {
  title: string;
  desc?: string;
  caption?: string;
  mainland: string;
  taiwan: string;
  horizontal: string;
  vertical: string;
  /** Four Han characters; a mark follows each one. */
  sample: string;
}

/*
 * Layout (viewBox 760 x 352)
 *
 * Each strip is eight 34 px cells: four characters, each followed by a mark
 * (。 ， 、 ：). The marks are drawn as shapes, not glyphs, so the figure shows
 * the positions whatever Chinese font the reader's browser has:
 *   mainland, across the page   lower left of the cell (GB/T 15834 §5.1.1)
 *   mainland, down the page     upper right of the cell (§5.2.1)
 *   Taiwan and Hong Kong        centred, in both directions
 * The two horizontal strips sit at x 40, y 84 and y 204; the two vertical
 * strips at x 520 and x 650, y 58..330. A faint cross marks each mark's cell
 * quarters.
 */

const CELL = 34;
const HAN_FONT = '"Noto Serif SC", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "SimSun", serif';
const INK = "var(--svg-dark-text)";
const MARK = "var(--svg-pink-text)";

type Mark = "stop" | "comma" | "pause" | "colon";
type Setting = "mainland-h" | "mainland-v" | "centred";

/** Centre of a mark in its cell, in fractions of the cell (x right, y down). */
function markCentre(mark: Mark, setting: Setting): [number, number] {
  if (setting === "centred") return [0.5, mark === "comma" ? 0.46 : 0.5];
  if (setting === "mainland-h") {
    if (mark === "colon") return [0.26, 0.54];
    return [0.24, mark === "comma" ? 0.72 : 0.76];
  }
  if (mark === "colon") return [0.74, 0.46];
  return [0.76, mark === "comma" ? 0.2 : 0.24];
}

function MarkShape({ mark, x, y, setting }: { mark: Mark; x: number; y: number; setting: Setting }) {
  const [fx, fy] = markCentre(mark, setting);
  const cx = x + fx * CELL;
  const cy = y + fy * CELL;
  const s = CELL;
  switch (mark) {
    case "stop":
      return <circle cx={cx} cy={cy} r={0.1 * s} fill="none" stroke={MARK} strokeWidth={0.04 * s} />;
    case "comma":
      return (
        <g fill={MARK} stroke={MARK}>
          <circle cx={cx} cy={cy} r={0.065 * s} stroke="none" />
          <path
            d={`M${cx + 0.055 * s} ${cy + 0.01 * s} Q${cx + 0.06 * s} ${cy + 0.13 * s} ${cx - 0.05 * s} ${cy + 0.2 * s}`}
            fill="none"
            strokeWidth={0.035 * s}
            strokeLinecap="round"
          />
        </g>
      );
    case "pause":
      return (
        <line
          x1={cx - 0.06 * s}
          y1={cy - 0.06 * s}
          x2={cx + 0.06 * s}
          y2={cy + 0.07 * s}
          stroke={MARK}
          strokeWidth={0.055 * s}
          strokeLinecap="round"
        />
      );
    case "colon":
      return (
        <g fill={MARK}>
          <circle cx={cx} cy={cy - 0.15 * s} r={0.055 * s} />
          <circle cx={cx} cy={cy + 0.15 * s} r={0.055 * s} />
        </g>
      );
  }
}

function Cell({ x, y, mark }: { x: number; y: number; mark: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={CELL} height={CELL} fill={mark ? "var(--svg-pink-fill)" : "none"} stroke="var(--svg-legend-stroke)" strokeWidth={1} strokeDasharray="2 2" />
      {mark ? (
        <path
          d={`M${x + CELL / 2} ${y + 3} V${y + CELL - 3} M${x + 3} ${y + CELL / 2} H${x + CELL - 3}`}
          stroke="var(--svg-grid)"
          strokeWidth={1}
        />
      ) : null}
    </g>
  );
}

const MARKS: Mark[] = ["stop", "comma", "pause", "colon"];

function Strip({ x, y, vertical, setting, chars }: { x: number; y: number; vertical: boolean; setting: Setting; chars: string[] }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < 8; i++) {
    const cx = vertical ? x : x + i * CELL;
    const cy = vertical ? y + i * CELL : y;
    const isMark = i % 2 === 1;
    out.push(<Cell key={`cell${i}`} x={cx} y={cy} mark={isMark} />);
    if (isMark) {
      out.push(<MarkShape key={`m${i}`} mark={MARKS[(i - 1) / 2]!} x={cx} y={cy} setting={setting} />);
    } else {
      out.push(
        <text key={`c${i}`} x={cx + CELL / 2} y={cy + CELL * 0.8} fontSize={CELL * 0.82} textAnchor="middle" fill={INK} fontFamily={HAN_FONT}>
          {chars[i / 2] ?? "字"}
        </text>,
      );
    }
  }
  return <g lang="zh-Hans">{out}</g>;
}

export function PunctuationPositions({ labels }: { labels: PunctuationPositionsLabels }) {
  const chars = Array.from(labels.sample);
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 352" maxWidth={760}>
      <Label x={40} y={30} size={11} bold>
        {labels.horizontal}
      </Label>
      <Label x={40} y={72} size={10} color="mid">
        {labels.mainland}
      </Label>
      <Strip x={40} y={80} vertical={false} setting="mainland-h" chars={chars} />
      <Label x={40} y={192} size={10} color="mid">
        {labels.taiwan}
      </Label>
      <Strip x={40} y={200} vertical={false} setting="centred" chars={chars} />

      <Label x={604} y={30} size={11} bold anchor="middle">
        {labels.vertical}
      </Label>
      <Label x={537} y={50} size={10} color="mid" anchor="middle">
        {labels.mainland}
      </Label>
      <Strip x={520} y={58} vertical setting="mainland-v" chars={chars} />
      <Label x={667} y={50} size={10} color="mid" anchor="middle">
        {labels.taiwan}
      </Label>
      <Strip x={650} y={58} vertical setting="centred" chars={chars} />
    </Figure>
  );
}
