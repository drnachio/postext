// TeX → Office Math (OMML) for the semantic .docx: the TeX goes through the
// engine's MathJax TeX input (src/math/mathjax.ts) to MathJax's internal
// MathML tree, which ./convert.ts maps to `m:oMath`. Word opens the result
// in its equation editor. What the writer cannot express returns null, and
// the caller sets a picture of the equation instead.
//
// MathJax is large and loaded on demand: await `initTexToOmml()` (or hand
// over a running converter with `setTexToOmmlConverter`) before calling
// `texToOmml`, which answers null until then.

import type { MathJaxConverter } from '../../math/mathjax.js';
import type { MmlNode } from './mml.js';
import type { RunOptions } from './runs.js';
import { convertNode } from './convert.js';

export { UnsupportedMath } from './mml.js';
export type { MmlNode } from './mml.js';
export type { RunOptions } from './runs.js';

/** MathJax's STATE.COMPILED: convert stops at the MathML tree. */
const STATE_COMPILED = 20;

let converter: MathJaxConverter | null = null;
let starting: Promise<void> | null = null;

/** Start MathJax's TeX input for the writer. Idempotent. */
export async function initTexToOmml(): Promise<void> {
  if (converter) return;
  starting ??= (async () => {
    try {
      const { createMathJaxConverter } = await import('../../math/mathjax.js');
      converter ??= createMathJaxConverter();
    } catch (err) {
      starting = null;
      throw err;
    }
  })();
  return starting;
}

/** Use a converter that is already running (the engine's) instead of
 *  starting another one. */
export function setTexToOmmlConverter(c: MathJaxConverter | null): void {
  converter = c;
  // A later initTexToOmml starts a converter again after a reset.
  if (!c) starting = null;
}

/** Whether the converter from TeX to Word's equations has loaded. */
export const isTexToOmmlReady = (): boolean => converter !== null;

/** MathJax's MathML tree for `tex`, or null (no converter, or a TeX error). */
export function texToMml(tex: string, display: boolean): MmlNode | null {
  if (!converter) return null;
  const doc = converter.document as unknown as {
    convert(tex: string, options: Record<string, unknown>): unknown;
  };
  try {
    return doc.convert(tex, { display, end: STATE_COMPILED }) as MmlNode;
  } catch {
    return null;
  }
}

/** OMML for a MathML tree: the content of one `m:oMath`. Throws
 *  UnsupportedMath for what it cannot express. */
export function mmlToOmmlContent(root: MmlNode, options: RunOptions = {}): string {
  return convertNode(root, options);
}

/**
 * An `m:oMath` (inline) or `m:oMathPara` holding one `m:oMath` (display) for
 * `tex`, with `m:` and `w:` prefixes the host part declares. Null when the
 * converter is not running, the TeX does not parse, or a construct has no
 * OMML form (equation tags, `merror`, unusual `menclose` notations …).
 */
export function texToOmml(tex: string, display: boolean, options: RunOptions = {}): string | null {
  const root = texToMml(tex, display);
  if (!root) return null;
  let content: string;
  try {
    content = mmlToOmmlContent(root, { ...options, display });
  } catch {
    // UnsupportedMath, or a tree shape the writer does not expect: the
    // caller's picture fallback is safer than a broken equation.
    return null;
  }
  const oMath = `<m:oMath>${content}</m:oMath>`;
  return display ? `<m:oMathPara>${oMath}</m:oMathPara>` : oMath;
}
