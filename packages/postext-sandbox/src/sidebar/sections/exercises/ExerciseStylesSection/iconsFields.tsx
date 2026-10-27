'use client';

// The icon fields of an exercise style and the icon id input they use
// (#1276: split out of ExerciseStylesSection.tsx).
import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import type { ExerciseIcon, ResolvedBodyTextConfig, Resource } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { SelectInput, TextInput, FontPicker, ColorPicker, NumberInput } from '../../../../controls/index.js';
import { IconButton, Button } from '../../../../ui/index.js';
import { uniqueId, slugifyStyleId, inputClass, inputStyle } from './shared.js';

interface IconsFieldsProps {
  icons: Record<string, ExerciseIcon> | undefined;
  bodyText: ResolvedBodyTextConfig;
  iconResources: Resource[];
  fieldId: string;
  onChange: (icons: Record<string, ExerciseIcon>) => void;
}

/** The activity icons a style defines (`icon="oral"` on a fence): each an
 *  id with a character or a picture, its colour and what it stands for. */
export function IconsFields({ icons, bodyText, iconResources, fieldId, onChange }: IconsFieldsProps) {
  const labels = useSandboxLabels();
  const entries = Object.entries(icons ?? {});
  const write = (next: [string, ExerciseIcon][]) => onChange(Object.fromEntries(next));
  const setIcon = (id: string, partial: Partial<ExerciseIcon>) =>
    write(entries.map(([k, v]) => [k, k === id ? { ...v, ...partial } : v]));
  const resetIcon = (id: string, field: keyof ExerciseIcon) =>
    write(entries.map(([k, v]) => {
      if (k !== id) return [k, v];
      const next = { ...v };
      delete next[field];
      return [k, next];
    }));
  const renameIcon = (id: string, nextId: string) => {
    if (nextId === id || nextId.length === 0 || entries.some(([k]) => k === nextId)) return;
    write(entries.map(([k, v]) => [k === id ? nextId : k, v]));
  };
  const addIcon = () => {
    const id = uniqueId('icon', new Set(entries.map(([k]) => k)));
    write([...entries, [id, { glyph: '★' }]]);
  };
  const resourceOptions = (value: string | undefined) => {
    const out = [{ value: '', label: labels.exerciseStyleIconResourceNone }, ...iconResources.map((r) => ({ value: r.id, label: r.caption?.trim() ? `${r.caption.trim()} (${r.id})` : r.id }))];
    if (value && !iconResources.some((r) => r.id === value)) out.push({ value, label: value });
    return out;
  };

  return (
    <>
      <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>{labels.exerciseStyleIconsHint}</p>
      {entries.map(([id, icon]) => {
        const kind = icon.resourceId !== undefined ? 'resource' : 'glyph';
        const unsetIcon = (field: keyof ExerciseIcon) => icon[field] === undefined;
        return (
          <div key={id} className="mb-2 rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
            <div className="mb-1 flex items-center gap-1">
              <IconIdInput id={id} onRename={(next) => renameIcon(id, next)} />
              <IconButton label={labels.exerciseStyleIconDelete} icon={<Trash2 size={13} />} destructive onClick={() => write(entries.filter(([k]) => k !== id))} />
            </div>
            <SelectInput
              label={labels.exerciseStyleIconKind}
              value={kind}
              options={[
                { value: 'glyph', label: labels.exerciseStyleIconKindGlyph },
                { value: 'resource', label: labels.exerciseStyleIconKindResource },
              ]}
              onChange={(v) => {
                const next = { ...icon };
                if (v === 'resource') {
                  delete next.glyph;
                  delete next.fontFamily;
                  next.resourceId = iconResources[0]?.id ?? '';
                } else {
                  delete next.resourceId;
                  next.glyph = icon.glyph ?? '★';
                }
                write(entries.map(([k, val]) => [k, k === id ? next : val]));
              }}
              variant="segmented"
            />
            {kind === 'glyph' ? (
              <>
                <TextInput label={labels.exerciseStyleIconGlyph} value={icon.glyph ?? ''} onChange={(v) => setIcon(id, { glyph: v })} widthCh={4} />
                <FontPicker label={labels.fontLabel} value={icon.fontFamily ?? bodyText.fontFamily} onChange={(v) => setIcon(id, { fontFamily: v })} isDefault={unsetIcon('fontFamily')} onReset={() => resetIcon(id, 'fontFamily')} />
              </>
            ) : (
              <SelectInput
                label={labels.exerciseStyleIconResource}
                value={icon.resourceId ?? ''}
                options={resourceOptions(icon.resourceId)}
                onChange={(v) => setIcon(id, { resourceId: v })}
              />
            )}
            <ColorPicker label={labels.colorLabel} value={icon.color ?? bodyText.color} onChange={(v) => setIcon(id, { color: v })} fieldId={`${fieldId}-icon-${id}-color`} isDefault={unsetIcon('color')} onReset={() => resetIcon(id, 'color')} />
            <NumberInput label={labels.sizeLabel} value={icon.size ?? 0.75} onChange={(v) => setIcon(id, { size: v })} min={0.3} max={3} step={0.05} suffix="em" isDefault={unsetIcon('size')} onReset={() => resetIcon(id, 'size')} />
            <TextInput label={labels.exerciseStyleIconAlt} value={icon.alt ?? ''} onChange={(v) => (v === '' ? resetIcon(id, 'alt') : setIcon(id, { alt: v }))} tooltip={labels.exerciseStyleIconAltTooltip} isDefault={unsetIcon('alt')} onReset={() => resetIcon(id, 'alt')} />
          </div>
        );
      })}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addIcon}>
        {labels.exerciseStyleIconAdd}
      </Button>
    </>
  );
}

/** An icon's id, renamed on blur or Enter (never to an empty one). */
function IconIdInput({ id, onRename }: { id: string; onRename: (next: string) => void }) {
  const labels = useSandboxLabels();
  const [draft, setDraft] = useState(id);
  const commit = () => {
    const next = slugifyStyleId(draft);
    setDraft(next.length > 0 ? next : id);
    if (next.length > 0 && next !== id) onRename(next);
  };
  return (
    <input
      dir="ltr"
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      aria-label={labels.exerciseStyleIconId}
      className={inputClass}
      style={inputStyle}
    />
  );
}
