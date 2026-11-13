/**
 * The pages of a chapter that a heading style's running head dressed
 * (#874): where each run of Markdown under a migrated page design starts and
 * ends, page by page, so the migration can wrap it in a `::::page{template}`
 * fence. A line scanner, not the parser: it only has to know headings, the
 * fences that open and close containers, code blocks and page breaks, and it
 * keeps every other line byte for byte.
 */

/** A heading line of the chapter. */
export interface HeadingLine {
  /** 0-based line index. */
  line: number;
  level: number;
  /** The title as written, without its attribute block. */
  title: string;
  /** The `{…}` block as written (without the braces), if any. */
  attrsRaw?: string;
  /** Its attributes; a bare word is `''`, `#x` is `id`. */
  attrs: Record<string, string>;
  /** Where each attribute is written in `attrsRaw` (`key=value` as typed). */
  attrTokens: Record<string, string>;
}

/** One page of a run: lines `startLine`…`endLine` (inclusive). */
export interface RunPage {
  startLine: number;
  endLine: number;
  headings: HeadingLine[];
}

/** Lines under one page design, from the heading that opens it to the line
 *  before what closes it. */
export interface DesignRun {
  design: string;
  startLine: number;
  endLine: number;
  pages: RunPage[];
}

export interface ScannedChapter {
  lines: string[];
  headings: HeadingLine[];
  runs: DesignRun[];
  /** Lines of bare `:::pagebreak` directives next to a run (blank lines
   *  aside): a composed page starts a page of its own and the flow after it
   *  resumes on a new one, so these breaks would add empty pages. */
  dropBreaks: number[];
}

export interface ScanOptions {
  /** The page design a heading style is migrated into, if any. */
  designOf: (styleId: string) => string | undefined;
  /** Whether a heading starts a new page (its style's, else its level's
   *  `breakBefore.enabled`). */
  breaksPage: (heading: HeadingLine) => boolean;
}

