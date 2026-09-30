import { Figure } from "../Figure";
import { Label } from "../primitives";

export interface PunctuationWidthsLabels {
  title: string;
  desc?: string;
  caption?: string;
  fullwidth: string;
  kaiming: string;
  blank: string;
  /** The line to set: Han characters, brackets and a final full stop. */
  sample: string;
  /** Unit after the line lengths ("em"). */
  ems: string;
  /** Decimal separator of the line lengths ("." or ","); "." by default. */
  decimal?: string;
}

/*
 * Layout (viewBox 760 x 236)
 *
 * The same line twice, one 34 px cell per em, starting at x 40:
 *   full width  y 44..78   every character one em; the blank half of each mark tinted
 *   Kaiming     y 142..176 brackets half an em, the full stop at the line end half an em
 * Each glyph is drawn with its whole em box placed so that its ink lands in
 * the box the style gives it: an opening bracket's ink is in the right half of
 * its em box, a closing bracket's and a mainland full stop's in the left half.
 * That holds for any Chinese face, so the figure does not depend on the font.
 */

const EM = 34;
const LEFT = 40;
const HAN_FONT = '"Noto Serif SC", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "SimSun", serif';

type Kind = "han" | "open" | "close" | "stop";

function kindOf(ch: string): Kind {
  if ("《（「『“‘〈【〔".includes(ch)) return "open";
  if ("》）」』”’〉】〕".includes(ch)) return "close";
  if ("。，、；：？！".includes(ch)) return "stop";
  return "han";
}

interface Placed {
  ch: string;
  kind: Kind;
  /** Box the style gives the character, in px from LEFT. */
  x: number;
  w: number;
  /** Left edge of the glyph's em box. */
  emX: number;
}

function place(chars: string[], kaiming: boolean): Placed[] {
  const out: Placed[] = [];
  let x = 0;
  chars.forEach((ch, i) => {
    const kind = kindOf(ch);
    const last = i === chars.length - 1;
    let w = EM;
    let emX = x;
    if (kaiming && kind === "open") {
      w = EM / 2;
      emX = x - EM / 2;
    } else if (kaiming && kind === "close") {
      w = EM / 2;
    } else if (kaiming && kind === "stop" && last) {
      w = EM / 2;
    }
    out.push({ ch, kind, x, w, emX });
    x += w;
  });
  return out;
}

function Row({ y, placed, tintBlank, label, total, blankLabel }: {
  y: number;
  placed: Placed[];
  tintBlank: boolean;
  label: string;
  /** The line's length, written out with its unit. */
  total: string;
  blankLabel?: string;
}) {
  const width = placed.reduce((s, p) => s + p.w, 0);
  return (
    <g>
      <Label x={LEFT} y={y - 12} size={11} bold>
        {label}
      </Label>
      {placed.map((p, i) => {
        const bx = LEFT + p.x;
        const blank =
          tintBlank && p.kind !== "han"
            ? p.kind === "open"
              ? { x: bx, w: EM / 2 }
              : { x: bx + EM / 2, w: EM / 2 }
            : null;
        return (
          <g key={i}>
            <rect x={bx} y={y} width={p.w} height={EM} fill={p.kind === "han" ? "none" : "var(--svg-blue-fill)"} stroke="var(--svg-legend-stroke)" strokeWidth={1} />
            {blank ? <rect x={blank.x} y={y} width={blank.w} height={EM} fill="var(--svg-pink-half)" /> : null}
            <text x={LEFT + p.emX + EM / 2} y={y + EM * 0.88} fontSize={EM} textAnchor="middle" fill="var(--svg-dark-text)" fontFamily={HAN_FONT}>
              {p.ch}
            </text>
          </g>
        );
      })}
      {/* ruler: a tick per em, the length at the end */}
      <path
        d={Array.from({ length: Math.floor(width / EM) + 1 }, (_, k) => `M${LEFT + k * EM} ${y + EM + 4} v5`).join(" ")}
        stroke="var(--svg-stroke)"
        strokeWidth={1}
      />
      <line x1={LEFT} y1={y + EM + 4} x2={LEFT + width} y2={y + EM + 4} stroke="var(--svg-stroke)" strokeWidth={1} />
      <line x1={LEFT + width} y1={y - 4} x2={LEFT + width} y2={y + EM + 10} stroke="var(--svg-pink-stroke)" strokeWidth={1.5} />
      <Label x={LEFT + width} y={y + EM + 22} anchor="end" size={10} color="mid">
        {total}
      </Label>
      {blankLabel ? (
        <g>
          <rect x={LEFT} y={y + EM + 14} width={10} height={10} fill="var(--svg-pink-half)" />
          <Label x={LEFT + 16} y={y + EM + 23} size={10} color="mid">
            {blankLabel}
          </Label>
        </g>
      ) : null}
    </g>
  );
}

export function PunctuationWidths({ labels }: { labels: PunctuationWidthsLabels }) {
  const chars = Array.from(labels.sample);
  const full = place(chars, false);
  const kaiming = place(chars, true);
  const len = (p: Placed[]) =>
    `${String(p.reduce((s, q) => s + q.w, 0) / EM).replace(".", labels.decimal ?? ".")} ${labels.ems}`;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 236" maxWidth={760}>
      <g lang="zh-Hans">
        <Row y={44} placed={full} tintBlank label={labels.fullwidth} total={len(full)} blankLabel={labels.blank} />
        <Row y={152} placed={kaiming} tintBlank={false} label={labels.kaiming} total={len(kaiming)} />
      </g>
    </Figure>
  );
}
