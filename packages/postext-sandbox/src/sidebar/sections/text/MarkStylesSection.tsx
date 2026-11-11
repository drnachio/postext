'use client';

import { memo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { DimensionUnit, MarkDecorationBreak, MarkLineConfig, MarkLinePosition, MarkLineStyle, MarkStyleConfig, ResolvedBodyTextConfig, ResolvedMarkStyleConfig } from 'postext';
import { DEFAULT_MARK_STYLES, resolveBodyTextConfig, resolveMarkStylesConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, ItemCard, ItemCardListActions, moveCardState, openCard, ColorPicker, DimensionInput, NumberInput, SelectInput, ToggleSwitch } from '../../../controls/index.js';
import { Button, ConfirmPopover, IconButton } from '../../../ui/index.js';
import { FieldRow } from '../../../controls/FieldRow.js';
import { SearchScope } from '../../search/SearchScope.js';

const BOX_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

/** The value of the line select that draws none. */
const NO_LINE = 'none';

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

/** Turn free text into a `:mark[…]{style="…"}`-friendly id. */
function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nextStyleId(existing: MarkStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`mark-${n}`)) n++;
  return `mark-${n}`;
}

interface MarkStyleCardProps {
  style: MarkStyleConfig;
  resolved: ResolvedMarkStyleConfig;
  /** The body text: what the text colour shows while unset. */
  bodyText: ResolvedBodyTextConfig;
  otherIds: Set<string>;
  /** Whether the style is stored in the config (the built-in style shown
   *  while the config has no list is not an override). */
  stored: boolean;
  onChange: (partial: Partial<MarkStyleConfig>) => void;
  onResetField: (field: keyof MarkStyleConfig) => void;
  onRename: (nextId: string) => void;
  onRemove: () => void;
}

/** One highlight style (#888): id (renamed on blur / Enter, never to a
 *  colliding id), display name, the band (on or off, colour, opacity,
 *  hand-drawn edges, corner radius, padding, negative at the top or bottom
 *  for a band over part of the letters), the colour of the marked words and
 *  the line drawn with them, under or through (#1488). */
