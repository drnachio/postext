'use client';

import { memo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CharacterStyleConfig, Dimension, DimensionUnit, ResolvedBodyTextConfig, ResolvedCharacterStyleConfig } from 'postext';
import { DEFAULT_MARK_STYLES, resolveBodyTextConfig, resolveCharacterStylesConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, ColorPicker, DimensionInput, FontPicker, NumberInput, SelectInput, ToggleSwitch } from '../../../controls/index.js';
import { Button, ConfirmPopover, IconButton } from '../../../ui/index.js';
import { FieldRow } from '../../../controls/FieldRow.js';
import { SearchScope } from '../../search/SearchScope.js';

const SIZE_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const EM_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

/** The value of the highlight-style select that names none. */
const NO_MARK = '';

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

const em = (value: number): Dimension => ({ value, unit: 'em' });

/** Turn free text into an id for `:span[…]{style="…"}`. */
function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nextStyleId(existing: CharacterStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`style-${n}`)) n++;
  return `style-${n}`;
}

interface CharacterStyleCardProps {
  style: CharacterStyleConfig;
  resolved: ResolvedCharacterStyleConfig;
  /** The body text — what the inherited text fields show while unset. */
  bodyText: ResolvedBodyTextConfig;
  otherIds: Set<string>;
  /** The book's highlight styles, which a character style can name. */
  marks: readonly { id: string; name?: string }[];
  onChange: (partial: Partial<CharacterStyleConfig>) => void;
  onResetField: (field: keyof CharacterStyleConfig) => void;
  onRename: (nextId: string) => void;
  onRemove: () => void;
}

/** One character style: id (renamed on blur / Enter, never to a colliding
 *  id), display name, the text (family, size, weight, slant, colour,
 *  tracking, capitals — inherited from the surrounding text while unset)
 *  and the highlight style it takes, if any (a band, a line under or
 *  through the words: the Highlights panel's). */
