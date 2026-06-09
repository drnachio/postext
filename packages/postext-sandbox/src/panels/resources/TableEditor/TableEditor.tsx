'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  TableCell,
  TableCellAlign,
  TableCellPos,
  TableModel,
} from 'postext';
import {
  addColumn,
  addRow,
  mergeCells,
  parseTSV,
  removeColumn,
  removeRow,
  setAlignment,
  setCellContent,
  unmergeCell,
} from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext';
import { TableEditorCell, type CellNav } from './TableEditorCell';
import { TableEditorToolbar } from './TableEditorToolbar';

// ---------------------------------------------------------------------------
// TableEditor — interactive grid editor for table resources. All model edits
// go through the Phase-4 pure functions (plus a couple of local immutable
// header helpers for the toggles those functions don't cover). Every committed
// edit is pushed onto an undo snapshot stack; Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z
// walk it. Keyboard navigation (Tab / Shift-Tab with row wrap, arrows) moves
// the active cell.
// ---------------------------------------------------------------------------

interface TableEditorProps {
  model: TableModel;
  onModelChange: (next: TableModel) => void;
}

const columnCount = (m: TableModel): number =>
  m.rows.reduce((max, row) => Math.max(max, row.length), 0);

/** Clone a cell, returning a brand-new object (immutability). */
const cloneCell = (c: TableCell): TableCell => ({ ...c });

/**
 * Toggle whether the first `n` rows are header rows. Sets/clears `isHeader` on
 * the affected cells and updates `headerRowCount`. Pure: returns a new model.
 */
function setHeaderRows(m: TableModel, headerRowCount: number): TableModel {
  const count = Math.max(0, Math.min(headerRowCount, m.rows.length));
  const rows = m.rows.map((row, r) =>
    row.map((cell) => {
      const next = cloneCell(cell);
      if (r < count) next.isHeader = true;
      else delete next.isHeader;
      return next;
    }),
  );
  return { ...m, rows, headerRowCount: count };
}

/**
 * Toggle whether column `col` is a header column by flipping `isHeader` on each
 * of its cells. Pure: returns a new model.
 */
function toggleHeaderColumn(m: TableModel, col: number, on: boolean): TableModel {
  const headerRows = m.headerRowCount ?? 0;
  const rows = m.rows.map((row, r) =>
    row.map((cell, c) => {
      if (c !== col) return cell;
      const next = cloneCell(cell);
      // Header rows always stay header cells.
      if (on || r < headerRows) next.isHeader = true;
      else delete next.isHeader;
      return next;
    }),
  );
  return { ...m, rows };
}

/** Heuristic CSV/TSV → TableModel. Tabs win; otherwise commas are the split. */
function parseDelimited(text: string): TableModel {
  const hasTab = text.includes('\t');
  if (hasTab) return parseTSV(text);
  // Convert simple (unquoted) CSV to TSV so the shared parser handles padding
  // and trailing-newline rules. Quoted commas are uncommon in pasted ranges;
  // a lightweight unquote keeps the common case correct.
  const tsv = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => splitCsvLine(line).join('\t'))
    .join('\n');
  return parseTSV(tsv);
}

