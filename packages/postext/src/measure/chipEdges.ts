import type { VDTLineSegment } from '../vdt';

/** A chip opening or closing a line keeps no gap margin on that side, so it
 *  sits flush with the measure like a word. */
export function trimChipLineEdges(segments: VDTLineSegment[]): VDTLineSegment[] {
  if (segments.length === 0) return segments;
  let out = segments;
  const trim = (idx: number, side: 'marginLeft' | 'marginRight'): void => {
    const seg = out[idx]!;
    const m = seg.chip?.[side] ?? 0;
    if (m <= 0) return;
    if (out === segments) out = [...segments];
    out[idx] = { ...seg, width: seg.width - m, chip: { ...seg.chip!, [side]: 0 } };
  };
  trim(0, 'marginLeft');
  trim(out.length - 1, 'marginRight');
  return out;
}
