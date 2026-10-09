// Code fences (#624): the lines that open and close a ``` or ~~~ code
// block, shared by the block parser and the passes that read the text
// before it (index marks).

/** An opening code fence (#624): three or more backticks or tildes, up to
 *  three spaces in, then the info string. */
const CODE_FENCE_OPEN_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
/** A closing code fence: a run of the opening's character, at least as
 *  long, alone on its line (up to three spaces in). */
const CODE_FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})\s*$/;

/** The opening fence `line` writes, or undefined: its indentation, its run
 *  of backticks or tildes and its info string. A backtick fence's info
 *  string holds no backtick (```` ```js `x` ```` is a line of text). */
export function codeFenceOpen(line: string): { indent: number; marker: string; info: string } | undefined {
  const m = CODE_FENCE_OPEN_RE.exec(line);
  if (!m) return undefined;
  const marker = m[2]!;
  const info = m[3]!;
  if (marker[0] === '`' && info.includes('`')) return undefined;
  return { indent: m[1]!.length, marker, info: info.trim() };
}

/** Whether `line` closes a fence opened with `marker`. */
export function closesCodeFence(line: string, marker: string): boolean {
  const m = CODE_FENCE_CLOSE_RE.exec(line);
  return !!m && m[1]![0] === marker[0] && m[1]!.length >= marker.length;
}

/**
 * For each of `lines`, whether it belongs to a fenced code block: its
 * opening fence, its lines and its closing fence (a fence left open runs
 * to the end). For editors that mark a listing as one region and leave
 * the Markdown inside it alone.
 */
export function fencedCodeLines(lines: readonly string[]): boolean[] {
  const out: boolean[] = new Array(lines.length).fill(false);
  let open: string | undefined;
  lines.forEach((line, i) => {
    if (open !== undefined) {
      out[i] = true;
      if (closesCodeFence(line, open)) open = undefined;
      return;
    }
    const fence = codeFenceOpen(line);
    if (fence) {
      open = fence.marker;
      out[i] = true;
    }
  });
  return out;
}
