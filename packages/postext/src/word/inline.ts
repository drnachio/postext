// Inline text both ways: Word runs → Postext inline marks (import) and
// Postext inline marks → runs Word can carry (export). Whatever has no Word
// equivalent (`:ref{…}`, maths, `:index`, annotations, a stray `*`) travels
// as a verbatim run, so a manuscript that goes to Word and back keeps it.

export { WORD_JOINER, LINE_BREAK, escapeText, guardLineStart, linkDestination, normaliseRuns, renderInline } from './inline/render.js';
export type { InlineRun } from './inline/render.js';
export { parseInline } from './inline/parse.js';
export type { ParseInlineOptions } from './inline/parse.js';
