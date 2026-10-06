'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveFootnotesConfig, DEFAULT_FOOTNOTES_CONFIG, dimensionsEqual } from 'postext';
import type { ColorValue, DimensionUnit, FootnotesConfig } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  NestedGroup,
  NumberInput,
  SelectInput,
  TextInput,
  ToggleSwitch,
} from '../../controls';
import { listNumberFormatValue, numberFormatOptions } from './OrderedListsSection/numberFormat';
import { flowSideLabels, useRightToLeftFlow } from '../settings/flowSides';

const SIZE_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const MARKER_UNITS: DimensionUnit[] = ['em', 'pt'];
const SPACE_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];
const RULE_UNITS: DimensionUnit[] = ['pt', 'px', 'mm'];

const D = DEFAULT_FOOTNOTES_CONFIG;

const FALLBACK_COLOR: ColorValue = { model: 'rgb', hex: '#000000' };

type Separator = NonNullable<FootnotesConfig['separator']>;

export const FootnotesSection = memo(function FootnotesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.footnotes);
  const bodyColor = useSandboxSelector((s) => s.config.bodyText?.color);
  const bodyAlign = useSandboxSelector((s) => s.config.bodyText?.textAlign);
  const locale = useSandboxSelector((s) => s.config.locale);
  const writingMode = useSandboxSelector((s) => s.config.layout?.writingMode);
  const fn = resolveFootnotesConfig(raw, locale, writingMode);
  // What the unset fields come to in this document: a Japanese one sets its
  // notes after JLReq (endnotes with （1） markers in a vertical book), and
  // spread sidenotes number per spread.
  // Reference symbols count per page by default (#538).
  const ddInput = {
    ...(raw?.placement ? { placement: raw.placement } : {}),
    ...(raw?.numberFormat !== undefined ? { numberFormat: raw.numberFormat } : {}),
  };
  const DD = resolveFootnotesConfig(Object.keys(ddInput).length > 0 ? ddInput : undefined, locale, writingMode);
  const vertical = writingMode === 'vertical-rl';
  const textSide = flowSideLabels(useRightToLeftFlow(), labels.bodyTextAlignLeft, labels.headingsTextAlignRight);

  const write = (next: FootnotesConfig | undefined) => {
    const empty = !next || Object.keys(next).length === 0;
    dispatch({ type: 'UPDATE_CONFIG', payload: { footnotes: empty ? undefined : next } });
  };
  const update = (partial: Partial<FootnotesConfig>) => write({ ...raw, ...partial });
  const resetField = (field: keyof FootnotesConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    write(next);
  };
  const updateSeparator = (partial: Partial<Separator>) => update({ separator: { ...raw?.separator, ...partial } });
  const resetSeparatorField = (field: keyof Separator) => {
    if (!raw?.separator) return;
    const next = { ...raw.separator };
    delete next[field];
    if (Object.keys(next).length === 0) resetField('separator');
    else update({ separator: next });
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const columnFoot = fn.placement === 'column' || fn.placement === 'spread';
  const defaultTemplate = DD.markerTemplate ?? '{n}';

  return (
    <CollapsibleSection
      title={labels.footnotesSection}
      sectionId="footnotes"
      onReset={() => write(undefined)}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SelectInput
        label={labels.footnotesPlacement}
        value={fn.placement}
        variant="segmented"
        stacked
        options={[
          { value: 'column', label: labels.footnotesPlacementColumn },
          { value: 'chapterEnd', label: labels.footnotesPlacementChapterEnd },
          // Sidenotes on the spread are a vertical book's.
          ...(vertical || raw?.placement === 'spread' ? [{ value: 'spread', label: labels.footnotesPlacementSpread }] : []),
        ]}
        onChange={(v) => update({ placement: v as FootnotesConfig['placement'] })}
        tooltip={labels.footnotesPlacementTooltip}
        isDefault={raw?.placement === undefined || raw.placement === resolveFootnotesConfig(undefined, locale, writingMode).placement}
        onReset={() => resetField('placement')}
      />
      {fn.placement === 'chapterEnd' && (
        <SelectInput
          label={labels.footnotesChapterEndAlign}
          value={fn.chapterEndAlign}
          variant="segmented"
          stacked
          options={[
            { value: 'foot', label: labels.footnotesChapterEndAlignFoot },
            { value: 'text', label: labels.footnotesChapterEndAlignText },
          ]}
          onChange={(v) => update({ chapterEndAlign: v as FootnotesConfig['chapterEndAlign'] })}
          tooltip={labels.footnotesChapterEndAlignTooltip}
          isDefault={fn.chapterEndAlign === D.chapterEndAlign}
          onReset={() => resetField('chapterEndAlign')}
        />
      )}
      <SelectInput
        label={labels.footnotesNumbering}
        value={fn.numbering}
        variant="segmented"
        stacked
        options={[
          { value: 'chapter', label: labels.footnotesNumberingChapter },
          { value: 'document', label: labels.footnotesNumberingDocument },
          // Counted where the notes land: notes at the column foot only.
          ...(columnFoot
            ? [
                { value: 'page', label: labels.footnotesNumberingPage },
                { value: 'column', label: labels.footnotesNumberingColumn },
              ]
            : []),
          ...(fn.placement === 'spread' ? [{ value: 'spread', label: labels.footnotesNumberingSpread }] : []),
        ]}
        onChange={(v) => update({ numbering: v as FootnotesConfig['numbering'] })}
        tooltip={labels.footnotesNumberingTooltip}
        isDefault={fn.numbering === DD.numbering}
        onReset={() => resetField('numbering')}
      />
      <SelectInput
        label={labels.footnotesNumberFormat}
        value={fn.numberFormat === 'symbols' ? 'symbols' : listNumberFormatValue(fn.numberFormat)}
        options={[...numberFormatOptions(labels), { label: labels.footnotesNumberFormatSymbols, value: 'symbols' }]}
        onChange={(v) => update({ numberFormat: v === 'arabic' ? 'decimal' : v })}
        tooltip={labels.footnotesNumberFormatTooltip}
        isDefault={raw?.numberFormat === undefined}
        onReset={() => resetField('numberFormat')}
      />
      <SelectInput
        label={labels.footnotesMarkerPosition}
        value={raw?.markerPosition ?? 'auto'}
        variant="segmented"
        stacked
        options={[
          { value: 'auto', label: labels.footnotesMarkerPositionAuto },
          { value: 'superscript', label: labels.footnotesMarkerPositionSuperscript },
          { value: 'inline', label: labels.footnotesMarkerPositionInline },
          { value: 'side', label: labels.footnotesMarkerPositionSide },
          { value: 'right', label: labels.footnotesMarkerPositionRight },
        ]}
        onChange={(v) => update({ markerPosition: v as FootnotesConfig['markerPosition'] })}
        tooltip={labels.footnotesMarkerPositionTooltip}
        isDefault={(raw?.markerPosition ?? 'auto') === 'auto'}
        onReset={() => resetField('markerPosition')}
      />
      {fn.markerPosition !== 'superscript' && (
        <NestedGroup>
          <DimensionInput
            label={labels.footnotesMarkerSize}
            value={fn.markerSize}
            onChange={(dim) => update({ markerSize: dim })}
            min={0.3}
            step={0.05}
            tooltip={labels.footnotesMarkerSizeTooltip}
            isDefault={raw?.markerSize === undefined || dimensionsEqual(fn.markerSize, resolveFootnotesConfig({ markerPosition: fn.markerPosition }).markerSize)}
            onReset={() => resetField('markerSize')}
            units={MARKER_UNITS}
          />
        </NestedGroup>
      )}
      <SelectInput
        label={labels.footnotesNoteNumberPosition}
        value={raw?.noteNumberPosition ?? 'auto'}
        variant="segmented"
        stacked
        options={[
          { value: 'auto', label: labels.footnotesNoteNumberPositionAuto },
          { value: 'superscript', label: labels.footnotesMarkerPositionSuperscript },
          { value: 'inline', label: labels.footnotesMarkerPositionInline },
        ]}
        onChange={(v) => (v === 'auto' ? resetField('noteNumberPosition') : update({ noteNumberPosition: v as FootnotesConfig['noteNumberPosition'] }))}
        tooltip={labels.footnotesNoteNumberPositionTooltip}
        isDefault={(raw?.noteNumberPosition ?? 'auto') === 'auto'}
        onReset={() => resetField('noteNumberPosition')}
      />
      <TextInput
        label={labels.footnotesMarkerTemplate}
        value={raw?.markerTemplate ?? defaultTemplate}
        onChange={(v) => (v.trim() === '' || v === defaultTemplate ? resetField('markerTemplate') : update({ markerTemplate: v }))}
        tooltip={labels.footnotesMarkerTemplateTooltip}
        isDefault={raw?.markerTemplate === undefined || raw.markerTemplate === defaultTemplate}
        onReset={() => resetField('markerTemplate')}
        widthCh={8}
      />
      <DimensionInput
        label={labels.footnotesFontSize}
        value={fn.fontSize}
        onChange={(dim) => update({ fontSize: dim })}
        min={0.1}
        step={0.05}
        tooltip={labels.footnotesFontSizeTooltip}
        isDefault={dimensionsEqual(fn.fontSize, D.fontSize)}
        onReset={() => resetField('fontSize')}
        units={SIZE_UNITS}
      />
      <DimensionInput
        label={labels.footnotesLineHeight}
        value={fn.lineHeight}
        onChange={(dim) => update({ lineHeight: dim })}
        min={0.5}
        step={0.05}
        tooltip={labels.footnotesLineHeightTooltip}
        isDefault={dimensionsEqual(fn.lineHeight, D.lineHeight)}
        onReset={() => resetField('lineHeight')}
        units={SIZE_UNITS}
      />
      <ColorPicker
        label={labels.footnotesColor}
        value={fn.color ?? bodyColor ?? FALLBACK_COLOR}
        onChange={(color) => update({ color })}
        tooltip={labels.footnotesColorTooltip}
        isDefault={raw?.color === undefined}
        onReset={() => resetField('color')}
        fieldId="footnotes-color"
      />
      <SelectInput
        label={labels.alignmentLabel} tooltip={labels.alignmentHelp}
        value={fn.textAlign ?? bodyAlign ?? 'justify'}
        options={[
          { value: 'left', label: textSide.left },
          { value: 'justify', label: labels.bodyTextAlignJustify },
        ]}
        onChange={(v) => update({ textAlign: v as FootnotesConfig['textAlign'] })}
        isDefault={raw?.textAlign === undefined}
        onReset={() => resetField('textAlign')}
      />
      <DimensionInput
        label={labels.footnotesHangingIndent}
        value={fn.hangingIndent}
        onChange={(dim) => update({ hangingIndent: dim })}
        min={0}
        step={0.1}
        tooltip={labels.footnotesHangingIndentTooltip}
        isDefault={dimensionsEqual(fn.hangingIndent, DD.hangingIndent)}
        onReset={() => resetField('hangingIndent')}
        units={SPACE_UNITS}
      />
      <SelectInput
        label={labels.footnotesNumberGap}
        value={fn.numberGap ?? 'en'}
        variant="segmented"
        stacked
        options={[
          { value: 'en', label: labels.footnotesNumberGapEn },
          { value: 'em', label: labels.footnotesNumberGapEm },
        ]}
        onChange={(v) => update({ numberGap: v as FootnotesConfig['numberGap'] })}
        tooltip={labels.footnotesNumberGapTooltip}
        isDefault={(fn.numberGap ?? 'en') === (DD.numberGap ?? 'en')}
        onReset={() => resetField('numberGap')}
      />
      <DimensionInput
        label={labels.footnotesSpaceBetween}
        value={fn.spaceBetween}
        onChange={(dim) => update({ spaceBetween: dim })}
        min={0}
        step={0.1}
        tooltip={labels.footnotesSpaceBetweenTooltip}
        isDefault={dimensionsEqual(fn.spaceBetween, D.spaceBetween)}
        onReset={() => resetField('spaceBetween')}
        units={SPACE_UNITS}
      />
      <DimensionInput
        label={labels.footnotesSpaceAbove}
        value={fn.spaceAbove}
        onChange={(dim) => update({ spaceAbove: dim })}
        min={0}
        step={0.1}
        tooltip={labels.footnotesSpaceAboveTooltip}
        isDefault={dimensionsEqual(fn.spaceAbove, D.spaceAbove)}
        onReset={() => resetField('spaceAbove')}
        units={SPACE_UNITS}
      />
      <DimensionInput
        label={labels.footnotesSpaceBelowRule}
        value={fn.spaceBelowRule}
        onChange={(dim) => update({ spaceBelowRule: dim })}
        min={0}
        step={0.1}
        tooltip={labels.footnotesSpaceBelowRuleTooltip}
        isDefault={dimensionsEqual(fn.spaceBelowRule, D.spaceBelowRule)}
        onReset={() => resetField('spaceBelowRule')}
        units={SPACE_UNITS}
      />
      <ToggleSwitch
        label={labels.footnotesSeparator}
        checked={fn.separator.enabled}
        onChange={(v) => updateSeparator({ enabled: v })}
        tooltip={labels.footnotesSeparatorTooltip}
        isDefault={fn.separator.enabled === D.separator.enabled}
        onReset={() => resetSeparatorField('enabled')}
      />
      {fn.separator.enabled && (
        <NestedGroup>
          <NumberInput
            label={labels.footnotesSeparatorWidth}
            value={fn.separator.width}
            onChange={(v) => updateSeparator({ width: v })}
            min={0}
            max={1}
            step={0.05}
            tooltip={labels.footnotesSeparatorWidthTooltip}
            isDefault={fn.separator.width === DD.separator.width}
            onReset={() => resetSeparatorField('width')}
          />
          <DimensionInput
            label={labels.footnotesSeparatorLineWidth}
            value={fn.separator.lineWidth}
            onChange={(dim) => updateSeparator({ lineWidth: dim })}
            min={0}
            step={0.1}
            tooltip={labels.footnotesSeparatorLineWidthTooltip}
            isDefault={dimensionsEqual(fn.separator.lineWidth, D.separator.lineWidth)}
            onReset={() => resetSeparatorField('lineWidth')}
            units={RULE_UNITS}
          />
          <ColorPicker
            label={labels.footnotesSeparatorColor}
            value={fn.separator.color ?? fn.color ?? bodyColor ?? FALLBACK_COLOR}
            onChange={(color) => updateSeparator({ color })}
            tooltip={labels.footnotesSeparatorColorTooltip}
            isDefault={raw?.separator?.color === undefined}
            onReset={() => resetSeparatorField('color')}
            fieldId="footnotes-separator-color"
          />
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
});
