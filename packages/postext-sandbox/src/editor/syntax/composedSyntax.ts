'use client';

import { ViewPlugin, Decoration, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, RangeSetBuilder } from '@codemirror/state';
import { inFencedCode } from './codeFences.js';

/**
 * Editor highlighting for composed pages (#854): the page fence
 * `::::page{template=…}` and its closing `::::` (four or more colons), the
 * `:::frame{slot=…}` and `:::figure{resource=… slot=…}` fences, the
 * `::label[TEXT]{at=… style=…}` lines of a figure, and every `slot="…"`
 * attribute (on a heading, a `::resource`, a code fence or any `:::`
 * fence), so the name a piece of content asks for stands out. Same grammar
 * as the engine's `parse/blockParser.ts`.
 */

/** `::::page`, optional attributes (trimmed line). */
const PAGE_FENCE_RE = /^(:{4,})\s*page(?:\s*\{([^}]*)\})?\s*$/;
/** A bare run of four or more colons: a composed page's closing fence. */
const PAGE_CLOSE_RE = /^:{4,}\s*$/;
/** `:::frame` / `:::figure`, optional attributes. */
const FRAME_FENCE_RE = /^:::\s*(frame|figure)(?:\s*\{([^}]*)\})?\s*$/;
/** `::label[`, the start of a figure label. */
const LABEL_RE = /^::label\[/;
/** A code fence's opening line: its `slot=` is marked too. */
const CODE_FENCE_RE = /^ {0,3}(?:`{3,}|~{3,})/;
/** A `slot` attribute: the key, `=` and its value (quoted or bare). */
const SLOT_ATTR_RE = /(?<![\w-])(slot)(\s*[=＝]\s*)("[^"]*"?|'[^']*'?|[^\s}]*)/g;
/** One attribute of a blob: `#id`, `key=value` (quoted or bare), or a
 *  bare flag. */
const ATTR_RE = /(#[^\s#]+)|([A-Za-z_][\w-]*)(\s*[=＝]\s*)("[^"]*"?|'[^']*'?|[^\s]*)|([^\s=＝]+)/gu;

export type ComposedRangeKind = 'fence' | 'label' | 'brace' | 'bracket' | 'attrKey' | 'attrValue' | 'slotKey' | 'slotValue';

export interface ComposedRange {
  from: number;
  to: number;
  kind: ComposedRangeKind;
}

/** The ranges of an attribute blob that starts at `start`; `slot` gets its
 *  own marks. */
function attrRanges(blob: string, start: number): ComposedRange[] {
  const out: ComposedRange[] = [];
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
      const slot = m[2] === 'slot';
      out.push({ from: at, to: at + m[2].length, kind: slot ? 'slotKey' : 'attrKey' });
      const valueAt = at + m[2].length + m[3]!.length;
      if (m[4]) out.push({ from: valueAt, to: valueAt + m[4].length, kind: slot ? 'slotValue' : 'attrValue' });
    } else if (m[5]) {
      out.push({ from: at, to: at + m[5].length, kind: 'attrKey' });
    }
  }
  return out;
}

/** A fence's name (up to its `{`) and attributes, `lead` columns in. */
function fenceRanges(trimmed: string, lead: number, kind: ComposedRangeKind): ComposedRange[] {
  const brace = trimmed.indexOf('{');
  const nameEnd = brace >= 0 ? trimmed.slice(0, brace).trimEnd().length : trimmed.length;
  const out: ComposedRange[] = [{ from: lead, to: lead + nameEnd, kind }];
  if (brace >= 0) {
    const close = trimmed.lastIndexOf('}');
    out.push({ from: lead + brace, to: lead + brace + 1, kind: 'brace' });
    out.push(...attrRanges(trimmed.slice(brace + 1, close), lead + brace + 1));
    out.push({ from: lead + close, to: lead + close + 1, kind: 'brace' });
  }
  return out;
}

/** The `slot=…` attributes of a line that is no composed-page fence (a
 *  heading's `{…}`, a `::resource{…}`, any `:::name{…}`, a code fence's
 *  info string). Only inside `{…}`, except on a code fence. */
function slotRanges(text: string): ComposedRange[] {
  if (!text.includes('slot')) return [];
  const code = CODE_FENCE_RE.test(text);
  const out: ComposedRange[] = [];
  SLOT_ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SLOT_ATTR_RE.exec(text)) !== null) {
    const open = text.lastIndexOf('{', m.index);
    const shut = text.lastIndexOf('}', m.index);
    if (!code && (open < 0 || shut > open)) continue;
    out.push({ from: m.index, to: m.index + m[1]!.length, kind: 'slotKey' });
    const valueAt = m.index + m[1]!.length + m[2]!.length;
    if (m[3]) out.push({ from: valueAt, to: valueAt + m[3].length, kind: 'slotValue' });
  }
  return out;
}

