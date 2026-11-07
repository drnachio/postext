// Numbered equations set by hand, the way Word users number them and the
// way the semantic writer exports `\tag{1}` (#1444): a paragraph holding
// tabs, one equation and, after a tab, its number. Word sees an inline
// equation there, so the reader would import `$…$` with tab directives and
// the number as text. Read as a display equation with its `\tag` instead.

import type { WordRun } from '../model.js';

/** The paragraph style the semantic writer gives equations. */
const EQUATION_STYLE = 'PostextEquation';

/** `\tag{…}` for a number as Word shows it: `(1)`, `(2.3a)`. Any other
 *  label only in a Postext equation paragraph (`\tag*{A}` exports as `A`). */
function tagFor(label: string, styleId: string): string | undefined {
  const paren = /^\((.+)\)$/.exec(label);
  if (paren && !/[()]/.test(paren[1]!)) return `\\tag{${paren[1]}}`;
  if (styleId === EQUATION_STYLE && /^\S+$/.test(label)) return `\\tag*{${label}}`;
  return undefined;
}

/** The paragraph's runs as one numbered display equation, or undefined when
 *  they are anything else: optional tabs, one equation, at least one tab,
 *  then the number and nothing more. */
export function numberedEquation(runs: readonly WordRun[], styleId: string): WordRun[] | undefined {
  let tex: string | undefined;
  let tabAfter = false;
  let label = '';
  for (const r of runs) {
    if (r.type === 'tab') {
      if (tex !== undefined) {
        if (label.trim()) return undefined;
        tabAfter = true;
      }
    } else if (r.type === 'math') {
      if (tex !== undefined) return undefined;
      tex = r.tex;
    } else if (r.type === 'text') {
      if (tex === undefined || !tabAfter) {
        if (r.text.trim()) return undefined;
        continue;
      }
      label += r.text;
    } else return undefined;
  }
  if (tex === undefined || !tabAfter) return undefined;
  const tag = tagFor(label.trim(), styleId);
  if (!tag) return undefined;
  return [{ type: 'math', tex: `${tex.trim()} ${tag}`, display: true }];
}
