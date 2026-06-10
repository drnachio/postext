import { Figure } from "../Figure";
import { DropShadowDef, Label, colorTokens } from "../primitives";

export interface HyphenationExampleLabels {
  title: string;
  desc?: string;
  caption?: string;
  withoutTitle: string;
  withTitle: string;
  withoutCaption: string;
  withCaption: string;
}

/**
 * One justified line of "text": word chips separated by gap chips.
 * Words fill the measure exactly (sum(words) + gaps = width), so every line
 * is flush to both margins — the variance lives in the gap widths.
 */
interface LineSpec {
  words: number[];
  gap: number;
  /** last line of the paragraph: natural spaces, ragged right, no gap tint */
  last?: boolean;
  /** indices of word chips that are halves of a hyphenated word */
  frag?: number[];
  /** draw a hyphen glyph flush against the right margin */
  hyphen?: boolean;
  /** tag the gap chips with a CSS class (for the subtle pulse animation) */
  gapClass?: string;
}

const WORD_H = 8;
const LINE_STEP = 21;

function renderLine(
  spec: LineSpec,
  x0: number,
  y: number,
  gapFill: string,
  gapOpacity: number,
  fragColor: string,
  key: number,
) {
  const parts: React.ReactNode[] = [];
  let x = x0;
  spec.words.forEach((w, i) => {
    const isFrag = spec.frag?.includes(i);
    parts.push(
      <rect
        key={`w${i}`}
        x={x}
        y={y}
        width={w}
        height={WORD_H}
        rx={1.5}
        fill={isFrag ? fragColor : "var(--svg-mid-text)"}
        opacity={isFrag ? 0.95 : 0.5}
        className={isFrag ? "he-hyph" : undefined}
      />,
    );
    x += w;
    if (i < spec.words.length - 1) {
      if (!spec.last) {
        parts.push(
          <rect
            key={`g${i}`}
            x={x}
            y={y}
            width={spec.gap}
            height={WORD_H}
            rx={1.5}
            fill={gapFill}
            opacity={gapOpacity}
            className={spec.gapClass}
          />,
        );
      }
      x += spec.gap;
    }
  });
  if (spec.hyphen) {
    parts.push(
      <rect
        key="hyphen"
        x={x + 2}
        y={y + 2.5}
        width={6}
        height={3}
        rx={1}
        fill={fragColor}
        className="he-hyph"
      />,
    );
  }
  return <g key={key}>{parts}</g>;
}

// Measure is 312px wide in both panels. Every non-last line sums to exactly 312.

// Without hyphenation: only whole words can move, so the leftover space per
// line varies wildly — gaps of 4.8px up to 34px. Lines 2 and 4 are loose.
const WITHOUT: LineSpec[] = [
  { words: [52, 38, 64, 30, 58, 34], gap: 7.2 }, //               276 + 5*7.2
  { words: [64, 48, 40, 58], gap: 34, gapClass: "he-loose" }, //  210 + 3*34
  { words: [46, 58, 34, 62, 40], gap: 18 }, //                    240 + 4*18
  { words: [56, 36, 48, 42, 38], gap: 23, gapClass: "he-loose" }, // 220 + 4*23
  { words: [44, 62, 38, 56, 40, 48], gap: 4.8 }, //               288 + 5*4.8
  { words: [50, 36, 44], gap: 8, last: true },
];

// With hyphenation: break points inside words keep every gap near 8px.
// Line 3 ends in a word fragment + hyphen; line 4 starts with the rest.
const WITH: LineSpec[] = [
  { words: [52, 40, 58, 36, 50, 36], gap: 8 }, //                 272 + 5*8
  { words: [56, 42, 50, 38, 46, 40], gap: 8 }, //                 272 + 5*8
  { words: [50, 38, 56, 42, 86], gap: 8, frag: [4], hyphen: true }, // +8 hyphen
  { words: [44, 52, 38, 58, 44, 36], gap: 8, frag: [0] }, //      272 + 5*8
  { words: [58, 40, 50, 36, 48, 40], gap: 8 }, //                 272 + 5*8
  { words: [46, 38, 52], gap: 8, last: true },
];

function Panel({
  x,
  title,
  caption,
  titleColor,
  lines,
  gapFill,
  gapOpacity,
  fragColor,
}: {
  x: number;
  title: string;
  caption: string;
  titleColor: "pink" | "green";
  lines: LineSpec[];
  gapFill: string;
  gapOpacity: number;
  fragColor: string;
}) {
  const gx = x + 30; // left text margin
  const gxRight = gx + 312; // right text margin
  const linesTop = 66;
  return (
    <g>
      <rect
        x={x}
        y={20}
        width={372}
        height={200}
        rx={6}
        fill="var(--svg-legend-fill)"
        stroke="var(--svg-legend-stroke)"
        strokeWidth={1.5}
        filter="url(#he-shadow)"
      />
      <Label x={x + 186} y={46} anchor="middle" size={12} bold color={titleColor}>
        {title}
      </Label>
      {/* margin guides: every justified line is flush against both of these */}
      <line x1={gx} y1={58} x2={gx} y2={184} stroke="var(--svg-stroke)" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
      <line x1={gxRight} y1={58} x2={gxRight} y2={184} stroke="var(--svg-stroke)" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
      {lines.map((spec, i) => renderLine(spec, gx, linesTop + i * LINE_STEP, gapFill, gapOpacity, fragColor, i))}
      <Label x={gx} y={206} size={9} color="mid">
        {caption}
      </Label>
    </g>
  );
}

export function HyphenationExample({ labels }: { labels: HyphenationExampleLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 820 244" maxWidth={820}>
      <defs>
        <DropShadowDef id="he-shadow" />
      </defs>
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .he-loose { animation: he-pulse 5s ease-in-out infinite; }
          .he-hyph { animation: he-pulse 5s ease-in-out 2.5s infinite; }
          @keyframes he-pulse {
            0%, 100% { opacity: 0.55; }
            50% { opacity: 1; }
          }
        }
      `}</style>
      <Panel
        x={24}
        title={labels.withoutTitle}
        caption={labels.withoutCaption}
        titleColor="pink"
        lines={WITHOUT}
        gapFill="var(--svg-pink-half)"
        gapOpacity={1}
        fragColor={colorTokens.pink.text}
      />
      <Panel
        x={424}
        title={labels.withTitle}
        caption={labels.withCaption}
        titleColor="green"
        lines={WITH}
        gapFill={colorTokens.green.text}
        gapOpacity={0.3}
        fragColor={colorTokens.green.text}
      />
    </Figure>
  );
}
