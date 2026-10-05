import { Figure } from "../Figure";
import { Label } from "../primitives";

export interface RubyPlacementLabels {
  title: string;
  desc?: string;
  caption?: string;
  /** Panel titles and one short note under each (about 40 characters at most). */
  spreadTitle: string;
  spreadNote: string;
  overhangTitle: string;
  overhangNote: string;
  jukugoTitle: string;
  jukugoNote: string;
  /** Legend of the tinted room a reading takes over a neighbour. */
  overhangLegend: string;
}

/*
 * Layout (viewBox 760 x 244)
 *
 * Three panels, one 52 px cell per em of the text, readings at half size
 * (26 px a kana) in the line gap above the bases:
 *   x 40   紫陽花 / あじさい   a reading shorter than its base is spaced
 *                            1:2:1 (JIS X 4051 / JLReq §3.3.6): half a unit
 *                            at each end, one unit between, 1 unit = 1/4 em
 *   x 300  を志す / こころざ  a reading longer than its kanji runs half an em
 *                            (one ruby character) onto the kana either side
 *   x 560  東京に / とう|きょう jukugo ruby: each kanji keeps its reading;
 *                            きょう cannot centre over 京 without meeting とう,
 *                            so it starts where とう ends and runs half an em
 *                            onto に (JLReq §3.3.7)
 * The geometry is computed here, not taken from a font.
 */

const EM = 52;
const R = EM / 2;
const BASE_Y = 100;
const JA_FONT = 'var(--font-noto-serif-jp), "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", "YuMincho", serif';

interface Reading {
  /** The reading's characters, each placed at x (em from the panel's left). */
  chars: { ch: string; x: number }[];
}

function Panel({ x0, bases, rubyBases, readings, overhang, title, note }: {
  x0: number;
  bases: string;
  /** Indexes of the characters that carry a reading (tinted cells). */
  rubyBases: number[];
  readings: Reading[];
  /** Ranges (em) of neighbours a reading runs onto. */
  overhang: [number, number][];
  title: string;
  note: string;
}) {
  const chars = Array.from(bases);
  return (
    <g>
      <Label x={x0} y={30} size={11} bold>
        {title}
      </Label>
      {overhang.map(([a, b], i) => (
        <rect key={`o${i}`} x={x0 + a * EM} y={BASE_Y - R - 6} width={(b - a) * EM} height={R + 4} fill="var(--svg-pink-half)" />
      ))}
      <g lang="ja">
        {chars.map((ch, i) => (
          <g key={i}>
            <rect
              x={x0 + i * EM}
              y={BASE_Y}
              width={EM}
              height={EM}
              fill={rubyBases.includes(i) ? "var(--svg-blue-fill)" : "none"}
              stroke="var(--svg-legend-stroke)"
              strokeWidth={1}
            />
            <text x={x0 + (i + 0.5) * EM} y={BASE_Y + EM * 0.86} fontSize={EM * 0.92} textAnchor="middle" fill="var(--svg-dark-text)" style={{ fontFamily: JA_FONT }}>
              {ch}
            </text>
          </g>
        ))}
        {readings.flatMap((r, j) =>
          r.chars.map((c, i) => (
            <g key={`${j}-${i}`}>
              <rect x={x0 + c.x * EM} y={BASE_Y - R - 4} width={R} height={R} fill="none" stroke="var(--svg-stroke)" strokeWidth={0.6} strokeDasharray="2 2" />
              <text x={x0 + c.x * EM + R / 2} y={BASE_Y - 4 - R * 0.14} fontSize={R * 0.92} textAnchor="middle" fill="var(--svg-blue-text)" style={{ fontFamily: JA_FONT }}>
                {c.ch}
              </text>
            </g>
          )),
        )}
      </g>
      <line x1={x0} y1={BASE_Y + EM + 8} x2={x0 + chars.length * EM} y2={BASE_Y + EM + 8} stroke="var(--svg-stroke)" strokeWidth={1} />
      <path d={Array.from({ length: chars.length + 1 }, (_, k) => `M${x0 + k * EM} ${BASE_Y + EM + 8} v5`).join(" ")} stroke="var(--svg-stroke)" strokeWidth={1} />
      <Label x={x0} y={BASE_Y + EM + 34} size={10} color="mid">
        {note}
      </Label>
    </g>
  );
}

/** Reading characters spaced 1:2:1 over a base of `baseEm` ems from `start`. */
function jis121(reading: string, start: number, baseEm: number): Reading {
  const chars = Array.from(reading);
  const slack = baseEm - chars.length * 0.5;
  const unit = slack / chars.length; // half a unit at each end + one between = n units
  return { chars: chars.map((ch, i) => ({ ch, x: start + unit / 2 + i * (0.5 + unit) })) };
}

/** Reading characters set solid from `start` (em). */
function solid(reading: string, start: number): Reading {
  return { chars: Array.from(reading).map((ch, i) => ({ ch, x: start + i * 0.5 })) };
}

export function RubyPlacement({ labels }: { labels: RubyPlacementLabels }) {
  return (
    <Figure title={labels.title} desc={labels.desc} caption={labels.caption} viewBox="0 0 760 244" maxWidth={760}>
      <Panel
        x0={40}
        bases="紫陽花"
        rubyBases={[0, 1, 2]}
        readings={[jis121("あじさい", 0, 3)]}
        overhang={[]}
        title={labels.spreadTitle}
        note={labels.spreadNote}
      />
      <Panel
        x0={300}
        bases="を志す"
        rubyBases={[1]}
        readings={[solid("こころざ", 0.5)]}
        overhang={[[0.5, 1], [2, 2.5]]}
        title={labels.overhangTitle}
        note={labels.overhangNote}
      />
      <Panel
        x0={560}
        bases="東京に"
        rubyBases={[0, 1]}
        readings={[solid("とう", 0), solid("きょう", 1)]}
        overhang={[[2, 2.5]]}
        title={labels.jukugoTitle}
        note={labels.jukugoNote}
      />
      <rect x={40} y={218} width={10} height={10} fill="var(--svg-pink-half)" />
      <Label x={56} y={227} size={10} color="mid">
        {labels.overhangLegend}
      </Label>
    </Figure>
  );
}
