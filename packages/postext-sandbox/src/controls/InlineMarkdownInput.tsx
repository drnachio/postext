'use client';

import { useEffect, useId, useMemo, useRef, type CSSProperties } from 'react';
import { wordRangeAt } from './wordRange';

// ---------------------------------------------------------------------------
// InlineMarkdownInput — a lightweight text/textarea control that renders a live
// preview of postext's inline microformats (bold, italic, inline code, inline
// math `$…$`, and `:ref{id="…"}`). Reused by resource captions and table cells.
//
// Preview parsing mirrors the core inline pipeline: code, inline math, and refs
// are extracted to placeholders first (so the bold/italic splitter — which would
// otherwise eat their markers — cannot mangle them) and reinserted as styled
// tokens. The bold/italic pass mirrors `parseInlineFormatting` but is inlined
// here to keep this control self-contained.
// ---------------------------------------------------------------------------

/** Minimal bold/italic span carrier, mirroring postext's `InlineSpan` subset. */
interface FormatSpan {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** A single visual token in the preview. */
type PreviewToken =
  | { kind: 'text'; text: string; bold: boolean; italic: boolean }
  | { kind: 'code'; text: string }
  | { kind: 'math'; text: string }
  | { kind: 'ref'; text: string };

// One private-use placeholder code unit per extracted token so the surrounding
// text keeps its bold/italic context through `parseInlineFormatting`.
const TOKEN_PLACEHOLDER = '';

const CODE_RE = /`([^`]+)`/g;
const MATH_RE = /\$([^$]+)\$/g;
const REF_RE =
  /:ref\{id="([^"]+)"(?:\s+style="(?:default|number|full)")?(?:\s+text="([^"]*)")?\}/g;

type ExtractedToken =
  | { kind: 'code'; text: string }
  | { kind: 'math'; text: string }
  | { kind: 'ref'; text: string };

/** Replace every match of `re` with a placeholder, collecting the token data
 *  in document order. */
function extract(
  text: string,
  re: RegExp,
  make: (m: RegExpExecArray) => ExtractedToken,
  into: ExtractedToken[],
): string {
  re.lastIndex = 0;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out += text.slice(last, m.index);
    into.push(make(m));
    out += TOKEN_PLACEHOLDER;
    last = m.index + m[0].length;
  }
  out += text.slice(last);
  return out;
}

/** Split a region into italic/non-italic runs carrying an ambient bold flag. */
function splitItalic(text: string, bold: boolean, out: FormatSpan[]): void {
  const italicRe = /\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = italicRe.exec(text)) !== null) {
    if (m.index > last) {
      const before = text.slice(last, m.index);
      if (before.length > 0) out.push({ text: before, bold, italic: false });
    }
    const inner = m[1] ?? m[2]!;
    if (inner.length > 0) out.push({ text: inner, bold, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const rest = text.slice(last);
    if (rest.length > 0) out.push({ text: rest, bold, italic: false });
  }
}

/** Bold/italic splitter mirroring postext's `parseInlineFormatting`
 *  (***bold italic***, **bold**, *italic* and underscore equivalents). */
function parseFormatting(text: string): FormatSpan[] {
  const spans: FormatSpan[] = [];
  const boldRe = /\*\*\*(.+?)\*\*\*|___(.+?)___|\*\*(.+?)\*\*|__(.+?)__/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      splitItalic(text.slice(lastIndex, match.index), false, spans);
    }
    const triple = match[1] ?? match[2];
    if (triple !== undefined) {
      // bold + italic
      if (triple.length > 0) spans.push({ text: triple, bold: true, italic: true });
    } else {
      const inner = match[3] ?? match[4]!;
      splitItalic(inner, true, spans);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    splitItalic(text.slice(lastIndex), false, spans);
  }
  return spans;
}

/** Parse a caption/cell string into a flat list of preview tokens. */
export function parseInlinePreview(value: string): PreviewToken[] {
  const tokens: ExtractedToken[] = [];
  // Order matters: refs first (their attrs may contain spaces/`=`), then math,
  // then code — mirroring the extraction order the block parser relies on.
  let working = extract(value, REF_RE, (m) => ({ kind: 'ref', text: m[2] ?? `${m[1]}` }), tokens);
  working = extract(working, MATH_RE, (m) => ({ kind: 'math', text: m[1]! }), tokens);
  working = extract(working, CODE_RE, (m) => ({ kind: 'code', text: m[1]! }), tokens);

  const spans: FormatSpan[] = parseFormatting(working);
  const out: PreviewToken[] = [];
  let idx = 0;

  const emit = (span: FormatSpan) => {
    if (span.text.indexOf(TOKEN_PLACEHOLDER) < 0) {
      if (span.text.length > 0) {
        out.push({ kind: 'text', text: span.text, bold: span.bold, italic: span.italic });
      }
      return;
    }
    let buf = '';
    for (const ch of span.text) {
      if (ch === TOKEN_PLACEHOLDER) {
        if (buf.length > 0) {
          out.push({ kind: 'text', text: buf, bold: span.bold, italic: span.italic });
          buf = '';
        }
        const tok = tokens[idx++];
        if (tok) out.push(tok);
      } else {
        buf += ch;
      }
    }
    if (buf.length > 0) {
      out.push({ kind: 'text', text: buf, bold: span.bold, italic: span.italic });
    }
  };

  for (const span of spans) emit(span);

  // The bold/italic splitter can drop runs that are only placeholders + spaces
  // in some edge cases; backfill any unconsumed tokens so the preview is honest.
  while (idx < tokens.length) {
    const tok = tokens[idx++];
    if (tok) out.push(tok);
  }
  return out;
}

function tokenStyle(token: PreviewToken): CSSProperties {
  switch (token.kind) {
    case 'text':
      return {
        fontWeight: token.bold ? 600 : 400,
        fontStyle: token.italic ? 'italic' : 'normal',
      };
    case 'code':
      return {
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '0.92em',
        padding: '0 3px',
        borderRadius: 3,
        backgroundColor: 'var(--surface)',
        color: 'var(--foreground)',
      };
    case 'math':
      return { fontStyle: 'italic', color: 'var(--foreground)' };
    case 'ref':
      return {
        color: 'var(--gilt)',
        textDecoration: 'underline',
        textUnderlineOffset: 2,
      };
  }
}

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle: CSSProperties = { borderColor: 'var(--rule)', color: 'var(--foreground)' };

/** A request to focus the field with a given selection (offsets in `value`).
 *  `selectWord` expands a collapsed selection to the word around it. */
export interface InlineFocusRequest {
  anchor: number;
  head: number;
  selectWord: boolean;
}

/** The field's current selection, reported while it has focus. */
export interface InlineSelection {
  from: number;
  to: number;
  head: number;
}

export interface InlineMarkdownInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible label (also used as the input title). */
  ariaLabel: string;
  placeholder?: string;
  /** Render a multi-line `<textarea>` instead of a single-line `<input>`. */
  multiline?: boolean;
  /** Rows for the textarea variant. Default 2. */
  rows?: number;
  /** Hide the live preview row (e.g. compact table-cell editing). */
  hidePreview?: boolean;
  /** Optional content shown as the preview when `value` is empty. */
  emptyPreview?: string;
  /** Pending focus/selection request (from a preview click). Consumed once;
   *  `onFocusConsumed` fires after it is applied. */
  focusRequest?: InlineFocusRequest | null;
  onFocusConsumed?: () => void;
  /** Selection reports: on select / key / mouse / focus, and `null` on blur. */
  onSelectionChange?: (selection: InlineSelection | null) => void;
}

/** Text input with a live inline-microformat preview. */
export function InlineMarkdownInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
  multiline = false,
  rows = 2,
  hidePreview = false,
  emptyPreview,
  focusRequest = null,
  onFocusConsumed,
  onSelectionChange,
}: InlineMarkdownInputProps) {
  const previewId = useId();
  const tokens = useMemo(() => parseInlinePreview(value), [value]);
  const hasContent = tokens.length > 0;
  const fieldRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const onFocusConsumedRef = useRef(onFocusConsumed);
  onFocusConsumedRef.current = onFocusConsumed;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const report = () => {
    const el = fieldRef.current;
    const cb = onSelectionChangeRef.current;
    if (!el || !cb) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    const head = el.selectionDirection === 'backward' ? start : end;
    cb({ from: start, to: end, head });
  };

  // Consume a focus request: clamp to the value, expand to the word when
  // asked, scroll the field into view, focus it and set the selection.
  useEffect(() => {
    if (!focusRequest) return;
    const el = fieldRef.current;
    if (!el) return;
    const len = el.value.length;
    const clamp = (n: number) => Math.max(0, Math.min(n, len));
    let anchor = clamp(focusRequest.anchor);
    let head = clamp(focusRequest.head);
    if (focusRequest.selectWord && anchor === head) {
      const word = wordRangeAt(el.value, anchor);
      anchor = word.from;
      head = word.to;
    }
    el.scrollIntoView?.({ block: 'nearest' });
    el.focus({ preventScroll: true });
    try {
      el.setSelectionRange(Math.min(anchor, head), Math.max(anchor, head), head < anchor ? 'backward' : 'forward');
    } catch {
      /* input types without selection support */
    }
    onFocusConsumedRef.current?.();
    report();
  }, [focusRequest]);

  const selectionHandlers = {
    onSelect: report,
    onKeyUp: report,
    onMouseUp: report,
    onFocus: report,
    onBlur: () => onSelectionChangeRef.current?.(null),
  };

  return (
    <div className="flex flex-col gap-1">
      {multiline ? (
        <textarea
          ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          title={ariaLabel}
          placeholder={placeholder}
          rows={rows}
          aria-describedby={hidePreview ? undefined : previewId}
          className={`${inputClass} resize-y`}
          style={{ ...inputStyle, lineHeight: '16px' }}
          {...selectionHandlers}
        />
      ) : (
        <input
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          title={ariaLabel}
          placeholder={placeholder}
          aria-describedby={hidePreview ? undefined : previewId}
          className={inputClass}
          style={inputStyle}
          {...selectionHandlers}
        />
      )}
      {!hidePreview && (
        <div
          id={previewId}
          aria-live="polite"
          className="rounded px-1.5 py-1 text-xs"
          style={{
            minHeight: 22,
            backgroundColor: 'var(--surface)',
            color: hasContent ? 'var(--foreground)' : 'var(--slate)',
            lineHeight: '16px',
            wordBreak: 'break-word',
          }}
        >
          {hasContent ? (
            tokens.map((token, i) => (
              <span key={i} style={tokenStyle(token)}>
                {token.text}
              </span>
            ))
          ) : (
            <span style={{ color: 'var(--slate)', fontStyle: 'italic' }}>
              {emptyPreview ?? placeholder ?? ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
