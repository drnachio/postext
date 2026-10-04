import { Figure } from "../Figure";
import { ArrowMarker, Label } from "../primitives";

export interface BaytLayoutLabels {
  title: string;
  desc?: string;
  caption?: string;
  sadr: string;
  ajuz: string;
  gap: string;
  width: string;
  rhyme: string;
  /** The bayts, each `[ṣadr, ʿajuz]`, in Arabic. */
  lines: [string, string][];
}

/*
 * Layout (viewBox 600 x 250)
 *
 * The poem block is centred: two hemistich slots of width W = 200 with a
 * 40 px gap, from x 80 to 520. The ṣadr slot is on the right (320..520),
 * the ʿajuz slot on the left (80..280). Bayts on a 36 px pitch from y 92.
 * Each hemistich starts flush with its slot's right edge and ends flush
 * with its left edge (a light band marks the slot), so the right edges of
 * the ṣadrs line up at 520 and the left ends of the ʿajuzes, where the
 * rhyme falls, at 80. Width brackets y 54; edge guides dashed.
 */

const W = 200;
const GAP = 40;
const LEFT = 80;
const SADR = LEFT + W + GAP; // 320
const RIGHT = SADR + W; // 520
const FIRST = 92;
const PITCH = 36;
const ARABIC_FONT = '"Amiri", "Noto Naskh Arabic", "Geeza Pro", "Arial", serif';

function Hemistich({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <g>
      <rect x={x} y={y - 16} width={W} height={22} rx={2} fill="var(--svg-blue-fill)" opacity={0.5} />
      <text
        x={x + W}
        y={y}
        fontSize={16}
        direction="rtl"
        textAnchor="start"
        textLength={W - 4}
        lengthAdjust="spacingAndGlyphs"
        fill="var(--svg-dark-text)"
        fontFamily={ARABIC_FONT}
      >
        {text}
      </text>
    </g>
  );
}

function WidthBracket({ x, label }: { x: number; label: string }) {
  const y = 54;
  return (
    <g>
      <path d={`M${x} ${y + 6} V${y} H${x + W} V${y + 6}`} fill="none" stroke="var(--svg-stroke)" strokeWidth={1} />
      <Label x={x + W / 2} y={y - 5} anchor="middle" size={10} color="mid">
        {label}
      </Label>
    </g>
  );
}

export function BaytLayout({ labels }: { labels: BaytLayoutLabels }) {
  const last = FIRST + (labels.lines.length - 1) * PITCH;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 600 250" maxWidth={600}>
      <defs>
        <ArrowMarker id="bayt-arrow" color="var(--svg-stroke)" />
      </defs>
      <Label x={SADR + W / 2} y={22} anchor="middle" size={11} bold>
        {labels.sadr}
      </Label>
      <Label x={LEFT + W / 2} y={22} anchor="middle" size={11} bold>
        {labels.ajuz}
      </Label>
      <WidthBracket x={SADR} label={labels.width} />
      <WidthBracket x={LEFT} label={labels.width} />
      <Label x={LEFT + W + GAP / 2} y={54} anchor="middle" size={9} color="light">
        {labels.gap}
      </Label>

      <line x1={RIGHT} y1={66} x2={RIGHT} y2={last + 14} stroke="var(--svg-stroke)" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={LEFT} y1={66} x2={LEFT} y2={last + 14} stroke="var(--svg-blue-stroke)" strokeWidth={1.5} strokeDasharray="3 3" />

      <g lang="ar">
        {labels.lines.map(([sadr, ajuz], i) => {
          const y = FIRST + i * PITCH;
          return (
            <g key={i}>
              <Hemistich x={SADR} y={y} text={sadr} />
              <Hemistich x={LEFT} y={y} text={ajuz} />
            </g>
          );
        })}
      </g>

      <path d={`M${LEFT + 40} ${last + 40} L${LEFT + 4} ${last + 18}`} fill="none" stroke="var(--svg-blue-stroke)" strokeWidth={1.2} markerEnd="url(#bayt-arrow)" />
      <Label x={LEFT + 44} y={last + 44} size={10} color="blue">
        {labels.rhyme}
      </Label>
    </Figure>
  );
}