function MarkStyleCard({ style, resolved, bodyText, otherIds, stored, onChange, onResetField, onRename, onRemove }: MarkStyleCardProps) {
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

  const unset = (field: keyof MarkStyleConfig) => style[field] === undefined;
  const line = style.line;
  const lineUnset = (field: keyof MarkLineConfig) => line?.[field] === undefined;
  /** Merge `partial` into the line; a field set to undefined is dropped,
   *  and a line left with no field is removed. */
  const setLine = (partial: Partial<MarkLineConfig>) => {
    const next: MarkLineConfig = { ...(line ?? {}), ...partial };
    for (const key of Object.keys(partial) as (keyof MarkLineConfig)[]) if (next[key] === undefined) delete next[key];
    onChange({ line: Object.keys(next).length > 0 ? next : undefined });
  };

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden={stored}>
    <ItemCard
      list="markStyles"
      id={style.id}
      styleId={style.id}
      title={style.name || style.id}
      subtitle={style.name && style.name !== style.id ? style.id : undefined}
      actions={
        <ConfirmPopover message={labels.markStyleDeleteConfirm} onConfirm={onRemove}>
          {({ open }) => (
            <IconButton label={labels.chipStyleDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
          )}
        </ConfirmPopover>
      }
    >

      <div className="mb-2 flex flex-col gap-2">
        <FieldRow
          stacked
          label={labels.idLabel} tooltip={labels.styleIdHelp}
          hint={idTaken ? labels.chipStyleIdHintDuplicate : labels.markStyleUsageHint.replace('__id__', style.id)}
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
            aria-label={labels.markStyleIdAria}
            className={inputClass}
            style={{ ...inputStyle, borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)' }}
          />
        </FieldRow>
        <FieldRow stacked label={labels.chipStyleNameLabel} tooltip={labels.styleNameHelp} className="mb-0">
          <input
            dir="auto"
            type="text"
            value={style.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value.length > 0 ? e.target.value : undefined })}
            aria-label={labels.markStyleNameAria}
            placeholder={style.id}
            className={inputClass}
            style={inputStyle}
          />
        </FieldRow>
      </div>

      <ToggleSwitch
        label={labels.markStyleBand}
        tooltip={labels.markStyleBandTooltip}
        checked={resolved.backgroundEnabled}
        onChange={(v) => onChange({ backgroundEnabled: v ? undefined : false })}
        isDefault={unset('backgroundEnabled')}
        onReset={() => onResetField('backgroundEnabled')}
      />
      <ColorPicker
        label={labels.markStyleBandColor}
        value={resolved.background}
        onChange={(v) => onChange({ background: v })}
        isDefault={unset('background')}
        onReset={() => onResetField('background')}
        fieldId={`markStyle-${style.id}-background`}
      />
      <ColorPicker
        label={labels.colorLabel}
        value={resolved.color ?? bodyText.color}
        onChange={(v) => onChange({ color: v })}
        tooltip={labels.markStyleColorTooltip}
        isDefault={unset('color')}
        onReset={() => onResetField('color')}
        fieldId={`markStyle-${style.id}-color`}
      />
      <NumberInput
        label={labels.markStyleOpacity}
        tooltip={labels.markStyleOpacityTooltip}
        value={resolved.opacity}
        min={0}
        max={100}
        step={5}
        suffix="%"
        onChange={(v) => onChange({ opacity: Math.max(0, Math.min(100, v)) })}
        isDefault={unset('opacity')}
        onReset={() => onResetField('opacity')}
      />
      <NumberInput
        label={labels.markStyleRough}
        tooltip={labels.markStyleRoughTooltip}
        value={resolved.rough}
        min={0}
        max={100}
        step={5}
        onChange={(v) => onChange({ rough: Math.max(0, Math.min(100, v)) })}
        isDefault={unset('rough')}
        onReset={() => onResetField('rough')}
      />
      <DimensionInput
        label={labels.chipStyleBorderRadius}
        value={resolved.borderRadius}
        onChange={(v) => onChange({ borderRadius: v })}
        min={0}
        step={0.05}
        units={BOX_UNITS}
        isDefault={unset('borderRadius')}
        onReset={() => onResetField('borderRadius')}
      />
      <SelectInput
        label={labels.markStyleDecorationBreak}
        value={resolved.decorationBreak}
        options={[
          { value: 'slice', label: labels.markStyleDecorationBreakSlice },
          { value: 'clone', label: labels.markStyleDecorationBreakClone },
        ]}
        onChange={(v) => onChange({ decorationBreak: v as MarkDecorationBreak })}
        tooltip={labels.markStyleDecorationBreakTooltip}
        variant="segmented"
        isDefault={unset('decorationBreak')}
        onReset={() => onResetField('decorationBreak')}
      />
      <DimensionInput
        label={labels.chipStylePaddingX}
        value={resolved.paddingX}
        onChange={(v) => onChange({ paddingX: v })}
        min={0}
        step={0.05}
        units={BOX_UNITS}
        tooltip={labels.markStylePaddingXTooltip}
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
        tooltip={labels.markStylePaddingYTooltip}
        isDefault={unset('paddingY')}
        onReset={() => onResetField('paddingY')}
      />
      <DimensionInput
        label={labels.chipStylePaddingTop}
        value={resolved.paddingTop ?? resolved.paddingY}
        onChange={(v) => onChange({ paddingTop: v })}
        min={-1}
        step={0.05}
        units={BOX_UNITS}
        tooltip={labels.markStylePaddingTopTooltip}
        isDefault={unset('paddingTop')}
        onReset={() => onResetField('paddingTop')}
      />
      <DimensionInput
        label={labels.chipStylePaddingBottom}
        value={resolved.paddingBottom ?? resolved.paddingY}
        onChange={(v) => onChange({ paddingBottom: v })}
        min={-1}
        step={0.05}
        units={BOX_UNITS}
        tooltip={labels.markStylePaddingBottomTooltip}
        isDefault={unset('paddingBottom')}
        onReset={() => onResetField('paddingBottom')}
      />
      <SelectInput
        label={labels.markStyleLineStyle}
        value={line ? (resolved.line?.style ?? 'solid') : NO_LINE}
        options={[
          { value: NO_LINE, label: labels.markStyleLineNone },
          { value: 'solid', label: labels.markStyleLineSolid },
          { value: 'double', label: labels.markStyleLineDouble },
          { value: 'dotted', label: labels.markStyleLineDotted },
          { value: 'dashed', label: labels.markStyleLineDashed },
          { value: 'wavy', label: labels.markStyleLineWavy },
        ]}
        onChange={(v) => (v === NO_LINE ? onResetField('line') : setLine({ style: v as MarkLineStyle }))}
        tooltip={labels.markStyleLineStyleTooltip}
        isDefault={unset('line')}
        onReset={() => onResetField('line')}
      />
      {line && (
        <>
          <SelectInput
            label={labels.markStyleLinePosition}
            value={resolved.line?.position ?? 'under'}
            options={[
              { value: 'under', label: labels.markStyleLineUnder },
              { value: 'through', label: labels.markStyleLineThrough },
            ]}
            onChange={(v) => setLine({ position: v as MarkLinePosition })}
            variant="segmented"
            isDefault={lineUnset('position')}
            onReset={() => setLine({ position: undefined })}
          />
          <ColorPicker
            label={labels.markStyleLineColor}
            value={resolved.line?.color ?? resolved.color ?? bodyText.color}
            onChange={(v) => setLine({ color: v })}
            tooltip={labels.markStyleLineColorTooltip}
            isDefault={lineUnset('color')}
            onReset={() => setLine({ color: undefined })}
            fieldId={`markStyle-${style.id}-lineColor`}
          />
          <DimensionInput
            label={labels.markStyleLineThickness}
            value={resolved.line?.thickness ?? { value: 0.06, unit: 'em' }}
            onChange={(v) => setLine({ thickness: v })}
            min={0}
            step={0.01}
            units={BOX_UNITS}
            tooltip={labels.markStyleLineThicknessTooltip}
            isDefault={lineUnset('thickness')}
            onReset={() => setLine({ thickness: undefined })}
          />
        </>
      )}
    </ItemCard>
    </SearchScope>
  );
}

