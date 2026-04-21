import type { HeroGeometry } from './geometry';

export function RightColumn({ g }: { g: HeroGeometry }) {
  return (
    <>
      {/* Section heading */}
      <rect
        x={g.rightColX}
        y={g.row(g.colRow0)}
        width={g.colW * 0.6}
        height={3.5}
        rx="1"
        fill="var(--foreground)"
        opacity="0.5"
        className="hero-rhead"
      />

      {g.rightP1.map((l, i) => (
        <rect
          key={`rp1-${i}`}
          x={l.x}
          y={l.y}
          width={l.width}
          height={g.lineH}
          rx="1"
          fill="var(--foreground)"
          opacity="0.35"
          className="hero-rl"
          style={{ animationDelay: `${1.6 + i * 0.05}s` }}
        />
      ))}

      {/* Figure */}
      <g className="hero-figure" style={{ animationDelay: "2.1s" }}>
        <rect
          x={g.rightColX}
          y={g.figY}
          width={g.figW}
          height={g.figH}
          fill="var(--surface)"
          stroke="var(--gilt)"
          strokeWidth="0.75"
          opacity="0.6"
          rx="1"
        />
        <path
          d={`M${g.rightColX + 6} ${g.figY + g.figH - 6}
              L${g.rightColX + g.figW * 0.3} ${g.figY + 14}
              L${g.rightColX + g.figW * 0.45} ${g.figY + 26}
              L${g.rightColX + g.figW * 0.6} ${g.figY + 10}
              L${g.rightColX + g.figW - 6} ${g.figY + g.figH - 6} Z`}
          fill="var(--gilt)"
          opacity="0.12"
        />
        <circle
          cx={g.rightColX + g.figW * 0.78}
          cy={g.figY + 16}
          r="6"
          fill="var(--gilt)"
          opacity="0.2"
        />
      </g>

      {g.rightP2.map((l, i) => (
        <rect
          key={`rp2-${i}`}
          x={l.x}
          y={l.y}
          width={l.width}
          height={g.lineH}
          rx="1"
          fill="var(--foreground)"
          opacity="0.35"
          className="hero-rl"
          style={{ animationDelay: `${2.45 + i * 0.05}s` }}
        />
      ))}

      {g.rightP3.map((l, i) => (
        <rect
          key={`rp3-${i}`}
          x={l.x}
          y={l.y}
          width={l.width}
          height={g.lineH}
          rx="1"
          fill="var(--foreground)"
          opacity="0.35"
          className="hero-rl"
          style={{ animationDelay: `${2.75 + i * 0.05}s` }}
        />
      ))}
    </>
  );
}
