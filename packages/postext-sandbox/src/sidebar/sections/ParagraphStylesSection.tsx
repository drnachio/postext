'use client';

import { memo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { BodyTextConfig, ColorValue, DimensionUnit, ParagraphContainerSpacing, ParagraphStyleConfig, ResolvedParagraphStyleConfig } from 'postext';
import { DEFAULT_BODY_TEXT_CONFIG, resolveBodyTextConfig, resolveParagraphStylesConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  SelectInput,
  ToggleSwitch,
} from '../../controls';
import { Button, ConfirmPopover, IconButton } from '../../ui';
import { FieldRow } from '../../controls/FieldRow';
import { SearchScope } from '../search/SearchScope';
import { flowSideLabels, useRightToLeftFlow } from '../settings/flowSides';

const FONT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

/** Turn free text into a `:::paragraphs{style="…"}`-friendly id. */
function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nextStyleId(existing: ParagraphStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`style-${n}`)) n++;
  return `style-${n}`;
}

interface FieldProps {
  label: string;
  tooltip?: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, tooltip, hint, children }: FieldProps) {
  return (
    <FieldRow stacked label={label} tooltip={tooltip} hint={hint} className="mb-0">
      {children}
    </FieldRow>
  );
}

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
function ParagraphStyleCard({
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
    <div className="mb-3 rounded border p-2" style={{ borderColor: 'var(--rule)' }}>
      <div className="mb-2 flex items-center justify-between gap-1">
        <span
          className="truncate text-xs font-medium"
          style={{ color: 'var(--foreground)' }}
          title={style.name ?? style.id}
        >
          {style.name || style.id}
        </span>
        <ConfirmPopover message={labels.paragraphStyleDeleteConfirm} onConfirm={onRemove}>
          {({ open }) => (
            <IconButton label={labels.paragraphStyleDelete} icon={<Trash2 size={13} />} destructive onClick={open} />
          )}
        </ConfirmPopover>
      </div>

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
      <SelectInput
        label={labels.alignmentLabel} tooltip={labels.alignmentHelp}
        value={resolved.textAlign}
        options={alignOptions}
        onChange={(v) => onChange({ textAlign: v as ParagraphStyleConfig['textAlign'] })}
        isDefault={unset('textAlign')}
        onReset={() => onResetField('textAlign')}
      />
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
    </div>
    </SearchScope>
  );
}

/** Config-panel section for the named paragraph styles applied by
 *  `:::paragraphs{style="…"}` containers (`config.paragraphStyles`). */
export const ParagraphStylesSection = memo(function ParagraphStylesSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.paragraphStyles);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const bodyText = resolveBodyTextConfig(bodyTextRaw);
  const styles: ParagraphStyleConfig[] = raw ?? [];
  const resolved = resolveParagraphStylesConfig(raw, bodyText);

  const write = (next: ParagraphStyleConfig[]) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { paragraphStyles: next.length > 0 ? next : undefined },
    });
  };

  const addStyle = () => {
    write([...styles, { id: nextStyleId(styles), name: labels.paragraphStyleNewName }]);
  };

  const updateStyle = (id: string, partial: Partial<ParagraphStyleConfig>) => {
    write(styles.map((s) => (s.id === id ? { ...s, ...partial } : s)));
  };

  const resetStyleField = (id: string, field: keyof ParagraphStyleConfig) => {
    write(
      styles.map((s) => {
        if (s.id !== id) return s;
        const next = { ...s };
        delete next[field];
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

  /** The document-wide rule for the space under a container, kept in
   *  `bodyText` (EF-159, EF-181). */
  const writeContainerSpacing = (value: ParagraphContainerSpacing | undefined) => {
    const next: BodyTextConfig = { ...bodyTextRaw };
    if (value === undefined) delete next.paragraphContainerSpacing;
    else next.paragraphContainerSpacing = value;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: Object.keys(next).length > 0 ? next : undefined },
    });
  };
  const containerSpacingOptions = [
    { value: 'collapse', label: labels.paragraphContainerSpacingCollapse },
    { value: 'add', label: labels.paragraphContainerSpacingAdd },
  ];

  return (
    <CollapsibleSection
      title={labels.paragraphStylesSection}
      sectionId="paragraphStyles"
      hasOverrides={styles.length > 0}
      onReset={() => dispatch({ type: 'UPDATE_CONFIG', payload: { paragraphStyles: undefined } })}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.paragraphStylesResetConfirm}
    >
      {styles.length === 0 && (
        <p className="mb-2 text-xs" style={{ color: 'var(--slate)' }}>
          {labels.paragraphStylesEmpty}
        </p>
      )}
      {styles.length > 0 && (
        <SelectInput
          label={labels.paragraphContainerSpacing}
          value={bodyText.paragraphContainerSpacing}
          options={containerSpacingOptions}
          onChange={(v) => writeContainerSpacing(v as ParagraphContainerSpacing)}
          tooltip={labels.paragraphContainerSpacingTooltip}
          isDefault={bodyText.paragraphContainerSpacing === DEFAULT_BODY_TEXT_CONFIG.paragraphContainerSpacing}
          onReset={() => writeContainerSpacing(undefined)}
        />
      )}
      {styles.map((style, i) => (
        <ParagraphStyleCard
          key={style.id}
          style={style}
          resolved={resolved[i] ?? resolveParagraphStylesConfig([style], bodyText)[0]!}
          bodyBoldColor={bodyText.boldColor ?? bodyText.color}
          bodyItalicColor={bodyText.italicColor ?? bodyText.color}
          otherIds={new Set(styles.filter((s) => s.id !== style.id).map((s) => s.id))}
          onChange={(partial) => updateStyle(style.id, partial)}
          onResetField={(field) => resetStyleField(style.id, field)}
          onRename={(nextId) => renameStyle(style.id, nextId)}
          onRemove={() => removeStyle(style.id)}
        />
      ))}
      <Button variant="outline" size="xs" icon={<Plus size={12} />} onClick={addStyle} className="mt-1">
        {labels.paragraphStyleAdd}
      </Button>
    </CollapsibleSection>
  );
});