const HEADING_RE = /^(#{1,6})[ \t]+([^ \t].*)?$/;
const FENCE_RE = /^(:{3,})(?:[ \t]*([A-Za-z][\w-]*))?(?:[ \t]*(\{.*\}))?$/;
const CODE_RE = /^[ \t]{0,3}(`{3,}|~{3,})/;
/** Containers, and the blocks the parser reads whole up to a bare `:::`. */
const OPENS = new Set(['callout', 'paragraphs', 'part', 'columns', 'paper', 'diecut', 'frame', 'references', 'verse', 'figure', 'page', 'strip', 'exercise', 'solution', 'hint']);
/** Directives that close a run when they stand at the top level: a part
 *  page, the contents, a composed page already there, the index. */
const CLOSES = new Set(['part', 'toc', 'index', 'bibliography', 'numbering']);

/** The `{…}` attributes of a heading line: `key="v"`, `key='v'`, `key=v`,
 *  `#id`, `.class` (ignored) and bare words. */
export function parseAttrBlock(raw: string): { attrs: Record<string, string>; tokens: Record<string, string> } {
  const attrs: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const re = /([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"']+))|#([\w-]+)|\.([\w-]+)|([A-Za-z_][\w-]*)/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    if (m[1] !== undefined) {
      attrs[m[1]] = m[3] ?? m[4] ?? m[5] ?? '';
      tokens[m[1]] = m[0];
    } else if (m[6] !== undefined) {
      attrs.id = m[6];
      tokens.id = m[0];
    } else if (m[8] !== undefined) {
      attrs[m[8]] = '';
      tokens[m[8]] = m[0];
    }
  }
  return { attrs, tokens };
}

/** A heading's text and trailing attribute block. */
export function readHeading(line: string, index: number): HeadingLine | null {
  const m = line.match(HEADING_RE);
  if (!m) return null;
  let title = (m[2] ?? '').trimEnd();
  let attrsRaw: string | undefined;
  if (title.endsWith('}')) {
    const open = title.lastIndexOf('{');
    if (open >= 0) {
      attrsRaw = title.slice(open + 1, -1);
      title = title.slice(0, open).trimEnd();
    }
  }
  const { attrs, tokens } = attrsRaw !== undefined ? parseAttrBlock(attrsRaw) : { attrs: {}, tokens: {} };
  return { line: index, level: m[1]!.length, title, ...(attrsRaw !== undefined ? { attrsRaw } : {}), attrs, attrTokens: tokens };
}

const blank = (s: string | undefined): boolean => s === undefined || s.trim() === '';

/** Find the runs of a chapter's Markdown under the page designs `designOf`
 *  names. A run opens at a heading whose style is migrated and goes on
 *  while the headings that follow belong to the same design (or are
 *  unstyled and deeper than the one that opened it); a heading of another
 *  style, a part, the contents, a composed page fence or the chapter's end
 *  close it. Inside a run a page break, or a heading that breaks the page,
 *  starts the run's next page. Only top-level lines count: what sits in a
 *  container or a code block is carried along. */
export function scanChapter(markdown: string, opts: ScanOptions): ScannedChapter {
  const lines = markdown.split('\n');
  const headings: HeadingLine[] = [];
  const runs: DesignRun[] = [];
  const breaks: number[] = [];
  /** Colons of each open fence (3 for containers, 4+ for composed pages). */
  const stack: number[] = [];
  let code: string | null = null;
  let run = null as (DesignRun & { level: number }) | null;
  let page = null as RunPage | null;
  /** A page break met in a run, waiting for what follows it. */
  let pendingBreak = null as number | null;

  const closeRun = (endLine: number): void => {
    if (!run) return;
    // Trailing blank lines stay outside.
    let end = endLine;
    while (end > run.startLine && blank(lines[end])) end--;
    if (page) page.endLine = Math.max(page.startLine, Math.min(page.endLine, end));
    run.endLine = end;
    runs.push({ design: run.design, startLine: run.startLine, endLine: run.endLine, pages: run.pages });
    run = null;
    page = null;
  };
  const startPage = (line: number): void => {
    if (!run) return;
    // The page before ends at its last line of content (`endLine` follows
    // the content lines, never a page break or a blank line).
    page = { startLine: line, endLine: line, headings: [] };
    run.pages.push(page);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();
    if (code !== null) {
      if (trimmed.startsWith(code)) code = null;
      if (page) page.endLine = i;
      continue;
    }
    const codeOpen = line.match(CODE_RE);
    if (codeOpen) {
      code = codeOpen[1]!.slice(0, 3);
      if (pendingBreak !== null && run) { startPage(i); pendingBreak = null; }
      if (page) page.endLine = i;
      continue;
    }
    const fence = trimmed.match(FENCE_RE);
    const top = stack.length === 0;
    if (fence) {
      const colons = fence[1]!.length;
      const name = fence[2];
      if (!name) {
        // A bare fence closes the innermost one it matches.
        if (stack.length > 0 && (stack[stack.length - 1] === colons || (colons === 3 && stack[stack.length - 1] === 3))) stack.pop();
        if (page) page.endLine = i;
        continue;
      }
      if (top && name === 'pagebreak') {
        if (run) {
          pendingBreak = i;
        } else if (/^:{3}pagebreak[ \t]*$/.test(trimmed)) {
          breaks.push(i);
        }
        continue;
      }
      if (top && (colons >= 4 || CLOSES.has(name))) {
        if (run) closeRun(pendingBreak !== null ? pendingBreak - 1 : i - 1);
        if (pendingBreak !== null) {
          breaks.push(pendingBreak);
          pendingBreak = null;
        }
      } else if (top && pendingBreak !== null && run) {
        startPage(i);
        pendingBreak = null;
      }
      if (colons >= 4 || OPENS.has(name)) stack.push(colons >= 4 ? colons : 3);
      if (page) page.endLine = i;
      continue;
    }
    if (top) {
      const h = readHeading(line, i);
      if (h) {
        headings.push(h);
        const design = h.attrs.style !== undefined ? opts.designOf(h.attrs.style) : undefined;
        if (run) {
          const same = design !== undefined && design === run.design;
          const deeper = h.attrs.style === undefined && h.level > run.level;
          if (same || deeper) {
            if (pendingBreak !== null || (same && opts.breaksPage(h) && page && page.headings.length > 0)) startPage(i);
            pendingBreak = null;
            page!.headings.push(h);
            page!.endLine = i;
            continue;
          }
          closeRun(pendingBreak !== null ? pendingBreak - 1 : i - 1);
          if (pendingBreak !== null) breaks.push(pendingBreak);
          pendingBreak = null;
        }
        if (design !== undefined) {
          run = { design, startLine: i, endLine: i, pages: [], level: h.level };
          startPage(i);
          page!.headings.push(h);
        }
        continue;
      }
      if (!blank(line) && pendingBreak !== null && run) {
        startPage(i);
        pendingBreak = null;
      }
    }
    if (page && !blank(line)) page.endLine = i;
  }
  if (run) closeRun(pendingBreak !== null ? pendingBreak - 1 : lines.length - 1);
  if (pendingBreak !== null) breaks.push(pendingBreak);

  // Bare page breaks next to a run: only blank lines between.
  const dropBreaks = breaks.filter((b) => {
    const near = (from: number, step: number): number | null => {
      for (let j = from; j >= 0 && j < lines.length; j += step) if (!blank(lines[j])) return j;
      return null;
    };
    const before = near(b - 1, -1);
    const after = near(b + 1, 1);
    return runs.some((r) => r.endLine === before || r.startLine === after);
  });
  return { lines, headings, runs, dropBreaks };
}
