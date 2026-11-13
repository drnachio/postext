'use client';

import { memo, useState } from 'react';
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { ColorPaletteEntry } from 'postext';
import { cloneDefaultColorPalette, isDefaultColorPalette } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { findPaletteUsages, unlinkPaletteRefs } from '../../../context/paletteUtils.js';
import { CollapsibleSection, ColorPicker } from '../../../controls/index.js';
import { Button, ConfirmPopover, IconButton, Menu, MenuItem } from '../../../ui/index.js';
import { SPECIAL_INK_PRESETS, finishText, specialInkEntry, type SpecialInkPreset } from '../../../controls/color/inkFinish.js';
import { SearchScope } from '../../search/SearchScope.js';

function newEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `palette-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const ColorPaletteSection = memo(function ColorPaletteSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
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

  // A special ink (#1570): a spot colour with its finish, named in the
  // interface's language as a printer would understand it.
  const addSpecialInk = (preset: SpecialInkPreset) => {
    writePalette([...palette, specialInkEntry(preset, labels[preset.labelKey], newEntryId(), palette)]);
  };

  const updateEntry = (id: string, partial: Partial<ColorPaletteEntry>) => {
    const next = palette.map((e) => (e.id === id ? { ...e, ...partial } : e));
    writePalette(next);
  };

  const removeEntry = (id: string) => {
    const unlinked = unlinkPaletteRefs(config, id);
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
      hasOverrides={!isDefaultColorPalette(palette)}
      onReset={() => writePalette(cloneDefaultColorPalette())}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      {palette.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.colorPaletteNone}
        </p>
      )}
      {palette.map((entry) => {
        const usages = findPaletteUsages(config, entry.id, labels);
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
                <ul style={{ margin: 0, paddingInlineStart: 16, marginBottom: 6 }}>
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
          <SearchScope key={entry.id} title={entry.name} overridden={!isDefaultColorPalette(palette)}>
          <div className="mb-2 flex items-center gap-1">
            {isEditing ? (
              <input
                dir="auto"
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
                <IconButton label={labels.colorPaletteEditName} icon={<Pencil size={11} />} onClick={() => beginEdit(entry)} />
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
              fieldId={`palette-${entry.id}`}
            />
            <ConfirmPopover message={confirmMessage} onConfirm={() => removeEntry(entry.id)}>
              {({ open }) => (
                <IconButton label={labels.colorPaletteRemove} icon={<Trash2 size={13} />} destructive onClick={open} />
              )}
            </ConfirmPopover>
          </div>
          </SearchScope>
        );
      })}
      <div className="mt-1 flex flex-wrap gap-1">
        <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addEntry}>
          {labels.colorPaletteAdd}
        </Button>
        <Menu side="bottom" align="start" trigger={<Button variant="outline" size="xs" icon={<Sparkles size={12} aria-hidden="true" />}>{labels.colorPaletteAddSpecial}</Button>}>
          {SPECIAL_INK_PRESETS.map((preset) => (
            <MenuItem key={preset.id} onClick={() => addSpecialInk(preset)} title={finishText(preset.finish, labels)}
              icon={<span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 6, border: '1px solid var(--rule)', backgroundColor: preset.hex }} />}>
              {labels[preset.labelKey]}
            </MenuItem>
          ))}
        </Menu>
      </div>
    </CollapsibleSection>
  );
});
