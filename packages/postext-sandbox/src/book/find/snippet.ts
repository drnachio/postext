// The line around a match, for the find bar's list of matches and the
// answers of sandbox_search_text.

import type { FindMatch } from './compile.js';

export interface MatchSnippet {
  /** 1-based line of the match. */
  line: number;
  before: string;
  match: string;
  after: string;
}

/** The line around a match for a results list: up to `radius` characters
 *  each side (cut at a word where it can be), the match itself, and the
 *  line number. A match that runs past its line shows its first line. */
export function matchSnippet(text: string, match: FindMatch, radius = 40): MatchSnippet {
  let line = 1;
  for (let i = text.indexOf('\n'); i >= 0 && i < match.from; i = text.indexOf('\n', i + 1)) line++;
  return snippetAt(text, match, line, radius);
}

/** {@link matchSnippet} of the first `limit` matches (in text order),
 *  counting lines in one pass over the text. */
export function matchSnippets(text: string, matches: readonly FindMatch[], limit = matches.length, radius = 40): MatchSnippet[] {
  const out: MatchSnippet[] = [];
  let line = 1;
  let scanned = 0;
  for (const m of matches.slice(0, limit)) {
    for (let i = text.indexOf('\n', scanned); i >= 0 && i < m.from; i = text.indexOf('\n', i + 1)) {
      line++;
      scanned = i + 1;
    }
    out.push(snippetAt(text, m, line, radius));
  }
  return out;
}

function snippetAt(text: string, match: FindMatch, line: number, radius: number): MatchSnippet {
  const lineStart = text.lastIndexOf('\n', match.from - 1) + 1;
  const nl = text.indexOf('\n', match.from);
  const lineEnd = nl < 0 ? text.length : nl;
  let start = Math.max(lineStart, match.from - radius);
  if (start > lineStart) {
    const space = text.indexOf(' ', start);
    if (space >= 0 && space < match.from) start = space + 1;
  }
  const matchEnd = Math.min(match.to, lineEnd);
  let end = Math.min(lineEnd, matchEnd + radius);
  if (end < lineEnd) {
    const space = text.lastIndexOf(' ', end);
    if (space > matchEnd) end = space;
  }
  return {
    line,
    before: (start > lineStart ? '…' : '') + text.slice(start, match.from),
    match: text.slice(match.from, matchEnd),
    after: text.slice(matchEnd, end) + (end < lineEnd ? '…' : ''),
  };
}
