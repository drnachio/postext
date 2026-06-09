'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveBodyTextConfig, resolveCaptionStyleConfig } from 'postext';
import type { CaptionStyleConfig, DimensionUnit, TextAlign } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  SelectInput,
  ToggleSwitch,
} from '../../controls';

const FONT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em'];
const GAP_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

/** Config-panel section for styling resource captions: the shared caption
 *  typography plus independent weight/slant/colour for the numbered label and
 *  the description. Unset fields inherit the body text. */
export const CaptionStyleSection = memo(function CaptionStyleSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.captionStyle);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const cs = resolveCaptionStyleConfig(raw, bodyText);

  const update = (partial: Partial<CaptionStyleConfig>) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { captionStyle: { ...raw, ...partial } } });
  };
  const resetSection = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { captionStyle: undefined } });
  };
  const resetField = (field: keyof CaptionStyleConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { captionStyle: Object.keys(next).length > 0 ? next : undefined },
    });
  };
  const unset = (field: keyof CaptionStyleConfig) => raw?.[field] === undefined;

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;

  const alignOptions = [
    { value: 'left', label: labels.alignLeft },
    { value: 'center', label: labels.alignCenter },
  ];

  return (
    <CollapsibleSection
      title={labels.captionStyleSection}
      sectionId="captionStyle"
      onReset={resetSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <FontPicker
        label={labels.fontLabel}
        value={cs.fontFamily}
        onChange={(v) => update({ fontFamily: v })}
        isDefault={unset('fontFamily')}
        onReset={() => resetField('fontFamily')}
      />
      <DimensionInput
        label={labels.sizeLabel}
        value={cs.fontSize}
        onChange={(v) => update({ fontSize: v })}
        min={1}
        units={FONT_SIZE_UNITS}
        isDefault={unset('fontSize')}
        onReset={() => resetField('fontSize')}
      />
      <SelectInput
        label={labels.alignmentLabel}
        value={cs.align}
        options={alignOptions}
        onChange={(v) => update({ align: v as TextAlign })}
        isDefault={unset('align')}
        onReset={() => resetField('align')}
      />
      <DimensionInput
        label={labels.captionGap}
        value={cs.gap}
        onChange={(v) => update({ gap: v })}
        min={0}
        step={0.05}
        units={GAP_UNITS}
        isDefault={unset('gap')}
        onReset={() => resetField('gap')}
      />

      <CollapsibleSection title={labels.captionLabelGroup} sectionId="captionStyle.label" variant="subsection">
        <ToggleSwitch
          label={labels.bold ?? 'Bold'}
          checked={cs.labelBold}
          onChange={(v) => update({ labelBold: v })}
          isDefault={unset('labelBold')}
          onReset={() => resetField('labelBold')}
        />
        <ToggleSwitch
          label={labels.italic ?? 'Italic'}
          checked={cs.labelItalic}
          onChange={(v) => update({ labelItalic: v })}
          isDefault={unset('labelItalic')}
          onReset={() => resetField('labelItalic')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={cs.labelColor}
          onChange={(v) => update({ labelColor: v })}
          isDefault={unset('labelColor')}
          onReset={() => resetField('labelColor')}
          fieldId="captionStyle-labelColor"
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.captionDescriptionGroup} sectionId="captionStyle.description" variant="subsection">
        <ToggleSwitch
          label={labels.italic ?? 'Italic'}
          checked={cs.descriptionItalic}
          onChange={(v) => update({ descriptionItalic: v })}
          isDefault={unset('descriptionItalic')}
          onReset={() => resetField('descriptionItalic')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={cs.color}
          onChange={(v) => update({ color: v })}
          isDefault={unset('color')}
          onReset={() => resetField('color')}
          fieldId="captionStyle-color"
        />
      </CollapsibleSection>
    </CollapsibleSection>
  );
});
