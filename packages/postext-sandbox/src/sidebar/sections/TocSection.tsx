'use client';

import { memo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  DesignSlot,
  DimensionUnit,
  ResolvedTocEntryStyleConfig,
  TocConfig,
  TocEntryStyleConfig,
  TocLevelConfig,
} from 'postext';
import { DEFAULT_TOC_CONFIG, resolveBodyTextConfig, resolveDesignSlot, resolveTocConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NestedGroup,
  NumberInput,
  TextInput,
  ToggleSwitch,
} from '../../controls';
import { Button, ConfirmPopover, IconButton } from '../../ui';
import { SearchScope } from '../search/SearchScope';
import { ShowingDefaultsContext } from '../../controls/fieldContext';
import { SlotEditor } from './HeaderFooterSection/SlotEditor';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'px', 'mm'];
const infoStyle = { color: 'var(--slate)' } as const;

type Labels = ReturnType<typeof useSandboxLabels>;
type PageNumberConfig = NonNullable<TocConfig['pageNumber']>;
type LeaderConfig = NonNullable<TocConfig['leader']>;
type SubtitleConfig = NonNullable<TocConfig['subtitle']>;
type PartsRowConfig = NonNullable<TocConfig['parts']>;

/** Copy of `obj` without `key`; `undefined` when nothing remains. */
function omit<T extends object, K extends keyof T>(obj: T | undefined, key: K): T | undefined {
  if (!obj) return undefined;
  const next = { ...obj };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

function hasKeys(obj: object | undefined): boolean {
  return obj !== undefined && Object.keys(obj).length > 0;
}

/** `{ ...base, ...partial }` with the keys `partial` sets to `undefined` dropped. */
function merge<T extends object>(base: T | undefined, partial: Partial<T>): T {
  const next = { ...base, ...partial } as T;
  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined) delete (next as Record<string, unknown>)[k];
  }
  return next;
}

interface EntryStyleFieldsProps {
  raw: TocEntryStyleConfig | undefined;
  resolved: ResolvedTocEntryStyleConfig;
  onUpdate: (partial: Partial<TocEntryStyleConfig>) => void;
  onReset: (field: keyof TocEntryStyleConfig) => void;
  fieldIdPrefix: string;
  labels: Labels;
}

/** The typography of one kind of contents entry — a level, or the
 *  unnumbered headings. Shows the resolved value; each field resets by
 *  dropping its key. */
