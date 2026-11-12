// The detail line of a PDF font warning in the Checks panel (split out of
// details.ts to keep it under the size limit).
import type { SandboxLabels } from '../../types/index.js';

/** `"Noto Serif TC" 700 italic`: the face a PDF font warning is about. */
function faceLabel(payload: { family: string; weight: number; style: 'normal' | 'italic' }): string {
  return `"${payload.family}" ${payload.weight}${payload.style === 'italic' ? ' italic' : ''}`;
}

/** A PDF font warning's detail: the face, what happened, and a note when
 *  the book has changed since that PDF. */
export function pdfFontDetail(payload: { family: string; weight: number; style: 'normal' | 'italic'; stale?: true }, labels: SandboxLabels, detail: string): string {
  const text = `${faceLabel(payload)} — ${detail}`;
  return payload.stale ? `${text} ${labels.warningsPdfFontStale}` : text;
}
