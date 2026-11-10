'use client';

import { memo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  CharacterStyleConfig,
  CharacterStyleHighlightConfig,
  CharacterStyleLineConfig,
  Dimension,
  DimensionUnit,
  ResolvedBodyTextConfig,
  ResolvedCharacterStyleConfig,
  ResolvedCharacterStyleLine,
} from 'postext';
import { DEFAULT_CHARACTER_STYLES, resolveBodyTextConfig, resolveCharacterStylesConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, ColorPicker, DimensionInput, FontPicker, NumberInput, SelectInput, ToggleSwitch } from '../../../controls/index.js';
import { Button, ConfirmPopover, IconButton } from '../../../ui/index.js';
import { FieldRow } from '../../../controls/FieldRow.js';
import { SearchScope } from '../../search/SearchScope.js';

const SIZE_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const EM_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

const em = (value: number): Dimension => ({ value, unit: 'em' });

/** Turn free text into a `[…]|id|`-friendly id. */
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

type LineKey = 'underline' | 'strike';

interface CharacterStyleCardProps {
  style: CharacterStyleConfig;
  resolved: ResolvedCharacterStyleConfig;
  /** The body text — what the inherited text fields show while unset. */
  bodyText: ResolvedBodyTextConfig;
  otherIds: Set<string>;
  /** Whether the style is stored in the config (the built-in styles shown
   *  while the config has no list are not overrides). */
  stored: boolean;
  onChange: (partial: Partial<CharacterStyleConfig>) => void;
  onResetField: (field: keyof CharacterStyleConfig) => void;
  onRename: (nextId: string) => void;
  onRemove: () => void;
}

/** One character style: id (renamed on blur / Enter, never to a colliding
 *  id), display name, the text (family, size, weight, slant, colour,
 *  tracking, capitals — inherited from the surrounding text while unset),
 *  the underline, the highlighter band and the strike-through. */
