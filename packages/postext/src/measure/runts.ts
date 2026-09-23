import type { VDTLine } from '../vdt';

/**
 * Whether a broken paragraph ends in a runt: a last line narrower than the
 * runt threshold (`runtMinCharacters` × the normal space width). A single
 * line is never a runt — there is nothing to pull it up from — and neither
 * is a line that ends in a hyphen, which only happens when the paragraph
 * continues.
 */
export function isRuntLastLine(lines: readonly VDTLine[], runtMinWidth: number): boolean {
  if (runtMinWidth <= 0 || lines.length < 2) return false;
  const last = lines[lines.length - 1]!;
  if (last.hyphenated) return false;
  return last.bbox.width < runtMinWidth;
}
