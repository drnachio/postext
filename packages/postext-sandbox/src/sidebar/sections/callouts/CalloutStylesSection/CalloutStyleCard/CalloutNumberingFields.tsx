'use client';

// A box style's numbering fields (#530) and the closing mark of a proof.
import type { CalloutStyleConfig, ResolvedCalloutStyleConfig, ResourceCounterReset, ResourceCounterFormat } from 'postext';
import { useSandboxLabels } from '../../../../../context/SandboxContext.js';
import { CollapsibleSection, ToggleSwitch, NestedGroup, TextInput, SelectInput } from '../../../../../controls/index.js';
import { resetOnOptions, counterFormatOptions } from '../../../../settings/counterOptions.js';
import type { CalloutNumbering } from '../shared.js';

/** Numbered statements (#530) and the closing mark of a proof: the
 *  `numbering` group and `endMark`. */
export function CalloutNumberingFields({ style, resolved, onChange, onResetField, sectionId }: {
  style: CalloutStyleConfig;
  resolved: ResolvedCalloutStyleConfig;
  onChange: (partial: Partial<CalloutStyleConfig>) => void;
  onResetField: (field: keyof CalloutStyleConfig) => void;
  sectionId: string;
}) {
  const labels = useSandboxLabels();
  const raw = style.numbering;
  const num = resolved.numbering;
  const set = (partial: Partial<CalloutNumbering>) => onChange({ numbering: { label: num?.label ?? '', ...raw, ...partial } });
  const reset = (field: Exclude<keyof CalloutNumbering, 'label'>) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    onChange({ numbering: next });
  };
  const unset = (field: keyof CalloutNumbering) => raw?.[field] === undefined;
  return (
    <CollapsibleSection title={labels.calloutStyleNumberingGroup} sectionId={`${sectionId}.numbering`} variant="subsection">
      <ToggleSwitch
        label={labels.calloutStyleNumbering}
        checked={num !== undefined}
        onChange={(v) => (v ? onChange({ numbering: { label: style.name ?? style.id } }) : onResetField('numbering'))}
        tooltip={labels.calloutStyleNumberingTooltip}
        isDefault={raw === undefined}
        onReset={() => onResetField('numbering')}
      />
      {num && (
        <NestedGroup>
          <TextInput
            label={labels.calloutStyleNumberingLabel}
            value={num.label}
            onChange={(v) => set({ label: v })}
            tooltip={labels.calloutStyleNumberingLabelTooltip}
            isDefault={false}
          />
          <ToggleSwitch
            label={labels.calloutStyleNumberingNumbered}
            checked={raw?.counter !== false}
            onChange={(v) => (v ? reset('counter') : set({ counter: false }))}
            tooltip={labels.calloutStyleNumberingNumberedTooltip}
            isDefault={raw?.counter !== false}
            onReset={() => reset('counter')}
          />
          {raw?.counter !== false && (
            <>
              <TextInput
                label={labels.calloutStyleNumberingCounter}
                value={typeof raw?.counter === 'string' ? raw.counter : ''}
                onChange={(v) => (v === '' ? reset('counter') : set({ counter: v }))}
                placeholder={style.id}
                tooltip={labels.calloutStyleNumberingCounterTooltip}
                isDefault={unset('counter')}
                onReset={() => reset('counter')}
              />
              <TextInput
                label={labels.resourceTypeNumberingLabel}
                value={num.numberingTemplate}
                onChange={(v) => (v === '' ? reset('numberingTemplate') : set({ numberingTemplate: v }))}
                tooltip={labels.resourceTypeNumberingTooltip}
                isDefault={unset('numberingTemplate')}
                onReset={() => reset('numberingTemplate')}
              />
              <SelectInput
                label={labels.resourceTypeResetCounterLabel}
                value={num.resetOn}
                options={resetOnOptions(labels)}
                onChange={(v) => set({ resetOn: v as ResourceCounterReset })}
                tooltip={labels.resourceTypeResetCounterTooltip}
                isDefault={unset('resetOn')}
                onReset={() => reset('resetOn')}
              />
              <SelectInput
                label={labels.resourceTypeCounterFormatLabel}
                value={num.counterFormat}
                options={counterFormatOptions(labels)}
                onChange={(v) => set({ counterFormat: v as ResourceCounterFormat })}
                tooltip={labels.resourceTypeCounterFormatTooltip}
                isDefault={unset('counterFormat')}
                onReset={() => reset('counterFormat')}
              />
            </>
          )}
          <SelectInput
            label={labels.calloutStyleNumberingPlacement}
            value={num.placement}
            options={[
              { value: 'runIn', label: labels.calloutStyleNumberingPlacementRunIn },
              { value: 'title', label: labels.calloutStyleNumberingPlacementTitle },
            ]}
            onChange={(v) => set({ placement: v as 'runIn' | 'title' })}
            tooltip={labels.calloutStyleNumberingPlacementTooltip}
            variant="segmented"
            isDefault={unset('placement')}
            onReset={() => reset('placement')}
          />
          {num.placement === 'runIn' && (
            <>
              <ToggleSwitch
                label={labels.bold}
                checked={num.bold}
                onChange={(v) => set({ bold: v })}
                isDefault={unset('bold')}
                onReset={() => reset('bold')}
              />
              <ToggleSwitch
                label={labels.italic}
                checked={num.italic}
                onChange={(v) => set({ italic: v })}
                isDefault={unset('italic')}
                onReset={() => reset('italic')}
              />
              <TextInput
                label={labels.calloutStyleNumberingSuffix}
                value={num.suffix}
                onChange={(v) => set({ suffix: v })}
                tooltip={labels.calloutStyleNumberingSuffixTooltip}
                isDefault={unset('suffix')}
                onReset={() => reset('suffix')}
                widthCh={6}
              />
            </>
          )}
        </NestedGroup>
      )}
      <TextInput
        label={labels.calloutStyleEndMark}
        value={resolved.endMark}
        onChange={(v) => (v === '' ? onResetField('endMark') : onChange({ endMark: v }))}
        placeholder="∎"
        tooltip={labels.calloutStyleEndMarkTooltip}
        isDefault={style.endMark === undefined}
        onReset={() => onResetField('endMark')}
        widthCh={6}
      />
    </CollapsibleSection>
  );
}
