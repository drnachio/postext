'use client';

import { memo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ChipStyleConfig, DimensionUnit, ResolvedBodyTextConfig, ResolvedChipStyleConfig } from 'postext';
import { DEFAULT_CHIP_STYLES, resolveBodyTextConfig, resolveChipStylesConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { CollapsibleSection, ColorPicker, DimensionInput, FontPicker, ToggleSwitch } from '../../controls';
import { Button, ConfirmPopover, IconButton } from '../../ui';
import { FieldRow } from '../../controls/FieldRow';
import { SearchScope } from '../search/SearchScope';

const FONT_SIZE_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const BOX_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const BORDER_UNITS: DimensionUnit[] = ['pt', 'px'];

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--rule)', color: 'var(--foreground)' } as const;

/** Turn free text into a `:chip[…]{style="…"}`-friendly id. */
function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nextStyleId(existing: ChipStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`chip-${n}`)) n++;
  return `chip-${n}`;
}

interface ChipStyleCardProps {
  style: ChipStyleConfig;
  resolved: ResolvedChipStyleConfig;
  /** The body text — what the inherited text fields show while unset. */
  bodyText: ResolvedBodyTextConfig;
  otherIds: Set<string>;
  /** Whether the style is stored in the config (the built-in style shown
   *  while the config has no list is not an override). */
  stored: boolean;
  onChange: (partial: Partial<ChipStyleConfig>) => void;
  onResetField: (field: keyof ChipStyleConfig) => void;
  onRename: (nextId: string) => void;
  onRemove: () => void;
}

/** One chip style: id (renamed on blur / Enter, never to a colliding id),
 *  display name, the text (family, size, colour, weight, slant — inherited
 *  from the surrounding text while unset) and the box (fill, outline,
 *  radius, padding, gap). */
function ChipStyleCard({ style, resolved, bodyText, otherIds, stored, onChange, onResetField, onRename, onRemove }: ChipStyleCardProps) {
  const labels = useSandboxLabels();
  const [idDraft, setIdDraft] = useState(style.id);
  const draftSlug = slugifyStyleId(idDraft);
  const idTaken = draftSlug.length > 0 && draftSlug !== style.id && otherIds.has(draftSlug);
  const idEmpty = draftSlug.length === 0;

  const commitId = () => {
    if (idEmpty || idTaken) {
      setIdDraft(style.id);
      return;
    }
    setIdDraft(draftSlug);
    if (draftSlug !== style.id) onRename(draftSlug);
  };

  const unset = (field: keyof ChipStyleConfig) => style[field] === undefined;
  const sectionId = `chipStyles.${style.id}`;

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden={stored}>
    <div className="mb-3 rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="truncate text-xs font-medium" style={{ color: 'var(--foreground)' }} title={style.name ?? style.id}>
          {style.name || style.id}
        </span>
        <ConfirmPopover message={labels.chipStyleDeleteConfirm} onConfirm={onRemove}>
          {({ open }) => (
            <IconButton label={labels.chipStyleDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
          )}
        </ConfirmPopover>
      </div>

      <div className="mb-2 flex flex-col gap-2">
        <FieldRow
          stacked
          label={labels.idLabel}
          hint={idTaken ? labels.chipStyleIdHintDuplicate : labels.chipStyleUsageHint.replace('__id__', style.id)}
          className="mb-0"
        >
          <input
            type="text"
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
            onBlur={commitId}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label={labels.chipStyleIdAria}
            className={inputClass}
            style={{ ...inputStyle, borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)' }}
          />
        </FieldRow>
        <FieldRow stacked label={labels.chipStyleNameLabel} className="mb-0">
          <input
            type="text"
            value={style.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value.length > 0 ? e.target.value : undefined })}
            aria-label={labels.chipStyleNameAria}
            placeholder={style.id}
            className={inputClass}
            style={inputStyle}
          />
        </FieldRow>
      </div>

      <CollapsibleSection title={labels.chipStyleTextGroup} sectionId={`${sectionId}.text`} variant="subsection">
        <FontPicker
          label={labels.fontLabel}
          value={resolved.fontFamily ?? bodyText.fontFamily}
          onChange={(v) => onChange({ fontFamily: v })}
          isDefault={unset('fontFamily')}
          onReset={() => onResetField('fontFamily')}
          searchPlaceholder={labels.bodyFontSearch}
          noResultsLabel={labels.bodyFontNoResults}
        />
        <DimensionInput
          label={labels.sizeLabel}
          value={resolved.fontSize ?? { value: 1, unit: 'em' }}
          onChange={(v) => onChange({ fontSize: v })}
          min={0.1}
          step={0.05}
          units={FONT_SIZE_UNITS}
          tooltip={labels.chipStyleFontSizeTooltip}
          isDefault={unset('fontSize')}
          onReset={() => onResetField('fontSize')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={resolved.color ?? bodyText.color}
          onChange={(v) => onChange({ color: v })}
          tooltip={labels.chipStyleColorTooltip}
          isDefault={unset('color')}
          onReset={() => onResetField('color')}
          fieldId={`chipStyle-${style.id}-color`}
        />
        <ToggleSwitch
          label={labels.bold}
          checked={resolved.bold}
          onChange={(v) => onChange({ bold: v })}
          isDefault={unset('bold')}
          onReset={() => onResetField('bold')}
        />
        <ToggleSwitch
          label={labels.italic}
          checked={resolved.italic}
          onChange={(v) => onChange({ italic: v })}
          isDefault={unset('italic')}
          onReset={() => onResetField('italic')}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.chipStyleBoxGroup} sectionId={`${sectionId}.box`} variant="subsection">
        <ToggleSwitch
          label={labels.chipStyleBackground}
          checked={resolved.backgroundEnabled}
          onChange={(v) => onChange({ backgroundEnabled: v })}
          isDefault={unset('backgroundEnabled')}
          onReset={() => onResetField('backgroundEnabled')}
        />
        {resolved.backgroundEnabled && (
          <ColorPicker
            label={labels.chipStyleBackgroundColor}
            value={resolved.background}
            onChange={(v) => onChange({ background: v })}
            isDefault={unset('background')}
            onReset={() => onResetField('background')}
            fieldId={`chipStyle-${style.id}-background`}
          />
        )}
        <DimensionInput
          label={labels.chipStyleBorderWidth}
          value={resolved.borderWidth}
          onChange={(v) => onChange({ borderWidth: v })}
          min={0}
          step={0.25}
          units={BORDER_UNITS}
          tooltip={labels.chipStyleBorderWidthTooltip}
          isDefault={unset('borderWidth')}
          onReset={() => onResetField('borderWidth')}
        />
        {resolved.borderWidth.value > 0 && (
          <ColorPicker
            label={labels.chipStyleBorderColor}
            value={resolved.borderColor}
            onChange={(v) => onChange({ borderColor: v })}
            isDefault={unset('borderColor')}
            onReset={() => onResetField('borderColor')}
            fieldId={`chipStyle-${style.id}-borderColor`}
          />
        )}
        <DimensionInput
          label={labels.chipStyleBorderRadius}
          value={resolved.borderRadius}
          onChange={(v) => onChange({ borderRadius: v })}
          min={0}
          step={0.05}
          units={BOX_UNITS}
          tooltip={labels.chipStyleBorderRadiusTooltip}
          isDefault={unset('borderRadius')}
          onReset={() => onResetField('borderRadius')}
        />
        <DimensionInput
          label={labels.chipStylePaddingX}
          value={resolved.paddingX}
          onChange={(v) => onChange({ paddingX: v })}
          min={0}
          step={0.05}
          units={BOX_UNITS}
          isDefault={unset('paddingX')}
          onReset={() => onResetField('paddingX')}
        />
        <DimensionInput
          label={labels.chipStylePaddingY}
          value={resolved.paddingY}
          onChange={(v) => onChange({ paddingY: v })}
          min={0}
          step={0.05}
          units={BOX_UNITS}
          tooltip={labels.chipStylePaddingYTooltip}
          isDefault={unset('paddingY')}
          onReset={() => onResetField('paddingY')}
        />
        <DimensionInput
          label={labels.chipStyleGap}
          value={resolved.gap}
          onChange={(v) => onChange({ gap: v })}
          min={0}
          step={0.05}
          units={BOX_UNITS}
          tooltip={labels.chipStyleGapTooltip}
          isDefault={unset('gap')}
          onReset={() => onResetField('gap')}
        />
      </CollapsibleSection>
    </div>
    </SearchScope>
  );
}

