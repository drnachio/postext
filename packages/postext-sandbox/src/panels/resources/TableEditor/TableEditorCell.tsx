'use client';

import { useEffect, useRef } from 'react';
import type { TableCell, TableCellPos } from 'postext';
import { InlineMarkdownInput } from '../../../controls/InlineMarkdownInput';

// ---------------------------------------------------------------------------
// TableEditorCell — a single editable grid cell. It renders the Phase-6
// InlineMarkdownInput (compact, no preview) and intercepts keyboard / focus /
// paste events on the wrapping cell so the parent can drive cell-to-cell
// navigation and TSV paste. InlineMarkdownInput is used unmodified, so events
// are captured on the wrapper rather than via props on the control.
// ---------------------------------------------------------------------------

/** Directional navigation requested from within a cell. */
export type CellNav = 'next' | 'prev' | 'up' | 'down' | 'left' | 'right';

interface TableEditorCellProps {
  cell: TableCell;
  pos: TableCellPos;
  /** Whether this is the active (focused) cell. */
  active: boolean;
  /** Whether this cell falls within the current selection range. */
  selected: boolean;
  onContentChange: (pos: TableCellPos, content: string) => void;
  onFocus: (pos: TableCellPos) => void;
  /** `extend` true when Shift is held, growing the selection range. */
  onNavigate: (nav: CellNav, extend: boolean) => void;
  onPaste: (pos: TableCellPos, text: string) => void;
}

export function TableEditorCell({
  cell,
  pos,
  active,
  selected,
  onContentChange,
  onFocus,
  onNavigate,
  onPaste,
}: TableEditorCellProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  const textarea = (): HTMLTextAreaElement | null =>
    wrapRef.current?.querySelector('textarea') ?? null;

  // Pull focus to the inner textarea when this cell becomes active (e.g. after
  // a keyboard move) so the caret follows navigation.
  useEffect(() => {
    if (!active) return;
    const el = textarea();
    if (el && document.activeElement !== el) el.focus();
  }, [active]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLTextAreaElement;
    if (!el || el.tagName !== 'TEXTAREA') return;
    if (e.key === 'Tab') {
      e.preventDefault();
      onNavigate(e.shiftKey ? 'prev' : 'next', false);
      return;
    }
    // Arrow keys move between cells only when the caret sits at the relevant
    // edge, so intra-cell text editing keeps working. Shift extends a multi-
    // cell selection (for merge) instead of moving.
    const ext = e.shiftKey;
    const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
    const atEnd =
      el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (e.key === 'ArrowUp' && (atStart || ext)) {
      e.preventDefault();
      onNavigate('up', ext);
    } else if (e.key === 'ArrowDown' && (atEnd || ext)) {
      e.preventDefault();
      onNavigate('down', ext);
    } else if (e.key === 'ArrowLeft' && (atStart || ext)) {
      e.preventDefault();
      onNavigate('left', ext);
    } else if (e.key === 'ArrowRight' && (atEnd || ext)) {
      e.preventDefault();
      onNavigate('right', ext);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain');
    // Multi-cell pastes (containing tabs or newlines) are offered as a table
    // import by the parent; single-value pastes fall through to the textarea.
    if (/[\t\n]/.test(text)) {
      e.preventDefault();
      onPaste(pos, text);
    }
  };

  const Tag = cell.isHeader ? 'th' : 'td';

  return (
    <Tag
      colSpan={cell.colSpan ?? 1}
      rowSpan={cell.rowSpan ?? 1}
      style={{
        border: `1px solid ${active || selected ? 'var(--gilt)' : 'var(--rule)'}`,
        padding: 0,
        verticalAlign: cell.verticalAlign ?? 'top',
        backgroundColor: selected && !active ? 'var(--surface)' : undefined,
        minWidth: 64,
      }}
    >
      <div
        ref={wrapRef}
        onKeyDownCapture={handleKeyDown}
        onFocusCapture={() => onFocus(pos)}
        onPasteCapture={handlePaste}
        style={{
          textAlign: cell.align ?? 'left',
          fontWeight: cell.isHeader ? 600 : 400,
        }}
      >
        <InlineMarkdownInput
          value={cell.content}
          onChange={(value) => onContentChange(pos, value)}
          ariaLabel={`Cell row ${pos.row + 1}, column ${pos.col + 1}`}
          multiline
          rows={1}
          hidePreview
        />
      </div>
    </Tag>
  );
}
