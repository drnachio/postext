'use client';

// One paragraph style's card with every setting of the style (#1276: split
// out of ParagraphStylesSection.tsx).
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { type ParagraphStyleConfig, type ResolvedParagraphStyleConfig, type ColorValue, isCjkLanguage, DEFAULT_CJK_CONFIG, type ParagraphContainerSpacing } from 'postext';
import { useSandboxLabels, useSandboxSelector } from '../../../../context/SandboxContext.js';
import { ItemCard, FontPicker, DimensionInput, ColorPicker, NumberInput, ToggleSwitch, SelectInput } from '../../../../controls/index.js';
import { ConfirmPopover, IconButton } from '../../../../ui/index.js';
import { SearchScope } from '../../../search/SearchScope.js';
import { flowSideLabels, useRightToLeftFlow } from '../../../settings/flowSides.js';
import { defaultDocumentLocale } from '../../../../controls/language/hyphenation.js';
import { TabStopsField } from '../../../settings/TabStopsField.js';
import { DropCapFields } from '../../../settings/DropCapFields.js';
import { FigureStyleField } from '../../../settings/FigureStyleField.js';
import { slugifyStyleId, Field, inputClass, inputStyle, FONT_SIZE_UNITS, LINE_HEIGHT_UNITS, ZERO_EM, TRACKING_UNITS, SPACING_UNITS } from './shared.js';

interface ParagraphStyleCardProps {
  style: ParagraphStyleConfig;
  resolved: ResolvedParagraphStyleConfig;
  /** The body text bold colour — what an unset `boldColor` renders with. */
  bodyBoldColor: ColorValue;
  /** The body text italic colour — what an unset `italicColor` renders with. */
  bodyItalicColor: ColorValue;
  otherIds: Set<string>;
  onChange: (partial: Partial<ParagraphStyleConfig>) => void;
  onResetField: (field: keyof ParagraphStyleConfig) => void;
  onRename: (nextId: string) => void;
  onRemove: () => void;
}

/** One paragraph style: id (renamed on blur / Enter, never to a colliding
 *  id), display name, and the typographic overrides. Every typographic
 *  control shows the resolved value and offers a per-field reset while the
 *  key is set, so a style only stores what differs from the body text. */
