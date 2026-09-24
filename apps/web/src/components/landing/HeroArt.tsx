// The hero artwork: the cover of the built-in Postext guide (see
// packages/postext-sandbox/src/defaultResources/cover.ts) redrawn as React
// SVG and set in motion. An open spread the way the engine sees it —
// justified lines of word boxes, a chapter band, a
// floated chart, a pull quote — with one line lifted out and opened into
// Knuth-Plass boxes, glue and a flagged penalty. The line keeps
// re-justifying: its glue stretches and shrinks while the boxes hold.
// Deterministic (seeded), so the server render is stable.

import type { CSSProperties } from "react";

const VW = 1080;
const VH = 840;

// Colours that depend on the ground are CSS variables (see STYLES): night
// by default, a paper spread when the root is `.light` and the SVG is
// `themed` (the hero). The guide cover on the showcase shelf stays night.
const C = {
  night: "var(--ha-night)",
  page: "var(--ha-page)",
  pageEdge: "var(--ha-edge)",
  word: "var(--ha-word)",
  wordSoft: "var(--ha-soft)",
  blue: "#2b4acb",
  blueSoft: "#3d5bd6",
  gilt: "#d8a21a",
  giltSoft: "var(--ha-gilt-soft)",
  white: "#f4f1ea",
  vermilion: "#c0452f",
};

/** Mulberry32, as in cover.ts. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One justified line of word boxes; a paragraph's last line ends short. */
function wordLine(rand: () => number, x: number, y: number, width: number, last: boolean, indent: number): Box[] {
  const space = 5;
  const words: number[] = [];
  const target = last ? width * (0.3 + rand() * 0.5) : width - indent;
  let used = 0;
  while (used < target) {
    const w = 7 + Math.floor(rand() * rand() * 38);
    if (used + w > target && words.length > 2) break;
    words.push(w);
    used += w + space;
  }
  const natural = words.reduce((s, w) => s + w, 0);
  const gap = last || words.length < 2 ? space : (target - natural) / (words.length - 1);
  let cx = x + indent;
  return words.map((w) => {
    const b = { x: cx, y, w, h: 5 };
    cx += w + gap;
    return b;
  });
}

/** A column of paragraphs, line by line on the grid. */
function column(rand: () => number, x: number, top: number, bottom: number, width: number, pitch: number): Box[][] {
  const lines: Box[][] = [];
  let y = top;
  let left = 3 + Math.floor(rand() * 7);
  let first = true;
  while (y + 5 <= bottom) {
    const last = left === 1;
    lines.push(wordLine(rand, x, y, width, last, first ? 14 : 0));
    y += pitch;
    left--;
    first = false;
    if (left === 0) {
      left = 3 + Math.floor(rand() * 8);
      first = true;
    }
  }
  return lines;
}

function Lines({ lines, fill, delay, step }: { lines: Box[][]; fill: string; delay: number; step: number }) {
  return (
    <>
      {lines.map((line, i) => (
        <g key={i} className="ha-line" style={{ animationDelay: `${delay + i * step}s` }}>
          {line.map((b, j) => (
            <rect key={j} x={b.x} y={b.y} width={b.w} height={b.h} rx={1.2} fill={fill} />
          ))}
        </g>
      ))}
    </>
  );
}

/** Display numeral "1" as a path, `h` units tall (cover.ts). */
function numeralOne(x: number, y: number, h: number): string {
  const u = h / 10;
  const pts: [number, number][] = [
    [3.2, 0], [5.6, 0], [5.6, 8.9], [7.4, 8.9], [7.4, 10], [1.6, 10], [1.6, 8.9], [3.4, 8.9], [3.4, 2.2], [1.4, 3.1], [1.0, 2.1],
  ];
  return pts.map(([px, py], i) => `${i ? "L" : "M"}${(x + px * u).toFixed(1)},${(y + py * u).toFixed(1)}`).join(" ") + " Z";
}

/** The model line: gilt boxes, glue springs and a flagged penalty. Every
 *  piece carries its index in `--i`, so one keyframe (a per-gap shift
 *  `--d`) re-justifies the whole line. */
