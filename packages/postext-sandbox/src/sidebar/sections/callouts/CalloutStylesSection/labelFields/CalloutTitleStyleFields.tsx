'use client';

// The title row fields of a box style or a code listing.
import type { CalloutTitleStyleConfig, CalloutTextTransform } from 'postext';
import { useSandboxLabels } from '../../../../../context/SandboxContext.js';
import { CollapsibleSection, FontPicker, DimensionInput, NumberInput, ToggleSwitch, ColorPicker, SelectInput } from '../../../../../controls/index.js';
import { FONT_SIZE_UNITS, SPACING_UNITS, TRACKING_UNITS, LINE_HEIGHT_UNITS } from '../shared.js';
import { type CalloutGroupFieldsProps, tabHostEdits } from './tabHost.js';

/** The title row group: face, size, weight, colour, case, gap, tracking,
 *  indent and leading. */
export function CalloutTitleStyleFields({ style, resolved, onChange, onResetField, sectionId, fieldId }: CalloutGroupFieldsProps) {
  const labels = useSandboxLabels();
  const { updateGroup, resetGroupField, groupUnset } = tabHostEdits({ style, onChange, onResetField });
  const title = (partial: Partial<CalloutTitleStyleConfig>) => updateGroup('titleStyle', partial);
  const transformOptions = [
    { value: 'none', label: labels.calloutStyleTitleTransformNone },
    { value: 'uppercase', label: labels.calloutStyleTitleTransformUppercase },
  ];

  return (
    <>
      <CollapsibleSection
        title={labels.calloutStyleTitleGroup}
        sectionId={`${sectionId}.title`}
        variant="subsection"
      >
        <FontPicker
          label={labels.calloutStyleTitleFont}
          value={resolved.titleStyle.fontFamily}
          onChange={(v) => title({ fontFamily: v })}
          isDefault={groupUnset('titleStyle', 'fontFamily')}
          onReset={() => resetGroupField('titleStyle', 'fontFamily')}
          searchPlaceholder={labels.headingFontSearch}
          noResultsLabel={labels.headingFontNoResults}
        />
        <DimensionInput
          label={labels.calloutStyleTitleSize}
          value={resolved.titleStyle.fontSize}
          onChange={(v) => title({ fontSize: v })}
          min={1}
          step={0.5}
          units={FONT_SIZE_UNITS}
          isDefault={groupUnset('titleStyle', 'fontSize')}
          onReset={() => resetGroupField('titleStyle', 'fontSize')}
        />
        <NumberInput
          label={labels.calloutStyleTitleWeight}
          value={resolved.titleStyle.fontWeight}
          onChange={(v) => title({ fontWeight: v })}
          min={100}
          max={900}
          step={10}
          isDefault={groupUnset('titleStyle', 'fontWeight')}
          onReset={() => resetGroupField('titleStyle', 'fontWeight')}
        />
        <ToggleSwitch
          label={labels.calloutStyleTitleItalic} tooltip={labels.italicHelp}
          checked={resolved.titleStyle.italic}
          onChange={(v) => title({ italic: v })}
          isDefault={groupUnset('titleStyle', 'italic')}
          onReset={() => resetGroupField('titleStyle', 'italic')}
        />
        <ColorPicker
          label={labels.calloutStyleTitleColor}
          value={resolved.titleStyle.color}
          onChange={(v) => title({ color: v })}
          isDefault={groupUnset('titleStyle', 'color')}
          onReset={() => resetGroupField('titleStyle', 'color')}
          fieldId={`${fieldId}-title`}
        />
        <SelectInput
          label={labels.calloutStyleTitleTransform} tooltip={labels.calloutStyleTitleTransformTooltip}
          value={resolved.titleStyle.textTransform}
          options={transformOptions}
          onChange={(v) => title({ textTransform: v as CalloutTextTransform })}
          isDefault={groupUnset('titleStyle', 'textTransform')}
          onReset={() => resetGroupField('titleStyle', 'textTransform')}
        />
        <DimensionInput
          label={labels.calloutStyleTitleGap}
          value={resolved.titleStyle.gap}
          onChange={(v) => title({ gap: v })}
          min={0}
          step={0.05}
          units={SPACING_UNITS}
          tooltip={labels.calloutStyleTitleGapTooltip}
          isDefault={groupUnset('titleStyle', 'gap')}
          onReset={() => resetGroupField('titleStyle', 'gap')}
        />
        <DimensionInput
          label={labels.calloutStyleTitleLetterSpacing}
          value={resolved.titleStyle.letterSpacing}
          onChange={(v) => title({ letterSpacing: v })}
          min={-5}
          step={0.05}
          units={TRACKING_UNITS}
          isDefault={groupUnset('titleStyle', 'letterSpacing')}
          onReset={() => resetGroupField('titleStyle', 'letterSpacing')}
        />
        <DimensionInput
          label={labels.calloutStyleTitleIndent}
          value={resolved.titleStyle.indent}
          onChange={(v) => title({ indent: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.calloutStyleTitleIndentTooltip}
          isDefault={groupUnset('titleStyle', 'indent')}
          onReset={() => resetGroupField('titleStyle', 'indent')}
        />
        <DimensionInput
          label={labels.calloutStyleTitleLineHeight}
          value={resolved.titleStyle.lineHeight}
          onChange={(v) => title({ lineHeight: v })}
          min={0.5}
          max={5}
          step={0.1}
          units={LINE_HEIGHT_UNITS}
          tooltip={labels.calloutStyleTitleLineHeightTooltip}
          isDefault={groupUnset('titleStyle', 'lineHeight')}
          onReset={() => resetGroupField('titleStyle', 'lineHeight')}
        />
      </CollapsibleSection>
    </>
  );
}