/** The decoration ranges of one line, relative to the line. */
export function composedLineRanges(text: string): ComposedRange[] {
  const lead = text.length - text.trimStart().length;
  const trimmed = text.trim();
  if (PAGE_FENCE_RE.test(trimmed) || FRAME_FENCE_RE.test(trimmed)) return fenceRanges(trimmed, lead, 'fence');
  if (PAGE_CLOSE_RE.test(trimmed)) return [{ from: lead, to: lead + trimmed.length, kind: 'fence' }];
  if (LABEL_RE.test(trimmed)) {
    const open = lead + '::label'.length;
    const out: ComposedRange[] = [
      { from: lead, to: open, kind: 'label' },
      { from: open, to: open + 1, kind: 'bracket' },
    ];
    // The bracket closing the label's text (nested brackets counted).
    let depth = 1;
    let close = -1;
    for (let k = open + 1; k < text.length; k++) {
      const c = text[k];
      if (c === '\\') { k++; continue; }
      if (c === '[') depth++;
      else if (c === ']' && --depth === 0) { close = k; break; }
    }
    if (close < 0) return out;
    out.push({ from: close, to: close + 1, kind: 'bracket' });
    const brace = text.indexOf('{', close);
    const shut = text.lastIndexOf('}');
    if (brace === close + 1 && shut > brace) {
      out.push({ from: brace, to: brace + 1, kind: 'brace' });
      out.push(...attrRanges(text.slice(brace + 1, shut), brace + 1));
      out.push({ from: shut, to: shut + 1, kind: 'brace' });
    }
    return out;
  }
  return slotRanges(text);
}

const MARKS: Record<ComposedRangeKind, Decoration> = {
  fence: Decoration.mark({ class: 'cm-composed-fence' }),
  label: Decoration.mark({ class: 'cm-composed-label' }),
  brace: Decoration.mark({ class: 'cm-composed-brace' }),
  bracket: Decoration.mark({ class: 'cm-composed-brace' }),
  attrKey: Decoration.mark({ class: 'cm-composed-attr-key' }),
  attrValue: Decoration.mark({ class: 'cm-composed-attr-value' }),
  slotKey: Decoration.mark({ class: 'cm-composed-slot-key' }),
  slotValue: Decoration.mark({ class: 'cm-composed-slot-value' }),
};

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    const first = doc.lineAt(from).number;
    const last = doc.lineAt(to).number;
    for (let n = first; n <= last; n++) {
      const line = doc.line(n);
      // Inside a listing only its opening fence is read (its `slot=`).
      if (inFencedCode(doc, n) && !CODE_FENCE_RE.test(line.text)) continue;
      for (const r of composedLineRanges(line.text)) {
        if (r.to > r.from) builder.add(line.from + r.from, line.from + r.to, MARKS[r.kind]);
      }
    }
  }
  return builder.finish();
}

export const composedHighlight = ViewPlugin.fromClass(
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

export const composedTheme = Prec.highest(
  EditorView.baseTheme({
    '.cm-composed-fence': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
    '.cm-composed-label': {
      color: 'var(--brand)',
      fontWeight: 'bold',
    },
    '.cm-composed-brace': {
      color: 'var(--slate)',
    },
    '.cm-composed-attr-key': {
      color: 'var(--slate)',
    },
    '.cm-composed-attr-value': {
      color: 'var(--slate)',
      fontStyle: 'italic',
    },
    '.cm-composed-slot-key': {
      color: 'var(--brand)',
    },
    '.cm-composed-slot-value': {
      color: 'var(--brand)',
      backgroundColor: 'color-mix(in srgb, var(--brand) 10%, transparent)',
      borderRadius: '2px',
    },
  }),
);