function ModelLine({ x, y, width }: { x: number; y: number; width: number }) {
  const h = 22;
  const widths = [58, 34, 76, 28, 52, 42];
  const natural = widths.reduce((s, w) => s + w, 0);
  const penalty = 26;
  const gap = (width - natural - penalty) / (widths.length - 1);
  const n = widths.length - 1;
  let cx = x;
  const parts: React.ReactNode[] = [];
  widths.forEach((w, i) => {
    parts.push(
      <rect key={`b${i}`} className="ha-shift" style={{ "--i": i } as CSSProperties} x={cx} y={y} width={w} height={h} rx={3} fill={C.gilt} />,
    );
    if (i < n) {
      const g0 = cx + w + 4;
      const g1 = cx + w + gap - 4;
      const steps = 6;
      let d = `M${g0.toFixed(1)},${(y + h / 2).toFixed(1)}`;
      for (let s = 1; s <= steps; s++) {
        const px = g0 + ((g1 - g0) * s) / steps;
        const py = s === steps ? y + h / 2 : y + (s % 2 ? 3 : h - 3);
        d += ` L${px.toFixed(1)},${py.toFixed(1)}`;
      }
      parts.push(
        <g key={`g${i}`} className="ha-shift" style={{ "--i": i } as CSSProperties}>
          <path
            className="ha-spring"
            style={{ "--gap": gap - 8 } as CSSProperties}
            d={d}
            stroke={C.gilt}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>,
      );
    }
    cx += w + gap;
  });
  const px = x + width - penalty + 8;
  parts.push(
    <g key="pen" className="ha-shift" style={{ "--i": n } as CSSProperties}>
      <rect x={px} y={y + h / 2 - 2.5} width={16} height={5} rx={2} fill={C.gilt} />
      <path
        className="ha-flag"
        d={`M${px + 8},${y - 8} L${px + 8},${y - 42} L${px + 32},${y - 34} L${px + 8},${y - 26} Z`}
        fill={C.gilt}
        stroke={C.gilt}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </g>,
  );
  parts.push(
    <path
      key="measure"
      className="ha-measure"
      style={{ "--w": width, "--n": n } as CSSProperties}
      d={`M${x},${y + h + 12} L${x},${y + h + 20} L${x + width},${y + h + 20} L${x + width},${y + h + 12}`}
      stroke={C.giltSoft}
      strokeWidth={2}
      fill="none"
    />,
  );
  return <>{parts}</>;
}

const STYLES = `
.ha-root { --d: 0; --ha-night: #0e1014; --ha-page: #161920; --ha-edge: #2a2f39; --ha-word: #363d4a; --ha-soft: #232833; --ha-gilt-soft: #8a6a1c; }
:root.light .ha-root.ha-themed { --ha-night: #15171c; --ha-page: #ffffff; --ha-edge: #e2ded4; --ha-word: #d6d2c8; --ha-soft: #f1f3f8; --ha-gilt-soft: #d8a21a; }
:root.light .ha-root.ha-themed .ha-modelbox { fill: #ffffff; }
@keyframes ha-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes ha-drop { from { transform: scaleY(0) } to { transform: scaleY(1) } }
@keyframes ha-grow { from { transform: scaleY(0) } to { transform: scaleY(1) } }
@keyframes ha-rise { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: translateY(0) } }
@keyframes ha-pop { from { opacity: 0; transform: scale(0.6) } to { opacity: 1; transform: scale(1) } }
@keyframes ha-set { from { opacity: 0; transform: translateX(-10px) } to { opacity: 1; transform: translateX(0) } }
@keyframes ha-breathe { 0%, 12% { --d: 0 } 40%, 55% { --d: 5 } 80%, 100% { --d: -7 } }
@keyframes ha-wave { 0%, 100% { transform: skewY(0deg) } 50% { transform: skewY(-6deg) } }
.ha-page { animation: ha-fade 0.9s ease-out both }
.ha-band { transform-box: fill-box; transform-origin: top; animation: ha-drop 0.7s cubic-bezier(.2,.8,.2,1) 0.25s both }
.ha-bandtext { animation: ha-set 0.5s ease-out 0.8s both }
.ha-num { transform-box: fill-box; transform-origin: center; animation: ha-pop 0.6s cubic-bezier(.2,1.4,.4,1) 0.9s both }
.ha-line { animation: ha-set 0.35s ease-out both }
.ha-bar { transform-box: fill-box; transform-origin: bottom; animation: ha-grow 0.6s cubic-bezier(.2,.8,.2,1) both }
.ha-accent { animation: ha-fade 0.6s ease-out 1.8s both }
.ha-crop { animation: ha-fade 1s ease-out 0.4s both }
.ha-model { animation: ha-rise 0.7s cubic-bezier(.2,.8,.2,1) 2.4s both }
.ha-modelinner { animation: ha-breathe 5s ease-in-out 3.3s infinite alternate }
.ha-shift { transform: translateX(calc(var(--i) * var(--d) * 1px)) }
.ha-spring { transform-box: fill-box; transform-origin: left center; transform: scaleX(calc(1 + var(--d) / var(--gap))) }
.ha-measure { transform-box: fill-box; transform-origin: left center; transform: scaleX(calc(1 + var(--n) * var(--d) / var(--w))) }
.ha-flag { transform-box: fill-box; transform-origin: left bottom; animation: ha-wave 2.4s ease-in-out 3.3s infinite }
@media (prefers-reduced-motion: reduce) {
  .ha-root * { animation: none !important; opacity: 1 !important; }
}
`;

