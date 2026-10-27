// Postext Markdown to export blocks: the chapter parser the export walks.
import { codeFenceOpen, closesCodeFence } from '../../parse/codeFence.js';

// ---------------------------------------------------------------------------
// Markdown → export blocks
// ---------------------------------------------------------------------------

export type Role =
  | { kind: 'body' }
  | { kind: 'paragraphs'; style: string }
  | { kind: 'callout'; type: string }
  | { kind: 'quote' };

type ExBlock =
  | { kind: 'markup'; text: string }
  | { kind: 'chapter'; title: string }
  | { kind: 'heading'; level: number; style?: string; text: string }
  | { kind: 'para'; text: string; role: Role }
  | { kind: 'list'; text: string; depth: number; ordered: boolean; number: number; role: Role; run: number };

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const FENCE_RE = /^:::\s*([a-z][a-z0-9-]*)(?:\s*\{([^}]*)\})?\s*$/;
const CLOSE_RE = /^:::\s*$/;
const CONTAINERS = new Set(['callout', 'paragraphs', 'part', 'columns', 'paper']);
const RAW_BODY = new Set(['references', 'verse', 'page', 'strip']);
const TASK_RE = /^(\s*)([-*+])\s+(\[[ xX]\]\s+.*)$/;
const ORDERED_RE = /^(\s*)([0-9]+)([.)])\s+(.*)$/;
const BULLET_RE = /^(\s*)([-*+])\s+(.*)$/;
export const NOTE_DEF_RE = /^\[\^([\p{L}\p{N}_.:-]+)\]:[ \t]*/u;
const RESOURCE_RE = /^::resource\s*\{id="[^"]+"\}\s*$/;
const MATH_SINGLE_RE = /^\s*\$\$[\s\S]+?\$\$\s*$/;
const MATH_FENCE_RE = /^\s*\$\$\s*$/;

/** `key="value"` / `key=value` / flag pairs of an attribute blob. */
function attrPairs(blob: string): Array<[string, string | true]> {
  const out: Array<[string, string | true]> = [];
  const re = /([A-Za-z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(blob))) out.push([m[1]!, m[2] ?? m[3] ?? m[4] ?? true]);
  return out;
}

/** Whether a blob is attributes and nothing else — what
 *  `/^(?:[A-Za-z_][\w-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"']+))?\s*)*$/`
 *  accepts. Read as a set of states in one pass: the expression's nested
 *  repetitions backtrack exponentially on a long blob that fails (a name
 *  runs into the next one, an unquoted value may hold a name). */
function isAttributeBlob(blob: string): boolean {
  // At the start (a name, no space, first), between attributes (after a
  // value), in a name, after a name and the spaces that may lead to its
  // `=`, after `=`, inside "…" or '…', in an unquoted value.
  const START = 128, BETWEEN = 1, NAME = 2, AFTER_NAME = 4, EQUALS = 8, DOUBLE = 16, SINGLE = 32, VALUE = 64;
  let states = START;
  for (const c of blob) {
    const space = c.trim() === '';
    const nameStart = /[A-Za-z_]/.test(c);
    const quote = c === '"' || c === "'";
    let next = 0;
    if (states & (START | BETWEEN | AFTER_NAME) && nameStart) next |= NAME;
    if (space) next |= states & (BETWEEN | AFTER_NAME | EQUALS);
    if (states & (NAME | AFTER_NAME) && c === '=') next |= EQUALS;
    if (states & NAME) {
      if (/[\w-]/.test(c)) next |= NAME;
      else if (space) next |= AFTER_NAME;
    }
    if (states & EQUALS && !space) {
      if (c === '"') next |= DOUBLE;
      else if (c === "'") next |= SINGLE;
      else next |= VALUE;
    }
    if (states & DOUBLE) next |= c === '"' ? BETWEEN : DOUBLE;
    if (states & SINGLE) next |= c === "'" ? BETWEEN : SINGLE;
    if (states & VALUE) {
      // A value may run straight into the next attribute's name.
      if (space) next |= BETWEEN;
      else if (!quote) next |= nameStart ? VALUE | NAME : VALUE;
    }
    states = next;
    if (states === 0) return false;
  }
  return (states & (START | BETWEEN | NAME | AFTER_NAME | VALUE)) !== 0;
}

/** A paragraph's lines as one text: joined with a space, or with a line
 *  feed after a line that ends in a backslash, a forced line break (#620)
 *  `parseInline` reads. */
