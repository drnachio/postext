/** Small diagrams for the capability cards, in the part colour
 *  (`currentColor`) with ink/mist detail. Decorative. */
const common = { viewBox: "0 0 96 56", className: "h-14 w-24", "aria-hidden": true } as const;

export function JustificationGlyph() {
  return (
    <svg {...common}>
      {[6, 18, 30].map((y, r) => (
        <g key={y}>
          {[0, 1, 2, 3].map((i) => {
            const ws = [[22, 14, 26, 18], [16, 24, 12, 28], [30, 12, 20, 18]][r]!;
            const total = ws.reduce((a, b) => a + b, 0);
            const gap = (92 - total) / 3;
            const x = 2 + ws.slice(0, i).reduce((a, b) => a + b, 0) + gap * i;
            return <rect key={i} x={x} y={y} width={ws[i]} height={7} rx={1.5} fill="currentColor" opacity={r === 1 ? 1 : 0.35} />;
          })}
        </g>
      ))}
      <path d="M2 46 V51 H94 V46" fill="none" stroke="currentColor" strokeWidth={1.5} opacity={0.6} />
    </svg>
  );
}

export function ResourcesGlyph() {
  return (
    <svg {...common}>
      <rect x={2} y={2} width={42} height={52} rx={2} fill="none" stroke="currentColor" strokeOpacity={0.35} />
      <rect x={52} y={2} width={42} height={52} rx={2} fill="none" stroke="currentColor" strokeOpacity={0.35} />
      {[10, 17, 24, 31, 38, 45].map((y) => (
        <rect key={y} x={7} y={y} width={32} height={3} rx={1} fill="currentColor" opacity={0.35} />
      ))}
      <rect x={57} y={7} width={32} height={20} rx={1.5} fill="currentColor" />
      {[32, 39, 46].map((y) => (
        <rect key={y} x={57} y={y} width={32} height={3} rx={1} fill="currentColor" opacity={0.35} />
      ))}
      <path d="M36 17 C 46 17, 46 12, 55 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="2 2" />
    </svg>
  );
}

export function TablesGlyph() {
  return (
    <svg {...common}>
      <rect x={4} y={4} width={88} height={11} rx={1.5} fill="currentColor" />
      {[20, 30, 40].map((y) => (
        <g key={y}>
          <rect x={8} y={y} width={26} height={4} rx={1} fill="currentColor" opacity={0.4} />
          <rect x={42} y={y} width={18} height={4} rx={1} fill="currentColor" opacity={0.4} />
          <rect x={68} y={y} width={20} height={4} rx={1} fill="currentColor" opacity={0.4} />
          <rect x={4} y={y + 7} width={88} height={0.8} fill="currentColor" opacity={0.3} />
        </g>
      ))}
    </svg>
  );
}

export function SingleInkGlyph() {
  return (
    <svg {...common}>
      {[1, 0.6, 0.3].map((o, i) => (
        <circle key={i} cx={24 + i * 24} cy={28} r={18} fill="currentColor" fillOpacity={o} />
      ))}
    </svg>
  );
}

export function MathGlyph() {
  return (
    <svg {...common}>
      <text x={4} y={40} fontFamily="var(--font-display)" fontStyle="italic" fontSize={34} fill="currentColor">
        e<tspan dy={-14} fontSize={18}>iπ</tspan>
      </text>
      <text x={52} y={40} fontFamily="var(--font-display)" fontSize={30} fill="currentColor" opacity={0.45}>
        +1
      </text>
      <rect x={2} y={48} width={92} height={0.8} fill="currentColor" opacity={0.4} />
    </svg>
  );
}

export function OutputGlyph() {
  return (
    <svg {...common}>
      <rect x={4} y={10} width={26} height={36} rx={2} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <text x={17} y={32} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="currentColor">&lt;/&gt;</text>
      <rect x={35} y={10} width={26} height={36} rx={2} fill="currentColor" opacity={0.35} />
      <rect x={66} y={6} width={26} height={40} rx={2} fill="currentColor" />
      <text x={79} y={30} textAnchor="middle" fontFamily="var(--font-sans)" fontWeight={700} fontSize={8} fill="var(--background)">PDF</text>
    </svg>
  );
}