function CharacterStyleCard({ style, resolved, bodyText, otherIds, stored, onChange, onResetField, onRename, onRemove }: CharacterStyleCardProps) {
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

  // The built-in styles shown while the book stores none are no changes.
  const unset = (field: keyof CharacterStyleConfig) => !stored || style[field] === undefined;
  const sectionId = `characterStyles.${style.id}`;

  // A decoration's fields live in a nested object: set or drop one of them.
  const setLine = (key: LineKey, partial: Partial<CharacterStyleLineConfig>) => onChange({ [key]: { ...style[key], ...partial } });
  const resetLine = (key: LineKey, field: keyof CharacterStyleLineConfig) => {
    const next = { ...style[key] };
    delete next[field];
    onChange({ [key]: Object.keys(next).length > 0 ? next : undefined });
  };
  const setBand = (partial: Partial<CharacterStyleHighlightConfig>) => onChange({ highlight: { ...style.highlight, ...partial } });
  const resetBand = (field: keyof CharacterStyleHighlightConfig) => {
    const next = { ...style.highlight };
    delete next[field];
    onChange({ highlight: Object.keys(next).length > 0 ? next : undefined });
  };

  const lineStyles = [
    { value: 'solid', label: labels.charStyleLineSolid },
    { value: 'double', label: labels.charStyleLineDouble },
    { value: 'dotted', label: labels.charStyleLineDotted },
    { value: 'dashed', label: labels.charStyleLineDashed },
    { value: 'wavy', label: labels.charStyleLineWavy },
  ];

  const lineFields = (key: LineKey, line: ResolvedCharacterStyleLine) => {
    const own = style[key] ?? {};
    const lineUnset = (field: keyof CharacterStyleLineConfig) => !stored || own[field] === undefined;
    return (
      <>
        <ToggleSwitch
          label={labels.charStyleLineEnabled}
          tooltip={key === 'underline' ? labels.charStyleUnderlineEnabledTooltip : labels.charStyleStrikeEnabledTooltip}
          checked={line.enabled}
          onChange={(v) => setLine(key, { enabled: v })}
          isDefault={lineUnset('enabled')}
          onReset={() => resetLine(key, 'enabled')}
        />
        {line.enabled && (
          <>
            <SelectInput
              label={labels.charStyleLineStyle}
              value={line.style}
              options={lineStyles}
              onChange={(v) => setLine(key, { style: v as CharacterStyleLineConfig['style'] })}
              isDefault={lineUnset('style')}
              onReset={() => resetLine(key, 'style')}
            />
            <ColorPicker
              label={labels.colorLabel}
              value={line.color ?? resolved.color ?? bodyText.color}
              onChange={(v) => setLine(key, { color: v })}
              tooltip={labels.charStyleLineColorTooltip}
              isDefault={lineUnset('color')}
              onReset={() => resetLine(key, 'color')}
              fieldId={`charStyle-${style.id}-${key}-color`}
            />
            <NumberInput
              label={labels.charStyleOpacity}
              value={line.opacity}
              onChange={(v) => setLine(key, { opacity: v })}
              min={0}
              max={100}
              step={5}
              suffix="%"
              tooltip={labels.charStyleOpacityTooltip}
              isDefault={lineUnset('opacity')}
              onReset={() => resetLine(key, 'opacity')}
            />
            <DimensionInput
              label={labels.charStyleThickness}
              value={line.thickness}
              onChange={(v) => setLine(key, { thickness: v })}
              min={0.01}
              step={0.01}
              units={EM_UNITS}
              isDefault={lineUnset('thickness')}
              onReset={() => resetLine(key, 'thickness')}
            />
            <DimensionInput
              label={key === 'underline' ? labels.charStyleUnderlineOffset : labels.charStyleStrikeOffset}
              value={line.offset}
              onChange={(v) => setLine(key, { offset: v })}
              min={-2}
              step={0.01}
              units={EM_UNITS}
              tooltip={key === 'underline' ? labels.charStyleUnderlineOffsetTooltip : labels.charStyleStrikeOffsetTooltip}
              isDefault={lineUnset('offset')}
              onReset={() => resetLine(key, 'offset')}
            />
            <ToggleSwitch
              label={labels.charStyleSkipSpaces}
              tooltip={labels.charStyleSkipSpacesTooltip}
              checked={line.skipSpaces}
              onChange={(v) => setLine(key, { skipSpaces: v })}
              isDefault={lineUnset('skipSpaces')}
              onReset={() => resetLine(key, 'skipSpaces')}
            />
          </>
        )}
      </>
    );
  };

  const band = resolved.highlight;
  const ownBand = style.highlight ?? {};
  const bandUnset = (field: keyof CharacterStyleHighlightConfig) => !stored || ownBand[field] === undefined;

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden={stored}>
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

      <CollapsibleSection title={labels.charStyleHighlightGroup} sectionId={`${sectionId}.highlight`} variant="subsection" hasOverrides={stored && style.highlight !== undefined}>
        <ToggleSwitch
          label={labels.charStyleLineEnabled}
          tooltip={labels.charStyleHighlightEnabledTooltip}
          checked={band.enabled}
          onChange={(v) => setBand({ enabled: v })}
          isDefault={bandUnset('enabled')}
          onReset={() => resetBand('enabled')}
        />
        {band.enabled && (
          <>
            <div className="mb-2 flex flex-wrap gap-1">
              <Button variant="outline" size="xs" onClick={() => setBand({ bottom: em(-0.12), top: em(0.45) })}>
                {labels.charStyleHighlightPresetLow}
              </Button>
              <Button variant="outline" size="xs" onClick={() => setBand({ bottom: em(-0.2), top: em(0.8) })}>
                {labels.charStyleHighlightPresetFull}
              </Button>
              <Button variant="outline" size="xs" onClick={() => setBand({ bottom: em(-0.15), top: em(0.05) })}>
                {labels.charStyleHighlightPresetUnder}
              </Button>
            </div>
            <ColorPicker
              label={labels.colorLabel}
              value={band.color}
              onChange={(v) => setBand({ color: v })}
              isDefault={bandUnset('color')}
              onReset={() => resetBand('color')}
              fieldId={`charStyle-${style.id}-highlight-color`}
            />
            <NumberInput
              label={labels.charStyleOpacity}
              value={band.opacity}
              onChange={(v) => setBand({ opacity: v })}
              min={0}
              max={100}
              step={5}
              suffix="%"
              tooltip={labels.charStyleHighlightOpacityTooltip}
              isDefault={bandUnset('opacity')}
              onReset={() => resetBand('opacity')}
            />
            <DimensionInput
              label={labels.charStyleHighlightBottom}
              value={band.bottom}
              onChange={(v) => setBand({ bottom: v })}
              min={-2}
              step={0.01}
              units={EM_UNITS}
              tooltip={labels.charStyleHighlightBottomTooltip}
              isDefault={bandUnset('bottom')}
              onReset={() => resetBand('bottom')}
            />
            <DimensionInput
              label={labels.charStyleHighlightTop}
              value={band.top}
              onChange={(v) => setBand({ top: v })}
              min={-2}
              step={0.01}
              units={EM_UNITS}
              tooltip={labels.charStyleHighlightTopTooltip}
              isDefault={bandUnset('top')}
              onReset={() => resetBand('top')}
            />
            <DimensionInput
              label={labels.charStyleHighlightOverhang}
              value={band.overhang}
              onChange={(v) => setBand({ overhang: v })}
              min={0}
              step={0.01}
              units={EM_UNITS}
              tooltip={labels.charStyleHighlightOverhangTooltip}
              isDefault={bandUnset('overhang')}
              onReset={() => resetBand('overhang')}
            />
            <DimensionInput
              label={labels.charStyleHighlightRadius}
              value={band.radius}
              onChange={(v) => setBand({ radius: v })}
              min={0}
              step={0.01}
              units={EM_UNITS}
              isDefault={bandUnset('radius')}
              onReset={() => resetBand('radius')}
            />
            <NumberInput
              label={labels.charStyleHighlightRough}
              value={band.rough}
              onChange={(v) => setBand({ rough: v })}
              min={0}
              max={100}
              step={5}
              tooltip={labels.charStyleHighlightRoughTooltip}
              isDefault={bandUnset('rough')}
              onReset={() => resetBand('rough')}
            />
            <ToggleSwitch
              label={labels.charStyleSkipSpaces}
              tooltip={labels.charStyleSkipSpacesTooltip}
              checked={band.skipSpaces}
              onChange={(v) => setBand({ skipSpaces: v })}
              isDefault={bandUnset('skipSpaces')}
              onReset={() => resetBand('skipSpaces')}
            />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.charStyleUnderlineGroup} sectionId={`${sectionId}.underline`} variant="subsection" hasOverrides={stored && style.underline !== undefined}>
        {lineFields('underline', resolved.underline)}
      </CollapsibleSection>

      <CollapsibleSection title={labels.charStyleStrikeGroup} sectionId={`${sectionId}.strike`} variant="subsection" hasOverrides={stored && style.strike !== undefined}>
        {lineFields('strike', resolved.strike)}
      </CollapsibleSection>
    </div>
    </SearchScope>
  );
}

/** Config-panel section for the named character styles set on a run of
 *  words with `[some words]|id|` (`config.characterStyles`). While the
 *  config has no list, the built-in styles are shown so they can be edited
 *  in place. */
export const CharacterStylesSection = memo(function CharacterStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.characterStyles);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: CharacterStyleConfig[] = raw ?? DEFAULT_CHARACTER_STYLES;
  const resolved = resolveCharacterStylesConfig(styles);

  const write = (next: CharacterStyleConfig[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { characterStyles: next } });
  };

  const addStyle = () => {
    write([...styles, { id: nextStyleId(styles), name: labels.charStyleNewName, highlight: { enabled: true } }]);
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
          stored={raw !== undefined}
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
