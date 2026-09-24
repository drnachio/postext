'use client';

import { memo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  ColorPaletteEntry,
  ColorValue,
  DesignSlot,
  Dimension,
  DimensionUnit,
  HeadingAdvancedDesignConfig,
  HeadingBreakBeforeConfig,
  HeadingBreakParity,
  HeadingSpan,
  HeadingStyleConfig,
  HeadingTextTransform,
  LayoutConfig,
  OrderedListsConfig,
  PageMargins,
  PartsBodyStyleConfig,
  ResolvedDesignSlot,
  ResolvedHeadingLevelConfig,
  TextAlign,
  UnorderedListsConfig,
} from 'postext';
import {
  DEFAULT_COLOR_PALETTE,
  DEFAULT_COLUMN_RULE,
  resolveBodyTextConfig,
  resolveDesignSlot,
  resolveHeaderFooterConfig,
  resolveHeadingsConfig,
  resolveLayoutConfig,
  resolveOrderedListsConfig,
  resolvePageConfig,
  resolveUnorderedListsConfig,
} from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NestedGroup,
  NumberInput,
  SelectInput,
  ToggleSwitch,
  ChoiceInput,
} from '../../controls';
import { ColumnsPicture } from '../settings/pictures';
import { Button, ConfirmPopover, IconButton } from '../../ui';
import { FieldRow } from '../../controls/FieldRow';
import { SearchScope } from '../search/SearchScope';
import { SlotEditor } from './HeaderFooterSection/SlotEditor';
import { PartsOrderedListsOverrides, PartsUnorderedListsOverrides } from './PartsListOverrides';
import { breakParityOptions } from './HeadingsSection/breakParityOptions';

const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const MARGIN_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const MIN_HEIGHT_UNITS: DimensionUnit[] = ['pt', 'mm', 'cm', 'in', 'em', 'px'];
const ZERO_PT: Dimension = { value: 0, unit: 'pt' };

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--rule)', color: 'var(--foreground)' } as const;
const infoStyle = { color: 'var(--slate)' } as const;

type MarginSide = 'top' | 'bottom' | 'left' | 'right';

/** Turn free text into a `{style="…"}`-friendly id. */
function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nextStyleId(existing: HeadingStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`style-${n}`)) n++;
  return `style-${n}`;
}

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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <FieldRow stacked label={label} hint={hint} className="mb-0">
      {children}
    </FieldRow>
  );
}

interface Baselines {
  /** The H1 level, resolved — what an unset heading field falls back to for display. */
  level: ResolvedHeadingLevelConfig;
  page: ReturnType<typeof resolvePageConfig>;
  layout: ReturnType<typeof resolveLayoutConfig>;
  bodyText: ReturnType<typeof resolveBodyTextConfig>;
  unorderedLists: ReturnType<typeof resolveUnorderedListsConfig>;
  orderedLists: ReturnType<typeof resolveOrderedListsConfig>;
  palette: ColorPaletteEntry[];
  documentHeader: ResolvedDesignSlot;
  documentFooter: ResolvedDesignSlot;
}

interface HeadingStyleCardProps {
  style: HeadingStyleConfig;
  otherIds: Set<string>;
  base: Baselines;
  onChange: (partial: Partial<HeadingStyleConfig>) => void;
  onRename: (nextId: string) => void;
  onRemove: () => void;
}

/** One heading style: identity, what it counts for, the heading's own
 *  typography (the level fields it overrides), the running heads, geometry,
 *  body typography and palette of the section it opens. Every unset field
 *  shows the value it inherits — the H1 level, the page, the document layout,
 *  the body text — and resets by dropping its key. */