function EntryStyleFields({ raw, resolved, onUpdate, onReset, fieldIdPrefix, labels }: EntryStyleFieldsProps) {
  const unset = (field: keyof TocEntryStyleConfig) => raw?.[field] === undefined;
  return (
    <>
      <FontPicker
        label={labels.fontLabel}
        value={resolved.fontFamily}
        onChange={(v) => onUpdate({ fontFamily: v })}
        isDefault={unset('fontFamily')}
        onReset={() => onReset('fontFamily')}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
      />
      <DimensionInput
        label={labels.sizeLabel}
        value={resolved.fontSize}
        onChange={(v) => onUpdate({ fontSize: v })}
        min={1}
        step={0.5}
        units={TEXT_SIZE_UNITS}
        isDefault={unset('fontSize')}
        onReset={() => onReset('fontSize')}
      />
      <DimensionInput
        label={labels.bodyLineHeight}
        value={resolved.lineHeight}
        onChange={(v) => onUpdate({ lineHeight: v })}
        min={0.5}
        max={5}
        step={0.1}
        units={LINE_HEIGHT_UNITS}
        tooltip={labels.tocEntryLineHeightTooltip}
        isDefault={unset('lineHeight')}
        onReset={() => onReset('lineHeight')}
      />
      <NumberInput
        label={labels.headingFontWeight}
        value={resolved.fontWeight}
        onChange={(v) => onUpdate({ fontWeight: v })}
        min={100}
        max={900}
        step={10}
        isDefault={unset('fontWeight')}
        onReset={() => onReset('fontWeight')}
      />
      <ToggleSwitch
        label={labels.headingItalic}
        checked={resolved.italic}
        onChange={(v) => onUpdate({ italic: v })}
        isDefault={unset('italic')}
        onReset={() => onReset('italic')}
      />
      <ColorPicker
        label={labels.colorLabel}
        value={resolved.color}
        onChange={(v) => onUpdate({ color: v })}
        isDefault={unset('color')}
        onReset={() => onReset('color')}
        fieldId={`${fieldIdPrefix}-color`}
      />
      <DimensionInput
        label={labels.tocEntryIndent}
        value={resolved.indent}
        onChange={(v) => onUpdate({ indent: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.tocEntryIndentTooltip}
        isDefault={unset('indent')}
        onReset={() => onReset('indent')}
      />
      <DimensionInput
        label={labels.tocEntryNumberWidth}
        value={resolved.numberWidth}
        onChange={(v) => onUpdate({ numberWidth: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.tocEntryNumberWidthTooltip}
        isDefault={unset('numberWidth')}
        onReset={() => onReset('numberWidth')}
      />
      <DimensionInput
        label={labels.tocEntryNumberGap}
        value={resolved.numberGap}
        onChange={(v) => onUpdate({ numberGap: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.tocEntryNumberGapTooltip}
        isDefault={unset('numberGap')}
        onReset={() => onReset('numberGap')}
      />
      <FontPicker
        label={labels.tocEntryNumberFont}
        value={resolved.numberFontFamily}
        onChange={(v) => onUpdate({ numberFontFamily: v })}
        tooltip={labels.tocEntryNumberFontTooltip}
        isDefault={unset('numberFontFamily')}
        onReset={() => onReset('numberFontFamily')}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
      />
      <DimensionInput
        label={labels.tocEntryNumberFontSize}
        value={resolved.numberFontSize}
        onChange={(v) => onUpdate({ numberFontSize: v })}
        min={1}
        step={0.5}
        units={TEXT_SIZE_UNITS}
        isDefault={unset('numberFontSize')}
        onReset={() => onReset('numberFontSize')}
      />
      <NumberInput
        label={labels.tocEntryNumberFontWeight}
        value={resolved.numberFontWeight}
        onChange={(v) => onUpdate({ numberFontWeight: v })}
        min={100}
        max={900}
        step={10}
        isDefault={unset('numberFontWeight')}
        onReset={() => onReset('numberFontWeight')}
      />
      <ColorPicker
        label={labels.tocEntryNumberColor}
        value={resolved.numberColor}
        onChange={(v) => onUpdate({ numberColor: v })}
        isDefault={unset('numberColor')}
        onReset={() => onReset('numberColor')}
        fieldId={`${fieldIdPrefix}-number-color`}
      />
      <DimensionInput
        label={labels.marginTop}
        value={resolved.marginTop}
        onChange={(v) => onUpdate({ marginTop: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.tocEntryMarginTooltip}
        isDefault={unset('marginTop')}
        onReset={() => onReset('marginTop')}
      />
      <DimensionInput
        label={labels.marginBottom}
        value={resolved.marginBottom}
        onChange={(v) => onUpdate({ marginBottom: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.tocEntryMarginTooltip}
        isDefault={unset('marginBottom')}
        onReset={() => onReset('marginBottom')}
      />
    </>
  );
}

/** Config-panel section for what `:::toc` prints (`config.toc`): the
 *  levels listed and their entry typography, the unnumbered entries, page
 *  numbers, leaders, the subtitle line and the part rows. */
export const TocSection = memo(function TocSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.toc);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const documentLocale = useSandboxSelector((s) => s.config.locale);
  const bodyText = resolveBodyTextConfig(bodyTextRaw, documentLocale);
  const resolved = resolveTocConfig(raw, bodyText);

  // The levels shown: the raw ones, or the default level 1 when unset.
  const rawLevels: TocLevelConfig[] = raw?.levels && raw.levels.length > 0
    ? raw.levels
    : DEFAULT_TOC_CONFIG.levels.map((level) => ({ level }));
  const levelsAreDefault = !(raw?.levels && raw.levels.length > 0);

  const commit = (next: TocConfig | undefined) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { toc: next && Object.keys(next).length > 0 ? next : undefined } });
  };
  const setGroup = <K extends keyof TocConfig>(key: K, value: TocConfig[K] | undefined) => {
    const next: TocConfig = { ...raw };
    if (value === undefined) delete next[key];
    else next[key] = value;
    commit(next);
  };

  // --- levels ---
  const writeLevels = (levels: TocLevelConfig[]) => setGroup('levels', levels.length > 0 ? levels : undefined);
  const updateLevel = (index: number, partial: Partial<TocLevelConfig>) =>
    writeLevels(rawLevels.map((l, i) => (i === index ? { ...l, ...partial } : l)));
  const resetLevelField = (index: number, field: keyof TocEntryStyleConfig) =>
    writeLevels(rawLevels.map((l, i) => {
      if (i !== index) return l;
      const next = { ...l };
      delete next[field];
      return next;
    }));
  const removeLevel = (index: number) => writeLevels(rawLevels.filter((_, i) => i !== index));
  const addLevel = () => {
    const taken = new Set(rawLevels.map((l) => l.level));
    let level = 1;
    while (taken.has(level) && level < 6) level++;
    writeLevels([...rawLevels, { level }]);
  };

  // --- the other groups ---
  const updateUnnumbered = (partial: Partial<TocEntryStyleConfig>) =>
    setGroup('unnumbered', { ...raw?.unnumbered, ...partial });
  const resetUnnumberedField = (field: keyof TocEntryStyleConfig) =>
    setGroup('unnumbered', omit(raw?.unnumbered, field));
  const updatePageNumber = (partial: Partial<PageNumberConfig>) =>
    setGroup('pageNumber', { ...raw?.pageNumber, ...partial });
  const resetPageNumberField = (field: keyof PageNumberConfig) =>
    setGroup('pageNumber', omit(raw?.pageNumber, field));
  const updateLeader = (partial: Partial<LeaderConfig>) => setGroup('leader', { ...raw?.leader, ...partial });
  const resetLeaderField = (field: keyof LeaderConfig) => setGroup('leader', omit(raw?.leader, field));
  const updateSubtitle = (partial: Partial<SubtitleConfig>) => setGroup('subtitle', { ...raw?.subtitle, ...partial });
  const resetSubtitleField = (field: keyof SubtitleConfig) => setGroup('subtitle', omit(raw?.subtitle, field));
  const updateParts = (partial: Partial<PartsRowConfig>) => setGroup('parts', merge(raw?.parts, partial));
  const resetPartsField = (field: keyof PartsRowConfig) => setGroup('parts', omit(raw?.parts, field));

  const firstLevel = resolved.levels[0]!;
  const unnumberedResolved: ResolvedTocEntryStyleConfig = { ...firstLevel, ...resolved.unnumbered };
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;

  return (
    <CollapsibleSection
      title={labels.tocSection}
      sectionId="toc"
      onReset={() => commit(undefined)}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <p className="mb-2 text-xs" style={infoStyle}>
        {labels.tocInfo}
      </p>

      <CollapsibleSection
        title={labels.tocLevels}
        sectionId="toc-levels"
        onReset={() => setGroup('levels', undefined)}
        hasOverrides={!levelsAreDefault}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={infoStyle}>
          {labels.tocLevelsInfo}
        </p>
        {/* The built-in levels stand in while none are stored. */}
        <ShowingDefaultsContext value={levelsAreDefault}>
        {rawLevels.map((level, index) => {
          const resolvedLevel = resolved.levels[index] ?? firstLevel;
          return (
            <SearchScope key={`${level.level}-${index}`} title={`${labels.headingLevel}${level.level}`} overridden={!levelsAreDefault}>
            <div className="mb-3 rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
              <div className="mb-2 flex items-center justify-between gap-1">
                <span className="truncate text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                  {labels.headingLevel}{level.level}
                </span>
                <ConfirmPopover message={labels.tocLevelDeleteConfirm} onConfirm={() => removeLevel(index)}>
                  {({ open }) => (
                    <IconButton label={labels.tocLevelDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
                  )}
                </ConfirmPopover>
              </div>
              <NumberInput
                label={labels.tocLevelNumber}
                value={level.level}
                onChange={(v) => updateLevel(index, { level: Math.min(6, Math.max(1, Math.round(v))) })}
                min={1}
                max={6}
                step={1}
                tooltip={labels.tocLevelNumberTooltip}
              />
              <EntryStyleFields
                raw={level}
                resolved={resolvedLevel}
                onUpdate={(partial) => updateLevel(index, partial)}
                onReset={(field) => resetLevelField(index, field)}
                fieldIdPrefix={`toc-level-${index}`}
                labels={labels}
              />
            </div>
            </SearchScope>
          );
        })}
        </ShowingDefaultsContext>
        <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addLevel} className="mt-1">
          {labels.tocLevelAdd}
        </Button>
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.tocUnnumbered}
        sectionId="toc-unnumbered"
        onReset={() => setGroup('unnumbered', undefined)}
        hasOverrides={hasKeys(raw?.unnumbered)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={infoStyle}>
          {labels.tocUnnumberedInfo}
        </p>
        <EntryStyleFields
          raw={raw?.unnumbered}
          resolved={unnumberedResolved}
          onUpdate={updateUnnumbered}
          onReset={resetUnnumberedField}
          fieldIdPrefix="toc-unnumbered"
          labels={labels}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.tocPageNumber}
        sectionId="toc-page-number"
        onReset={() => setGroup('pageNumber', undefined)}
        hasOverrides={hasKeys(raw?.pageNumber)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <FontPicker
          label={labels.fontLabel}
          value={resolved.pageNumber.fontFamily}
          onChange={(v) => updatePageNumber({ fontFamily: v })}
          isDefault={raw?.pageNumber?.fontFamily === undefined}
          onReset={() => resetPageNumberField('fontFamily')}
          searchPlaceholder={labels.bodyFontSearch}
          noResultsLabel={labels.bodyFontNoResults}
        />
        <DimensionInput
          label={labels.sizeLabel}
          value={resolved.pageNumber.fontSize}
          onChange={(v) => updatePageNumber({ fontSize: v })}
          min={1}
          step={0.5}
          units={TEXT_SIZE_UNITS}
          isDefault={raw?.pageNumber?.fontSize === undefined}
          onReset={() => resetPageNumberField('fontSize')}
        />
        <NumberInput
          label={labels.headingFontWeight}
          value={resolved.pageNumber.fontWeight}
          onChange={(v) => updatePageNumber({ fontWeight: v })}
          min={100}
          max={900}
          step={10}
          isDefault={raw?.pageNumber?.fontWeight === undefined}
          onReset={() => resetPageNumberField('fontWeight')}
        />
        <ToggleSwitch
          label={labels.headingItalic}
          checked={resolved.pageNumber.italic}
          onChange={(v) => updatePageNumber({ italic: v })}
          isDefault={raw?.pageNumber?.italic === undefined}
          onReset={() => resetPageNumberField('italic')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={resolved.pageNumber.color}
          onChange={(v) => updatePageNumber({ color: v })}
          isDefault={raw?.pageNumber?.color === undefined}
          onReset={() => resetPageNumberField('color')}
          fieldId="toc-page-number-color"
        />
        <DimensionInput
          label={labels.tocPageNumberWidth}
          value={resolved.pageNumber.width}
          onChange={(v) => updatePageNumber({ width: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.tocPageNumberWidthTooltip}
          isDefault={raw?.pageNumber?.width === undefined}
          onReset={() => resetPageNumberField('width')}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.tocLeader}
        sectionId="toc-leader"
        onReset={() => setGroup('leader', undefined)}
        hasOverrides={hasKeys(raw?.leader)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <ToggleSwitch
          label={labels.tocLeaderEnabled}
          checked={resolved.leader.enabled}
          onChange={(v) => updateLeader({ enabled: v })}
          tooltip={labels.tocLeaderEnabledTooltip}
          isDefault={raw?.leader?.enabled === undefined}
          onReset={() => resetLeaderField('enabled')}
        />
        {resolved.leader.enabled && (
          <NestedGroup>
            <TextInput
              label={labels.tocLeaderChar}
              value={resolved.leader.char}
              onChange={(v) => updateLeader({ char: v })}
              tooltip={labels.tocLeaderCharTooltip}
              isDefault={raw?.leader?.char === undefined}
              onReset={() => resetLeaderField('char')}
              widthCh={6}
            />
          </NestedGroup>
        )}
        <DimensionInput
          label={labels.tocLeaderGap}
          value={resolved.leader.gap}
          onChange={(v) => updateLeader({ gap: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.tocLeaderGapTooltip}
          isDefault={raw?.leader?.gap === undefined}
          onReset={() => resetLeaderField('gap')}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.tocSubtitle}
        sectionId="toc-subtitle"
        onReset={() => setGroup('subtitle', undefined)}
        hasOverrides={hasKeys(raw?.subtitle)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={infoStyle}>
          {labels.tocSubtitleInfo}
        </p>
        <ToggleSwitch
          label={labels.tocSubtitleEnabled}
          checked={resolved.subtitle.enabled}
          onChange={(v) => updateSubtitle({ enabled: v })}
          isDefault={raw?.subtitle?.enabled === undefined}
          onReset={() => resetSubtitleField('enabled')}
        />
        {resolved.subtitle.enabled && (
          <NestedGroup>
            <TextInput
              label={labels.tocSubtitleAttr}
              value={resolved.subtitle.attr}
              onChange={(v) => updateSubtitle({ attr: v })}
              tooltip={labels.tocSubtitleAttrTooltip}
              isDefault={raw?.subtitle?.attr === undefined}
              onReset={() => resetSubtitleField('attr')}
              widthCh={12}
            />
            <FontPicker
              label={labels.fontLabel}
              value={resolved.subtitle.fontFamily}
              onChange={(v) => updateSubtitle({ fontFamily: v })}
              isDefault={raw?.subtitle?.fontFamily === undefined}
              onReset={() => resetSubtitleField('fontFamily')}
              searchPlaceholder={labels.bodyFontSearch}
              noResultsLabel={labels.bodyFontNoResults}
            />
            <DimensionInput
              label={labels.sizeLabel}
              value={resolved.subtitle.fontSize}
              onChange={(v) => updateSubtitle({ fontSize: v })}
              min={1}
              step={0.5}
              units={TEXT_SIZE_UNITS}
              isDefault={raw?.subtitle?.fontSize === undefined}
              onReset={() => resetSubtitleField('fontSize')}
            />
            <NumberInput
              label={labels.headingFontWeight}
              value={resolved.subtitle.fontWeight}
              onChange={(v) => updateSubtitle({ fontWeight: v })}
              min={100}
              max={900}
              step={10}
              isDefault={raw?.subtitle?.fontWeight === undefined}
              onReset={() => resetSubtitleField('fontWeight')}
            />
            <ToggleSwitch
              label={labels.headingItalic}
              checked={resolved.subtitle.italic}
              onChange={(v) => updateSubtitle({ italic: v })}
              isDefault={raw?.subtitle?.italic === undefined}
              onReset={() => resetSubtitleField('italic')}
            />
            <ColorPicker
              label={labels.colorLabel}
              value={resolved.subtitle.color}
              onChange={(v) => updateSubtitle({ color: v })}
              isDefault={raw?.subtitle?.color === undefined}
              onReset={() => resetSubtitleField('color')}
              fieldId="toc-subtitle-color"
            />
            <DimensionInput
              label={labels.tocSubtitleIndent}
              value={resolved.subtitle.indent}
              onChange={(v) => updateSubtitle({ indent: v })}
              min={0}
              step={0.1}
              units={SPACING_UNITS}
              tooltip={labels.tocSubtitleIndentTooltip}
              isDefault={raw?.subtitle?.indent === undefined}
              onReset={() => resetSubtitleField('indent')}
            />
          </NestedGroup>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.tocParts}
        sectionId="toc-parts"
        onReset={() => setGroup('parts', undefined)}
        hasOverrides={hasKeys(raw?.parts)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <ToggleSwitch
          label={labels.tocPartsEnabled}
          checked={resolved.parts.enabled}
          onChange={(v) => updateParts({ enabled: v })}
          tooltip={labels.tocPartsEnabledTooltip}
          isDefault={raw?.parts?.enabled === undefined}
          onReset={() => resetPartsField('enabled')}
        />
        {resolved.parts.enabled && (
          <NestedGroup>
            <ToggleSwitch
              label={labels.tocPartsBreakBefore}
              checked={resolved.parts.breakBefore}
              onChange={(v) => updateParts({ breakBefore: v })}
              tooltip={labels.tocPartsBreakBeforeTooltip}
              isDefault={raw?.parts?.breakBefore === undefined}
              onReset={() => resetPartsField('breakBefore')}
            />
            <DimensionInput
              label={labels.tocPartsHeight}
              value={resolved.parts.height}
              onChange={(v) => updateParts({ height: v })}
              min={0}
              step={0.1}
              units={SPACING_UNITS}
              tooltip={labels.tocPartsHeightTooltip}
              isDefault={raw?.parts?.height === undefined}
              onReset={() => resetPartsField('height')}
            />
            <DimensionInput
              label={labels.marginTop}
              value={resolved.parts.marginTop}
              onChange={(v) => updateParts({ marginTop: v })}
              min={0}
              step={0.1}
              units={SPACING_UNITS}
              isDefault={raw?.parts?.marginTop === undefined}
              onReset={() => resetPartsField('marginTop')}
            />
            <DimensionInput
              label={labels.marginBottom}
              value={resolved.parts.marginBottom}
              onChange={(v) => updateParts({ marginBottom: v })}
              min={0}
              step={0.1}
              units={SPACING_UNITS}
              isDefault={raw?.parts?.marginBottom === undefined}
              onReset={() => resetPartsField('marginBottom')}
            />
            <p className="px-2 py-1 text-xs" style={infoStyle}>
              {labels.tocPartsDesignInfo}
            </p>
            <SlotEditor
              slotKey="part"
              raw={raw?.parts?.design}
              resolved={raw?.parts?.design ? resolveDesignSlot(raw.parts.design, 'header') : { elements: [] }}
              onUpdate={(slot: DesignSlot | undefined) =>
                updateParts({ design: slot && slot.elements.length > 0 ? slot : undefined })
              }
            />
          </NestedGroup>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
});
