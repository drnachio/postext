'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  resolveBodyTextConfig,
  resolveDesignSlot,
  resolveOrderedListsConfig,
  resolvePageConfig,
  resolvePartsConfig,
  resolveUnorderedListsConfig,
} from 'postext';
import type {
  DesignSlot,
  DimensionUnit,
  HeadingBreakParity,
  OrderedListsConfig,
  PageMargins,
  PartsBodyStyleConfig,
  PartsBreakAfterConfig,
  PartsBreakBeforeConfig,
  PartsConfig,
  TextAlign,
  UnorderedListsConfig,
} from 'postext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NestedGroup,
  SelectInput,
  ToggleSwitch,
} from '../../controls';
import { SlotEditor } from './HeaderFooterSection/SlotEditor';
import { PartsOrderedListsOverrides, PartsUnorderedListsOverrides } from './PartsListOverrides';
import { breakParityOptions } from './HeadingsSection/breakParityOptions';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

type MarginSide = 'top' | 'bottom' | 'left' | 'right';

/** Copy of `obj` without `key`; `undefined` when nothing remains. */
function omit<T extends object, K extends keyof T>(obj: T | undefined, key: K): T | undefined {
  if (!obj) return undefined;
  const next = { ...obj };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

/** `:::part` container pages: opener/closer breaks, body area, opener
 *  design and the typography of the blocks inside. Every value shown is the
 *  resolved one (`resolvePartsConfig`), so margins and body style display
 *  what they inherit from the page, body text and list sections until
 *  overridden; each field resets by dropping its own key. */
export const PartsSection = memo(function PartsSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.parts);
  const pageRaw = useSandboxSelector((s) => s.config.page);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const unorderedRaw = useSandboxSelector((s) => s.config.unorderedLists);
  const orderedRaw = useSandboxSelector((s) => s.config.orderedLists);

  const page = resolvePageConfig(pageRaw);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const unorderedLists = resolveUnorderedListsConfig(unorderedRaw, bodyText);
  const orderedLists = resolveOrderedListsConfig(orderedRaw, bodyText);
  const parts = resolvePartsConfig(raw, page, bodyText, unorderedLists, orderedLists);

  const commit = (next: PartsConfig | undefined) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { parts: next && Object.keys(next).length > 0 ? next : undefined },
    });
  };

  const setGroup = <K extends keyof PartsConfig>(key: K, value: PartsConfig[K] | undefined) => {
    const next: PartsConfig = { ...raw };
    if (value === undefined) delete next[key];
    else next[key] = value;
    commit(next);
  };

  const updateBreakBefore = (partial: PartsBreakBeforeConfig) =>
    setGroup('breakBefore', { ...raw?.breakBefore, ...partial });
  const updateBreakAfter = (partial: PartsBreakAfterConfig) =>
    setGroup('breakAfter', { ...raw?.breakAfter, ...partial });
  const updateMargins = (partial: PageMargins) =>
    setGroup('margins', { ...raw?.margins, ...partial });
  const updateBodyStyle = (partial: PartsBodyStyleConfig) =>
    setGroup('bodyStyle', { ...raw?.bodyStyle, ...partial });

  const resetMargin = (side: MarginSide | 'mirror') =>
    setGroup('margins', omit(raw?.margins, side));
  const resetBodyStyle = (field: keyof PartsBodyStyleConfig) =>
    setGroup('bodyStyle', omit(raw?.bodyStyle, field));

  // List overrides inside the part: each group is a partial list config
  // under `bodyStyle`; dropping its last field drops the group.
  const updateOrderedOverride = (partial: Partial<OrderedListsConfig>) =>
    updateBodyStyle({ orderedLists: { ...raw?.bodyStyle?.orderedLists, ...partial } });
  const resetOrderedOverride = (field: keyof OrderedListsConfig) => {
    const next = omit(raw?.bodyStyle?.orderedLists, field);
    if (next) updateBodyStyle({ orderedLists: next });
    else resetBodyStyle('orderedLists');
  };
  const updateUnorderedOverride = (partial: Partial<UnorderedListsConfig>) =>
    updateBodyStyle({ unorderedLists: { ...raw?.bodyStyle?.unorderedLists, ...partial } });
  const resetUnorderedOverride = (field: keyof UnorderedListsConfig) => {
    const next = omit(raw?.bodyStyle?.unorderedLists, field);
    if (next) updateBodyStyle({ unorderedLists: next });
    else resetBodyStyle('unorderedLists');
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const hasMarginOverrides = raw?.margins !== undefined && Object.keys(raw.margins).length > 0;
  const hasDesignOverride = raw?.design !== undefined;
  const hasVersoDesignOverride = raw?.versoDesign !== undefined;
  const hasBodyStyleOverrides = raw?.bodyStyle !== undefined && Object.keys(raw.bodyStyle).length > 0;

  const mirror = parts.margins.mirror ?? false;
  const PARITY_OPTIONS = breakParityOptions(labels);
  const ALIGN_OPTIONS = [
    { value: 'left', label: labels.bodyTextAlignLeft },
    { value: 'justify', label: labels.bodyTextAlignJustify },
    { value: 'center', label: labels.partsBodyTextAlignCenter },
  ];

  const marginField = (side: MarginSide, label: string) => (
    <DimensionInput
      label={label}
      value={parts.margins[side]}
      onChange={(dim) => updateMargins({ [side]: dim })}
      min={0}
      tooltip={labels.partsMarginsTooltip}
      isDefault={raw?.margins?.[side] === undefined}
      onReset={() => resetMargin(side)}
    />
  );

  return (
    <CollapsibleSection
      title={labels.parts}
      sectionId="parts"
      onReset={() => commit(undefined)}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SelectInput
        label={labels.partsBreakBeforeParity}
        value={parts.breakBefore.parity}
        options={PARITY_OPTIONS}
        onChange={(v) => updateBreakBefore({ parity: v as HeadingBreakParity })}
        tooltip={labels.partsBreakBeforeParityTooltip}
        isDefault={raw?.breakBefore?.parity === undefined}
        onReset={() => setGroup('breakBefore', omit(raw?.breakBefore, 'parity'))}
      />

      <ToggleSwitch
        label={labels.partsBreakAfter}
        checked={parts.breakAfter.enabled}
        onChange={(v) => updateBreakAfter({ enabled: v })}
        tooltip={labels.partsBreakAfterTooltip}
        isDefault={raw?.breakAfter?.enabled === undefined}
        onReset={() => setGroup('breakAfter', omit(raw?.breakAfter, 'enabled'))}
      />
      {parts.breakAfter.enabled && (
        <NestedGroup>
          <SelectInput
            label={labels.partsBreakAfterParity}
            value={parts.breakAfter.parity}
            options={PARITY_OPTIONS}
            onChange={(v) => updateBreakAfter({ parity: v as HeadingBreakParity })}
            tooltip={labels.partsBreakAfterParityTooltip}
            isDefault={raw?.breakAfter?.parity === undefined}
            onReset={() => setGroup('breakAfter', omit(raw?.breakAfter, 'parity'))}
          />
        </NestedGroup>
      )}

      <CollapsibleSection
        title={labels.partsMargins}
        sectionId="parts-margins"
        onReset={() => setGroup('margins', undefined)}
        hasOverrides={hasMarginOverrides}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        {marginField('top', labels.marginTop)}
        {marginField('bottom', labels.marginBottom)}
        <ToggleSwitch
          label={labels.pageMarginsMirror}
          checked={mirror}
          onChange={(v) => updateMargins({ mirror: v })}
          tooltip={labels.pageMarginsMirrorTooltip}
          isDefault={raw?.margins?.mirror === undefined}
          onReset={() => resetMargin('mirror')}
        />
        {marginField('left', mirror ? labels.pageMarginsInner : labels.marginLeft)}
        {marginField('right', mirror ? labels.pageMarginsOuter : labels.marginRight)}
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.partsDesign}
        sectionId="parts-design"
        onReset={() => setGroup('design', undefined)}
        hasOverrides={hasDesignOverride}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.partsDesignInfo}
        </p>
        <SlotEditor
          slotKey="part"
          raw={raw?.design}
          resolved={resolveDesignSlot(raw?.design, 'header')}
          onUpdate={(slot: DesignSlot | undefined) => {
            setGroup('design', slot && slot.elements.length > 0 ? slot : undefined);
          }}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.partsVersoDesign}
        sectionId="parts-verso-design"
        onReset={() => setGroup('versoDesign', undefined)}
        hasOverrides={hasVersoDesignOverride}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.partsVersoDesignInfo}
        </p>
        <SlotEditor
          slotKey="part"
          raw={raw?.versoDesign}
          resolved={resolveDesignSlot(raw?.versoDesign, 'header')}
          onUpdate={(slot: DesignSlot | undefined) => {
            setGroup('versoDesign', slot && slot.elements.length > 0 ? slot : undefined);
          }}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.partsBodyStyle}
        sectionId="parts-body"
        onReset={() => setGroup('bodyStyle', undefined)}
        hasOverrides={hasBodyStyleOverrides}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <FontPicker
          label={labels.partsBodyFont}
          value={parts.bodyStyle.fontFamily}
          onChange={(font) => updateBodyStyle({ fontFamily: font })}
          tooltip={labels.partsBodyFontTooltip}
          isDefault={raw?.bodyStyle?.fontFamily === undefined}
          onReset={() => resetBodyStyle('fontFamily')}
          searchPlaceholder={labels.bodyFontSearch}
          noResultsLabel={labels.bodyFontNoResults}
        />
        <DimensionInput
          label={labels.partsBodyFontSize}
          value={parts.bodyStyle.fontSize}
          onChange={(dim) => updateBodyStyle({ fontSize: dim })}
          min={1}
          step={0.5}
          tooltip={labels.partsBodyFontSizeTooltip}
          isDefault={raw?.bodyStyle?.fontSize === undefined}
          onReset={() => resetBodyStyle('fontSize')}
          units={TEXT_SIZE_UNITS}
        />
        <DimensionInput
          label={labels.partsBodyLineHeight}
          value={parts.bodyStyle.lineHeight}
          onChange={(dim) => updateBodyStyle({ lineHeight: dim })}
          min={0.5}
          max={5}
          step={0.1}
          tooltip={labels.partsBodyLineHeightTooltip}
          isDefault={raw?.bodyStyle?.lineHeight === undefined}
          onReset={() => resetBodyStyle('lineHeight')}
          units={LINE_HEIGHT_UNITS}
        />
        <ColorPicker
          label={labels.partsBodyColor}
          value={parts.bodyStyle.color}
          onChange={(color) => updateBodyStyle({ color })}
          tooltip={labels.partsBodyColorTooltip}
          isDefault={raw?.bodyStyle?.color === undefined}
          onReset={() => resetBodyStyle('color')}
          fieldId="parts-body-color"
        />
        <SelectInput
          label={labels.partsBodyTextAlign}
          value={parts.bodyStyle.textAlign}
          options={ALIGN_OPTIONS}
          onChange={(v) => updateBodyStyle({ textAlign: v as TextAlign })}
          tooltip={labels.partsBodyTextAlignTooltip}
          isDefault={raw?.bodyStyle?.textAlign === undefined}
          onReset={() => resetBodyStyle('textAlign')}
        />
        <ColorPicker
          label={labels.partsBodyBulletColor}
          value={parts.bodyStyle.bulletColor}
          onChange={(color) => updateBodyStyle({ bulletColor: color })}
          tooltip={labels.partsBodyBulletColorTooltip}
          isDefault={raw?.bodyStyle?.bulletColor === undefined}
          onReset={() => resetBodyStyle('bulletColor')}
          fieldId="parts-body-bullet-color"
        />
        <ColorPicker
          label={labels.partsBodyNumberColor}
          value={parts.bodyStyle.numberColor}
          onChange={(color) => updateBodyStyle({ numberColor: color })}
          tooltip={labels.partsBodyNumberColorTooltip}
          isDefault={raw?.bodyStyle?.numberColor === undefined}
          onReset={() => resetBodyStyle('numberColor')}
          fieldId="parts-body-number-color"
        />
        <PartsOrderedListsOverrides
          raw={raw?.bodyStyle?.orderedLists}
          base={orderedLists}
          onUpdate={updateOrderedOverride}
          onReset={resetOrderedOverride}
          onResetAll={() => resetBodyStyle('orderedLists')}
          labels={labels}
        />
        <PartsUnorderedListsOverrides
          raw={raw?.bodyStyle?.unorderedLists}
          base={unorderedLists}
          onUpdate={updateUnorderedOverride}
          onReset={resetUnorderedOverride}
          onResetAll={() => resetBodyStyle('unorderedLists')}
          labels={labels}
        />
      </CollapsibleSection>
    </CollapsibleSection>
  );
});