function HeadingStyleCard({ style, otherIds, base, onChange, onRename, onRemove }: HeadingStyleCardProps) {
  const labels = useSandboxLabels();
  const [idDraft, setIdDraft] = useState(style.id);
  const draftSlug = slugifyStyleId(idDraft);
  const idTaken = draftSlug.length > 0 && draftSlug !== style.id && otherIds.has(draftSlug);
  const idEmpty = draftSlug.length === 0;
  const prefix = `heading-styles.${style.id}`;

  const commitId = () => {
    if (idEmpty || idTaken) {
      setIdDraft(style.id);
      return;
    }
    setIdDraft(draftSlug);
    if (draftSlug !== style.id) onRename(draftSlug);
  };

  const set = <K extends keyof HeadingStyleConfig>(key: K, value: HeadingStyleConfig[K] | undefined) => {
    onChange({ [key]: value } as Partial<HeadingStyleConfig>);
  };
  const unset = (field: keyof HeadingStyleConfig) => style[field] === undefined;

  // --- heading typography (the level fields) ---
  const lvl = base.level;
  const rawAdvanced = style.advancedDesign;
  const advancedEnabled = rawAdvanced?.enabled ?? false;
  const updateAdvanced = (partial: Partial<HeadingAdvancedDesignConfig>) => {
    const next: HeadingAdvancedDesignConfig = {
      enabled: rawAdvanced?.enabled ?? false,
      slot: rawAdvanced?.slot ?? { elements: [] },
      ...(rawAdvanced?.minHeight ? { minHeight: rawAdvanced.minHeight } : {}),
      ...partial,
    };
    if (partial.minHeight === undefined && 'minHeight' in partial) delete next.minHeight;
    set('advancedDesign', next);
  };
  const headingFields: (keyof HeadingStyleConfig)[] = [
    'fontSize', 'lineHeight', 'fontFamily', 'fontWeight', 'color', 'italic', 'textTransform',
    'marginTop', 'marginBottom', 'breakBefore', 'span', 'advancedDesign',
  ];
  const hasHeadingOverrides = headingFields.some((f) => style[f] !== undefined);
  const resetHeadingFields = () => {
    const partial: Partial<HeadingStyleConfig> = {};
    for (const f of headingFields) (partial as Record<string, unknown>)[f] = undefined;
    onChange(partial);
  };

  // --- margins / layout / body style ---
  const margins = style.margins;
  const updateMargins = (partial: PageMargins) => set('margins', { ...margins, ...partial });
  const resetMargin = (side: MarginSide | 'mirror') => set('margins', omit(margins, side));
  const mirror = margins?.mirror ?? base.page.margins.mirror ?? false;

  const layout = style.layout;
  const resolvedLayout = layout ? resolveLayoutConfig(layout) : base.layout;
  const updateLayout = (partial: Partial<LayoutConfig>) => set('layout', { ...layout, ...partial });
  const resetLayoutField = (field: keyof LayoutConfig) => set('layout', omit(layout, field));
  const updateColumnRule = (partial: Partial<NonNullable<LayoutConfig['columnRule']>>) =>
    updateLayout({ columnRule: { ...layout?.columnRule, ...partial } });
  const resetColumnRuleField = (field: keyof NonNullable<LayoutConfig['columnRule']>) => {
    const next = omit(layout?.columnRule, field);
    if (next) updateLayout({ columnRule: next });
    else resetLayoutField('columnRule');
  };
  const showGutter = resolvedLayout.layoutType === 'double' || resolvedLayout.layoutType === 'oneAndHalf';
  const showSideCol = resolvedLayout.layoutType === 'oneAndHalf';

  const body = style.bodyStyle;
  const updateBodyStyle = (partial: PartsBodyStyleConfig) => set('bodyStyle', { ...body, ...partial });
  const resetBodyStyle = (field: keyof PartsBodyStyleConfig) => set('bodyStyle', omit(body, field));
  const updateOrderedOverride = (partial: Partial<OrderedListsConfig>) =>
    updateBodyStyle({ orderedLists: { ...body?.orderedLists, ...partial } });
  const resetOrderedOverride = (field: keyof OrderedListsConfig) => {
    const next = omit(body?.orderedLists, field);
    if (next) updateBodyStyle({ orderedLists: next });
    else resetBodyStyle('orderedLists');
  };
  const updateUnorderedOverride = (partial: Partial<UnorderedListsConfig>) =>
    updateBodyStyle({ unorderedLists: { ...body?.unorderedLists, ...partial } });
  const resetUnorderedOverride = (field: keyof UnorderedListsConfig) => {
    const next = omit(body?.unorderedLists, field);
    if (next) updateBodyStyle({ unorderedLists: next });
    else resetBodyStyle('unorderedLists');
  };

  // --- palette overrides (palette id → hex) ---
  const palette = style.palette ?? {};
  const setPaletteColor = (id: string, hex: string | undefined) => {
    const next: Record<string, string> = { ...palette };
    if (hex === undefined) delete next[id];
    else next[id] = hex;
    set('palette', Object.keys(next).length > 0 ? next : undefined);
  };

  const PARITY_OPTIONS = breakParityOptions(labels);
  const ALIGN_OPTIONS = [
    { value: 'left', label: labels.bodyTextAlignLeft },
    { value: 'justify', label: labels.bodyTextAlignJustify },
    { value: 'center', label: labels.partsBodyTextAlignCenter },
  ];
  const LAYOUT_TYPE_OPTIONS = [
    { value: 'single' as const, label: labels.layoutSingle, description: labels.layoutSingleDescription, picture: <ColumnsPicture kind="single" /> },
    { value: 'double' as const, label: labels.layoutDouble, description: labels.layoutDoubleDescription, picture: <ColumnsPicture kind="double" /> },
    { value: 'oneAndHalf' as const, label: labels.layoutOneAndHalf, description: labels.layoutOneAndHalfDescription, picture: <ColumnsPicture kind="oneAndHalf" /> },
  ];
  const SIDE_ROLE_OPTIONS = [
    { value: 'text', label: labels.sideColumnRoleText },
    { value: 'floats', label: labels.sideColumnRoleFloats },
  ];
  const SIDE_SIDE_OPTIONS = [
    { value: 'right', label: labels.sideColumnSideRight },
    { value: 'left', label: labels.sideColumnSideLeft },
    { value: 'outer', label: labels.sideColumnSideOuter },
    { value: 'inner', label: labels.sideColumnSideInner },
  ];

  const marginField = (side: MarginSide, label: string) => (
    <DimensionInput
      label={label}
      value={margins?.[side] ?? base.page.margins[side]}
      onChange={(dim) => updateMargins({ [side]: dim })}
      min={0}
      tooltip={labels.headingStyleMarginsTooltip}
      isDefault={margins?.[side] === undefined}
      onReset={() => resetMargin(side)}
    />
  );

  const slotSection = (key: 'header' | 'footer', title: string, documentSlot: ResolvedDesignSlot) => {
    const raw = style[key];
    return (
      <CollapsibleSection
        title={title}
        sectionId={`${prefix}.${key}`}
        variant="subsection"
        onReset={() => set(key, undefined)}
        hasOverrides={raw !== undefined}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={infoStyle}>
          {labels.headingStyleRunningHeadsInfo}
        </p>
        {raw === undefined && (
          <Button
            variant="outline"
            size="xs"
            onClick={() => set(key, { elements: documentSlot.elements as DesignSlot['elements'] })}
            className="mb-1"
          >
            {labels.headingStyleCopyDocumentSlot}
          </Button>
        )}
        <SlotEditor
          slotKey={key}
          raw={raw}
          resolved={raw ? resolveDesignSlot(raw, key) : { elements: [] }}
          onUpdate={(slot: DesignSlot | undefined) => set(key, slot)}
        />
      </CollapsibleSection>
    );
  };

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden>
    <div className="mb-3 rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <span className="truncate text-xs font-medium" style={{ color: 'var(--foreground)' }} title={style.name ?? style.id}>
          {style.name || style.id}
        </span>
        <ConfirmPopover message={labels.headingStyleDeleteConfirm} onConfirm={onRemove}>
          {({ open }) => (
            <IconButton label={labels.headingStyleDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
          )}
        </ConfirmPopover>
      </div>

      <div className="mb-2 flex flex-col gap-2">
        <Field
          label={labels.idLabel}
          hint={idTaken ? labels.paragraphStyleIdHintDuplicate : labels.headingStyleUsageHint.replace('__id__', style.id)}
        >
          <input
            type="text"
            value={idDraft}
            onChange={(e) => setIdDraft(e.target.value)}
            onBlur={commitId}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            aria-label={labels.headingStyleIdAria}
            className={inputClass}
            style={{ ...inputStyle, borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)' }}
          />
        </Field>
        <Field label={labels.paragraphStyleNameLabel}>
          <input
            type="text"
            value={style.name ?? ''}
            onChange={(e) => set('name', e.target.value.length > 0 ? e.target.value : undefined)}
            aria-label={labels.headingStyleNameAria}
            placeholder={style.id}
            className={inputClass}
            style={inputStyle}
          />
        </Field>
      </div>

      <ToggleSwitch
        label={labels.headingStyleNumbered}
        checked={style.numbered ?? true}
        onChange={(v) => set('numbered', v)}
        tooltip={labels.headingStyleNumberedTooltip}
        isDefault={unset('numbered')}
        onReset={() => set('numbered', undefined)}
      />
      <ToggleSwitch
        label={labels.headingStyleToc}
        checked={style.toc ?? true}
        onChange={(v) => set('toc', v)}
        tooltip={labels.headingStyleTocTooltip}
        isDefault={unset('toc')}
        onReset={() => set('toc', undefined)}
      />

      <CollapsibleSection
        title={labels.headingStyleHeading}
        sectionId={`${prefix}.heading`}
        variant="subsection"
        onReset={resetHeadingFields}
        hasOverrides={hasHeadingOverrides}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={infoStyle}>
          {labels.headingStyleHeadingInfo}
        </p>
        <DimensionInput
          label={labels.headingFontSize}
          value={style.fontSize ?? lvl.fontSize}
          onChange={(dim) => set('fontSize', dim)}
          min={1}
          step={0.5}
          tooltip={labels.headingFontSizeTooltip}
          isDefault={unset('fontSize')}
          onReset={() => set('fontSize', undefined)}
          units={TEXT_SIZE_UNITS}
        />
        <DimensionInput
          label={labels.headingLineHeight}
          value={style.lineHeight ?? lvl.lineHeight}
          onChange={(dim) => set('lineHeight', dim)}
          min={0.5}
          max={5}
          step={0.1}
          tooltip={labels.headingLineHeightTooltip}
          isDefault={unset('lineHeight')}
          onReset={() => set('lineHeight', undefined)}
          units={LINE_HEIGHT_UNITS}
        />
        <FontPicker
          label={labels.headingFont}
          value={style.fontFamily ?? lvl.fontFamily}
          onChange={(font) => set('fontFamily', font)}
          tooltip={labels.headingFontTooltip}
          isDefault={unset('fontFamily')}
          onReset={() => set('fontFamily', undefined)}
          searchPlaceholder={labels.headingFontSearch}
          noResultsLabel={labels.headingFontNoResults}
        />
        <NumberInput
          label={labels.headingFontWeight}
          value={style.fontWeight ?? lvl.fontWeight}
          onChange={(w) => set('fontWeight', w)}
          min={100}
          max={900}
          step={10}
          tooltip={labels.headingFontWeightTooltip}
          isDefault={unset('fontWeight')}
          onReset={() => set('fontWeight', undefined)}
        />
        <ColorPicker
          label={labels.headingColor}
          value={style.color ?? lvl.color}
          onChange={(color) => set('color', color)}
          tooltip={labels.headingColorTooltip}
          isDefault={unset('color')}
          onReset={() => set('color', undefined)}
          fieldId={`${prefix}-color`}
        />
        <ToggleSwitch
          label={labels.headingItalic}
          checked={style.italic ?? lvl.italic}
          onChange={(v) => set('italic', v)}
          tooltip={labels.headingItalicTooltip}
          isDefault={unset('italic')}
          onReset={() => set('italic', undefined)}
        />
        <SelectInput
          label={labels.headingTextTransform}
          value={style.textTransform ?? lvl.textTransform}
          options={[
            { value: 'none', label: labels.headingTextTransformNone },
            { value: 'uppercase', label: labels.headingTextTransformUppercase },
          ]}
          onChange={(v) => set('textTransform', v as HeadingTextTransform)}
          tooltip={labels.headingTextTransformTooltip}
          isDefault={unset('textTransform')}
          onReset={() => set('textTransform', undefined)}
        />
        <DimensionInput
          label={labels.headingMarginTop}
          value={style.marginTop ?? lvl.marginTop}
          onChange={(dim) => set('marginTop', dim)}
          min={0}
          step={0.1}
          tooltip={labels.headingMarginTopTooltip}
          isDefault={unset('marginTop')}
          onReset={() => set('marginTop', undefined)}
          units={MARGIN_UNITS}
        />
        <DimensionInput
          label={labels.headingMarginBottom}
          value={style.marginBottom ?? lvl.marginBottom}
          onChange={(dim) => set('marginBottom', dim)}
          min={0}
          step={0.1}
          tooltip={labels.headingMarginBottomTooltip}
          isDefault={unset('marginBottom')}
          onReset={() => set('marginBottom', undefined)}
          units={MARGIN_UNITS}
        />
        <ToggleSwitch
          label={labels.headingBreakBefore}
          checked={style.breakBefore?.enabled ?? lvl.breakBefore.enabled}
          onChange={(v) => {
            const next: HeadingBreakBeforeConfig = { enabled: v };
            const parity = style.breakBefore?.parity;
            if (parity && parity !== 'any') next.parity = parity;
            set('breakBefore', next);
          }}
          tooltip={labels.headingBreakBeforeTooltip}
          isDefault={unset('breakBefore')}
          onReset={() => set('breakBefore', undefined)}
        />
        {(style.breakBefore?.enabled ?? lvl.breakBefore.enabled) && (
          <NestedGroup>
            <SelectInput
              label={labels.headingBreakBeforeParity}
              value={style.breakBefore?.parity ?? lvl.breakBefore.parity}
              options={PARITY_OPTIONS}
              onChange={(v) => set('breakBefore', { enabled: true, parity: v as HeadingBreakParity })}
              tooltip={labels.headingBreakBeforeParityTooltip}
              isDefault={style.breakBefore?.parity === undefined}
              onReset={() => set('breakBefore', { enabled: true })}
            />
          </NestedGroup>
        )}
        <SelectInput
          label={labels.headingSpan}
          value={style.span ?? lvl.span}
          options={[
            { value: 'column', label: labels.headingSpanColumn },
            { value: 'page', label: labels.headingSpanPage },
          ]}
          onChange={(v) => set('span', v as HeadingSpan)}
          tooltip={labels.headingSpanTooltip}
          isDefault={unset('span')}
          onReset={() => set('span', undefined)}
        />
        <ToggleSwitch
          label={labels.headingAdvancedDesign}
          checked={advancedEnabled}
          onChange={(v) => updateAdvanced({ enabled: v })}
          tooltip={labels.headingAdvancedDesignTooltip}
          isDefault={unset('advancedDesign')}
          onReset={() => set('advancedDesign', undefined)}
        />
        {advancedEnabled && (
          <NestedGroup>
            <p className="px-2 py-1 text-xs" style={infoStyle}>
              {labels.headingAdvancedDesignInfo}
            </p>
            <DimensionInput
              label={labels.headingAdvancedMinHeight}
              value={rawAdvanced?.minHeight ?? ZERO_PT}
              onChange={(dim) => updateAdvanced({ minHeight: dim })}
              min={0}
              step={1}
              tooltip={labels.headingAdvancedMinHeightTooltip}
              isDefault={rawAdvanced?.minHeight === undefined}
              onReset={() => updateAdvanced({ minHeight: undefined })}
              units={MIN_HEIGHT_UNITS}
            />
            <SlotEditor
              slotKey="heading"
              raw={rawAdvanced?.slot}
              resolved={resolveDesignSlot(rawAdvanced?.slot, 'header')}
              onUpdate={(slot: DesignSlot | undefined) => updateAdvanced({ enabled: true, slot: slot ?? { elements: [] } })}
            />
          </NestedGroup>
        )}
      </CollapsibleSection>

      {slotSection('header', labels.header, base.documentHeader)}
      {slotSection('footer', labels.footer, base.documentFooter)}

      <CollapsibleSection
        title={labels.partsMargins}
        sectionId={`${prefix}.margins`}
        variant="subsection"
        onReset={() => set('margins', undefined)}
        hasOverrides={hasKeys(margins)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={infoStyle}>
          {labels.headingStyleMarginsInfo}
        </p>
        {marginField('top', labels.marginTop)}
        {marginField('bottom', labels.marginBottom)}
        <ToggleSwitch
          label={labels.pageMarginsMirror}
          checked={mirror}
          onChange={(v) => updateMargins({ mirror: v })}
          tooltip={labels.pageMarginsMirrorTooltip}
          isDefault={margins?.mirror === undefined}
          onReset={() => resetMargin('mirror')}
        />
        {marginField('left', mirror ? labels.pageMarginsInner : labels.marginLeft)}
        {marginField('right', mirror ? labels.pageMarginsOuter : labels.marginRight)}
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.layout}
        sectionId={`${prefix}.layout`}
        variant="subsection"
        onReset={() => set('layout', undefined)}
        hasOverrides={hasKeys(layout)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={infoStyle}>
          {labels.headingStyleLayoutInfo}
        </p>
        <ChoiceInput
          label={labels.layoutType}
          value={resolvedLayout.layoutType}
          options={LAYOUT_TYPE_OPTIONS}
          onChange={(v) => updateLayout({ layoutType: v as LayoutConfig['layoutType'] })}
          tooltip={labels.layoutTypeTooltip}
          isDefault={layout?.layoutType === undefined}
          onReset={() => resetLayoutField('layoutType')}
        />
        {(showGutter || showSideCol) && (
          <NestedGroup>
            {showGutter && (
              <DimensionInput
                label={labels.gutterWidth}
                value={resolvedLayout.gutterWidth}
                onChange={(dim: Dimension) => updateLayout({ gutterWidth: dim })}
                min={0}
                step={0.1}
                tooltip={labels.gutterWidthTooltip}
                isDefault={layout?.gutterWidth === undefined}
                onReset={() => resetLayoutField('gutterWidth')}
              />
            )}
            {showSideCol && (
              <NumberInput
                label={labels.sideColumnPercent}
                value={resolvedLayout.sideColumnPercent}
                onChange={(v) => updateLayout({ sideColumnPercent: v })}
                min={10}
                max={50}
                step={1}
                tooltip={labels.sideColumnPercentTooltip}
                isDefault={layout?.sideColumnPercent === undefined}
                onReset={() => resetLayoutField('sideColumnPercent')}
                suffix="%"
              />
            )}
            {showSideCol && (
              <SelectInput
                label={labels.sideColumnRole}
                value={resolvedLayout.sideColumnRole}
                options={SIDE_ROLE_OPTIONS}
                onChange={(v) => updateLayout({ sideColumnRole: v as LayoutConfig['sideColumnRole'] })}
                tooltip={labels.sideColumnRoleTooltip}
                isDefault={layout?.sideColumnRole === undefined}
                onReset={() => resetLayoutField('sideColumnRole')}
              />
            )}
            {showSideCol && (
              <SelectInput
                label={labels.sideColumnSide}
                value={resolvedLayout.sideColumnSide}
                options={SIDE_SIDE_OPTIONS}
                onChange={(v) => updateLayout({ sideColumnSide: v as LayoutConfig['sideColumnSide'] })}
                tooltip={labels.sideColumnSideTooltip}
                isDefault={layout?.sideColumnSide === undefined}
                onReset={() => resetLayoutField('sideColumnSide')}
              />
            )}
            <ToggleSwitch
              label={labels.columnRule}
              checked={resolvedLayout.columnRule.enabled}
              onChange={(v) => updateColumnRule({ enabled: v })}
              tooltip={labels.columnRuleTooltip}
              isDefault={layout?.columnRule?.enabled === undefined}
              onReset={() => resetColumnRuleField('enabled')}
            />
            {resolvedLayout.columnRule.enabled && (
              <NestedGroup>
                <ColorPicker
                  label={labels.columnRuleColor}
                  value={resolvedLayout.columnRule.color ?? DEFAULT_COLUMN_RULE.color}
                  onChange={(color: ColorValue) => updateColumnRule({ color })}
                  tooltip={labels.columnRuleColorTooltip}
                  isDefault={layout?.columnRule?.color === undefined}
                  onReset={() => resetColumnRuleField('color')}
                  fieldId={`${prefix}-columnRuleColor`}
                />
                <DimensionInput
                  label={labels.columnRuleLineWidth}
                  value={resolvedLayout.columnRule.lineWidth ?? DEFAULT_COLUMN_RULE.lineWidth}
                  onChange={(dim: Dimension) => updateColumnRule({ lineWidth: dim })}
                  min={0.1}
                  step={0.1}
                  tooltip={labels.columnRuleLineWidthTooltip}
                  isDefault={layout?.columnRule?.lineWidth === undefined}
                  onReset={() => resetColumnRuleField('lineWidth')}
                />
              </NestedGroup>
            )}
          </NestedGroup>
        )}
        <ToggleSwitch
          label={labels.fitFiguresToPage}
          checked={resolvedLayout.fitFiguresToPage}
          onChange={(v) => updateLayout({ fitFiguresToPage: v })}
          tooltip={labels.fitFiguresToPageTooltip}
          isDefault={layout?.fitFiguresToPage === undefined}
          onReset={() => resetLayoutField('fitFiguresToPage')}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.partsBodyStyle}
        sectionId={`${prefix}.body`}
        variant="subsection"
        onReset={() => set('bodyStyle', undefined)}
        hasOverrides={hasKeys(body)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={infoStyle}>
          {labels.headingStyleBodyInfo}
        </p>
        <FontPicker
          label={labels.partsBodyFont}
          value={body?.fontFamily ?? base.bodyText.fontFamily}
          onChange={(font) => updateBodyStyle({ fontFamily: font })}
          isDefault={body?.fontFamily === undefined}
          onReset={() => resetBodyStyle('fontFamily')}
          searchPlaceholder={labels.bodyFontSearch}
          noResultsLabel={labels.bodyFontNoResults}
        />
        <DimensionInput
          label={labels.partsBodyFontSize}
          value={body?.fontSize ?? base.bodyText.fontSize}
          onChange={(dim) => updateBodyStyle({ fontSize: dim })}
          min={1}
          step={0.5}
          isDefault={body?.fontSize === undefined}
          onReset={() => resetBodyStyle('fontSize')}
          units={TEXT_SIZE_UNITS}
        />
        <DimensionInput
          label={labels.partsBodyLineHeight}
          value={body?.lineHeight ?? base.bodyText.lineHeight}
          onChange={(dim) => updateBodyStyle({ lineHeight: dim })}
          min={0.5}
          max={5}
          step={0.1}
          isDefault={body?.lineHeight === undefined}
          onReset={() => resetBodyStyle('lineHeight')}
          units={LINE_HEIGHT_UNITS}
        />
        <ColorPicker
          label={labels.partsBodyColor}
          value={body?.color ?? base.bodyText.color}
          onChange={(color) => updateBodyStyle({ color })}
          isDefault={body?.color === undefined}
          onReset={() => resetBodyStyle('color')}
          fieldId={`${prefix}-body-color`}
        />
        <SelectInput
          label={labels.partsBodyTextAlign}
          value={body?.textAlign ?? base.bodyText.textAlign}
          options={ALIGN_OPTIONS}
          onChange={(v) => updateBodyStyle({ textAlign: v as TextAlign })}
          isDefault={body?.textAlign === undefined}
          onReset={() => resetBodyStyle('textAlign')}
        />
        <ColorPicker
          label={labels.partsBodyBulletColor}
          value={body?.bulletColor ?? base.unorderedLists.color}
          onChange={(color) => updateBodyStyle({ bulletColor: color })}
          isDefault={body?.bulletColor === undefined}
          onReset={() => resetBodyStyle('bulletColor')}
          fieldId={`${prefix}-body-bullet-color`}
        />
        <ColorPicker
          label={labels.partsBodyNumberColor}
          value={body?.numberColor ?? base.orderedLists.color}
          onChange={(color) => updateBodyStyle({ numberColor: color })}
          isDefault={body?.numberColor === undefined}
          onReset={() => resetBodyStyle('numberColor')}
          fieldId={`${prefix}-body-number-color`}
        />
        <PartsOrderedListsOverrides
          raw={body?.orderedLists}
          base={base.orderedLists}
          onUpdate={updateOrderedOverride}
          onReset={resetOrderedOverride}
          onResetAll={() => resetBodyStyle('orderedLists')}
          labels={labels}
          sectionId={`${prefix}.ordered-lists`}
        />
        <PartsUnorderedListsOverrides
          raw={body?.unorderedLists}
          base={base.unorderedLists}
          onUpdate={updateUnorderedOverride}
          onReset={resetUnorderedOverride}
          onResetAll={() => resetBodyStyle('unorderedLists')}
          labels={labels}
          sectionId={`${prefix}.unordered-lists`}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title={labels.colorPalette}
        sectionId={`${prefix}.palette`}
        variant="subsection"
        onReset={() => set('palette', undefined)}
        hasOverrides={hasKeys(style.palette)}
        resetLabel={labels.reset}
        resetConfirmMessage={labels.resetSectionConfirm}
      >
        <p className="px-2 py-1 text-xs" style={infoStyle}>
          {labels.headingStylePaletteInfo}
        </p>
        {base.palette.map((entry) => {
          const hex = palette[entry.id];
          return (
            <ColorPicker
              key={entry.id}
              label={entry.name}
              value={hex ? { hex, model: 'hex' } : entry.value}
              onChange={(color: ColorValue) => setPaletteColor(entry.id, color.hex)}
              isDefault={hex === undefined}
              onReset={() => setPaletteColor(entry.id, undefined)}
              fieldId={`${prefix}-palette-${entry.id}`}
            />
          );
        })}
      </CollapsibleSection>
    </div>
    </SearchScope>
  );
}

/** Config-panel section for the named heading styles applied with
 *  `# Title {style="…"}` (`config.headingStyles`). */
export const HeadingStylesSection = memo(function HeadingStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const config = useSandboxSelector((s) => s.config);
  const styles: HeadingStyleConfig[] = config.headingStyles ?? [];

  const bodyText = resolveBodyTextConfig(config.bodyText, config.locale);
  const headings = resolveHeadingsConfig(config.headings);
  const base: Baselines = {
    level: headings.levels[0]!,
    page: resolvePageConfig(config.page),
    layout: resolveLayoutConfig(config.layout),
    bodyText,
    unorderedLists: resolveUnorderedListsConfig(config.unorderedLists, bodyText),
    orderedLists: resolveOrderedListsConfig(config.orderedLists, bodyText),
    palette: config.colorPalette && config.colorPalette.length > 0 ? config.colorPalette : DEFAULT_COLOR_PALETTE,
    documentHeader: resolveHeaderFooterConfig(config.header, 'header'),
    documentFooter: resolveHeaderFooterConfig(config.footer, 'footer'),
  };

  const write = (next: HeadingStyleConfig[]) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { headingStyles: next.length > 0 ? next : undefined } });
  };

  const addStyle = () => {
    write([...styles, { id: nextStyleId(styles), name: labels.headingStyleNewName }]);
  };

  const updateStyle = (id: string, partial: Partial<HeadingStyleConfig>) => {
    write(
      styles.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s, ...partial };
        for (const [k, v] of Object.entries(partial)) {
          if (v === undefined) delete (next as Record<string, unknown>)[k];
        }
        return next;
      }),
    );
  };

  const renameStyle = (id: string, nextId: string) => {
    if (styles.some((s) => s.id === nextId)) return;
    write(styles.map((s) => (s.id === id ? { ...s, id: nextId } : s)));
  };

  const removeStyle = (id: string) => {
    write(styles.filter((s) => s.id !== id));
  };

  return (
    <CollapsibleSection
      title={labels.headingStylesSection}
      sectionId="headingStyles"
      hasOverrides={styles.length > 0}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { headingStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.headingStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={infoStyle}>
          {labels.headingStylesEmpty}
        </p>
      )}
      {styles.map((style) => (
        <HeadingStyleCard
          key={style.id}
          style={style}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          base={base}
          onChange={(partial) => updateStyle(style.id, partial)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.headingStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
