'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';

/**
 * Editor highlighting for comic pages (`:::page{…}` and `:::strip{…}` …
 * `:::`): the fences, each `::panel{…}` line and, on the script lines, the
 * speaker key (or the reserved `caption`, `sfx`, `note`), its `{…}`
 * attributes (a bare flag names a balloon style) and the colon, ASCII or
 * fullwidth (`：`). Same grammar as the engine's `comics/page.ts` and
 * `comics/script.ts`.
 */

/** `:::page` / `:::strip`, optional attributes (trimmed line). */
const COMIC_FENCE_RE = /^:::\s*(page|strip)\s*(?:\{([^}]*)\})?\s*$/;
/** `::panel`, optional attributes, alone on its line (trimmed). */
const PANEL_RE = /^::panel\s*(?:\{([^}]*)\})?\s*$/;
const CLOSE_RE = /^\s*:::\s*$/;
/** `key`, an optional `{attrs}`, then the colon (ASCII or fullwidth). */
const SCRIPT_LINE_RE = /^([\p{L}\p{N}_.-]+)([ \t]*)(?:(\{)([^}\n]*)(\}))?[ \t]*([:：])/u;
const RESERVED_KEYS: ReadonlySet<string> = new Set(['caption', 'sfx', 'note']);
/** One attribute of a blob: `#id`, `key=value` (quoted or bare), or a
 *  bare flag. */
const ATTR_RE = /(#[^\s#]+)|([A-Za-z_][\w-]*)(\s*[=＝]\s*)("[^"]*"?|'[^']*'?|“[^”]*”?|「[^」]*」?|[^\s]*)|([^\s=＝]+)/gu;
/** How many lines above the viewport are read to tell whether it starts
 *  inside a comic page. */
const LOOK_BACK = 400;

export type ComicLineKind = 'fence' | 'close' | 'panel' | 'script' | null;

export type ComicRangeKind =
  | 'fence'
  | 'panel'
  | 'speaker'
  | 'role'
  | 'brace'
  | 'flag'
  | 'attrKey'
  | 'attrValue'
  | 'colon';

export interface ComicRange {
  from: number;
  to: number;
  kind: ComicRangeKind;
}

/** For each of `lines`, whether it opens a comic page (`fence`), closes
 *  one (`close`), starts a panel (`panel`), is a line of its script
 *  (`script`), or lies outside any comic page (null). `open`: the first
 *  line is already inside one. */
export function comicLineKinds(lines: readonly string[], open = false): ComicLineKind[] {
  let inside = open;
  return lines.map((text) => {
    const trimmed = text.trim();
    if (!inside) {
      if (COMIC_FENCE_RE.test(trimmed)) {
        inside = true;
        return 'fence';
      }
      return null;
    }
    if (CLOSE_RE.test(text)) {
      inside = false;
      return 'close';
    }
    if (PANEL_RE.test(trimmed)) return 'panel';
    return 'script';
  });
}

/** The ranges of an attribute blob that starts at `start`. `flags`: bare
 *  words are balloon-style flags (script lines), else plain attributes. */
function attrRanges(blob: string, start: number, flags: boolean): ComicRange[] {
  const out: ComicRange[] = [];
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(blob)) !== null) {
    if (m[0].length === 0) {
      ATTR_RE.lastIndex++;
      continue;
    }
    const at = start + m.index;
    if (m[1]) {
      out.push({ from: at, to: at + m[1].length, kind: 'attrValue' });
    } else if (m[2]) {
      out.push({ from: at, to: at + m[2].length, kind: 'attrKey' });
      const valueAt = at + m[2].length + m[3]!.length;
      if (m[4]) out.push({ from: valueAt, to: valueAt + m[4].length, kind: 'attrValue' });
    } else if (m[5]) {
      out.push({ from: at, to: at + m[5].length, kind: flags ? 'flag' : 'attrKey' });
    }
  }
  return out;
}

/** The decoration ranges of one line of a comic page, relative to the
 *  line, given its kind. */
