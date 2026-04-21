import type { HeroGeometry } from './geometry';

export function LeftColumn({ g }: { g: HeroGeometry }) {
  return (
    <>
      {/* Drop cap */}
      <rect
        x={g.contentX}
        y={g.row(g.colRow0) - 1}
        width={13}
        height={g.lineGap + 5}
        rx="1"
        fill="var(--gilt)"
        opacity="0.8"
        className="hero-dropcap"
      />

      {g.leftP1.map((l, i) => (
        <rect
          key={`lp1-${i}`}
          x={l.x}
          y={l.y}
          width={l.width}
          height={g.lineH}
          rx="1"
          fill="var(--foreground)"
          opacity="0.35"
          className="hero-ll"
          style={{ animationDelay: `${1.5 + i * 0.05}s` }}
        />
      ))}

      {g.leftP2.map((l, i) => (
        <rect
          key={`lp2-${i}`}
          x={l.x}
          y={l.y}
          width={l.width}
          height={g.lineH}
          rx="1"
          fill="var(--foreground)"
          opacity="0.35"
          className="hero-ll"
          style={{ animationDelay: `${1.85 + i * 0.05}s` }}
        />
      ))}

      {/* Pull quote */}
      <line
        x1={g.contentX + 6}
        y1={g.row(g.quoteStartRow) - 3}
        x2={g.contentX + 6}
        y2={g.row(g.quoteStartRow + 2) + g.lineH + 3}
        stroke="var(--gilt)"
        strokeWidth="2"
        opacity="0.6"
        className="hero-quote"
        style={{ animationDelay: "2.2s" }}
      />
      {g.quoteLines.map((l, i) => (
        <rect
          key={`ql-${i}`}
          x={l.x}
          y={l.y}
          width={l.width}
          height={g.lineH}
          rx="1"
          fill="var(--foreground)"
          opacity="0.45"
          className="hero-quoteline"
          style={{ animationDelay: `${2.3 + i * 0.06}s` }}
        />
      ))}

      {g.leftP3.map((l, i) => (
        <rect
          key={`lp3-${i}`}
          x={l.x}
          y={l.y}
          width={l.width}
          height={g.lineH}
          rx="1"
          fill="var(--foreground)"
          opacity="0.35"
          className="hero-ll"
          style={{ animationDelay: `${2.6 + i * 0.05}s` }}
        />
      ))}
    </>
  );
}