/** Config-panel section for the named chip styles selected by the inline
 *  `:chip[text]{style="…"}` (`config.chipStyles`). While the config has no
 *  list, the built-in `chip` style is shown so it can be edited in place. */
export const ChipStylesSection = memo(function ChipStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.chipStyles);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: ChipStyleConfig[] = raw ?? DEFAULT_CHIP_STYLES;
  const resolved = resolveChipStylesConfig(styles);

  const write = (next: ChipStyleConfig[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { chipStyles: next.length > 0 ? next : undefined } });
  };

  const addStyle = () => {
    write([...styles, { id: nextStyleId(styles), name: labels.chipStyleNewName }]);
  };

  const updateStyle = (id: string, partial: Partial<ChipStyleConfig>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof ChipStyleConfig) => {
    write(
      styles.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s };
        delete next[field];
        return next;
      }),
    );
  };

  const renameStyle = (id: string, nextId: string) => {
    if (styles.some((s) => s.id === nextId)) return;
    write(styles.map((s) => (s.id === id ? { ...s, id: nextId } : s)));
  };

  const removeStyle = (id: string) => {
    write(styles.filter((s) => s.id !== id));
  };

  return (
    <CollapsibleSection
      title={labels.chipStylesSection}
      sectionId="chipStyles"
      hasOverrides={raw !== undefined}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { chipStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.chipStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.chipStylesEmpty}
        </p>
      )}
      {styles.map((style, i) => (
        <ChipStyleCard
          key={style.id}
          style={style}
          resolved={resolved[i] ?? resolveChipStylesConfig([style])[0]!}
          bodyText={bodyText}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          stored={raw !== undefined}
          onChange={(partial) => updateStyle(style.id, partial)}
          onResetField={(field) => resetStyleField(style.id, field)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.chipStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
