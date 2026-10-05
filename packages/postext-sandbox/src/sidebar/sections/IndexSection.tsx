'use client';

import { memo } from 'react';
import type { DimensionUnit, IndexConfig, IndexGroupBy, IndexGroupsConfig } from 'postext';
import { DEFAULT_INDEX_CONFIG, resolveBodyTextConfig, resolveIndexConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  SelectInput,
  TextInput,
  ToggleSwitch,
} from '../../controls';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'px', 'mm'];
const infoStyle = { color: 'var(--slate)' } as const;

const D = DEFAULT_INDEX_CONFIG;

type MainStyle = NonNullable<IndexConfig['main']>;
type SeeConfig = NonNullable<IndexConfig['see']>;

/** Copy of `obj` without `key`; `undefined` when nothing remains. */
function omit<T extends object, K extends keyof T>(obj: T | undefined, key: K): T | undefined {
  if (!obj) return undefined;
  const next = { ...obj };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The back-of-book index `:::index` prints (`config.index`). */
export const IndexSection = memo(function IndexSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.index);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const documentLocale = useSandboxSelector((s) => s.config.locale);
  const bodyText = resolveBodyTextConfig(bodyTextRaw, documentLocale);
  // The language decides some defaults (an Arabic index: Arabic commas,
  // upright labels, the article ignored), as the engine resolves them.
  const resolved = resolveIndexConfig(raw, bodyText, documentLocale ?? bodyText.hyphenation.tag ?? bodyText.hyphenation.locale);

  const commit = (next: IndexConfig | undefined) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { index: next && Object.keys(next).length > 0 ? next : undefined } });
  };
  const update = (partial: Partial<IndexConfig>) => commit({ ...raw, ...partial });
  const resetField = (field: keyof IndexConfig) => commit(omit(raw, field));
  const setGroup = <K extends 'main' | 'see' | 'groups'>(key: K, value: IndexConfig[K] | undefined) => {
    const next: IndexConfig = { ...raw };
    if (value === undefined) delete next[key];
    else next[key] = value;
    commit(next);
  };
  const updateMain = (partial: Partial<MainStyle>) => setGroup('main', { ...raw?.main, ...partial });
  const resetMain = (field: keyof MainStyle) => setGroup('main', omit(raw?.main, field));
  const updateSee = (partial: Partial<SeeConfig>) => setGroup('see', { ...raw?.see, ...partial });
  const resetSee = (field: keyof SeeConfig) => setGroup('see', omit(raw?.see, field));
  const updateGroups = (partial: Partial<IndexGroupsConfig>) => setGroup('groups', { ...raw?.groups, ...partial });
  const resetGroups = (field: keyof IndexGroupsConfig) => setGroup('groups', omit(raw?.groups, field));

  const unset = (field: keyof IndexConfig) => raw?.[field] === undefined;
  const groupUnset = (field: keyof IndexGroupsConfig) => raw?.groups?.[field] === undefined;
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const g = resolved.groups;

  return (
    <CollapsibleSection
      title={labels.indexSection}
      sectionId="index"
      onReset={() => commit(undefined)}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <p className="mb-2 text-xs" style={infoStyle}>
        {labels.indexInfo}
      </p>

      <CollapsibleSection
        title={labels.indexEntries}
        sectionId="index-entries"
        onReset={() => commit(omit(omit(omit(omit(omit(omit(omit(omit(raw, 'fontFamily'), 'fontSize'), 'lineHeight'), 'fontWeight'), 'color'), 'indent'), 'turnoverIndent'), 'entrySpacing'))}
        hasOverrides={(['fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'color', 'indent', 'turnoverIndent', 'entrySpacing'] as const).some((k) => !unset(k))}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <FontPicker
          label={labels.fontLabel}
          value={resolved.fontFamily}
          onChange={(v) => update({ fontFamily: v })}
          isDefault={unset('fontFamily')}
          onReset={() => resetField('fontFamily')}
          searchPlaceholder={labels.bodyFontSearch}
          noResultsLabel={labels.bodyFontNoResults}
        />
        <DimensionInput
          label={labels.sizeLabel}
          value={resolved.fontSize}
          onChange={(v) => update({ fontSize: v })}
          min={1}
          step={0.5}
          units={TEXT_SIZE_UNITS}
          isDefault={unset('fontSize')}
          onReset={() => resetField('fontSize')}
        />
        <DimensionInput
          label={labels.bodyLineHeight}
          value={resolved.lineHeight}
          onChange={(v) => update({ lineHeight: v })}
          min={0.5}
          max={5}
          step={0.1}
          units={LINE_HEIGHT_UNITS}
          isDefault={unset('lineHeight')}
          onReset={() => resetField('lineHeight')}
        />
        <NumberInput
          label={labels.headingFontWeight}
          value={resolved.fontWeight}
          onChange={(v) => update({ fontWeight: v })}
          min={100}
          max={900}
          step={10}
          isDefault={unset('fontWeight')}
          onReset={() => resetField('fontWeight')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={resolved.color}
          onChange={(v) => update({ color: v })}
          isDefault={unset('color')}
          onReset={() => resetField('color')}
          fieldId="index-color"
        />
        <DimensionInput
          label={labels.indexIndent}
          value={resolved.indent}
          onChange={(v) => update({ indent: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.indexIndentTooltip}
          isDefault={unset('indent')}
          onReset={() => resetField('indent')}
        />
        <DimensionInput
          label={labels.indexTurnoverIndent}
          value={resolved.turnoverIndent}
          onChange={(v) => update({ turnoverIndent: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.indexTurnoverIndentTooltip}
          isDefault={unset('turnoverIndent')}
          onReset={() => resetField('turnoverIndent')}
        />
        <DimensionInput
          label={labels.indexEntrySpacing}
          value={resolved.entrySpacing}
          onChange={(v) => update({ entrySpacing: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.indexEntrySpacingTooltip}
          isDefault={unset('entrySpacing')}
          onReset={() => resetField('entrySpacing')}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.indexPageNumbers}
        sectionId="index-page-numbers"
        onReset={() => commit(omit(omit(omit(omit(omit(omit(raw, 'separator'), 'locatorSeparator'), 'rangeSeparator'), 'mergeRanges'), 'rangeFormat'), 'main'))}
        hasOverrides={(['separator', 'locatorSeparator', 'rangeSeparator', 'mergeRanges', 'rangeFormat', 'main'] as const).some((k) => !unset(k))}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <TextInput
          label={labels.indexSeparator}
          value={resolved.separator}
          onChange={(v) => update({ separator: v })}
          tooltip={labels.indexSeparatorTooltip}
          isDefault={unset('separator')}
          onReset={() => resetField('separator')}
          widthCh={6}
        />
        <TextInput
          label={labels.indexLocatorSeparator}
          value={resolved.locatorSeparator}
          onChange={(v) => update({ locatorSeparator: v })}
          tooltip={labels.indexLocatorSeparatorTooltip}
          isDefault={unset('locatorSeparator')}
          onReset={() => resetField('locatorSeparator')}
          widthCh={6}
        />
        <TextInput
          label={labels.indexRangeSeparator}
          value={resolved.rangeSeparator}
          onChange={(v) => update({ rangeSeparator: v })}
          tooltip={labels.indexRangeSeparatorTooltip}
          isDefault={unset('rangeSeparator')}
          onReset={() => resetField('rangeSeparator')}
          widthCh={6}
        />
        <ToggleSwitch
          label={labels.indexMergeRanges}
          checked={resolved.mergeRanges}
          onChange={(v) => update({ mergeRanges: v })}
          tooltip={labels.indexMergeRangesTooltip}
          isDefault={resolved.mergeRanges === D.mergeRanges}
          onReset={() => resetField('mergeRanges')}
        />
        <SelectInput
          label={labels.indexRangeFormat}
          value={resolved.rangeFormat}
          variant="segmented"
          stacked
          options={[
            { value: 'full', label: labels.indexRangeFormatFull },
            { value: 'chicago', label: labels.indexRangeFormatChicago },
          ]}
          onChange={(v) => update({ rangeFormat: v as IndexConfig['rangeFormat'] })}
          tooltip={labels.indexRangeFormatTooltip}
          isDefault={resolved.rangeFormat === D.rangeFormat}
          onReset={() => resetField('rangeFormat')}
        />
        <ToggleSwitch
          label={labels.indexMainBold}
          checked={resolved.main.bold}
          onChange={(v) => updateMain({ bold: v })}
          tooltip={labels.indexMainTooltip}
          isDefault={raw?.main?.bold === undefined}
          onReset={() => resetMain('bold')}
        />
        <ToggleSwitch
          label={labels.indexMainItalic} tooltip={labels.indexMainTooltip}
          checked={resolved.main.italic}
          onChange={(v) => updateMain({ italic: v })}
          isDefault={raw?.main?.italic === undefined}
          onReset={() => resetMain('italic')}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.indexCrossReferences}
        sectionId="index-see"
        onReset={() => setGroup('see', undefined)}
        hasOverrides={raw?.see !== undefined && Object.keys(raw.see).length > 0}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <TextInput
          label={labels.indexSeeLabel}
          value={raw?.see?.label ?? ''}
          placeholder={labels.indexSeeLabelPlaceholder}
          onChange={(v) => (v === '' ? resetSee('label') : updateSee({ label: v }))}
          tooltip={labels.indexSeeLabelTooltip}
          isDefault={raw?.see?.label === undefined}
          onReset={() => resetSee('label')}
        />
        <TextInput
          label={labels.indexSeeAlsoLabel} tooltip={labels.indexSeeAlsoLabelTooltip}
          value={raw?.see?.alsoLabel ?? ''}
          placeholder={labels.indexSeeAlsoLabelPlaceholder}
          onChange={(v) => (v === '' ? resetSee('alsoLabel') : updateSee({ alsoLabel: v }))}
          isDefault={raw?.see?.alsoLabel === undefined}
          onReset={() => resetSee('alsoLabel')}
        />
        <ToggleSwitch
          label={labels.indexSeeItalic} tooltip={labels.indexSeeItalicTooltip}
          checked={resolved.see.italic}
          onChange={(v) => updateSee({ italic: v })}
          isDefault={raw?.see?.italic === undefined}
          onReset={() => resetSee('italic')}
        />
        <TextInput
          label={labels.indexLocale}
          value={raw?.locale ?? ''}
          placeholder={documentLocale ?? ''}
          onChange={(v) => (v.trim() === '' ? resetField('locale') : update({ locale: v.trim() }))}
          tooltip={labels.indexLocaleTooltip}
          isDefault={unset('locale')}
          onReset={() => resetField('locale')}
          widthCh={8}
        />
        <ToggleSwitch
          label={labels.indexIgnoreArticle}
          checked={resolved.ignoreArticle}
          onChange={(v) => update({ ignoreArticle: v })}
          tooltip={labels.indexIgnoreArticleTooltip}
          isDefault={unset('ignoreArticle')}
          onReset={() => resetField('ignoreArticle')}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.indexGroups}
        sectionId="index-groups"
        onReset={() => commit(omit(omit(raw, 'groups'), 'groupBy'))}
        hasOverrides={!unset('groupBy') || (raw?.groups !== undefined && Object.keys(raw.groups).length > 0)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <SelectInput
          label={labels.indexGroupBy}
          value={resolved.groupBy}
          options={[
            { value: 'auto', label: labels.indexGroupByAuto },
            { value: 'letter', label: labels.indexGroupByLetter },
            { value: 'pinyin', label: labels.indexGroupByPinyin },
            { value: 'stroke', label: labels.indexGroupByStroke },
            { value: 'gojuon', label: labels.indexGroupByGojuon },
            { value: 'kana', label: labels.indexGroupByKana },
            { value: 'none', label: labels.indexGroupByNone },
          ]}
          onChange={(v) => update({ groupBy: v as IndexGroupBy })}
          tooltip={labels.indexGroupByTooltip}
          isDefault={unset('groupBy')}
          onReset={() => resetField('groupBy')}
        />
        <ToggleSwitch
          label={labels.indexGroupsEnabled}
          checked={g.enabled}
          onChange={(v) => updateGroups({ enabled: v })}
          tooltip={labels.indexGroupsEnabledTooltip}
          isDefault={groupUnset('enabled')}
          onReset={() => resetGroups('enabled')}
        />
        <DimensionInput
          label={labels.indexGroupsMarginTop}
          value={g.marginTop}
          onChange={(v) => updateGroups({ marginTop: v })}
          min={0}
          step={0.5}
          units={SPACING_UNITS}
          tooltip={labels.indexGroupsMarginTopTooltip}
          isDefault={groupUnset('marginTop')}
          onReset={() => resetGroups('marginTop')}
        />
        {g.enabled && (
          <>
            <FontPicker
              label={labels.fontLabel}
              value={g.fontFamily}
              onChange={(v) => updateGroups({ fontFamily: v })}
              isDefault={groupUnset('fontFamily')}
              onReset={() => resetGroups('fontFamily')}
              searchPlaceholder={labels.bodyFontSearch}
              noResultsLabel={labels.bodyFontNoResults}
            />
            <DimensionInput
              label={labels.sizeLabel}
              value={g.fontSize}
              onChange={(v) => updateGroups({ fontSize: v })}
              min={1}
              step={0.5}
              units={TEXT_SIZE_UNITS}
              isDefault={groupUnset('fontSize')}
              onReset={() => resetGroups('fontSize')}
            />
            <NumberInput
              label={labels.headingFontWeight}
              value={g.fontWeight}
              onChange={(v) => updateGroups({ fontWeight: v })}
              min={100}
              max={900}
              step={10}
              isDefault={groupUnset('fontWeight')}
              onReset={() => resetGroups('fontWeight')}
            />
            <ToggleSwitch
              label={labels.headingItalic} tooltip={labels.italicHelp}
              checked={g.italic}
              onChange={(v) => updateGroups({ italic: v })}
              isDefault={groupUnset('italic')}
              onReset={() => resetGroups('italic')}
            />
            <ColorPicker
              label={labels.colorLabel}
              value={g.color}
              onChange={(v) => updateGroups({ color: v })}
              isDefault={groupUnset('color')}
              onReset={() => resetGroups('color')}
              fieldId="index-groups-color"
            />
            <TextInput
              label={labels.indexSymbolsLabel} tooltip={labels.indexSymbolsLabelTooltip}
              value={raw?.groups?.symbolsLabel ?? ''}
              placeholder={labels.indexSymbolsLabelPlaceholder}
              onChange={(v) => (v === '' ? resetGroups('symbolsLabel') : updateGroups({ symbolsLabel: v }))}
              isDefault={groupUnset('symbolsLabel')}
              onReset={() => resetGroups('symbolsLabel')}
            />
            <TextInput
              label={labels.indexNumbersLabel} tooltip={labels.indexNumbersLabelTooltip}
              value={raw?.groups?.numbersLabel ?? ''}
              placeholder="0–9"
              onChange={(v) => (v === '' ? resetGroups('numbersLabel') : updateGroups({ numbersLabel: v }))}
              isDefault={groupUnset('numbersLabel')}
              onReset={() => resetGroups('numbersLabel')}
            />
          </>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
});