export function comicLineRanges(text: string, kind: ComicLineKind): ComicRange[] {
  if (kind === null) return [];
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  if (kind === 'close') return [{ from: lead, to: lead + trimmed.length, kind: 'fence' }];
  if (kind === 'fence' || kind === 'panel') {
    const brace = trimmed.indexOf('{');
    const nameEnd = brace >= 0 ? trimmed.slice(0, brace).trimEnd().length : trimmed.length;
    const out: ComicRange[] = [{ from: lead, to: lead + nameEnd, kind: kind === 'fence' ? 'fence' : 'panel' }];
    if (brace >= 0) {
      const close = trimmed.lastIndexOf('}');
      out.push({ from: lead + brace, to: lead + brace + 1, kind: 'brace' });
      out.push(...attrRanges(trimmed.slice(brace + 1, close), lead + brace + 1, false));
      out.push({ from: lead + close, to: lead + close + 1, kind: 'brace' });
    }
    return out;
  }
  // A script line starts at the margin; indented lines continue the
  // balloon above, and comments are not script.
  if (lead > 0 || trimmed.startsWith('<!--')) return [];
  const m = SCRIPT_LINE_RE.exec(text);
  if (!m) return [];
  const key = m[1]!;
  const out: ComicRange[] = [{ from: 0, to: key.length, kind: RESERVED_KEYS.has(key) ? 'role' : 'speaker' }];
  let at = key.length + m[2]!.length;
  if (m[3]) {
    out.push({ from: at, to: at + 1, kind: 'brace' });
    out.push(...attrRanges(m[4]!, at + 1, true));
    at += 1 + m[4]!.length;
    out.push({ from: at, to: at + 1, kind: 'brace' });
  }
  const colonAt = m[0].length - m[6]!.length;
  out.push({ from: colonAt, to: colonAt + m[6]!.length, kind: 'colon' });
  return out;
}

const MARKS: Record<ComicRangeKind, Decoration> = {
  fence: Decoration.mark({ class: 'cm-comic-fence' }),
  panel: Decoration.mark({ class: 'cm-comic-panel' }),
  speaker: Decoration.mark({ class: 'cm-comic-speaker' }),
  role: Decoration.mark({ class: 'cm-comic-role' }),
  brace: Decoration.mark({ class: 'cm-comic-brace' }),
  flag: Decoration.mark({ class: 'cm-comic-flag' }),
  attrKey: Decoration.mark({ class: 'cm-comic-attr-key' }),
  attrValue: Decoration.mark({ class: 'cm-comic-attr-value' }),
  colon: Decoration.mark({ class: 'cm-comic-colon' }),
};

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    // Inside a comic page at the top of the range: the nearest fence
    // above says.
    let open = false;
    for (let n = first - 1; n >= 1 && n >= first - LOOK_BACK; n--) {
      const text = doc.line(n).text;
      if (COMIC_FENCE_RE.test(text.trim())) {
        open = true;
        break;
      }
      if (CLOSE_RE.test(text)) break;
    }
    const last = doc.lineAt(to).number;
    const lines: { from: number; text: string }[] = [];
    for (let n = first; n <= last; n++) {
      const line = doc.line(n);
      lines.push({ from: line.from, text: line.text });
    }
    const kinds = comicLineKinds(lines.map((l) => l.text), open);
    lines.forEach((line, i) => {
      for (const r of comicLineRanges(line.text, kinds[i]!)) {
        if (r.to > r.from) builder.add(line.from + r.from, line.from + r.to, MARKS[r.kind]);
      }
    });
  }
  return builder.finish();
}

export const comicHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export const comicTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-comic-fence': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
    '.cm-comic-panel': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
    '.cm-comic-speaker': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
    '.cm-comic-role': {
      color: 'var(--brand)',
      fontStyle: 'italic',
    },
    '.cm-comic-brace': {
      color: 'var(--slate)',
    },
    '.cm-comic-flag': {
      color: 'var(--brand)',
      backgroundColor: 'color-mix(in srgb, var(--brand) 10%, transparent)',
      borderRadius: '2px',
    },
    '.cm-comic-attr-key': {
      color: 'var(--slate)',
    },
    '.cm-comic-attr-value': {
      color: 'var(--slate)',
      fontStyle: 'italic',
    },
    '.cm-comic-colon': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
  }),
);