export function ParagraphStyleCard({
  style,
  resolved,
  bodyBoldColor,
  bodyItalicColor,
  otherIds,
  onChange,
  onResetField,
  onRename,
  onRemove,
}: ParagraphStyleCardProps) {
  const labels = useSandboxLabels();
  const textSide = flowSideLabels(useRightToLeftFlow(), labels.bodyTextAlignLeft, labels.headingsTextAlignRight);
  // Ragged styles hyphenate too once the body turns ragged hyphenation on.
  const raggedHyphenation = useSandboxSelector((s) => s.config.bodyText?.hyphenation?.ragged === true);
  // Line breaking between CJK characters (#463): shown in a Chinese,
  // Japanese or Korean document, or when the style sets it; unset, the
  // style follows the document's `cjk.wordBreak`.
  const cjkDocument = useSandboxSelector((s) => isCjkLanguage(s.config.locale ?? s.config.bodyText?.hyphenation?.locale ?? defaultDocumentLocale(s.locale)));
  const documentWordBreak = useSandboxSelector((s) => s.config.cjk?.wordBreak ?? DEFAULT_CJK_CONFIG.wordBreak);
  // Line numbers (#621): shown once the document numbers lines, or when
  // the style says whether its lines are counted.
  const lineNumbersOn = useSandboxSelector((s) => s.config.lineNumbers?.enabled === true);
  // Tab stops (#622): an unset interval is the body's.
  const bodyTabInterval = useSandboxSelector((s) => s.config.bodyText?.tabInterval);
  const [idDraft, setIdDraft] = useState(style.id);
  const draftSlug = slugifyStyleId(idDraft);
  const idTaken = draftSlug.length > 0 && draftSlug !== style.id && otherIds.has(draftSlug);
  const idEmpty = draftSlug.length === 0;

  const commitId = () => {
    if (idEmpty || idTaken) {
      setIdDraft(style.id);
      return;
    }
    setIdDraft(draftSlug);
    if (draftSlug !== style.id) onRename(draftSlug);
  };

  const unset = (field: keyof ParagraphStyleConfig) => style[field] === undefined;

  const alignOptions = [
    { value: 'left', label: textSide.left },
    { value: 'justify', label: labels.bodyTextAlignJustify },
  ];
  const textTransformOptions = [
    { value: 'none', label: labels.headingTextTransformNone },
    { value: 'uppercase', label: labels.headingTextTransformUppercase },
  ];

  return (
    <SearchScope title={`${style.name ?? ''} ${style.id}`} overridden>
    <ItemCard
      list="paragraphStyles"
      id={style.id}
      styleId={style.id}
      title={style.name || style.id}
      subtitle={style.name && style.name !== style.id ? style.id : undefined}
      actions={
        <ConfirmPopover message={labels.paragraphStyleDeleteConfirm} onConfirm={onRemove}>
          {({ open }) => (
            <IconButton label={labels.paragraphStyleDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
          )}
        </ConfirmPopover>
      }
    >

      <div className="mb-2 flex flex-col gap-2">
        <Field
          label={labels.idLabel} tooltip={labels.styleIdHelp}
          hint={
            idTaken
              ? labels.paragraphStyleIdHintDuplicate
              : labels.paragraphStyleUsageHint.replace('__id__', style.id)
          }
        >
          <input
            dir="ltr"
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
            aria-label={labels.paragraphStyleIdAria}
            className={inputClass}
            style={{
              ...inputStyle,
              borderColor: idEmpty || idTaken ? 'var(--destructive)' : 'var(--rule)',
            }}
          />
        </Field>
        <Field label={labels.paragraphStyleNameLabel} tooltip={labels.styleNameHelp}>
          <input
            dir="auto"
            type="text"
            value={style.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value.length > 0 ? e.target.value : undefined })}
            aria-label={labels.paragraphStyleNameAria}
            placeholder={style.id}
            className={inputClass}
            style={inputStyle}
          />
        </Field>
      </div>

      <FontPicker
        label={labels.fontLabel}
        value={resolved.fontFamily}
        onChange={(v) => onChange({ fontFamily: v })}
        isDefault={unset('fontFamily')}
        onReset={() => onResetField('fontFamily')}
        searchPlaceholder={labels.bodyFontSearch}
        noResultsLabel={labels.bodyFontNoResults}
      />
      <FigureStyleField
        value={style.figureStyle}
        inherits
        onChange={(v) => onChange({ figureStyle: v })}
        onReset={() => onResetField('figureStyle')}
      />
      <DimensionInput
        label={labels.sizeLabel}
        value={resolved.fontSize}
        onChange={(v) => onChange({ fontSize: v })}
        min={1}
        step={0.5}
        units={FONT_SIZE_UNITS}
        isDefault={unset('fontSize')}
        onReset={() => onResetField('fontSize')}
      />
      <DimensionInput
        label={labels.bodyLineHeight}
        value={resolved.lineHeight}
        onChange={(v) => onChange({ lineHeight: v })}
        min={0.5}
        max={5}
        step={0.1}
        units={LINE_HEIGHT_UNITS}
        isDefault={unset('lineHeight')}
        onReset={() => onResetField('lineHeight')}
      />
      <ColorPicker
        label={labels.colorLabel}
        value={resolved.color}
        onChange={(v) => onChange({ color: v })}
        isDefault={unset('color')}
        onReset={() => onResetField('color')}
        fieldId={`paragraphStyle-${style.id}-color`}
      />
      <ColorPicker
        label={labels.bodyBoldColor}
        value={resolved.boldColor ?? bodyBoldColor}
        onChange={(v) => onChange({ boldColor: v })}
        tooltip={labels.paragraphStyleBoldColorTooltip}
        isDefault={unset('boldColor')}
        onReset={() => onResetField('boldColor')}
        fieldId={`paragraphStyle-${style.id}-boldColor`}
      />
      <ColorPicker
        label={labels.bodyItalicColor}
        value={resolved.italicColor ?? bodyItalicColor}
        onChange={(v) => onChange({ italicColor: v })}
        tooltip={labels.paragraphStyleItalicColorTooltip}
        isDefault={unset('italicColor')}
        onReset={() => onResetField('italicColor')}
        fieldId={`paragraphStyle-${style.id}-italicColor`}
      />
      <NumberInput
        label={labels.bodyFontWeight}
        value={resolved.fontWeight}
        onChange={(v) => onChange({ fontWeight: v })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.textStyleFontWeightTooltip}
        isDefault={unset('fontWeight')}
        onReset={() => onResetField('fontWeight')}
      />
      <NumberInput
        label={labels.bodyBoldFontWeight}
        value={resolved.boldFontWeight}
        onChange={(v) => onChange({ boldFontWeight: v })}
        min={100}
        max={900}
        step={10}
        tooltip={labels.textStyleBoldFontWeightTooltip}
        isDefault={unset('boldFontWeight')}
        onReset={() => onResetField('boldFontWeight')}
      />
      <ToggleSwitch
        label={labels.textStyleItalic}
        checked={resolved.italic}
        onChange={(v) => onChange({ italic: v })}
        tooltip={labels.textStyleItalicTooltip}
        isDefault={unset('italic')}
        onReset={() => onResetField('italic')}
      />
      <ToggleSwitch
        label={labels.textStyleSmallCaps}
        checked={resolved.smallCaps}
        onChange={(v) => onChange({ smallCaps: v })}
        tooltip={labels.textStyleSmallCapsTooltip}
        isDefault={unset('smallCaps')}
        onReset={() => onResetField('smallCaps')}
      />
      <SelectInput
        label={labels.paragraphStyleTextTransform}
        value={resolved.textTransform}
        options={textTransformOptions}
        onChange={(v) => onChange({ textTransform: v as ParagraphStyleConfig['textTransform'] })}
        tooltip={labels.paragraphStyleTextTransformTooltip}
        isDefault={unset('textTransform')}
        onReset={() => onResetField('textTransform')}
      />
      <DimensionInput
        label={labels.paragraphStyleLetterSpacing}
        value={resolved.letterSpacing ?? ZERO_EM}
        onChange={(v) => onChange({ letterSpacing: v })}
        min={-1}
        step={0.005}
        units={TRACKING_UNITS}
        tooltip={labels.paragraphStyleLetterSpacingTooltip}
        isDefault={unset('letterSpacing')}
        onReset={() => onResetField('letterSpacing')}
      />
      <SelectInput
        label={labels.alignmentLabel} tooltip={labels.alignmentHelp}
        value={resolved.textAlign}
        options={alignOptions}
        onChange={(v) => onChange({ textAlign: v as ParagraphStyleConfig['textAlign'] })}
        isDefault={unset('textAlign')}
        onReset={() => onResetField('textAlign')}
      />
      {(cjkDocument || style.wordBreak !== undefined) && (
        <SelectInput
          label={labels.cjkWordBreak}
          value={resolved.wordBreak ?? documentWordBreak}
          options={[
            { value: 'normal', label: labels.cjkWordBreakNormal },
            { value: 'keep-all', label: labels.cjkWordBreakKeepAll },
          ]}
          onChange={(v) => onChange({ wordBreak: v as ParagraphStyleConfig['wordBreak'] })}
          tooltip={labels.cjkWordBreakTooltip}
          isDefault={unset('wordBreak')}
          onReset={() => onResetField('wordBreak')}
        />
      )}
      {(lineNumbersOn || style.lineNumbers !== undefined) && (
        <SelectInput
          label={labels.paragraphStyleLineNumbers}
          value={style.lineNumbers === undefined ? 'auto' : style.lineNumbers ? 'on' : 'off'}
          variant="segmented"
          stacked
          options={[
            { value: 'auto', label: labels.paragraphStyleLineNumbersAuto },
            { value: 'on', label: labels.paragraphStyleLineNumbersOn },
            { value: 'off', label: labels.paragraphStyleLineNumbersOff },
          ]}
          onChange={(v) => (v === 'auto' ? onResetField('lineNumbers') : onChange({ lineNumbers: v === 'on' }))}
          tooltip={labels.paragraphStyleLineNumbersTooltip}
          isDefault={unset('lineNumbers')}
          onReset={() => onResetField('lineNumbers')}
        />
      )}
      {(resolved.textAlign === 'justify' || raggedHyphenation) && (
        <ToggleSwitch
          label={labels.bodyHyphenation}
          checked={resolved.hyphenation}
          onChange={(v) => onChange({ hyphenation: v })}
          isDefault={unset('hyphenation')}
          onReset={() => onResetField('hyphenation')}
        />
      )}
      <DimensionInput
        label={labels.paragraphStyleIndent}
        value={resolved.indent}
        onChange={(v) => onChange({ indent: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.paragraphStyleIndentTooltip}
        isDefault={unset('indent')}
        onReset={() => onResetField('indent')}
      />
      <DimensionInput
        label={labels.paragraphStyleEndIndent}
        value={resolved.endIndent ?? ZERO_EM}
        onChange={(v) => onChange({ endIndent: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.paragraphStyleEndIndentTooltip}
        isDefault={unset('endIndent')}
        onReset={() => onResetField('endIndent')}
      />
      <DimensionInput
        label={labels.bodyFirstLineIndent}
        value={resolved.firstLineIndent}
        onChange={(v) => onChange({ firstLineIndent: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.paragraphStyleFirstLineIndentTooltip}
        isDefault={unset('firstLineIndent')}
        onReset={() => onResetField('firstLineIndent')}
      />
      <DimensionInput
        label={labels.paragraphStyleHangingIndent}
        value={resolved.hangingIndent}
        onChange={(v) => onChange({ hangingIndent: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.paragraphStyleHangingIndentTooltip}
        isDefault={unset('hangingIndent')}
        onReset={() => onResetField('hangingIndent')}
      />
      <TabStopsField
        inherits
        stops={style.tabStops}
        interval={style.tabInterval}
        inheritedInterval={bodyTabInterval}
        onStopsChange={(next) => (next === undefined ? onResetField('tabStops') : onChange({ tabStops: next }))}
        onIntervalChange={(next) => (next === undefined ? onResetField('tabInterval') : onChange({ tabInterval: next }))}
      />
      <ToggleSwitch
        label={labels.paragraphStyleDropCap}
        checked={style.dropCap !== undefined}
        onChange={(v) => (v ? onChange({ dropCap: { ...style.dropCap } }) : onResetField('dropCap'))}
        tooltip={labels.paragraphStyleDropCapTooltip}
        isDefault={unset('dropCap')}
        onReset={() => onResetField('dropCap')}
      />
      {style.dropCap && (
        <DropCapFields
          kind="body"
          each
          value={style.dropCap}
          onChange={(dropCap) => onChange({ dropCap })}
          inherited={{ fontFamily: resolved.fontFamily, fontWeight: resolved.fontWeight, color: resolved.color }}
          fieldId={`paragraph-style-dropcap-${style.id}`}
        />
      )}
      <DimensionInput
        label={labels.paragraphStyleSpaceBetween}
        value={resolved.spaceBetween}
        onChange={(v) => onChange({ spaceBetween: v })}
        min={0}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.paragraphStyleSpaceBetweenTooltip}
        isDefault={unset('spaceBetween')}
        onReset={() => onResetField('spaceBetween')}
      />
      <DimensionInput
        label={labels.marginTop}
        value={resolved.marginTop}
        onChange={(v) => onChange({ marginTop: v })}
        min={-20}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.paragraphStyleMarginTopTooltip}
        isDefault={unset('marginTop')}
        onReset={() => onResetField('marginTop')}
      />
      <DimensionInput
        label={labels.marginBottom}
        value={resolved.marginBottom}
        onChange={(v) => onChange({ marginBottom: v })}
        min={-20}
        step={0.1}
        units={SPACING_UNITS}
        tooltip={labels.paragraphStyleMarginBottomTooltip}
        isDefault={unset('marginBottom')}
        onReset={() => onResetField('marginBottom')}
      />
      <ToggleSwitch
        label={labels.paragraphStyleSnapToGrid}
        checked={resolved.snapToGrid}
        onChange={(v) => onChange({ snapToGrid: v })}
        tooltip={labels.paragraphStyleSnapToGridTooltip}
        isDefault={unset('snapToGrid')}
        onReset={() => onResetField('snapToGrid')}
      />
      {/* The rule of the space under this style's own groups (#715). */}
      <SelectInput
        label={labels.paragraphStyleContainerSpacing}
        value={style.containerSpacing ?? 'inherit'}
        options={[
          { value: 'inherit', label: labels.paragraphStyleContainerSpacingInherit },
          { value: 'collapse', label: labels.paragraphContainerSpacingCollapse },
          { value: 'add', label: labels.paragraphContainerSpacingAdd },
        ]}
        onChange={(v) => (v === 'inherit' ? onResetField('containerSpacing') : onChange({ containerSpacing: v as ParagraphContainerSpacing }))}
        tooltip={labels.paragraphStyleContainerSpacingTooltip}
        isDefault={unset('containerSpacing')}
        onReset={() => onResetField('containerSpacing')}
      />
    </ItemCard>
    </SearchScope>
  );
}