/** Config-panel section for the named highlight styles selected by the
 *  inline `:mark[text]{style="…"}` (`config.markStyles`, #888). While the
 *  config has no list, the built-in `mark` style is shown so it can be
 *  edited in place. */
export const MarkStylesSection = memo(function MarkStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.markStyles);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: MarkStyleConfig[] = raw ?? DEFAULT_MARK_STYLES;
  const resolved = resolveMarkStylesConfig(styles);

  const write = (next: MarkStyleConfig[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { markStyles: next.length > 0 ? next : undefined } });
  };

  const addStyle = () => {
    const id = nextStyleId(styles);
    openCard('markStyles', id);
    write([...styles, { id, name: labels.markStyleNewName }]);
  };

  const updateStyle = (id: string, partial: Partial<MarkStyleConfig>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof MarkStyleConfig) => {
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
    moveCardState('markStyles', id, nextId);
    write(styles.map((s) => (s.id === id ? { ...s, id: nextId } : s)));
  };

  const removeStyle = (id: string) => {
    write(styles.filter((s) => s.id !== id));
  };

  return (
    <CollapsibleSection
      title={labels.markStylesSection}
      sectionId="markStyles"
      hasOverrides={raw !== undefined}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { markStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.markStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.markStylesEmpty}
        </p>
      )}
      <ItemCardListActions list="markStyles" ids={styles.map((s) => s.id)} />
      {styles.map((style, i) => (
        <MarkStyleCard
          key={style.id}
          style={style}
          resolved={resolved[i] ?? resolveMarkStylesConfig([style])[0]!}
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
        {labels.markStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
