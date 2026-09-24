// Small drawings for picture-card choices. Stroke/fill use currentColor so
// the card decides the colour (muted at rest, accent when selected).

const PAGE = { x: 8, y: 1, w: 22, h: 26 };

function Lines({ x, w, y0 = 5, y1 = 23, step = 3 }: { x: number; w: number; y0?: number; y1?: number; step?: number }) {
  const ys: number[] = [];
  for (let y = y0; y <= y1; y += step) ys.push(y);
  return <>{ys.map((y) => <rect key={y} x={x} y={y} width={w} height={1.2} rx={0.6} fill="currentColor" opacity={0.75} />)}</>;
}

export function ColumnsPicture({ kind }: { kind: 'single' | 'double' | 'oneAndHalf' }) {
  const inner = { x: PAGE.x + 3, w: PAGE.w - 6 };
  return (
    <svg width={38} height={28} viewBox="0 0 38 28" fill="none">
      <rect x={PAGE.x} y={PAGE.y} width={PAGE.w} height={PAGE.h} rx={1.5} stroke="currentColor" strokeWidth={1} />
      {kind === 'single' && <Lines x={inner.x} w={inner.w} />}
      {kind === 'double' && (
        <>
          <Lines x={inner.x} w={7} />
          <Lines x={inner.x + 9} w={7} />
        </>
      )}
      {kind === 'oneAndHalf' && (
        <>
          <Lines x={inner.x} w={10} />
          <Lines x={inner.x + 12} w={4} y0={5} y1={11} />
        </>
      )}
    </svg>
  );
}

export function AlignPicture({ align }: { align: 'left' | 'justify' | 'center' | 'right' }) {
  const widths = [18, 14, 18, 11];
  return (
    <svg width={22} height={16} viewBox="0 0 22 16" fill="none">
      {widths.map((w0, i) => {
        const w = align === 'justify' && i < widths.length - 1 ? 18 : w0;
        const x = align === 'left' || align === 'justify' ? 2 : align === 'right' ? 20 - w : (22 - w) / 2;
        return <rect key={i} x={x} y={2 + i * 3.6} width={w} height={1.6} rx={0.8} fill="currentColor" />;
      })}
    </svg>
  );
}