function joinLines(parts: readonly string[]): string {
  return parts.reduce((text, part, k) => (k === 0 ? part : `${text}${parts[k - 1]!.endsWith('\\') ? '\n' : ' '}${part}`), '');
}

function isBlank(line: string): boolean {
  return line.trim() === '';
}

/** Does a paragraph run end at this line? (blank, heading, list, quote,
 *  fence, maths, resource, note definition) */
function startsBlock(trimmed: string, raw: string): boolean {
  return HEADING_RE.test(trimmed) || trimmed.startsWith('>') || FENCE_RE.test(trimmed) || CLOSE_RE.test(trimmed)
    || TASK_RE.test(raw) || ORDERED_RE.test(raw) || BULLET_RE.test(raw) || RESOURCE_RE.test(trimmed)
    || MATH_SINGLE_RE.test(trimmed) || MATH_FENCE_RE.test(trimmed) || NOTE_DEF_RE.test(trimmed) || codeFenceOpen(raw) !== undefined;
}

interface ParsedChapter {
  blocks: ExBlock[];
  /** Note definitions by id (first wins). */
  notes: Map<string, string>;
}

export function parseChapter(markdown: string, listRunBase: { n: number }): ParsedChapter {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ExBlock[] = [];
  const notes = new Map<string, string>();
  let i = 0;

  // Front matter: verbatim.
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
    if (end > 0) {
      for (let k = 0; k <= end; k++) blocks.push({ kind: 'markup', text: lines[k]! });
      i = end + 1;
    }
  }

  /** Open containers: explicit ones (fences kept verbatim) and the one
   *  implicit `:::paragraphs` group a Word style stands for. */
  const stack: Array<{ name: string; role: Role | null; implicit: boolean }> = [];
  const role = (): Role => {
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k]!.role) return stack[k]!.role!;
    return { kind: 'body' };
  };
  let listStack: number[] = [];
  let listRun = -1;
  let lastImplicitStyle: string | null = null;
  let lastImplicitEnd = -2;

  const endList = (): void => {
    listStack = [];
    listRun = -1;
  };

  // Two verbatim blocks come back joined line to line; a blank line
  // between them in the source travels as an empty markup paragraph.
  let blankBefore = false;
  const pushBlock = (b: ExBlock): void => {
    if (b.kind === 'markup' && blankBefore && blocks[blocks.length - 1]?.kind === 'markup') blocks.push({ kind: 'markup', text: '' });
    blankBefore = false;
    blocks.push(b);
  };

  while (i < lines.length) {
    const raw = lines[i]!;
    const t = raw.trim();
    if (isBlank(raw)) {
      blankBefore = true;
      i++;
      continue;
    }
    // A code listing (#624): written verbatim, fences and all, in the
    // Postext Markup style (no Word mapping of code yet).
    const code = codeFenceOpen(raw);
    if (code) {
      endList();
      pushBlock({ kind: 'markup', text: raw });
      i++;
      while (i < lines.length && !closesCodeFence(lines[i]!, code.marker)) blocks.push({ kind: 'markup', text: lines[i++]! });
      if (i < lines.length) blocks.push({ kind: 'markup', text: lines[i++]! });
      continue;
    }
    const fence = FENCE_RE.exec(t);
    if (fence) {
      endList();
      const name = fence[1]!;
      const attrs = attrPairs(fence[2] ?? '');
      if (RAW_BODY.has(name)) {
        pushBlock({ kind: 'markup', text: raw });
        i++;
        while (i < lines.length && !CLOSE_RE.test(lines[i]!.trim())) blocks.push({ kind: 'markup', text: lines[i++]! });
        if (i < lines.length) blocks.push({ kind: 'markup', text: lines[i++]! });
        continue;
      }
      if (!CONTAINERS.has(name)) {
        pushBlock({ kind: 'markup', text: raw });
        i++;
        continue;
      }
      const style = attrs.find(([k]) => k === 'style')?.[1];
      if (name === 'paragraphs' && stack.length === 0 && attrs.length === 1 && typeof style === 'string' && style) {
        // A Word paragraph style can stand for the fence when the group
        // holds only paragraphs and does not touch another group of the
        // same style (the two would merge on the way back).
        let depth = 1;
        let simple = true;
        let k = i + 1;
        for (; k < lines.length; k++) {
          const lt = lines[k]!.trim();
          if (isBlank(lines[k]!)) continue;
          if (CLOSE_RE.test(lt)) {
            if (--depth === 0) break;
            continue;
          }
          if (FENCE_RE.test(lt)) {
            simple = false;
            depth++;
            continue;
          }
          if (startsBlock(lt, lines[k]!)) simple = false;
        }
        const adjacent = lastImplicitStyle === style && lastImplicitEnd === blocks.length;
        if (simple && k < lines.length && !adjacent) {
          stack.push({ name, role: { kind: 'paragraphs', style }, implicit: true });
          i++;
          continue;
        }
      }
      const fenceRole: Role | null = name === 'callout'
        ? { kind: 'callout', type: (attrs.find(([key]) => key === 'type')?.[1] as string | undefined) ?? '' }
        : name === 'paragraphs' && typeof style === 'string' && style ? { kind: 'paragraphs', style } : null;
      stack.push({ name, role: fenceRole, implicit: false });
      pushBlock({ kind: 'markup', text: raw });
      i++;
      continue;
    }
    if (CLOSE_RE.test(t)) {
      endList();
      const top = stack.pop();
      if (top?.implicit) {
        lastImplicitStyle = top.role?.kind === 'paragraphs' ? top.role.style : null;
        lastImplicitEnd = blocks.length;
      } else pushBlock({ kind: 'markup', text: raw });
      i++;
      continue;
    }
    if (RESOURCE_RE.test(t) || MATH_SINGLE_RE.test(t)) {
      endList();
      pushBlock({ kind: 'markup', text: raw });
      i++;
      continue;
    }
    if (MATH_FENCE_RE.test(t)) {
      endList();
      pushBlock({ kind: 'markup', text: raw });
      i++;
      while (i < lines.length && !MATH_FENCE_RE.test(lines[i]!.trim())) blocks.push({ kind: 'markup', text: lines[i++]! });
      if (i < lines.length) blocks.push({ kind: 'markup', text: lines[i++]! });
      continue;
    }
    const heading = HEADING_RE.exec(t);
    if (heading) {
      endList();
      let text = heading[2]!;
      let style: string | undefined;
      const attrs = /(\s+)\{([^{}]*)\}\s*$/.exec(text);
      if (attrs) {
        const pairs = attrPairs(attrs[2]!);
        const s = pairs.find(([k]) => k === 'style');
        // Only a blob the grammar reads whole is attributes.
        const reconstructed = attrs[2]!.trim();
        if (s && typeof s[1] === 'string' && isAttributeBlob(reconstructed)) {
          style = s[1];
          const rest = reconstructed.replace(/(^|\s)style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"']+)/, '').trim();
          text = text.slice(0, attrs.index) + (rest ? `${attrs[1]}{${rest}}` : '');
        }
      }
      pushBlock({ kind: 'heading', level: heading[1]!.length, ...(style ? { style } : {}), text });
      i++;
      continue;
    }
    if (t.startsWith('>')) {
      endList();
      const parts: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('>')) parts.push(lines[i++]!.trim().replace(/^>\s?/, ''));
      pushBlock({ kind: 'para', text: joinLines(parts).trim(), role: { kind: 'quote' } });
      continue;
    }
    const task = TASK_RE.exec(raw);
    const ordered = task ? null : ORDERED_RE.exec(raw);
    const bullet = task || ordered ? null : BULLET_RE.exec(raw);
    const item = task ?? ordered ?? bullet;
    if (item) {
      const col = item[1]!.replace(/\t/g, '    ').length;
      while (listStack.length && listStack[listStack.length - 1]! + 2 > col) listStack.pop();
      listStack.push(col);
      if (listRun < 0) listRun = listRunBase.n++;
      const depth = Math.min(5, listStack.length);
      pushBlock({
        kind: 'list',
        text: (task ? task[3]! : ordered ? ordered[4]! : bullet![3]!).trim(),
        depth,
        ordered: !!ordered,
        number: ordered ? Number(ordered[2]) : 0,
        role: role(),
        run: listRun,
      });
      i++;
      continue;
    }
    // A paragraph (or a note definition): lines up to the next block.
    endList();
    const parts: string[] = [t];
    i++;
    while (i < lines.length && !isBlank(lines[i]!) && !startsBlock(lines[i]!.trim(), lines[i]!)) parts.push(lines[i++]!.trim());
    const text = joinLines(parts);
    const def = NOTE_DEF_RE.exec(text);
    if (def) {
      const id = def[1]!;
      if (!notes.has(id)) notes.set(id, text.slice(def[0].length));
      pushBlock({ kind: 'markup', text });
      continue;
    }
    pushBlock({ kind: 'para', text, role: role() });
  }
  return { blocks, notes };
}
