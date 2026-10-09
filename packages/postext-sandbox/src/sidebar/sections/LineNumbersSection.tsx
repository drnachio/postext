'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveBodyTextConfig, resolveLineNumbersConfig, defaultLineNumbersRestart, DEFAULT_LINE_NUMBERS_CONFIG, dimensionsEqual } from 'postext';
import type { DimensionUnit, LineNumbersConfig } from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NestedGroup,
  NumberInput,
  SelectInput,
  ToggleSwitch,
} from '../../controls';
import { listNumberFormatValue, numberFormatOptions } from './OrderedListsSection/numberFormat';

const SIZE_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const GAP_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];

const D = DEFAULT_LINE_NUMBERS_CONFIG;

/** Line numbers in the margin (`config.lineNumbers`, #621): what is
 *  counted, how often a number is printed, where the count starts again,
 *  where the numbers stand and how they look. */
export const LineNumbersSection = memo(function LineNumbersSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.lineNumbers);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const locale = useSandboxSelector((s) => s.config.locale);
  const ln = resolveLineNumbersConfig(raw, resolveBodyTextConfig(bodyTextRaw, locale));

  const write = (next: LineNumbersConfig | undefined) => {
    const empty = !next || Object.keys(next).length === 0;
    dispatch({ type: 'UPDATE_CONFIG', payload: { lineNumbers: empty ? undefined : next } });
  };
  const update = (partial: Partial<LineNumbersConfig>) => write({ ...raw, ...partial });
  const resetField = (field: keyof LineNumbersConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    write(next);
  };
  const unset = (field: keyof LineNumbersConfig) => raw?.[field] === undefined;
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;

  return (
    <CollapsibleSection
      title={labels.lineNumbersSection}
      sectionId="lineNumbers"
      onReset={() => write(undefined)}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ToggleSwitch
        label={labels.lineNumbersEnabled}
        checked={ln.enabled}
        onChange={(v) => update({ enabled: v })}
        tooltip={labels.lineNumbersEnabledTooltip}
        isDefault={ln.enabled === D.enabled}
        onReset={() => resetField('enabled')}
      />
      {ln.enabled && (
        <NestedGroup>
          <SelectInput
            label={labels.lineNumbersCount}
            value={ln.count}
            variant="segmented"
            stacked
            options={[
              { value: 'verse', label: labels.lineNumbersCountVerse },
              { value: 'all', label: labels.lineNumbersCountAll },
            ]}
            onChange={(v) => update({ count: v as LineNumbersConfig['count'] })}
            tooltip={labels.lineNumbersCountTooltip}
            isDefault={ln.count === D.count}
            onReset={() => resetField('count')}
          />
          <NumberInput
            label={labels.lineNumbersInterval}
            value={ln.interval}
            onChange={(v) => update({ interval: Math.max(1, Math.round(v)) })}
            min={1}
            max={100}
            step={1}
            tooltip={labels.lineNumbersIntervalTooltip}
            isDefault={ln.interval === D.interval}
            onReset={() => resetField('interval')}
          />
          <ToggleSwitch
            label={labels.lineNumbersNumberFirst}
            checked={ln.numberFirst}
            onChange={(v) => update({ numberFirst: v })}
            tooltip={labels.lineNumbersNumberFirstTooltip}
            isDefault={ln.numberFirst === D.numberFirst}
            onReset={() => resetField('numberFirst')}
          />
          <SelectInput
            label={labels.lineNumbersRestart}
            value={ln.restart}
            options={[
              { value: 'document', label: labels.lineNumbersRestartDocument },
              { value: 'chapter', label: labels.lineNumbersRestartChapter },
              { value: 'section', label: labels.lineNumbersRestartSection },
              { value: 'page', label: labels.lineNumbersRestartPage },
              { value: 'poem', label: labels.lineNumbersRestartPoem },
            ]}
            onChange={(v) => update({ restart: v as LineNumbersConfig['restart'] })}
            tooltip={labels.lineNumbersRestartTooltip}
            isDefault={ln.restart === defaultLineNumbersRestart(ln.count)}
            onReset={() => resetField('restart')}
          />
          <NumberInput
            label={labels.lineNumbersStartAt}
            value={ln.startAt}
            onChange={(v) => update({ startAt: Math.max(0, Math.round(v)) })}
            min={0}
            step={1}
            tooltip={labels.lineNumbersStartAtTooltip}
            isDefault={ln.startAt === D.startAt}
            onReset={() => resetField('startAt')}
          />
          <SelectInput
            label={labels.lineNumbersPosition}
            value={ln.position}
            options={[
              { value: 'outer', label: labels.lineNumbersPositionOuter },
              { value: 'inner', label: labels.lineNumbersPositionInner },
              { value: 'left', label: labels.lineNumbersPositionLeft },
              { value: 'right', label: labels.lineNumbersPositionRight },
              { value: 'start', label: labels.lineNumbersPositionStart },
              { value: 'end', label: labels.lineNumbersPositionEnd },
              { value: 'side', label: labels.lineNumbersPositionSide },
            ]}
            onChange={(v) => update({ position: v as LineNumbersConfig['position'] })}
            tooltip={labels.lineNumbersPositionTooltip}
            isDefault={ln.position === D.position}
            onReset={() => resetField('position')}
          />
          <SelectInput
            label={labels.lineNumbersMultiColumn}
            value={ln.multiColumn}
            options={[
              { value: 'outer-edges', label: labels.lineNumbersMultiColumnOuterEdges },
              { value: 'gutter', label: labels.lineNumbersMultiColumnGutter },
              { value: 'each', label: labels.lineNumbersMultiColumnEach },
            ]}
            onChange={(v) => update({ multiColumn: v as LineNumbersConfig['multiColumn'] })}
            tooltip={labels.lineNumbersMultiColumnTooltip}
            isDefault={ln.multiColumn === D.multiColumn}
            onReset={() => resetField('multiColumn')}
          />
          {ln.position !== 'side' && (
            <DimensionInput
              label={labels.lineNumbersGap}
              value={ln.gap}
              onChange={(dim) => update({ gap: dim })}
              min={0}
              step={0.1}
              tooltip={labels.lineNumbersGapTooltip}
              isDefault={dimensionsEqual(ln.gap, D.gap)}
              onReset={() => resetField('gap')}
              units={GAP_UNITS}
            />
          )}
          <SelectInput
            label={labels.lineNumbersAlign}
            value={ln.align}
            variant="segmented"
            stacked
            options={[
              { value: 'auto', label: labels.lineNumbersAlignAuto },
              { value: 'left', label: labels.lineNumbersAlignLeft },
              { value: 'right', label: labels.lineNumbersAlignRight },
            ]}
            onChange={(v) => update({ align: v as LineNumbersConfig['align'] })}
            tooltip={labels.lineNumbersAlignTooltip}
            isDefault={ln.align === D.align}
            onReset={() => resetField('align')}
          />
          <SelectInput
            label={labels.lineNumbersFormat}
            value={listNumberFormatValue(ln.format)}
            options={numberFormatOptions(labels)}
            onChange={(v) => (v === 'arabic' ? resetField('format') : update({ format: v }))}
            tooltip={labels.lineNumbersFormatTooltip}
            isDefault={unset('format')}
            onReset={() => resetField('format')}
          />
          <FontPicker
            label={labels.lineNumbersFont}
            value={ln.fontFamily}
            onChange={(v) => update({ fontFamily: v })}
            tooltip={labels.lineNumbersFontTooltip}
            isDefault={unset('fontFamily')}
            onReset={() => resetField('fontFamily')}
            searchPlaceholder={labels.bodyFontSearch}
            noResultsLabel={labels.bodyFontNoResults}
          />
          <DimensionInput
            label={labels.lineNumbersFontSize}
            value={ln.fontSize}
            onChange={(dim) => update({ fontSize: dim })}
            min={0.1}
            step={0.05}
            tooltip={labels.lineNumbersFontSizeTooltip}
            isDefault={dimensionsEqual(ln.fontSize, D.fontSize)}
            onReset={() => resetField('fontSize')}
            units={SIZE_UNITS}
          />
          <NumberInput
            label={labels.headingFontWeight}
            value={ln.fontWeight}
            onChange={(v) => update({ fontWeight: v })}
            min={100}
            max={900}
            step={10}
            isDefault={unset('fontWeight')}
            onReset={() => resetField('fontWeight')}
          />
          <ToggleSwitch
            label={labels.headingItalic}
            tooltip={labels.italicHelp}
            checked={ln.italic}
            onChange={(v) => update({ italic: v })}
            isDefault={unset('italic')}
            onReset={() => resetField('italic')}
          />
          <ColorPicker
            label={labels.colorLabel}
            value={ln.color}
            onChange={(color) => update({ color })}
            isDefault={unset('color')}
            onReset={() => resetField('color')}
            fieldId="line-numbers-color"
          />
        </NestedGroup>
      )}
    </CollapsibleSection>
  );
});
