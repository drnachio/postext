'use client';

import type { TableModel } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext';

interface ColumnWidthsEditorProps {
  model: TableModel;
  /** Number of columns in the grid (the editor renders one input each). */
  columnCount: number;
  onModelChange: (next: TableModel) => void;
}

const inputStyle = {
  borderColor: 'var(--rule)',
  color: 'var(--foreground)',
  width: '100%',
  minWidth: 0,
} as const;

/** Relative column weights for a table resource (`TableModel.columnWidths`).
 *  One numeric input per column; the *equal widths* link unsets the array so
 *  the engine falls back to an equal split, and empty inputs mean no array yet.
 *  `addColumn` / `removeColumn` keep the array aligned with the grid, so this
 *  editor only has to deal with a stale length after a paste. */
export function ColumnWidthsEditor({ model, columnCount, onModelChange }: ColumnWidthsEditorProps) {
  const labels = useSandboxLabels();
  const widths = model.columnWidths;
  const aligned = widths !== undefined && widths.length === columnCount;
  const canClear = widths !== undefined;

  const setWidth = (col: number, raw: string) => {
    const base: number[] = aligned ? [...widths] : Array.from({ length: columnCount }, () => 1);
    const parsed = raw.trim() === '' ? 1 : Number(raw);
    base[col] = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    onModelChange({ ...model, columnWidths: base });
  };

  const clear = () => {
    if (model.columnWidths === undefined) return;
    const next: TableModel = { ...model };
    delete next.columnWidths;
    onModelChange(next);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span style={{ color: 'var(--slate)', fontSize: 11, lineHeight: '14px' }}>
          {labels.tableEditorColumnWidths}
        </span>
        <button
          type="button"
          onClick={clear}
          disabled={!canClear}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            fontSize: 11,
            color: 'inherit',
            cursor: canClear ? 'pointer' : 'default',
            opacity: canClear ? 1 : 0.4,
          }}
        >
          {labels.tableEditorColumnWidthsEqual}
        </button>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: columnCount }, (_, col) => {
          return (
            <input
              key={col}
              type="number"
              min={0.01}
              step={0.5}
              value={aligned ? String(widths[col]) : ''}
              placeholder="1"
              onChange={(e) => setWidth(col, e.target.value)}
              aria-label={labels.tableEditorColumnWidthAria.replace('__col__', String(col + 1))}
              className="rounded border bg-transparent px-1 py-0.5 text-xs"
              style={inputStyle}
            />
          );
        })}
      </div>
      <span style={{ color: 'var(--slate)', fontSize: 11, lineHeight: '14px' }} className="opacity-80">
        {labels.tableEditorColumnWidthsHint}
      </span>
    </div>
  );
}
