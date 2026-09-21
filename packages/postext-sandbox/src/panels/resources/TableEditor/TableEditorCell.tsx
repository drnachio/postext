'use client';

import { useEffect, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { TableCell, TableCellPos } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext';
import {
  InlineMarkdownInput,
  type InlineFocusRequest,
  type InlineSelection,
} from '../../../controls/InlineMarkdownInput';

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
  /** Focus/selection request addressed to this cell (from a preview click). */
  focusRequest?: InlineFocusRequest | null;
  onFocusConsumed?: () => void;
  /** The cell's selection while its field has focus (`null` on blur). */
  onSelectionChange?: (pos: TableCellPos, selection: InlineSelection | null) => void;
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
  focusRequest = null,
  onFocusConsumed,
  onSelectionChange,
}: TableEditorCellProps) {
  const labels = useSandboxLabels();
  const wrapRef = useRef<HTMLDivElement>(null);

  const textarea = (): HTMLTextAreaElement | null =>
    wrapRef.current?.querySelector('textarea') ?? null;

  // Pull focus to the inner textarea when this cell becomes active (e.g. after
  // a keyboard move) so the caret follows navigation. A pending focus request
  // sets its own selection, so it takes over here.
  useEffect(() => {
    if (!active || focusRequest) return;
    const el = textarea();
    if (el && document.activeElement !== el) el.focus();
  }, [active, focusRequest]);

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
        // The cell's own fill shows in the grid, as on the page; a
        // range selection overrides it while it lasts.
        backgroundColor: selected && !active ? 'var(--surface)' : cell.background?.hex,
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
        {cell.image && (
          <div
            role="img"
            aria-label={labels.tableEditorImageChipAria.replace('__id__', cell.image.resourceId)}
            title={cell.image.resourceId}
            className="mx-1 mt-1 flex items-center gap-1 rounded px-1 text-[10px]"
            style={{ backgroundColor: 'var(--surface)', color: 'var(--slate)', width: 'fit-content', maxWidth: 'calc(100% - 8px)' }}
          >
            <ImageIcon size={10} aria-hidden="true" />
            <span className="truncate">{cell.image.resourceId}</span>
            {cell.image.width !== undefined && <span>{Math.round(cell.image.width * 100)}%</span>}
          </div>
        )}
        <InlineMarkdownInput
          value={cell.content}
          onChange={(value) => onContentChange(pos, value)}
          ariaLabel={labels.tableEditorCellAria
            .replace('__row__', String(pos.row + 1))
            .replace('__col__', String(pos.col + 1))}
          multiline
          rows={1}
          hidePreview
          focusRequest={focusRequest}
          onFocusConsumed={onFocusConsumed}
          onSelectionChange={onSelectionChange ? (sel) => onSelectionChange(pos, sel) : undefined}
        />
      </div>
    </Tag>
  );
}
