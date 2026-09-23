'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ClipboardPaste,
  Columns,
  FileCode,
  Image as ImageIcon,
  Merge,
  PaintBucket,
  Rows,
  Split,
  Trash2,
  X,
} from 'lucide-react';
import type { ColorValue, TableCellAlign, TableCellVerticalAlign } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext';
import { ColorPicker } from '../../../controls/ColorPicker';
import { Menu, MenuItem, MenuSeparator } from '../../../ui';

/** Fill offered when the active cell has none: white, the paper. */
const NO_FILL: ColorValue = { hex: '#ffffff', model: 'hex' };

/** An image-bearing resource the active cell can embed. */
export interface TableEditorImageOption {
  id: string;
  kind: 'bitmap' | 'svg';
}

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
  /** Current vertical alignment of the active cell. */
  activeVerticalAlign: TableCellVerticalAlign | undefined;
  onAddRow: () => void;
  onRemoveRow: () => void;
  onAddColumn: () => void;
  onRemoveColumn: () => void;
  onMerge: () => void;
  onSplit: () => void;
  onToggleHeaderRow: () => void;
  onToggleHeaderColumn: () => void;
  onSetAlign: (align: TableCellAlign) => void;
  onSetVerticalAlign: (verticalAlign: TableCellVerticalAlign) => void;
  onPasteTsv: () => void;
  /** Bitmap / SVG resources offered for embedding in the active cell. */
  imageOptions: TableEditorImageOption[];
  /** Resource id of the image embedded in the active cell, if any. */
  activeImageId: string | undefined;
  /** Embed the given resource in the active cell (`undefined` clears it). */
  onSetImage: (resourceId: string | undefined) => void;
  /** Fill colour of the active cell (`TableCell.background`), if any. */
  activeBackground: ColorValue | undefined;
  /** Set the active cell's fill (`undefined` clears it). */
  onSetBackground: (color: ColorValue | undefined) => void;
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
  activeVerticalAlign,
  onAddRow,
  onRemoveRow,
  onAddColumn,
  onRemoveColumn,
  onMerge,
  onSplit,
  onToggleHeaderRow,
  onToggleHeaderColumn,
  onSetAlign,
  onSetVerticalAlign,
  onPasteTsv,
  imageOptions,
  activeImageId,
  onSetImage,
  activeBackground,
  onSetBackground,
}: TableEditorToolbarProps) {
  const labels = useSandboxLabels();
  const iconSize = 13;
  const imageActive = activeImageId !== undefined;
  const fillActive = activeBackground !== undefined;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded border p-1"
      style={{ borderColor: 'var(--rule)' }}
    >
      <Group>
        <Btn label={labels.tableEditorAddRow} onClick={onAddRow}>
          <Rows size={iconSize} aria-hidden="true" />+
        </Btn>
        <Btn label={labels.tableEditorRemoveRow} onClick={onRemoveRow}>
          <Rows size={iconSize} aria-hidden="true" />
          <Trash2 size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn label={labels.tableEditorAddColumn} onClick={onAddColumn}>
          <Columns size={iconSize} aria-hidden="true" />+
        </Btn>
        <Btn label={labels.tableEditorRemoveColumn} onClick={onRemoveColumn}>
          <Columns size={iconSize} aria-hidden="true" />
          <Trash2 size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn label={labels.tableEditorMergeCells} onClick={onMerge} disabled={!canMerge}>
          <Merge size={iconSize} aria-hidden="true" />
        </Btn>
        <Btn label={labels.tableEditorSplitCell} onClick={onSplit} disabled={!canSplit}>
          <Split size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn
          label={labels.tableEditorToggleHeaderRow}
          onClick={onToggleHeaderRow}
          active={headerRowActive}
        >
          {labels.tableEditorHeaderRowShort}
        </Btn>
        <Btn
          label={labels.tableEditorToggleHeaderColumn}
          onClick={onToggleHeaderColumn}
          active={headerColumnActive}
        >
          {labels.tableEditorHeaderColumnShort}
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn
          label={labels.tableEditorAlignLeft}
          onClick={() => onSetAlign('left')}
          active={(activeAlign ?? 'left') === 'left'}
        >
          <AlignLeft size={iconSize} aria-hidden="true" />
        </Btn>
        <Btn
          label={labels.tableEditorAlignCenter}
          onClick={() => onSetAlign('center')}
          active={activeAlign === 'center'}
        >
          <AlignCenter size={iconSize} aria-hidden="true" />
        </Btn>
        <Btn
          label={labels.tableEditorAlignRight}
          onClick={() => onSetAlign('right')}
          active={activeAlign === 'right'}
        >
          <AlignRight size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn
          label={labels.tableEditorAlignTop}
          onClick={() => onSetVerticalAlign('top')}
          active={(activeVerticalAlign ?? 'top') === 'top'}
        >
          <AlignVerticalJustifyStart size={iconSize} aria-hidden="true" />
        </Btn>
        <Btn
          label={labels.tableEditorAlignMiddle}
          onClick={() => onSetVerticalAlign('middle')}
          active={activeVerticalAlign === 'middle'}
        >
          <AlignVerticalJustifyCenter size={iconSize} aria-hidden="true" />
        </Btn>
        <Btn
          label={labels.tableEditorAlignBottom}
          onClick={() => onSetVerticalAlign('bottom')}
          active={activeVerticalAlign === 'bottom'}
        >
          <AlignVerticalJustifyEnd size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Menu
          side="bottom"
          align="start"
          trigger={
            <button
              type="button"
              aria-label={labels.tableEditorImage}
              aria-pressed={imageActive}
              title={labels.tableEditorImage}
              className={btnBase}
              style={{
                color: 'var(--foreground)',
                background: imageActive ? 'var(--surface)' : 'none',
                border: '1px solid var(--rule)',
                cursor: 'pointer',
              }}
            >
              <ImageIcon size={iconSize} aria-hidden="true" />
            </button>
          }
        >
          <MenuItem onClick={() => onSetImage(undefined)} selected={!imageActive} disabled={!imageActive}>
            {labels.tableEditorImageNone}
          </MenuItem>
          <MenuSeparator />
          {imageOptions.length === 0 ? (
            <MenuItem disabled>{labels.tableEditorImageEmpty}</MenuItem>
          ) : (
            imageOptions.map((option) => (
              <MenuItem
                key={option.id}
                icon={option.kind === 'svg' ? <FileCode size={12} /> : <ImageIcon size={12} />}
                selected={option.id === activeImageId}
                onClick={() => onSetImage(option.id)}
              >
                {option.id}
              </MenuItem>
            ))
          )}
        </Menu>
      </Group>
      <Divider />
      <Group>
        <span
          className="flex items-center gap-1"
          title={labels.tableEditorCellBackground}
          aria-label={labels.tableEditorCellBackground}
          style={{ color: fillActive ? 'var(--foreground)' : 'var(--slate)' }}
        >
          <PaintBucket size={iconSize} aria-hidden="true" />
          <ColorPicker
            label={labels.tableEditorCellBackground}
            value={activeBackground ?? NO_FILL}
            onChange={onSetBackground}
            isDefault={!fillActive}
            hideLabel
          />
        </span>
        <Btn label={labels.tableEditorCellBackgroundNone} onClick={() => onSetBackground(undefined)} disabled={!fillActive}>
          <X size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
      <Divider />
      <Group>
        <Btn label={labels.tableEditorPasteAsTable} onClick={onPasteTsv}>
          <ClipboardPaste size={iconSize} aria-hidden="true" />
        </Btn>
      </Group>
    </div>
  );
}