function CharacterStyleCard({ style, resolved, bodyText, otherIds, marks, onChange, onResetField, onRename, onRemove }: CharacterStyleCardProps) {
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

  const unset = (field: keyof CharacterStyleConfig) => style[field] === undefined;
  const sectionId = `characterStyles.${style.id}`;
  const markOptions = [
    { value: NO_MARK, label: labels.charStyleMarkNone },
    ...marks.map((m) => ({ value: m.id, label: m.name || m.id })),
  ];

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden>
    <div className="mb-3 rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="truncate text-xs font-medium" style={{ color: 'var(--foreground)' }} title={style.name ?? style.id}>
          {style.name || style.id}
        </span>
        <ConfirmPopover message={labels.charStyleDeleteConfirm} onConfirm={onRemove}>
          {({ open }) => (
            <IconButton label={labels.charStyleDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
          )}
        </ConfirmPopover>
      </div>

      <div className="mb-2 flex flex-col gap-2">
        <FieldRow
          stacked
          label={labels.idLabel} tooltip={labels.styleIdHelp}
          hint={idTaken ? labels.charStyleIdHintDuplicate : labels.charStyleUsageHint.replace('__id__', style.id)}
          className="mb-0"
        >
          <input
            dir="ltr"
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
            aria-label={labels.charStyleIdAria}
            className={inputClass}
            style={{ ...inputStyle, borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)' }}
          />
        </FieldRow>
        <FieldRow stacked label={labels.charStyleNameLabel} tooltip={labels.styleNameHelp} className="mb-0">
          <input
            dir="auto"
            type="text"
            value={style.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value.length > 0 ? e.target.value : undefined })}
            aria-label={labels.charStyleNameAria}
            placeholder={style.id}
            className={inputClass}
            style={inputStyle}
          />
        </FieldRow>
      </div>

      <CollapsibleSection title={labels.charStyleTextGroup} sectionId={`${sectionId}.text`} variant="subsection">
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
          value={resolved.fontSize ?? em(1)}
          onChange={(v) => onChange({ fontSize: v })}
          min={0.1}
          step={0.05}
          units={SIZE_UNITS}
          tooltip={labels.charStyleFontSizeTooltip}
          isDefault={unset('fontSize')}
          onReset={() => onResetField('fontSize')}
        />
        <NumberInput
          label={labels.charStyleWeight}
          value={resolved.fontWeight ?? 400}
          onChange={(v) => onChange({ fontWeight: v })}
          min={100}
          max={900}
          step={100}
          tooltip={labels.charStyleWeightTooltip}
          isDefault={unset('fontWeight')}
          onReset={() => onResetField('fontWeight')}
        />
        <ToggleSwitch
          label={labels.italic} tooltip={labels.italicHelp}
          checked={resolved.italic}
          onChange={(v) => onChange({ italic: v })}
          isDefault={unset('italic')}
          onReset={() => onResetField('italic')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={resolved.color ?? bodyText.color}
          onChange={(v) => onChange({ color: v })}
          tooltip={labels.charStyleColorTooltip}
          isDefault={unset('color')}
          onReset={() => onResetField('color')}
          fieldId={`charStyle-${style.id}-color`}
        />
        <DimensionInput
          label={labels.charStyleLetterSpacing}
          value={resolved.letterSpacing ?? em(0)}
          onChange={(v) => onChange({ letterSpacing: v })}
          min={-0.5}
          step={0.01}
          units={EM_UNITS}
          tooltip={labels.charStyleLetterSpacingTooltip}
          isDefault={unset('letterSpacing')}
          onReset={() => onResetField('letterSpacing')}
        />
        <ToggleSwitch
          label={labels.charStyleUppercase} tooltip={labels.charStyleUppercaseTooltip}
          checked={resolved.textTransform === 'uppercase'}
          onChange={(v) => onChange({ textTransform: v ? 'uppercase' : 'none' })}
          isDefault={unset('textTransform')}
          onReset={() => onResetField('textTransform')}
        />
        <ToggleSwitch
          label={labels.charStyleSmallCaps} tooltip={labels.charStyleSmallCapsTooltip}
          checked={resolved.smallCaps}
          onChange={(v) => onChange({ smallCaps: v })}
          isDefault={unset('smallCaps')}
          onReset={() => onResetField('smallCaps')}
        />
      </CollapsibleSection>

      <SelectInput
        label={labels.charStyleMark}
        value={resolved.mark ?? NO_MARK}
        options={markOptions}
        onChange={(v) => (v === NO_MARK ? onResetField('mark') : onChange({ mark: v }))}
        tooltip={labels.charStyleMarkTooltip}
        isDefault={unset('mark')}
        onReset={() => onResetField('mark')}
      />
    </div>
    </SearchScope>
  );
}

/** Config-panel section for the named character styles set on a run of
 *  words with `:span[some words]{style="id"}` (`config.characterStyles`,
 *  #1488). The book has none until one is added. */
export const CharacterStylesSection = memo(function CharacterStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.characterStyles);
  const markStyles = useSandboxSelector((s) => s.config.markStyles) ?? DEFAULT_MARK_STYLES;
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: CharacterStyleConfig[] = raw ?? [];
  const resolved = resolveCharacterStylesConfig(styles, new Set(markStyles.map((m) => m.id)));

  const write = (next: CharacterStyleConfig[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { characterStyles: next.length > 0 ? next : undefined } });
  };

  const addStyle = () => {
    write([...styles, { id: nextStyleId(styles), name: labels.charStyleNewName }]);
  };

  const updateStyle = (id: string, partial: Partial<CharacterStyleConfig>) => {
    write(styles.map((s) => {
      if (s.id !== id) return s;
      const next = { ...s, ...partial };
      for (const key of Object.keys(partial) as (keyof CharacterStyleConfig)[]) if (next[key] === undefined) delete next[key];
      return next;
    }));
  };

  const resetStyleField = (id: string, field: keyof CharacterStyleConfig) => {
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
      title={labels.characterStylesSection}
      sectionId="characterStyles"
      hasOverrides={raw !== undefined}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { characterStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.characterStylesResetConfirm}
    >
      <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
        {styles.length === 0 ? labels.characterStylesEmpty : labels.characterStylesIntro}
      </p>
      {styles.map((style, i) => (
        <CharacterStyleCard
          key={style.id}
          style={style}
          resolved={resolved[i] ?? resolveCharacterStylesConfig([style])[0]!}
          bodyText={bodyText}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          marks={markStyles}
          onChange={(partial) => updateStyle(style.id, partial)}
          onResetField={(field) => resetStyleField(style.id, field)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.charStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