export function HeroArt({ label, className, themed = false }: { label: string; className?: string; themed?: boolean }) {
  const rand = prng(1983);
  const pitch = 11;

  const pw = 462;
  const ph = 616;
  const sx = (VW - 2 * pw) / 2;
  const sy = 92;
  const margin = { top: 53, bottom: 48, inner: 44, outer: 44 };
  const colW = (pw - margin.inner - margin.outer - 20) / 2;

  // Verso.
  const vx = sx + margin.outer;
  const bandH = 150;
  const vTop = sy + bandH + 24;
  const bottom = sy + ph - margin.bottom;
  const v1 = column(rand, vx, vTop, bottom, colW, pitch);
  const v2 = column(rand, vx + colW + 20, vTop, bottom, colW, pitch);

  // Recto.
  const rx = sx + pw + margin.inner;
  const rTop = sy + margin.top;
  const figH = 132;
  const bars = [0.35, 0.55, 0.42, 0.7, 0.95];
  const r1 = column(rand, rx, rTop + figH + 26, bottom, colW, pitch);
  const qx = rx + colW + 20;
  const r2a = column(rand, qx, rTop, rTop + 150, colW, pitch);
  const r2b = column(rand, qx, rTop + 218, bottom, colW, pitch);

  const mw = 470;
  const mx = sx + pw - mw / 2;
  const my = sy + ph - 190;

  const crop = (x: number, y: number, w: number, h: number) => {
    const len = 22;
    const off = 8;
    return [
      [x - off - len, y, x - off, y], [x, y - off - len, x, y - off],
      [x + w + off, y, x + w + off + len, y], [x + w, y - off - len, x + w, y - off],
      [x - off - len, y + h, x - off, y + h], [x, y + h + off, x, y + h + off + len],
      [x + w + off, y + h, x + w + off + len, y + h], [x + w, y + h + off, x + w, y + h + off + len],
    ];
  };

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      role="img"
      aria-label={label}
      className={`ha-root ${themed ? "ha-themed" : ""} ${className ?? ""}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <style>{STYLES}</style>
      <g className="ha-page">
        <rect x={sx} y={sy} width={2 * pw} height={ph} fill={C.page} stroke={C.pageEdge} strokeWidth={1.2} />
        <path d={`M${sx + pw},${sy} L${sx + pw},${sy + ph}`} stroke={C.pageEdge} strokeWidth={1.2} />
      </g>

      {/* Verso: the chapter opener band, then two columns. */}
      <rect className="ha-band" x={sx} y={sy} width={pw} height={bandH} fill={C.blue} />
      <g className="ha-bandtext">
        <rect x={vx} y={sy + 34} width={60} height={4} rx={1} fill={C.white} />
        <rect x={vx} y={sy + 52} width={220} height={16} rx={2} fill={C.white} />
        <rect x={vx} y={sy + 74} width={150} height={16} rx={2} fill={C.white} />
        <rect x={vx} y={sy + 104} width={250} height={5} rx={1} fill={C.blueSoft} />
        <rect x={vx} y={sy + 115} width={210} height={5} rx={1} fill={C.blueSoft} />
      </g>
      <path className="ha-num" d={numeralOne(sx + pw - margin.inner - 80, sy + 22, 96)} fill={C.white} />
      <rect className="ha-band" x={sx} y={sy + bandH} width={pw} height={4} fill={C.night} />
      <Lines lines={v1} fill={C.word} delay={1.0} step={0.018} />
      <Lines lines={v2} fill={C.word} delay={1.3} step={0.018} />

      {/* Recto: a floated chart, a pull quote, text around them. */}
      <rect className="ha-page" x={rx} y={rTop} width={colW} height={figH} rx={2} fill={C.wordSoft} />
      {bars.map((v, i) => {
        const bw = 18;
        const bh = (figH - 40) * v;
        return (
          <rect
            key={i}
            className="ha-bar"
            style={{ animationDelay: `${1.2 + i * 0.12}s` }}
            x={rx + 16 + i * (bw + 9)}
            y={rTop + figH - 22 - bh}
            width={bw}
            height={bh}
            rx={1.5}
            fill={i === 4 ? C.gilt : C.blueSoft}
          />
        );
      })}
      <rect className="ha-accent" x={rx} y={rTop + figH + 8} width={colW * 0.8} height={4} rx={1} fill={C.giltSoft} />
      <Lines lines={r1} fill={C.word} delay={1.5} step={0.018} />
      <Lines lines={r2a} fill={C.word} delay={1.1} step={0.03} />
      <g className="ha-accent">
        <rect x={qx} y={rTop + 162} width={colW} height={3} fill={C.vermilion} />
        <rect x={qx} y={rTop + 176} width={colW * 0.92} height={9} rx={2} fill={C.vermilion} />
        <rect x={qx} y={rTop + 190} width={colW * 0.7} height={9} rx={2} fill={C.vermilion} />
      </g>
      <Lines lines={r2b} fill={C.word} delay={1.6} step={0.018} />

      <g className="ha-crop">
        {crop(sx, sy, 2 * pw, ph).map(([x1, y1, x2, y2], i) => (
          <path key={i} d={`M${x1},${y1} L${x2},${y2}`} stroke={C.gilt} strokeWidth={1.4} fill="none" />
        ))}
      </g>

      {/* The model line, lifted out across the gutter. */}
      <g className="ha-model">
        <rect className="ha-modelbox" x={mx - 26} y={my - 66} width={mw + 52} height={136} rx={8} fill={C.night} stroke={C.gilt} strokeWidth={2.4} />
        <g className="ha-modelinner">
          <ModelLine x={mx} y={my} width={mw} />
        </g>
      </g>
    </svg>
  );
}
