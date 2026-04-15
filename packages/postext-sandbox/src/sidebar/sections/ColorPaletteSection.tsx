'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { ColorPaletteEntry } from 'postext';
import { useSandbox } from '../../context/SandboxContext';
import { findPaletteUsages, unlinkPaletteRefs } from '../../context/paletteUtils';
import { CollapsibleSection, ColorPicker } from '../../controls';
import { ConfirmPopover } from '../../panels/ConfirmPopover';

function newEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `palette-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ColorPaletteSection() {
  const { state, dispatch } = useSandbox();
  const { config, labels } = state;
  const palette: ColorPaletteEntry[] = config.colorPalette ?? [];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const writePalette = (next: ColorPaletteEntry[]) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { colorPalette: next.length > 0 ? next : undefined },
    });
  };

  const addEntry = () => {
    const entry: ColorPaletteEntry = {
      id: newEntryId(),
      name: labels.colorPaletteNewEntry,
      value: { hex: '#000000', model: 'hex' },
    };
    writePalette([...palette, entry]);
    setDraftName(entry.name);
    setEditingId(entry.id);
  };

  const updateEntry = (id: string, partial: Partial<ColorPaletteEntry>) => {
    const next = palette.map((e) => (e.id === id ? { ...e, ...partial } : e));
    writePalette(next);
  };

  const removeEntry = (id: string) => {
    const unlinked = unlinkPaletteRefs(state.config, id);
    const nextPalette = palette.filter((e) => e.id !== id);
    dispatch({
      type: 'SET_CONFIG',
      payload: {
        ...unlinked,
        colorPalette: nextPalette.length > 0 ? nextPalette : undefined,
      },
    });
  };

  const beginEdit = (entry: ColorPaletteEntry) => {
    setDraftName(entry.name);
    setEditingId(entry.id);
  };

  const commitEdit = (id: string) => {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== palette.find((e) => e.id === id)?.name) {
      updateEntry(id, { name: trimmed });
    }
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  return (
    <CollapsibleSection
      title={labels.colorPalette}
      sectionId="color-palette"
      hasOverrides={palette.length > 0}
      onReset={() => writePalette([])}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      {palette.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.colorPaletteNone}
        </p>
      )}
      {palette.map((entry) => {
        const usages = findPaletteUsages(state.config, entry.id, labels);
        const isEditing = editingId === entry.id;
        const confirmMessage = (
          <>
            <div style={{ fontWeight: 500, marginBottom: usages.length > 0 ? 6 : 0 }}>
              {labels.colorPaletteDeleteConfirm}
            </div>
            {usages.length > 0 && (
              <>
                <div style={{ color: 'var(--slate)', marginBottom: 4 }}>
                  {labels.colorPaletteDeleteInUse}
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, marginBottom: 6 }}>
                  {usages.map((u, i) => (
                    <li key={i} style={{ fontSize: 11, lineHeight: '15px' }}>
                      {u}
                    </li>
                  ))}
                </ul>
                <div style={{ color: 'var(--slate)', fontSize: 11, lineHeight: '14px' }}>
                  {labels.colorPaletteDeleteInUseNote}
                </div>
              </>
            )}
          </>
        );

        return (
          <div key={entry.id} className="mb-2 flex items-center gap-1">
            {isEditing ? (
              <input
                type="text"
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitEdit(entry.id);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                onBlur={() => commitEdit(entry.id)}
                placeholder={labels.colorPaletteEntryName}
                aria-label={labels.colorPaletteEntryName}
                className="min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs"
                style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => beginEdit(entry)}
                  aria-label={labels.colorPaletteEditName}
                  title={labels.colorPaletteEditName}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                  style={{ color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
                >
                  <Pencil size={11} aria-hidden="true" />
                </button>
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  style={{ color: 'var(--foreground)' }}
                  title={entry.name}
                >
                  {entry.name}
                </span>
              </>
            )}
            <ColorPicker
              label=""
              value={entry.value}
              onChange={(value) => updateEntry(entry.id, { value })}
              disablePalette
              hideLabel
              className="flex items-center gap-1.5"
              fieldId={`palette-${entry.id}`}
            />
            <ConfirmPopover message={confirmMessage} onConfirm={() => removeEntry(entry.id)}>
              {({ open }) => (
                <button
                  type="button"
                  onClick={open}
                  aria-label={labels.colorPaletteRemove}
                  title={labels.colorPaletteRemove}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                  style={{ color: 'var(--destructive)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              )}
            </ConfirmPopover>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addEntry}
        className="mt-1 flex items-center gap-1 rounded border px-2 py-1 text-xs"
        style={{
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: 'var(--foreground)',
          cursor: 'pointer',
        }}
      >
        <Plus size={12} aria-hidden="true" />
        {labels.colorPaletteAdd}
      </button>
    </CollapsibleSection>
  );
}
