'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ClipboardPaste,
  Columns,
  Merge,
  Rows,
  Split,
  Trash2,
} from 'lucide-react';
import type { TableCellAlign } from 'postext';

// ---------------------------------------------------------------------------
// TableEditorToolbar — structural & formatting actions for the table editor.
// Stateless: every button raises an intent the parent fulfils through Phase-4
// pure model functions (which it then snapshots for undo).
// ---------------------------------------------------------------------------

interface TableEditorToolbarProps {
  /** Whether a multi-cell range is selected (enables merge). */
  canMerge: boolean;
  /** Whether the active cell is part of a merge (enables split). */
  canSplit: boolean;
  /** Whether the active cell's row is currently a header row. */
  headerRowActive: boolean;
  /** Whether the active cell's column is currently a header column. */
  headerColumnActive: boolean;
  /** Current horizontal alignment of the active cell. */
  activeAlign: TableCellAlign | undefined;
  onAddRow: () => void;
  onRemoveRow: () => void;
  onAddColumn: () => void;
  onRemoveColumn: () => void;
  onMerge: () => void;
  onSplit: () => void;
  onToggleHeaderRow: () => void;
  onToggleHeaderColumn: () => void;
  onSetAlign: (align: TableCellAlign) => void;
  onPasteTsv: () => void;
}

const btnBase =
  'flex h-6 items-center justify-center gap-1 rounded px-1.5 text-[11px]';

interface BtnProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}

function Btn({ label, onClick, disabled, active, children }: BtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={btnBase}
      style={{
        color: disabled ? 'var(--rule)' : 'var(--foreground)',
        background: active ? 'var(--surface)' : 'none',
        border: '1px solid var(--rule)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

function Divider() {
  return (
    <span
      aria-hidden="true"
      style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'var(--rule)' }}
    />
  );
}

export function TableEditorToolbar({
  canMerge,
  canSplit,
  headerRowActive,
  headerColumnActive,
  activeAlign,
  onAddRow,
  onRemoveRow,
  onAddColumn,
  onRemoveColumn,
  onMerge,
  onSplit,
  onToggleHeaderRow,
  onToggleHeaderColumn,
  onSetAlign,
  onPasteTsv,
}: TableEditorToolbarProps) {
  const iconSize = 13;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded border p-1"
      style={{ borderColor: 'var(--rule)' }}
    >
      <Group>
        <Btn label="Add row below" onClick={onAddRow}>
          <Rows size={iconSize} aria-hidden="true" />+
        </Btn>
        <Btn label="Remove row" onClick={onRemoveRow}>
          <Rows size={iconSize} aria-hidden="true" />
          <Trash2 size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn label="Add column right" onClick={onAddColumn}>
          <Columns size={iconSize} aria-hidden="true" />+
        </Btn>
        <Btn label="Remove column" onClick={onRemoveColumn}>
          <Columns size={iconSize} aria-hidden="true" />
          <Trash2 size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn label="Merge cells" onClick={onMerge} disabled={!canMerge}>
          <Merge size={iconSize} aria-hidden="true" />
        </Btn>
        <Btn label="Split cell" onClick={onSplit} disabled={!canSplit}>
          <Split size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn
          label="Toggle header row"
          onClick={onToggleHeaderRow}
          active={headerRowActive}
        >
          H row
        </Btn>
        <Btn
          label="Toggle header column"
          onClick={onToggleHeaderColumn}
          active={headerColumnActive}
        >
          H col
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn
          label="Align left"
          onClick={() => onSetAlign('left')}
          active={(activeAlign ?? 'left') === 'left'}
        >
          <AlignLeft size={iconSize} aria-hidden="true" />
        </Btn>
        <Btn
          label="Align center"
          onClick={() => onSetAlign('center')}
          active={activeAlign === 'center'}
        >
          <AlignCenter size={iconSize} aria-hidden="true" />
        </Btn>
        <Btn
          label="Align right"
          onClick={() => onSetAlign('right')}
          active={activeAlign === 'right'}
        >
          <AlignRight size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn label="Paste as table (TSV/CSV)" onClick={onPasteTsv}>
          <ClipboardPaste size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
    </div>
  );
}
