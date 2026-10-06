import type { AnchorMark, ContentBlock } from './types';

/** `\label{…}` in TeX: the identifier a `\eqref`, `\ref` or `:ref` names
 *  (#530). */
export const TEX_LABEL_RE = /\\label\{\s*([^{}]*?)\s*\}/g;

/** The labels of a TeX source, in order. */
export function texLabels(tex: string): string[] {
  const out: string[] = [];
  TEX_LABEL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TEX_LABEL_RE.exec(tex)) !== null) if (m[1]) out.push(m[1]);
  return out;
}

/**
 * A `\label{eq:x}` in a display formula (#530) is an anchor on the formula:
 * where a reference to it jumps and whose page it prints. The anchor sits
 * on the formula's first source character; the mark's range is the
 * `\label{…}` itself, so a duplicate is reported where it is written.
 */
export function attachEquationAnchors<T extends { blocks: ContentBlock[] }>(result: T, markdown: string): T {
  for (const b of result.blocks) {
    if (b.type !== 'mathDisplay' || !b.tex || !b.tex.includes('\\label')) continue;
    const marks: AnchorMark[] = [];
    const source = markdown.slice(b.sourceStart, b.sourceEnd);
    TEX_LABEL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TEX_LABEL_RE.exec(source)) !== null) {
      if (!m[1]) continue;
      marks.push({
        anchorId: m[1],
        sourceStart: b.sourceStart + m.index,
        sourceEnd: b.sourceStart + m.index + m[0].length,
        anchor: b.sourceStart,
        attach: 'after',
      });
    }
    if (marks.length > 0) b.anchorMarks = [...(b.anchorMarks ?? []), ...marks];
  }
  return result;
}
