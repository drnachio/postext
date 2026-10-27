'use client';

import { memo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { DimensionUnit, MarkDecorationBreak, MarkStyleConfig, ResolvedBodyTextConfig, ResolvedMarkStyleConfig } from 'postext';
import { DEFAULT_MARK_STYLES, resolveBodyTextConfig, resolveMarkStylesConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, ItemCard, ItemCardListActions, moveCardState, openCard, ColorPicker, DimensionInput, SelectInput } from '../../../controls/index.js';
import { Button, ConfirmPopover, IconButton } from '../../../ui/index.js';
import { FieldRow } from '../../../controls/FieldRow.js';
import { SearchScope } from '../../search/SearchScope.js';

const BOX_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

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
 *  colliding id), display name, the band (colour, corner radius, padding)
 *  and the colour of the marked words. */
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
        min={0}
        step={0.05}
        units={BOX_UNITS}
        isDefault={unset('paddingTop')}
        onReset={() => onResetField('paddingTop')}
      />
      <DimensionInput
        label={labels.chipStylePaddingBottom}
        value={resolved.paddingBottom ?? resolved.paddingY}
        onChange={(v) => onChange({ paddingBottom: v })}
        min={0}
        step={0.05}
        units={BOX_UNITS}
        tooltip={labels.chipStylePaddingBottomTooltip}
        isDefault={unset('paddingBottom')}
        onReset={() => onResetField('paddingBottom')}
      />
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
