'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ColorPaletteEntry } from 'postext';
import { useSandbox } from '../../context/SandboxContext';
import { unlinkPaletteRefs } from '../../context/paletteUtils';
import { CollapsibleSection, ColorPicker } from '../../controls';

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
      {palette.map((entry) => (
        <div
          key={entry.id}
          className="mb-2 rounded border p-2"
          style={{ borderColor: 'var(--rule)' }}
        >
          <div className="mb-1 flex items-center gap-1">
            <input
              type="text"
              value={entry.name}
              onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
              placeholder={labels.colorPaletteEntryName}
              aria-label={labels.colorPaletteEntryName}
              className="flex-1 rounded border bg-transparent px-1.5 py-1 text-xs"
              style={{ borderColor: 'var(--rule)', color: 'var(--foreground)' }}
            />
            <button
              type="button"
              onClick={() => removeEntry(entry.id)}
              aria-label={labels.colorPaletteRemove}
              title={labels.colorPaletteRemove}
              className="flex h-6 w-6 items-center justify-center rounded"
              style={{ color: 'var(--slate)', cursor: 'pointer' }}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
          <ColorPicker
            label=""
            value={entry.value}
            onChange={(value) => updateEntry(entry.id, { value })}
            disablePalette
            fieldId={`palette-${entry.id}`}
          />
        </div>
      ))}
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

