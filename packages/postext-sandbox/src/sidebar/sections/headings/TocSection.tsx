'use client';

import { memo } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { resolveBodyTextConfig, resolveTocConfig, type TocLevelConfig, DEFAULT_TOC_CONFIG, type TocConfig, type TocEntryStyleConfig, type TocLeaderFaceConfig, type ResolvedTocEntryStyleConfig, resolveDesignSlot, type DesignSlot, type TocGroupHead } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { openCard, CollapsibleSection, ItemCardListActions, ItemCard, NumberInput, FontPicker, DimensionInput, ToggleSwitch, ColorPicker, NestedGroup, TextInput, SelectInput } from '../../../controls/index.js';
import { ConfirmPopover, IconButton, Button } from '../../../ui/index.js';
import { SearchScope } from '../../search/SearchScope.js';
import { ShowingDefaultsContext } from '../../../controls/fieldContext.js';
import { SlotEditor } from '../running/HeaderFooterSection/SlotEditor.js';
import { omit, type PageNumberConfig, type LeaderConfig, type SubtitleConfig, type PartsRowConfig, merge, type GroupsConfig, type ContinuationConfig, infoStyle, EntryStyleFields, hasKeys, TEXT_SIZE_UNITS, SPACING_UNITS, LeaderFaceFields, TOC_PART_PLACEHOLDERS } from './TocSection/entryStyleFields.js';

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
  const resolved = resolveTocConfig(raw, bodyText, documentLocale);

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
    openCard('tocLevels', String(rawLevels.length));
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
  // The part rows' leader face (#1121), over `toc.leader`'s.
  const updatePartsLeader = (partial: TocLeaderFaceConfig) => updateParts({ leader: { ...raw?.parts?.leader, ...partial } });
  const resetPartsLeaderField = (field: keyof TocLeaderFaceConfig) => updateParts({ leader: omit(raw?.parts?.leader, field) });
  // What the entry rows' leader is set in while its face is unset: the
  // page number's.
  const leaderShown = {
    color: resolved.leader.color ?? resolved.pageNumber.color,
    fontFamily: resolved.leader.fontFamily ?? resolved.pageNumber.fontFamily,
    fontSize: resolved.leader.fontSize ?? resolved.pageNumber.fontSize,
    fontWeight: resolved.leader.fontWeight ?? resolved.pageNumber.fontWeight,
  };
  // Blocks kept together (#850).
  const updateGroups = (partial: Partial<GroupsConfig>) => setGroup('groups', merge(raw?.groups, partial));
  const resetGroupsField = (field: keyof GroupsConfig) => setGroup('groups', omit(raw?.groups, field));
  const updateContinuation = (partial: Partial<ContinuationConfig>) =>
    updateGroups({ continuation: merge(raw?.groups?.continuation, partial) });
  const resetContinuationField = (field: keyof ContinuationConfig) =>
    updateGroups({ continuation: omit(raw?.groups?.continuation, field) });
  const groupHeadOptions = [
    { value: 'part', label: labels.tocGroupsHeadPart },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: labels.tocGroupsHeadLevel.replace('__n__', String(n)) })),
  ];

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
        <ItemCardListActions list="tocLevels" ids={rawLevels.map((_, i) => String(i))} />
        {rawLevels.map((level, index) => {
          const resolvedLevel = resolved.levels[index] ?? firstLevel;
          return (
            <SearchScope key={`${level.level}-${index}`} title={`${labels.headingLevel}${level.level}`} overridden={!levelsAreDefault}>
            <ItemCard
              list="tocLevels"
              id={String(index)}
              title={`${labels.headingLevel}${level.level}`}
              actions={
                <ConfirmPopover message={labels.tocLevelDeleteConfirm} onConfirm={() => removeLevel(index)}>
                  {({ open }) => (
                    <IconButton label={labels.tocLevelDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
                  )}
                </ConfirmPopover>
              }
            >
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
            </ItemCard>
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
          label={labels.headingItalic} tooltip={labels.italicHelp}
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
        {resolved.leader.enabled && (
          <CollapsibleSection title={labels.tocLeaderFace} sectionId="toc-leader-face" variant="subsection">
            <p className="px-2 py-1 text-xs" style={infoStyle}>
              {labels.tocLeaderFaceInfo}
            </p>
            <LeaderFaceFields
              raw={raw?.leader}
              shown={leaderShown}
              onUpdate={updateLeader}
              onReset={resetLeaderField}
              fieldId="toc-leader-color"
              labels={labels}
            />
          </CollapsibleSection>
        )}
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
          label={labels.tocSubtitleEnabled} tooltip={labels.tocSubtitleInfo}
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
              label={labels.headingItalic} tooltip={labels.italicHelp}
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
            {resolved.leader.enabled && (
              <CollapsibleSection title={labels.tocPartsLeaderFace} sectionId="toc-parts-leader-face" variant="subsection">
                <p className="px-2 py-1 text-xs" style={infoStyle}>
                  {labels.tocPartsLeaderFaceInfo}
                </p>
                <LeaderFaceFields
                  raw={raw?.parts?.leader}
                  shown={leaderShown}
                  onUpdate={updatePartsLeader}
                  onReset={resetPartsLeaderField}
                  fieldId="toc-parts-leader-color"
                  labels={labels}
                />
              </CollapsibleSection>
            )}
            <p className="px-2 py-1 text-xs" style={infoStyle}>
              {labels.tocPartsDesignInfo}
            </p>
            <SlotEditor
              slotKey="part"
              extraPlaceholders={TOC_PART_PLACEHOLDERS}
              raw={raw?.parts?.design}
              resolved={raw?.parts?.design ? resolveDesignSlot(raw.parts.design, 'tocRow') : { elements: [] }}
              onUpdate={(slot: DesignSlot | undefined) =>
                updateParts({ design: slot && slot.elements.length > 0 ? slot : undefined })
              }
            />
          </NestedGroup>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.tocGroups}
        sectionId="toc-groups"
        onReset={() => setGroup('groups', undefined)}
        hasOverrides={hasKeys(raw?.groups)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={infoStyle}>
          {labels.tocGroupsInfo}
        </p>
        <ToggleSwitch
          label={labels.tocGroupsKeepTogether}
          checked={resolved.groups.keepTogether}
          onChange={(v) => updateGroups({ keepTogether: v })}
          tooltip={labels.tocGroupsKeepTogetherTooltip}
          isDefault={raw?.groups?.keepTogether === undefined}
          onReset={() => resetGroupsField('keepTogether')}
        />
        {resolved.groups.keepTogether && (
          <NestedGroup>
            <SelectInput
              label={labels.tocGroupsHead}
              value={String(resolved.groups.head)}
              options={groupHeadOptions}
              onChange={(v) => updateGroups({ head: (v === 'part' ? 'part' : Number(v)) as TocGroupHead })}
              tooltip={labels.tocGroupsHeadTooltip}
              isDefault={raw?.groups?.head === undefined}
              onReset={() => resetGroupsField('head')}
            />
            <NumberInput
              label={labels.tocGroupsMinEntries}
              value={resolved.groups.minEntriesAfterHead}
              onChange={(v) => updateGroups({ minEntriesAfterHead: Math.max(0, Math.round(v)) })}
              min={0}
              max={20}
              step={1}
              tooltip={labels.tocGroupsMinEntriesTooltip}
              isDefault={raw?.groups?.minEntriesAfterHead === undefined}
              onReset={() => resetGroupsField('minEntriesAfterHead')}
            />
            <ToggleSwitch
              label={labels.tocGroupsContinuation}
              checked={resolved.groups.continuation.enabled}
              onChange={(v) => updateContinuation({ enabled: v })}
              tooltip={labels.tocGroupsContinuationTooltip}
              isDefault={raw?.groups?.continuation?.enabled === undefined}
              onReset={() => resetContinuationField('enabled')}
            />
            {resolved.groups.continuation.enabled && (
              <TextInput
                label={labels.tocGroupsMark}
                value={resolved.groups.continuation.mark}
                onChange={(v) => updateContinuation({ mark: v.length > 0 ? v : undefined })}
                tooltip={labels.tocGroupsMarkTooltip}
                isDefault={raw?.groups?.continuation?.mark === undefined}
                onReset={() => resetContinuationField('mark')}
                widthCh={12}
              />
            )}
          </NestedGroup>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
});
