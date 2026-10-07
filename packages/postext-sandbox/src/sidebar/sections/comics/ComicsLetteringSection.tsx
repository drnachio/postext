'use client';

import { memo } from 'react';
import type { LetteringConfig } from 'postext';
import { useSandboxLabels } from '../../../context/SandboxContext';
import { CollapsibleSection, ColorPicker, DimensionInput, FieldGroup, FontPicker, NumberInput, SelectInput, ToggleSwitch } from '../../../controls';
import { setComicsField, setNestedField } from './comicsConfig';
import { EM_UNITS, GUTTER_UNITS, useComics } from './comicsShared';

/** Comics → Lettering: the one face and size every balloon is lettered in
 *  (a balloon style may scale it), the house rules applied to the text and
 *  how balloons sit in their panels. */
export const ComicsLetteringSection = memo(function ComicsLetteringSection() {
  const labels = useSandboxLabels();
  const { raw, resolved, write } = useComics();
  const own = raw?.lettering ?? {};
  const l = resolved.lettering;
  const set = <K extends keyof LetteringConfig>(key: K, value: LetteringConfig[K] | undefined) => write(setNestedField(raw, 'lettering', key, value));
  const unset = (key: keyof LetteringConfig) => own[key] === undefined;
  const reset = (key: keyof LetteringConfig) => () => set(key, undefined);
  const dropFinalStop = l.dropFinalStop === 'auto' ? 'auto' : l.dropFinalStop ? 'yes' : 'no';

  return (
    <CollapsibleSection
      title={labels.comicsLetteringSection}
      sectionId="comicsLettering"
      hasOverrides={Object.keys(own).length > 0}
      onReset={() => write(setComicsField(raw, 'lettering', undefined))}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <FieldGroup title={labels.comicsGroupLetteringType} description={labels.comicsGroupLetteringTypeDescription}>
        <FontPicker
          label={labels.fontLabel}
          tooltip={labels.comicsLetteringFontHelp}
          value={l.fontFamily}
          onChange={(v) => set('fontFamily', v)}
          isDefault={unset('fontFamily')}
          onReset={reset('fontFamily')}
          searchPlaceholder={labels.bodyFontSearch}
          noResultsLabel={labels.bodyFontNoResults}
        />
        <DimensionInput
          label={labels.sizeLabel}
          tooltip={labels.comicsLetteringSizeHelp}
          value={l.fontSize}
          onChange={(v) => set('fontSize', v)}
          min={1}
          step={0.25}
          units={['pt', 'mm', 'px']}
          isDefault={unset('fontSize')}
          onReset={reset('fontSize')}
        />
        <NumberInput
          label={labels.comicsLineHeight}
          tooltip={labels.comicsLineHeightHelp}
          value={l.lineHeight}
          onChange={(v) => set('lineHeight', v)}
          min={0.8}
          max={3}
          step={0.05}
          isDefault={unset('lineHeight')}
          onReset={reset('lineHeight')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={l.color}
          onChange={(v) => set('color', v)}
          isDefault={unset('color')}
          onReset={reset('color')}
          fieldId="comics-lettering-color"
        />
        <ToggleSwitch label={labels.bold} tooltip={labels.boldHelp} checked={l.bold} onChange={(v) => set('bold', v)} isDefault={unset('bold')} onReset={reset('bold')} />
        <ToggleSwitch label={labels.italic} tooltip={labels.italicHelp} checked={l.italic} onChange={(v) => set('italic', v)} isDefault={unset('italic')} onReset={reset('italic')} />
        <DimensionInput
          label={labels.comicsLetterSpacing}
          tooltip={labels.comicsLetterSpacingHelp}
          value={l.letterSpacing}
          onChange={(v) => set('letterSpacing', v)}
          min={-0.2}
          step={0.01}
          units={EM_UNITS}
          isDefault={unset('letterSpacing')}
          onReset={reset('letterSpacing')}
        />
        <SelectInput
          label={labels.comicsTextTransform}
          tooltip={labels.comicsTextTransformHelp}
          value={l.textTransform}
          options={[
            { value: 'none', label: labels.comicsTextTransformNone },
            { value: 'uppercase', label: labels.comicsTextTransformUppercase },
          ]}
          onChange={(v) => set('textTransform', v as LetteringConfig['textTransform'])}
          variant="segmented"
          isDefault={unset('textTransform')}
          onReset={reset('textTransform')}
        />
        <SelectInput
          label={labels.comicsWritingMode}
          tooltip={labels.comicsWritingModeHelp}
          value={l.writingMode}
          options={[
            { value: 'auto', label: labels.comicsWritingModeAuto },
            { value: 'horizontal', label: labels.comicsWritingModeHorizontal },
            { value: 'vertical', label: labels.comicsWritingModeVertical },
          ]}
          onChange={(v) => set('writingMode', v as LetteringConfig['writingMode'])}
          variant="segmented"
          isDefault={unset('writingMode')}
          onReset={reset('writingMode')}
        />
        <NumberInput
          label={labels.comicsMaxColumnChars}
          tooltip={labels.comicsMaxColumnCharsHelp}
          value={l.maxColumnChars}
          onChange={(v) => set('maxColumnChars', Math.round(v))}
          min={2}
          max={30}
          step={1}
          isDefault={unset('maxColumnChars')}
          onReset={reset('maxColumnChars')}
        />
      </FieldGroup>

      <FieldGroup title={labels.comicsGroupHouseRules} description={labels.comicsGroupHouseRulesDescription}>
        <SelectInput
          label={labels.comicsDropFinalStop}
          tooltip={labels.comicsDropFinalStopHelp}
          value={dropFinalStop}
          options={[
            { value: 'auto', label: labels.comicsDropFinalStopAuto },
            { value: 'yes', label: labels.comicsDropFinalStopYes },
            { value: 'no', label: labels.comicsDropFinalStopNo },
          ]}
          onChange={(v) => set('dropFinalStop', v === 'auto' ? 'auto' : v === 'yes')}
          variant="segmented"
          isDefault={unset('dropFinalStop')}
          onReset={reset('dropFinalStop')}
        />
        <ToggleSwitch
          label={labels.comicsDoubleDash}
          tooltip={labels.comicsDoubleDashHelp}
          checked={l.doubleDash}
          onChange={(v) => set('doubleDash', v)}
          isDefault={unset('doubleDash')}
          onReset={reset('doubleDash')}
        />
      </FieldGroup>

      <FieldGroup title={labels.comicsGroupBalloonPlacement} description={labels.comicsGroupBalloonPlacementDescription}>
        <DimensionInput
          label={labels.comicsLetteringInset}
          tooltip={labels.comicsLetteringInsetHelp}
          value={l.inset}
          onChange={(v) => set('inset', v)}
          min={0}
          step={0.5}
          units={GUTTER_UNITS}
          isDefault={unset('inset')}
          onReset={reset('inset')}
        />
        <SelectInput
          label={labels.comicsJoinSameSpeaker}
          tooltip={labels.comicsJoinSameSpeakerHelp}
          value={l.joinSameSpeaker}
          options={[
            { value: 'butt', label: labels.comicsJoinButt, description: labels.comicsJoinButtDescription },
            { value: 'connector', label: labels.comicsJoinConnector, description: labels.comicsJoinConnectorDescription },
            { value: 'none', label: labels.comicsJoinNone, description: labels.comicsJoinNoneDescription },
          ]}
          onChange={(v) => set('joinSameSpeaker', v as LetteringConfig['joinSameSpeaker'])}
          isDefault={unset('joinSameSpeaker')}
          onReset={reset('joinSameSpeaker')}
        />
      </FieldGroup>
    </CollapsibleSection>
  );
});
