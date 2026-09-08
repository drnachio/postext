'use client';

import type {
  CaptionNoteStyleConfig,
  CaptionPosition,
  CaptionStyleConfig,
  DimensionUnit,
  ResolvedCaptionStyleConfig,
  TextAlign,
} from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext';
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

export interface CaptionStyleFieldsProps {
  /** The partial config being edited (unset keys inherit). */
  raw: CaptionStyleConfig | undefined;
  /** Fully resolved values shown in the controls. */
  resolved: ResolvedCaptionStyleConfig;
  /** Merge `partial` into `raw`. */
  update: (partial: Partial<CaptionStyleConfig>) => void;
  /** Delete one key from `raw` (back to inherited). */
  resetField: (field: keyof CaptionStyleConfig) => void;
  /** Prefix for the persisted open/closed state of the sub-groups. */
  sectionIdPrefix: string;
  /** Prefix for colour-picker field ids. */
  fieldIdPrefix: string;
}

/** The caption-style control set shared by the global *Captions* section and
 *  the per-resource-type override editor. Every control shows the resolved
 *  value and offers a per-field reset whenever the key is set in `raw`, so an
 *  override only ever contains the keys the user touched. */
export function CaptionStyleFields({
  raw,
  resolved: cs,
  update,
  resetField,
  sectionIdPrefix,
  fieldIdPrefix,
}: CaptionStyleFieldsProps) {
  const labels = useSandboxLabels();
  const unset = (field: keyof CaptionStyleConfig) => raw?.[field] === undefined;

  const updateNote = (partial: Partial<CaptionNoteStyleConfig>) => {
    update({ note: { ...raw?.note, ...partial } });
  };
  const resetNoteField = (field: keyof CaptionNoteStyleConfig) => {
    if (!raw?.note) return;
    const next = { ...raw.note };
    delete next[field];
    if (Object.keys(next).length > 0) update({ note: next });
    else resetField('note');
  };
  const noteUnset = (field: keyof CaptionNoteStyleConfig) => raw?.note?.[field] === undefined;

  const alignOptions = [
    { value: 'left', label: labels.alignLeft },
    { value: 'center', label: labels.alignCenter },
  ];
  const positionOptions = [
    { value: 'below', label: labels.captionPositionBelow },
    { value: 'above', label: labels.captionPositionAbove },
  ];

  return (
    <>
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
      <SelectInput
        label={labels.captionPosition}
        value={cs.position}
        options={positionOptions}
        onChange={(v) => update({ position: v as CaptionPosition })}
        tooltip={labels.captionPositionTooltip}
        isDefault={unset('position')}
        onReset={() => resetField('position')}
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

      <CollapsibleSection title={labels.captionBarGroup} sectionId={`${sectionIdPrefix}.bar`} variant="subsection">
        <ToggleSwitch
          label={labels.captionBar}
          checked={cs.backgroundEnabled}
          onChange={(v) => update({ backgroundEnabled: v })}
          tooltip={labels.captionBarTooltip}
          isDefault={unset('backgroundEnabled')}
          onReset={() => resetField('backgroundEnabled')}
        />
        {cs.backgroundEnabled && (
          <>
            <ColorPicker
              label={labels.backgroundColorLabel}
              value={cs.background}
              onChange={(v) => update({ background: v })}
              isDefault={unset('background')}
              onReset={() => resetField('background')}
              fieldId={`${fieldIdPrefix}-background`}
            />
            <DimensionInput
              label={labels.captionPadding}
              value={cs.padding}
              onChange={(v) => update({ padding: v })}
              min={0}
              step={0.05}
              units={GAP_UNITS}
              isDefault={unset('padding')}
              onReset={() => resetField('padding')}
            />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.captionLabelGroup} sectionId={`${sectionIdPrefix}.label`} variant="subsection">
        <ToggleSwitch
          label={labels.bold}
          checked={cs.labelBold}
          onChange={(v) => update({ labelBold: v })}
          isDefault={unset('labelBold')}
          onReset={() => resetField('labelBold')}
        />
        <ToggleSwitch
          label={labels.italic}
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
          fieldId={`${fieldIdPrefix}-labelColor`}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.captionDescriptionGroup} sectionId={`${sectionIdPrefix}.description`} variant="subsection">
        <ToggleSwitch
          label={labels.italic}
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
          fieldId={`${fieldIdPrefix}-color`}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.captionNoteGroup} sectionId={`${sectionIdPrefix}.note`} variant="subsection">
        <DimensionInput
          label={labels.sizeLabel}
          value={cs.note.fontSize}
          onChange={(v) => updateNote({ fontSize: v })}
          min={1}
          units={FONT_SIZE_UNITS}
          isDefault={noteUnset('fontSize')}
          onReset={() => resetNoteField('fontSize')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={cs.note.color}
          onChange={(v) => updateNote({ color: v })}
          isDefault={noteUnset('color')}
          onReset={() => resetNoteField('color')}
          fieldId={`${fieldIdPrefix}-noteColor`}
        />
        <ToggleSwitch
          label={labels.italic}
          checked={cs.note.italic}
          onChange={(v) => updateNote({ italic: v })}
          isDefault={noteUnset('italic')}
          onReset={() => resetNoteField('italic')}
        />
        <SelectInput
          label={labels.alignmentLabel}
          value={cs.note.align}
          options={alignOptions}
          onChange={(v) => updateNote({ align: v as TextAlign })}
          isDefault={noteUnset('align')}
          onReset={() => resetNoteField('align')}
        />
        <DimensionInput
          label={labels.captionGap}
          value={cs.note.gap}
          onChange={(v) => updateNote({ gap: v })}
          min={0}
          step={0.05}
          units={GAP_UNITS}
          isDefault={noteUnset('gap')}
          onReset={() => resetNoteField('gap')}
        />
      </CollapsibleSection>
    </>
  );
}