/** Split one CSV line honoring double-quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

const inBounds = (m: TableModel, pos: TableCellPos): boolean =>
  pos.row >= 0 &&
  pos.row < m.rows.length &&
  pos.col >= 0 &&
  pos.col < (m.rows[pos.row]?.length ?? 0);

const clampPos = (m: TableModel, pos: TableCellPos): TableCellPos => {
  const rows = m.rows.length;
  if (rows === 0) return { row: 0, col: 0 };
  const row = Math.max(0, Math.min(pos.row, rows - 1));
  const cols = m.rows[row].length;
  const col = Math.max(0, Math.min(pos.col, Math.max(0, cols - 1)));
  return { row, col };
};

export function TableEditor({ model, onModelChange }: TableEditorProps) {
  const labels = useSandboxLabels();
  // Undo/redo snapshot stacks of TableModel. The live model is the prop; these
  // hold history only (past = older snapshots, future = redo targets).
  const [past, setPast] = useState<TableModel[]>([]);
  const [future, setFuture] = useState<TableModel[]>([]);

  const [active, setActive] = useState<TableCellPos>({ row: 0, col: 0 });
  // Selection anchor; the range spans anchor..active. Null = single-cell.
  const [anchor, setAnchor] = useState<TableCellPos | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const cols = columnCount(model);

  /** Commit a new model, recording the current one for undo. */
  const commit = useCallback(
    (next: TableModel) => {
      setPast((p) => [...p, model]);
      setFuture([]);
      onModelChange(next);
    },
    [model, onModelChange],
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [model, ...f]);
      onModelChange(previous);
      return p.slice(0, -1);
    });
  }, [model, onModelChange]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, model]);
      onModelChange(next);
      return f.slice(1);
    });
  }, [model, onModelChange]);

  // --- Selection range derived from anchor..active --------------------------
  const range = useMemo(() => {
    const a = anchor ?? active;
    return {
      start: { row: Math.min(a.row, active.row), col: Math.min(a.col, active.col) },
      end: { row: Math.max(a.row, active.row), col: Math.max(a.col, active.col) },
    };
  }, [anchor, active]);

  const isSelected = (pos: TableCellPos): boolean =>
    pos.row >= range.start.row &&
    pos.row <= range.end.row &&
    pos.col >= range.start.col &&
    pos.col <= range.end.col;

  const activeCell: TableCell | undefined = inBounds(model, active)
    ? model.rows[active.row][active.col]
    : undefined;

  const canMerge =
    range.start.row !== range.end.row || range.start.col !== range.end.col;
  const canSplit =
    !!activeCell &&
    ((activeCell.colSpan ?? 1) > 1 ||
      (activeCell.rowSpan ?? 1) > 1 ||
      activeCell.hiddenBy !== undefined);

  const headerRowActive = active.row < (model.headerRowCount ?? 0);
  const headerColumnActive =
    !!activeCell && activeCell.isHeader === true && !headerRowActive;

  // --- Content / structure intents -----------------------------------------
  const handleContentChange = (pos: TableCellPos, content: string) => {
    commit(setCellContent(model, pos, content));
  };

  const handleAddRow = () => {
    commit(addRow(model, active.row + 1));
  };
  const handleRemoveRow = () => {
    if (model.rows.length <= 1) return;
    const next = removeRow(model, active.row);
    commit(next);
    setActive((a) => clampPos(next, a));
    setAnchor(null);
  };
  const handleAddColumn = () => {
    commit(addColumn(model, active.col + 1));
  };
  const handleRemoveColumn = () => {
    if (cols <= 1) return;
    const next = removeColumn(model, active.col);
    commit(next);
    setActive((a) => clampPos(next, a));
    setAnchor(null);
  };

  const handleMerge = () => {
    if (!canMerge) return;
    commit(mergeCells(model, range));
    setAnchor(null);
  };
  const handleSplit = () => {
    if (!canSplit) return;
    commit(unmergeCell(model, active));
  };

  const handleToggleHeaderRow = () => {
    // Toggle header coverage so it includes (or excludes) the active row.
    const current = model.headerRowCount ?? 0;
    const next = active.row < current ? active.row : active.row + 1;
    commit(setHeaderRows(model, next));
  };
  const handleToggleHeaderColumn = () => {
    commit(toggleHeaderColumn(model, active.col, !headerColumnActive));
  };
  const handleSetAlign = (align: TableCellAlign) => {
    commit(setAlignment(model, active, align, activeCell?.verticalAlign));
  };

  const handlePasteTsv = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = '';
    }
    if (!text.trim()) {
      const manual = window.prompt(labels.tableEditorPastePrompt);
      if (!manual) return;
      text = manual;
    }
    applyPaste(text);
  };

  const applyPaste = (text: string) => {
    const parsed = parseDelimited(text);
    if (parsed.rows.length === 0) return;
    const ok = window.confirm(labels.tableEditorPasteConfirm);
    if (!ok) return;
    commit(parsed);
    setActive({ row: 0, col: 0 });
    setAnchor(null);
  };

  const handleCellPaste = (_pos: TableCellPos, text: string) => {
    applyPaste(text);
  };

  // --- Navigation -----------------------------------------------------------
  const move = useCallback(
    (nav: CellNav, extend: boolean) => {
      // When extending, pin the anchor to the pre-move active cell so the range
      // grows from there; otherwise collapse the selection.
      if (extend) setAnchor((a) => a ?? active);
      setActive((cur) => {
        let row = cur.row;
        let col = cur.col;
        const rowLen = model.rows[row]?.length ?? 0;
        switch (nav) {
          case 'next':
            col += 1;
            if (col >= rowLen) {
              col = 0;
              row = Math.min(row + 1, model.rows.length - 1);
            }
            break;
          case 'prev':
            col -= 1;
            if (col < 0) {
              row = Math.max(row - 1, 0);
              col = Math.max(0, (model.rows[row]?.length ?? 1) - 1);
            }
            break;
          case 'up':
            row = Math.max(row - 1, 0);
            break;
          case 'down':
            row = Math.min(row + 1, model.rows.length - 1);
            break;
          case 'left':
            col = Math.max(col - 1, 0);
            break;
          case 'right':
            col = Math.min(col + 1, rowLen - 1);
            break;
        }
        return clampPos(model, { row, col });
      });
      if (!extend) setAnchor(null);
    },
    [model, active],
  );

  const handleFocus = (pos: TableCellPos) => {
    setActive(pos);
    setAnchor(null);
  };

  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const handleContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      redo();
    }
  };

  if (model.rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <TableEditorToolbar
          canMerge={false}
          canSplit={false}
          headerRowActive={false}
          headerColumnActive={false}
          activeAlign={undefined}
          onAddRow={() =>
            commit({ headerRowCount: 1, rows: [[{ content: '', isHeader: true }], [{ content: '' }]] })
          }
          onRemoveRow={() => {}}
          onAddColumn={() => {}}
          onRemoveColumn={() => {}}
          onMerge={() => {}}
          onSplit={() => {}}
          onToggleHeaderRow={() => {}}
          onToggleHeaderColumn={() => {}}
          onSetAlign={() => {}}
          onPasteTsv={handlePasteTsv}
        />
        <p className="text-xs" style={{ color: 'var(--slate)' }}>
          {labels.tableEditorEmpty}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onKeyDown={handleContainerKeyDown}
      className="flex flex-col gap-2"
    >
      <TableEditorToolbar
        canMerge={canMerge}
        canSplit={canSplit}
        headerRowActive={headerRowActive}
        headerColumnActive={headerColumnActive}
        activeAlign={activeCell?.align}
        onAddRow={handleAddRow}
        onRemoveRow={handleRemoveRow}
        onAddColumn={handleAddColumn}
        onRemoveColumn={handleRemoveColumn}
        onMerge={handleMerge}
        onSplit={handleSplit}
        onToggleHeaderRow={handleToggleHeaderRow}
        onToggleHeaderColumn={handleToggleHeaderColumn}
        onSetAlign={handleSetAlign}
        onPasteTsv={handlePasteTsv}
      />

      <div className="overflow-x-auto">
        <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
          <tbody>
            {model.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => {
                  if (cell.hiddenBy) return null;
                  const pos: TableCellPos = { row: r, col: c };
                  return (
                    <TableEditorCell
                      key={c}
                      cell={cell}
                      pos={pos}
                      active={active.row === r && active.col === c}
                      selected={canMerge && isSelected(pos)}
                      onContentChange={handleContentChange}
                      onFocus={handleFocus}
                      onNavigate={move}
                      onPaste={handleCellPaste}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--slate)' }}>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label={labels.tableEditorUndo}
          title={labels.tableEditorUndoTitle}
          style={{ background: 'none', border: 'none', padding: 0, cursor: canUndo ? 'pointer' : 'default', color: 'inherit', opacity: canUndo ? 1 : 0.4 }}
        >
          {labels.tableEditorUndo}
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label={labels.tableEditorRedo}
          title={labels.tableEditorRedoTitle}
          style={{ background: 'none', border: 'none', padding: 0, cursor: canRedo ? 'pointer' : 'default', color: 'inherit', opacity: canRedo ? 1 : 0.4 }}
        >
          {labels.tableEditorRedo}
        </button>
        <span aria-hidden="true">·</span>
        <span>
          {labels.tableEditorCellPosition.replace('__row__', String(active.row + 1)).replace('__col__', String(active.col + 1))}
        </span>
        <span aria-hidden="true">·</span>
        <span>{labels.tableEditorNavHelp}</span>
      </div>
    </div>
  );
}
