import { Figure } from "../Figure";
import { Label } from "../primitives";

export interface YakumonoSpacingLabels {
  title: string;
  desc?: string;
  caption?: string;
  /** Label of the first row: every mark in a full em, nothing added. */
  solid: string;
  /** Label of the second row: JLReq spacing. */
  jlreq: string;
  /** Legend of the tinted blank a pair gives up. */
  blank: string;
  /** Legend of the em of space after ？ or ！. */
  aki: string;
  /** The line to set: kana and kanji, brackets, 、。 and one ？ followed by a kana. */
  sample: string;
  /** Unit after the line lengths ("em"). */
  ems: string;
  /** Decimal separator of the line lengths ("." or ","); "." by default. */
  decimal?: string;
}

/*
 * Layout (viewBox 760 x 244)
 *
 * The same line twice, one 34 px cell per em, starting at x 40:
 *   solid   y 44..78    every character one em, the blank half of each
 *                       bracket and of 、。 tinted where a pair meets
 *   JLReq   y 150..184  the pairs (」、 、「 」。) give up one blank half each
 *                       (JLReq §3.1.4), and ？ followed by text takes one em
 *                       of space after it (JLReq §3.1.6), drawn as a ruled cell
 * A glyph is drawn with its em box placed so that its ink lands in the box the
 * spacing gives it: an opening bracket's ink sits in the right half of its em,
 * a closing bracket's and 、。's in the left half (horizontal Japanese faces).
 * That holds for any Japanese face, so the figure does not depend on the font.
 */

const EM = 34;
const LEFT = 40;
const JA_FONT = 'var(--font-noto-serif-jp), "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif';

type Kind = "letter" | "open" | "close" | "stop" | "question" | "aki";

function kindOf(ch: string): Kind {
  if ("「『（〔［【〈《".includes(ch)) return "open";
  if ("」』）〕］】〉》".includes(ch)) return "close";
  if ("、。，．".includes(ch)) return "stop";
  if ("？！".includes(ch)) return "question";
  return "letter";
}

interface Placed {
  ch: string;
  kind: Kind;
  /** Box the spacing gives the character, in px from LEFT. */
  x: number;
  w: number;
  /** Left edge of the glyph's em box. */
  emX: number;
  /** Which half of the cell is blank and given up in the JLReq row ("start" / "end"). */
  gives?: "start" | "end";
}

/** Blank half after a closing mark, before an opening one. */
const trailingBlank = (k: Kind) => k === "close" || k === "stop";

function place(chars: string[], jlreq: boolean): Placed[] {
  // Which halves a pair gives up (JLReq §3.1.4): a closing mark or 、。 before
  // another closing mark or 、。 loses the blank after it; before an opening
  // bracket one of the two blank halves goes (here the opening bracket's).
  const gives: ("start" | "end" | undefined)[] = chars.map(() => undefined);
  for (let i = 0; i + 1 < chars.length; i++) {
    const a = kindOf(chars[i]!);
    const b = kindOf(chars[i + 1]!);
    if (trailingBlank(a) && (b === "close" || b === "stop")) gives[i] = "end";
    else if (trailingBlank(a) && b === "open") gives[i + 1] = "start";
  }
  const out: Placed[] = [];
  let x = 0;
  chars.forEach((ch, i) => {
    const kind = kindOf(ch);
    const give = gives[i];
    let w = EM;
    let emX = x;
    if (jlreq && give === "end") w = EM / 2;
    if (jlreq && give === "start") {
      w = EM / 2;
      emX = x - EM / 2;
    }
    out.push({ ch, kind, x, w, emX, gives: give });
    x += w;
    // ？！ followed by text (not by a closing mark or another ？！) take one
    // em of space after them, which never stretches or shrinks.
    const next = chars[i + 1];
    if (jlreq && kind === "question" && next && kindOf(next) === "letter") {
      out.push({ ch: "", kind: "aki", x, w: EM, emX: x });
      x += EM;
    }
  });
  return out;
}

function Row({ y, placed, tintGiven, label, total }: {
  y: number;
  placed: Placed[];
  /** Tint the blank half a pair gives up (solid row: still there). */
  tintGiven: boolean;
  label: string;
  /** The line's length, written out with its unit. */
  total: string;
}) {
  const width = placed.reduce((s, p) => s + p.w, 0);
  return (
    <g>
      <Label x={LEFT} y={y - 12} size={11} bold>
        {label}
      </Label>
      {placed.map((p, i) => {
        const bx = LEFT + p.x;
        if (p.kind === "aki") {
          return (
            <g key={i}>
              <rect x={bx} y={y} width={p.w} height={EM} fill="var(--svg-green-fill)" stroke="var(--svg-green-stroke)" strokeWidth={1} strokeDasharray="3 2" />
            </g>
          );
        }
        const blank =
          tintGiven && p.gives
            ? p.gives === "start"
              ? { x: bx, w: EM / 2 }
              : { x: bx + EM / 2, w: EM / 2 }
            : null;
        const mark = p.kind !== "letter";
        return (
          <g key={i}>
            <rect x={bx} y={y} width={p.w} height={EM} fill={mark ? "var(--svg-blue-fill)" : "none"} stroke="var(--svg-legend-stroke)" strokeWidth={1} />
            {blank ? <rect x={blank.x} y={y} width={blank.w} height={EM} fill="var(--svg-pink-half)" /> : null}
            <text x={LEFT + p.emX + EM / 2} y={y + EM * 0.86} fontSize={EM * 0.92} textAnchor="middle" fill="var(--svg-dark-text)" style={{ fontFamily: JA_FONT }}>
              {p.ch}
            </text>
          </g>
        );
      })}
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
    </g>
  );
}

export function YakumonoSpacing({ labels }: { labels: YakumonoSpacingLabels }) {
  const chars = Array.from(labels.sample);
  const solid = place(chars, false);
  const jlreq = place(chars, true);
  const len = (p: Placed[]) =>
    `${String(p.reduce((s, q) => s + q.w, 0) / EM).replace(".", labels.decimal ?? ".")} ${labels.ems}`;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 244" maxWidth={760}>
      <g lang="ja">
        <Row y={44} placed={solid} tintGiven label={labels.solid} total={len(solid)} />
        <Row y={150} placed={jlreq} tintGiven={false} label={labels.jlreq} total={len(jlreq)} />
      </g>
      <g>
        <rect x={LEFT} y={214} width={10} height={10} fill="var(--svg-pink-half)" />
        <Label x={LEFT + 16} y={223} size={10} color="mid">
          {labels.blank}
        </Label>
        <rect x={LEFT + 300} y={214} width={10} height={10} fill="var(--svg-green-fill)" stroke="var(--svg-green-stroke)" strokeWidth={1} strokeDasharray="3 2" />
        <Label x={LEFT + 316} y={223} size={10} color="mid">
          {labels.aki}
        </Label>
      </g>
    </Figure>
  );
}
