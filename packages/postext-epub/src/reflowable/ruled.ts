// Struck-through (`~~…~~`) and underlined (`++…++`) text in the reflowable
// rendition: which characters of a segment, and which spaces between its
// words, go inside the `<s>` and the `<u>`.

import type { VDTLineSegment } from 'postext';
import type { Format } from './model.js';

/** The lines a segment's characters may carry: through them (`~~…~~`)
 *  and under them (`++…++`). */
export const RULES = ['strike', 'underline'] as const;
type Rule = (typeof RULES)[number];

/** Whether the space at `i` lies between two words of one struck-through
 *  (`VDTLineSegment.strike`) or underlined run (`underline`). */
export function ruledSpace(segs: readonly VDTLineSegment[], i: number, key: Rule): boolean {
  let a = i - 1;
  while (a >= 0 && segs[a]!.kind === 'space') a--;
  let b = i + 1;
  while (b < segs.length && segs[b]!.kind === 'space') b++;
  const before = segs[a]?.[key];
  const after = segs[b]?.[key];
  if (!before || !after || before.id !== after.id) return false;
  // The run goes on through the end of the word before and from the start
  // of the word after.
  return (before.to === undefined || before.to >= segs[a]!.text.length) && !after.from;
}

/** Which characters of `text` (the part of `seg`'s text from `start`)
 *  are struck or underlined: all of them, or `from`–`to` (a full stop
 *  glued to the run stays out). A line over the whole text puts its flag
 *  on `fmt` and makes no pieces; else the pieces, each with its flags. */
export function ruledPieces(seg: VDTLineSegment, text: string, start: number, fmt: Format): [string, Format][] | undefined {
  const ruled = RULES.flatMap((key) => {
    const r = seg[key];
    const from = Math.max(0, (r?.from ?? 0) - start);
    const to = Math.min(text.length, (r?.to ?? seg.text.length) - start);
    return r && from < to ? [{ key, from, to }] : [];
  });
  if (ruled.length === 0) return undefined;
  if (ruled.every((r) => r.from <= 0 && r.to >= text.length)) {
    for (const r of ruled) fmt[r.key] = true;
    return undefined;
  }
  const cuts = [...new Set([0, text.length, ...ruled.flatMap((r) => [r.from, r.to]).filter((c) => c > 0 && c < text.length)])].sort((a, b) => a - b);
  const out: [string, Format][] = [];
  for (let c = 0; c + 1 < cuts.length; c++) {
    const [a, b] = [cuts[c]!, cuts[c + 1]!];
    const f: Format = { ...fmt };
    for (const r of ruled) if (r.from <= a && b <= r.to) f[r.key] = true;
    out.push([text.slice(a, b), f]);
  }
  return out;
}
