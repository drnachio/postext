'use client';

import type { TemplateSheet } from '../../../../templates/templateSheet.js';

interface TemplateSheetSvgProps {
  sheet: TemplateSheet;
  /** Rendered width, CSS px. */
  width: number;
  selectedFrame?: string | null;
  /** With it, a frame is a button that selects it. */
  onSelectFrame?: (name: string) => void;
  /** Names the frames for the buttons (`__name__`). */
  frameLabel?: string;
  /** The gutter's name, as a tooltip on the band. */
  gutterLabel?: string;
  /** As wide as its container (`width` is then only the scale of the
   *  strokes and names). */
  fluid?: boolean;
}

/** A page template drawn on its sheet: the pages, the margins, the area's
 *  grid, the spine band of a spread, the frames (flow frames tinted) and
 *  an arrow for each chain. */
export function TemplateSheetSvg({ sheet, width, selectedFrame, onSelectFrame, frameLabel, gutterLabel, fluid }: TemplateSheetSvgProps) {
  const height = (width * sheet.height) / sheet.width;
  const k = sheet.width / width;
  const byName = new Map(sheet.frames.map((f) => [f.name, f]));
  return (
    <svg
      viewBox={`0 0 ${sheet.width} ${sheet.height}`}
      width={fluid ? undefined : width}
      height={fluid ? undefined : height}
      aria-hidden={onSelectFrame ? undefined : true}
      className="block shrink-0"
      style={fluid ? { overflow: 'visible', width: '100%', height: 'auto' } : { overflow: 'visible' }}
    >
      {sheet.pages.map((p, i) => (
        <rect key={`p${i}`} x={p.x} y={p.y} width={p.width} height={p.height} fill="#ffffff" stroke="var(--rule)" strokeWidth={k} />
      ))}
      {sheet.content.map((c, i) => (
        <rect key={`c${i}`} x={c.x} y={c.y} width={c.width} height={c.height} fill="none" stroke="rgba(214,72,47,0.55)" strokeWidth={k} strokeDasharray={`${3 * k} ${2 * k}`} />
      ))}
      {sheet.grid?.cols.flatMap((col, ci) =>
        sheet.grid!.rows.map((row, ri) => (
          <rect key={`g${ci}-${ri}`} x={col.start} y={row.start} width={col.end - col.start} height={row.end - row.start} fill="rgba(47,111,214,0.07)" />
        )),
      )}
      {sheet.gutter && (
        <rect x={sheet.gutter.x} y={sheet.gutter.y} width={Math.max(sheet.gutter.width, k)} height={sheet.gutter.height} fill="rgba(214,72,47,0.2)">
          {gutterLabel && <title>{gutterLabel}</title>}
        </rect>
      )}
      {sheet.frames.map((f) => {
        const selected = f.name === selectedFrame;
        const r = f.rect;
        const transform = f.rotate ? `rotate(${f.rotate} ${r.x + r.width / 2} ${r.y + r.height / 2})` : undefined;
        const box = (
          <rect
            x={r.x}
            y={r.y}
            width={Math.max(r.width, k)}
            height={Math.max(r.height, k)}
            fill={f.flow ? 'rgba(47,111,214,0.16)' : 'rgba(47,111,214,0.08)'}
            stroke={selected ? 'var(--brand, #2f6fd6)' : 'rgba(47,111,214,0.7)'}
            strokeWidth={(selected ? 2.5 : 1) * k}
          />
        );
        if (!onSelectFrame) return <g key={`${f.name}#${f.instance ?? 0}`} transform={transform}>{box}</g>;
        // A repeating grid's later items (#1082) are drawn, not buttons: the
        // first item's frame selects the template frame they all copy.
        if ((f.instance ?? 1) > 1) {
          return (
            <g key={`${f.name}#${f.instance}`} transform={transform} style={{ pointerEvents: 'none' }}>
              {box}
              <text x={r.x + 1.2 * k * 3} y={r.y + 10 * k} fontSize={9 * k} fill="var(--foreground, #111)">{f.name}</text>
            </g>
          );
        }
        return (
          <g
            key={`${f.name}#${f.instance ?? 0}`}
            transform={transform}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={(frameLabel ?? '__name__').replace('__name__', f.name)}
            style={{ cursor: 'pointer', outline: 'none' }}
            onClick={() => onSelectFrame(f.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectFrame(f.name);
              }
            }}
          >
            {box}
            <text x={r.x + 1.2 * k * 3} y={r.y + 10 * k} fontSize={9 * k} fill="var(--foreground, #111)" style={{ pointerEvents: 'none' }}>
              {f.name}
            </text>
          </g>
        );
      })}
      {sheet.chains.map(({ from, to }) => {
        const a = byName.get(from)!.rect;
        const b = byName.get(to)!.rect;
        const x1 = a.x + a.width - 4 * k;
        const y1 = a.y + a.height;
        const x2 = b.x + 4 * k;
        const y2 = b.y;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const s = 5 * k;
        return (
          <g key={`${from}>${to}`} style={{ pointerEvents: 'none' }}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c26a00" strokeWidth={1.4 * k} />
            <polygon
              points={`${x2},${y2} ${x2 - s * Math.cos(angle - 0.45)},${y2 - s * Math.sin(angle - 0.45)} ${x2 - s * Math.cos(angle + 0.45)},${y2 - s * Math.sin(angle + 0.45)}`}
              fill="#c26a00"
            />
          </g>
        );
      })}
    </svg>
  );
}
