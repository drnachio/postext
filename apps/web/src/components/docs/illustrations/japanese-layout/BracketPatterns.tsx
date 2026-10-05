import { Figure } from "../Figure";
import { Label } from "../primitives";

export interface BracketPatternsLabels {
  title: string;
  desc?: string;
  caption?: string;
  /** Row label of the paragraph that opens with a plain character. */
  plain: string;
  /** Row labels of the three patterns: ① indent, ③ half, 天付き flush. */
  indent: string;
  half: string;
  flush: string;
  /** The values of cjk.paragraphStartBracket, printed beside each row. */
  indentValue?: string;
  halfValue?: string;
  flushValue?: string;
  /** A paragraph's opening, at least 13 characters: a plain one, then one opening with 「. */
  plainSample: string;
  bracketSample: string;
  /** Legend of the one-em paragraph indent. */
  indentLegend: string;
}

/*
 * Layout (viewBox 760 x 420)
 *
 * Four paragraph openings, two lines each, one 32 px cell per em from x 230,
 * 92 px apart:
 *   plain    the 1 em indent, then the text (the reference)
 *   ①        the indent kept whole, then 「 in its own em: the ink of 「 sits
 *            1.5 em in, the text at 2 em
 *   ③        「 gives up its blank before the glyph and fills the second half
 *            of the indent: the text starts at 1 em, as in the plain paragraph
 *   天付き   no indent: 「 gives up its blank and sits at the edge, the text at
 *            half an em; the half em left at the line end is spread between
 *            the characters, as justification does
 * The second line of each paragraph starts at the edge. The indent em is
 * tinted. JLReq §3.1.5 calls these the three usual ways; JIS X 4051 and most
 * novels use ③ (Postext's 'half', the Japan default).
 */

const EM = 32;
const LEFT = 230;
const ROW = 92;
const TOP = 24;
const JA_FONT = 'var(--font-noto-serif-jp), "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif';

type Pattern = "plain" | "indent" | "half" | "flush";

interface Cell {
  ch: string;
  /** Left edge of the box the setting gives the character, in em from the edge. */
  at: number;
  /** Width of that box in em. */
  w: number;
  /** Left edge of the glyph's em box. */
  em: number;
}

function firstLine(pattern: Pattern, text: string[], cells: number): Cell[] {
  const out: Cell[] = [];
  let x = 0;
  let rest = text;
  if (pattern === "plain") {
    x = 1;
  } else {
    const bracket = text[0]!;
    rest = text.slice(1);
    if (pattern === "indent") {
      out.push({ ch: bracket, at: 1, w: 1, em: 1 });
      x = 2;
    } else if (pattern === "half") {
      // The bracket's glyph is the right half of its em: with the blank before
      // it given up, its box is the second half of the one-em indent.
      out.push({ ch: bracket, at: 0.5, w: 0.5, em: 0 });
      x = 1;
    } else {
      out.push({ ch: bracket, at: 0, w: 0.5, em: -0.5 });
      x = 0.5;
    }
  }
  for (const ch of rest) {
    if (x + 1 > cells + 1e-9) break;
    out.push({ ch, at: x, w: 1, em: x });
    x += 1;
  }
  // A justified line: what is left (half an em after a flush bracket) is
  // spread between the characters.
  const left = cells - x;
  if (left > 1e-9 && out.length > 1) {
    const gap = left / (out.length - 1);
    out.forEach((c, i) => {
      c.at += i * gap;
      c.em += i * gap;
    });
  }
  return out;
}

function Paragraph({ y, pattern, label, value, text, next, cells }: {
  y: number;
  pattern: Pattern;
  label: string;
  value?: string;
  text: string[];
  /** Characters of the second line. */
  next: string[];
  cells: number;
}) {
  const line1 = firstLine(pattern, text, cells);
  const line2: Cell[] = next.slice(0, cells).map((ch, i) => ({ ch, at: i, w: 1, em: i }));
  const indent = pattern === "flush" ? 0 : 1;
  const row = (cells: Cell[], top: number) =>
    cells.map((c, i) => {
      const bracket = "「『（".includes(c.ch);
      return (
        <g key={i}>
          <rect x={LEFT + c.at * EM} y={top} width={c.w * EM} height={EM} fill={bracket ? "var(--svg-blue-fill)" : "none"} stroke="var(--svg-legend-stroke)" strokeWidth={0.8} />
          <text x={LEFT + (c.em + 0.5) * EM} y={top + EM * 0.86} fontSize={EM * 0.92} textAnchor="middle" fill="var(--svg-dark-text)" style={{ fontFamily: JA_FONT }}>
            {c.ch}
          </text>
        </g>
      );
    });
  return (
    <g>
      <Label x={LEFT - 16} y={y + EM * 0.68} anchor="end" size={11} bold>
        {label}
      </Label>
      {value ? (
        <Label x={LEFT - 16} y={y + EM * 0.68 + 15} anchor="end" size={9.5} color="mid">
          {value}
        </Label>
      ) : null}
      {indent ? <rect x={LEFT} y={y} width={EM} height={EM} fill="var(--svg-pink-half)" /> : null}
      <g lang="ja">
        {row(line1, y)}
        {row(line2, y + EM + 4)}
      </g>
    </g>
  );
}

export function BracketPatterns({ labels }: { labels: BracketPatternsLabels }) {
  const CELLS = 13;
  const plain = Array.from(labels.plainSample);
  const bracket = Array.from(labels.bracketSample);
  // Second lines: what follows each opening (the samples run on).
  const plainNext = plain.slice(CELLS - 1);
  const rows: { pattern: Pattern; label: string; value?: string; text: string[]; next: string[] }[] = [
    { pattern: "plain", label: labels.plain, text: plain, next: plainNext },
    { pattern: "indent", label: labels.indent, value: labels.indentValue, text: bracket, next: bracket.slice(CELLS - 1) },
    { pattern: "half", label: labels.half, value: labels.halfValue, text: bracket, next: bracket.slice(CELLS) },
    { pattern: "flush", label: labels.flush, value: labels.flushValue, text: bracket, next: bracket.slice(CELLS) },
  ];
  const right = LEFT + CELLS * EM;
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 420" maxWidth={760}>
      {/* The text edge and the one-em line the plain paragraph starts at. */}
      <line x1={LEFT} y1={TOP - 10} x2={LEFT} y2={TOP + 4 * ROW - 16} stroke="var(--svg-pink-stroke)" strokeWidth={1.2} />
      <line x1={LEFT + EM} y1={TOP - 10} x2={LEFT + EM} y2={TOP + 4 * ROW - 16} stroke="var(--svg-stroke)" strokeWidth={1} strokeDasharray="3 3" />
      <line x1={right} y1={TOP - 10} x2={right} y2={TOP + 4 * ROW - 16} stroke="var(--svg-pink-stroke)" strokeWidth={1.2} />
      {rows.map((r, i) => (
        <Paragraph key={r.pattern} y={TOP + i * ROW} cells={CELLS} {...r} />
      ))}
      <rect x={LEFT} y={TOP + 4 * ROW - 4} width={10} height={10} fill="var(--svg-pink-half)" />
      <Label x={LEFT + 16} y={TOP + 4 * ROW + 5} size={10} color="mid">
        {labels.indentLegend}
      </Label>
    </Figure>
  );
}
