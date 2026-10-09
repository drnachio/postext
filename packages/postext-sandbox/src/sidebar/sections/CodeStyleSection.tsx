'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { CODE_TOKEN_KINDS, DEFAULT_CODE_STYLE, DEFAULT_CODE_TOKENS, dimensionToPx, dimensionsEqual, resolveBodyTextConfig, resolveCodeStyleConfig, resolvePageConfig } from 'postext';
import type { CodeStyleConfig, CodeTokenKind, CodeTokenStyle, DimensionUnit, InlineCodeStyleConfig } from 'postext';
import type { SandboxLabels } from '../../types/labels';
import {
  CollapsibleSection,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NestedGroup,
  NumberInput,
  SelectInput,
  TextInput,
  ToggleSwitch,
} from '../../controls';

const SIZE_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];
const STROKE_UNITS: DimensionUnit[] = ['pt', 'px', 'mm'];

const D = DEFAULT_CODE_STYLE;

type Look = 'regular' | 'bold' | 'italic' | 'boldItalic';
const lookOf = (t: { bold: boolean; italic: boolean }): Look => (t.bold ? (t.italic ? 'boldItalic' : 'bold') : t.italic ? 'italic' : 'regular');

/** The label of each kind of token. */
function tokenLabels(labels: SandboxLabels): Record<CodeTokenKind, string> {
  return {
    keyword: labels.codeTokenKeyword,
    string: labels.codeTokenString,
    number: labels.codeTokenNumber,
    comment: labels.codeTokenComment,
    function: labels.codeTokenFunction,
    type: labels.codeTokenType,
    operator: labels.codeTokenOperator,
    punctuation: labels.codeTokenPunctuation,
    variable: labels.codeTokenVariable,
    meta: labels.codeTokenMeta,
    prompt: labels.codeTokenPrompt,
    output: labels.codeTokenOutput,
  };
}

/** Code listings and inline code (`config.codeStyle`, #624): how fences
 *  are read, the code face and its box, long lines, numbers and
 *  highlighted lines, splits, token colours and inline code. */
export const CodeStyleSection = memo(function CodeStyleSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.codeStyle);
  const bodyTextRaw = useSandboxSelector((s) => s.config.bodyText);
  const pageRaw = useSandboxSelector((s) => s.config.page);
  const locale = useSandboxSelector((s) => s.config.locale);
  const body = resolveBodyTextConfig(bodyTextRaw, locale);
  const cs = resolveCodeStyleConfig(raw, body);

  const write = (next: CodeStyleConfig | undefined) => {
    const empty = !next || Object.keys(next).length === 0;
    dispatch({ type: 'UPDATE_CONFIG', payload: { codeStyle: empty ? undefined : next } });
  };
  const update = (partial: Partial<CodeStyleConfig>) => write({ ...raw, ...partial });
  const resetField = (field: keyof CodeStyleConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    write(next);
  };
  const unset = (field: keyof CodeStyleConfig) => raw?.[field] === undefined;
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const groupUpdate = <K extends 'padding' | 'border'>(key: K, partial: NonNullable<CodeStyleConfig[K]>) =>
    update({ [key]: { ...raw?.[key], ...partial } } as Partial<CodeStyleConfig>);
  const groupReset = <K extends 'padding' | 'border'>(key: K, field: string) => {
    const group = { ...(raw?.[key] as Record<string, unknown> | undefined) };
    delete group[field];
    if (Object.keys(group).length === 0) resetField(key);
    else update({ [key]: group } as Partial<CodeStyleConfig>);
  };
  const groupUnset = (key: 'padding' | 'border', field: string) => (raw?.[key] as Record<string, unknown> | undefined)?.[field] === undefined;

  // The leading listings take when none is set: the body's grid line, in pt.
  const page = resolvePageConfig(pageRaw);
  const bodyPx = dimensionToPx(body.fontSize, page.dpi);
  const gridPx = body.lineHeight.unit === 'em' || body.lineHeight.unit === 'rem' ? body.lineHeight.value * bodyPx : dimensionToPx(body.lineHeight, page.dpi, bodyPx);
  const gridPt = Math.round((gridPx * 72 / page.dpi) * 100) / 100;

  const setToken = (kind: CodeTokenKind, partial: CodeTokenStyle) =>
    update({ tokens: { ...raw?.tokens, [kind]: { ...raw?.tokens?.[kind], ...partial } } });
  const resetToken = (kind: CodeTokenKind) => {
    const tokens = { ...raw?.tokens };
    delete tokens[kind];
    if (Object.keys(tokens).length === 0) resetField('tokens');
    else update({ tokens });
  };

  const inline = cs.inline;
  const setInline = (partial: Partial<InlineCodeStyleConfig>) => update({ inline: { ...raw?.inline, ...partial } });
  const resetInline = (field: keyof InlineCodeStyleConfig) => {
    const next = { ...raw?.inline };
    delete next[field];
    update({ inline: next });
  };
  const inlineUnset = (field: keyof InlineCodeStyleConfig) => raw?.inline?.[field] === undefined;

  return (
    <CollapsibleSection
      title={labels.codeStyleSection}
      sectionId="codeStyle"
      onReset={() => write(undefined)}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <CollapsibleSection title={labels.codeGroupReading} sectionId="codeStyle.reading" variant="subsection">
        <ToggleSwitch
          label={labels.codeBlocks}
          checked={cs.blocks}
          onChange={(v) => update({ blocks: v })}
          tooltip={labels.codeBlocksTooltip}
          isDefault={unset('blocks')}
          onReset={() => resetField('blocks')}
        />
        <ToggleSwitch
          label={labels.codeIndented}
          checked={cs.indentedCode}
          onChange={(v) => update({ indentedCode: v })}
          tooltip={labels.codeIndentedTooltip}
          isDefault={unset('indentedCode')}
          onReset={() => resetField('indentedCode')}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.codeGroupType} sectionId="codeStyle.type" variant="subsection">
        <FontPicker
          label={labels.codeFont}
          value={cs.fontFamily}
          onChange={(v) => update({ fontFamily: v })}
          tooltip={labels.codeFontTooltip}
          isDefault={unset('fontFamily')}
          onReset={() => resetField('fontFamily')}
          searchPlaceholder={labels.bodyFontSearch}
          noResultsLabel={labels.bodyFontNoResults}
        />
        <DimensionInput
          label={labels.codeFontSize}
          value={cs.fontSize}
          onChange={(v) => update({ fontSize: v })}
          min={0.1}
          step={0.05}
          units={SIZE_UNITS}
          tooltip={labels.codeFontSizeTooltip}
          isDefault={dimensionsEqual(cs.fontSize, D.fontSize)}
          onReset={() => resetField('fontSize')}
        />
        <DimensionInput
          label={labels.codeLineHeight}
          value={cs.lineHeight ?? { value: gridPt, unit: 'pt' }}
          onChange={(v) => update({ lineHeight: v })}
          min={0}
          step={0.5}
          units={['pt', 'em', 'px', 'mm']}
          tooltip={labels.codeLineHeightTooltip}
          isDefault={unset('lineHeight')}
          onReset={() => resetField('lineHeight')}
        />
        <ToggleSwitch
          label={labels.calloutStyleSnapToGrid}
          checked={cs.snapToGrid}
          onChange={(v) => update({ snapToGrid: v })}
          tooltip={labels.calloutStyleSnapToGridTooltip}
          isDefault={unset('snapToGrid')}
          onReset={() => resetField('snapToGrid')}
        />
        <ColorPicker
          label={labels.colorLabel}
          value={cs.color}
          onChange={(color) => update({ color })}
          isDefault={unset('color')}
          onReset={() => resetField('color')}
          fieldId="code-color"
        />
        <NumberInput
          label={labels.codeTabSize}
          value={cs.tabSize}
          onChange={(v) => update({ tabSize: Math.max(1, Math.round(v)) })}
          min={1}
          max={16}
          step={1}
          tooltip={labels.codeTabSizeTooltip}
          isDefault={cs.tabSize === D.tabSize}
          onReset={() => resetField('tabSize')}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.codeGroupBox} sectionId="codeStyle.box" variant="subsection">
        <SelectInput
          label={labels.calloutStyleSpan}
          value={cs.span}
          variant="segmented"
          options={[
            { value: 'column', label: labels.calloutStyleSpanColumn },
            { value: 'page', label: labels.calloutStyleSpanPage },
          ]}
          onChange={(v) => update({ span: v as 'column' | 'page' })}
          tooltip={labels.codeSpanTooltip}
          isDefault={unset('span')}
          onReset={() => resetField('span')}
        />
        <ToggleSwitch
          label={labels.calloutStyleBackground}
          checked={cs.backgroundEnabled}
          onChange={(v) => update({ backgroundEnabled: v })}
          tooltip={labels.calloutStyleBackgroundTooltip}
          isDefault={unset('backgroundEnabled')}
          onReset={() => resetField('backgroundEnabled')}
        />
        {cs.backgroundEnabled && (
          <ColorPicker
            label={labels.calloutStyleBackgroundColor}
            value={cs.background}
            onChange={(background) => update({ background })}
            isDefault={unset('background')}
            onReset={() => resetField('background')}
            fieldId="code-background"
          />
        )}
        <ToggleSwitch
          label={labels.calloutStyleBorder}
          checked={cs.border.enabled}
          onChange={(v) => groupUpdate('border', { enabled: v })}
          isDefault={groupUnset('border', 'enabled')}
          onReset={() => groupReset('border', 'enabled')}
        />
        {cs.border.enabled && (
          <NestedGroup>
            <ColorPicker
              label={labels.calloutStyleBorderColor}
              value={cs.border.color}
              onChange={(color) => groupUpdate('border', { color })}
              isDefault={groupUnset('border', 'color')}
              onReset={() => groupReset('border', 'color')}
              fieldId="code-border"
            />
            <DimensionInput
              label={labels.calloutStyleBorderWidth}
              value={cs.border.width}
              onChange={(width) => groupUpdate('border', { width })}
              min={0}
              step={0.1}
              units={STROKE_UNITS}
              isDefault={groupUnset('border', 'width')}
              onReset={() => groupReset('border', 'width')}
            />
          </NestedGroup>
        )}
        <DimensionInput
          label={labels.calloutStyleBorderRadius}
          value={cs.borderRadius}
          onChange={(v) => update({ borderRadius: v })}
          min={0}
          step={0.5}
          units={STROKE_UNITS}
          isDefault={unset('borderRadius')}
          onReset={() => resetField('borderRadius')}
        />
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <DimensionInput
            key={side}
            label={side === 'top' ? labels.calloutStylePaddingTop : side === 'right' ? labels.calloutStylePaddingRight : side === 'bottom' ? labels.calloutStylePaddingBottom : labels.calloutStylePaddingLeft}
            value={cs.padding[side]}
            onChange={(v) => groupUpdate('padding', { [side]: v })}
            min={0}
            step={0.05}
            units={SPACING_UNITS}
            isDefault={groupUnset('padding', side)}
            onReset={() => groupReset('padding', side)}
          />
        ))}
        <DimensionInput
          label={labels.marginTop}
          value={cs.marginTop}
          onChange={(v) => update({ marginTop: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          isDefault={unset('marginTop')}
          onReset={() => resetField('marginTop')}
        />
        <DimensionInput
          label={labels.marginBottom}
          value={cs.marginBottom}
          onChange={(v) => update({ marginBottom: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          isDefault={unset('marginBottom')}
          onReset={() => resetField('marginBottom')}
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.codeGroupLines} sectionId="codeStyle.lines" variant="subsection">
        <SelectInput
          label={labels.codeOverflow}
          value={cs.overflow}
          variant="segmented"
          stacked
          options={[
            { value: 'wrap', label: labels.codeOverflowWrap },
            { value: 'shrink', label: labels.codeOverflowShrink },
            { value: 'clip', label: labels.codeOverflowClip },
          ]}
          onChange={(v) => update({ overflow: v as CodeStyleConfig['overflow'] })}
          tooltip={labels.codeOverflowTooltip}
          isDefault={unset('overflow')}
          onReset={() => resetField('overflow')}
        />
        {cs.overflow === 'shrink' && (
          <NumberInput
            label={labels.codeMinFontScale}
            value={cs.minFontScale}
            onChange={(v) => update({ minFontScale: Math.min(1, Math.max(0.3, v)) })}
            min={0.3}
            max={1}
            step={0.05}
            tooltip={labels.codeMinFontScaleTooltip}
            isDefault={cs.minFontScale === D.minFontScale}
            onReset={() => resetField('minFontScale')}
          />
        )}
        {cs.overflow !== 'clip' && (
          <>
            <NumberInput
              label={labels.codeWrapIndent}
              value={cs.wrapIndent}
              onChange={(v) => update({ wrapIndent: Math.max(0, Math.round(v)) })}
              min={0}
              max={16}
              step={1}
              tooltip={labels.codeWrapIndentTooltip}
              isDefault={cs.wrapIndent === D.wrapIndent}
              onReset={() => resetField('wrapIndent')}
            />
            <TextInput
              label={labels.codeWrapMarker}
              value={cs.wrapMarker}
              onChange={(v) => update({ wrapMarker: v })}
              tooltip={labels.codeWrapMarkerTooltip}
              widthCh={4}
              isDefault={unset('wrapMarker')}
              onReset={() => resetField('wrapMarker')}
            />
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.codeGroupNumbers} sectionId="codeStyle.numbers" variant="subsection">
        <ToggleSwitch
          label={labels.codeLineNumbers}
          checked={cs.lineNumbers}
          onChange={(v) => update({ lineNumbers: v })}
          tooltip={labels.codeLineNumbersTooltip}
          isDefault={unset('lineNumbers')}
          onReset={() => resetField('lineNumbers')}
        />
        <ColorPicker
          label={labels.codeLineNumberColor}
          value={cs.lineNumberColor}
          onChange={(color) => update({ lineNumberColor: color })}
          isDefault={unset('lineNumberColor')}
          onReset={() => resetField('lineNumberColor')}
          fieldId="code-line-number-color"
        />
        <DimensionInput
          label={labels.codeLineNumberGap}
          value={cs.lineNumberGap}
          onChange={(v) => update({ lineNumberGap: v })}
          min={0}
          step={0.1}
          units={SPACING_UNITS}
          tooltip={labels.codeLineNumberGapTooltip}
          isDefault={unset('lineNumberGap')}
          onReset={() => resetField('lineNumberGap')}
        />
        <ColorPicker
          label={labels.codeHighlightBackground}
          tooltip={labels.codeHighlightBackgroundTooltip}
          value={cs.highlightBackground}
          onChange={(color) => update({ highlightBackground: color })}
          isDefault={unset('highlightBackground')}
          onReset={() => resetField('highlightBackground')}
          fieldId="code-highlight"
        />
      </CollapsibleSection>

      <CollapsibleSection title={labels.codeGroupSplit} sectionId="codeStyle.split" variant="subsection">
        <ToggleSwitch
          label={labels.calloutStyleKeepTogether}
          checked={cs.keepTogether}
          onChange={(v) => update({ keepTogether: v })}
          tooltip={labels.codeKeepTogetherTooltip}
          isDefault={unset('keepTogether')}
          onReset={() => resetField('keepTogether')}
        />
        <NumberInput
          label={labels.calloutStyleSplitMinLines}
          value={cs.splitMinLines}
          onChange={(v) => update({ splitMinLines: Math.max(1, Math.round(v)) })}
          min={1}
          max={10}
          step={1}
          tooltip={labels.calloutStyleSplitMinLinesTooltip}
          isDefault={unset('splitMinLines')}
          onReset={() => resetField('splitMinLines')}
        />
        <ToggleSwitch
          label={labels.calloutStyleRepeatTitle}
          checked={cs.repeatTitle}
          onChange={(v) => update({ repeatTitle: v })}
          tooltip={labels.calloutStyleRepeatTitleTooltip}
          isDefault={unset('repeatTitle')}
          onReset={() => resetField('repeatTitle')}
        />
        <ToggleSwitch
          label={labels.tableContinuesMarkerEnabled}
          checked={cs.continuesMarkerEnabled}
          onChange={(v) => update({ continuesMarkerEnabled: v })}
          tooltip={labels.calloutStyleContinuesMarkerTooltip}
          isDefault={unset('continuesMarkerEnabled')}
          onReset={() => resetField('continuesMarkerEnabled')}
        />
        {cs.continuesMarkerEnabled && (
          <TextInput
            label={labels.tableContinuesMarker}
            tooltip={labels.tableContinuesMarkerTooltip}
            value={cs.continuesMarker ?? ''}
            onChange={(v) => update({ continuesMarker: v })}
            isDefault={unset('continuesMarker')}
            onReset={() => resetField('continuesMarker')}
          />
        )}
      </CollapsibleSection>

      <CollapsibleSection title={labels.codeGroupTokens} sectionId="codeStyle.tokens" variant="subsection">
        <SelectInput
          label={labels.codeHighlight}
          value={cs.highlight}
          variant="segmented"
          options={[
            { value: 'builtin', label: labels.codeHighlightBuiltin },
            { value: 'none', label: labels.codeHighlightNone },
          ]}
          onChange={(v) => update({ highlight: v as 'builtin' | 'none' })}
          tooltip={labels.codeHighlightTooltip}
          isDefault={unset('highlight')}
          onReset={() => resetField('highlight')}
        />
        {cs.highlight === 'builtin' && CODE_TOKEN_KINDS.map((kind) => {
          const name = tokenLabels(labels)[kind];
          const token = cs.tokens[kind];
          const own = raw?.tokens?.[kind];
          return (
            <NestedGroup key={kind}>
              <ColorPicker
                label={name}
                value={token.color ?? cs.color}
                onChange={(color) => setToken(kind, { color })}
                isDefault={own?.color === undefined}
                onReset={() => (own && Object.keys(own).length === 1 ? resetToken(kind) : setToken(kind, { color: undefined }))}
                fieldId={`code-token-${kind}`}
              />
              <SelectInput
                label={labels.codeTokenStyle}
                value={lookOf(token)}
                variant="segmented"
                stacked
                options={[
                  { value: 'regular', label: labels.codeTokenRegular },
                  { value: 'bold', label: labels.codeTokenBold },
                  { value: 'italic', label: labels.codeTokenItalic },
                  { value: 'boldItalic', label: labels.codeTokenBoldItalic },
                ]}
                onChange={(v) => setToken(kind, { bold: v === 'bold' || v === 'boldItalic', italic: v === 'italic' || v === 'boldItalic' })}
                isDefault={own?.bold === undefined && own?.italic === undefined}
                onReset={() => {
                  const base = DEFAULT_CODE_TOKENS[kind];
                  setToken(kind, { bold: base.bold, italic: base.italic });
                }}
              />
            </NestedGroup>
          );
        })}
      </CollapsibleSection>

      <CollapsibleSection title={labels.codeGroupInline} sectionId="codeStyle.inline" variant="subsection">
        <ToggleSwitch
          label={labels.codeInline}
          checked={inline !== undefined}
          onChange={(v) => (v ? update({ inline: {} }) : resetField('inline'))}
          tooltip={labels.codeInlineTooltip}
          isDefault={unset('inline')}
          onReset={() => resetField('inline')}
        />
        {inline && (
          <NestedGroup>
            <FontPicker
              label={labels.codeFont}
              value={inline.fontFamily}
              onChange={(v) => setInline({ fontFamily: v })}
              isDefault={inlineUnset('fontFamily')}
              onReset={() => resetInline('fontFamily')}
              searchPlaceholder={labels.bodyFontSearch}
              noResultsLabel={labels.bodyFontNoResults}
            />
            <DimensionInput
              label={labels.codeFontSize}
              value={inline.fontSize}
              onChange={(v) => setInline({ fontSize: v })}
              min={0.1}
              step={0.05}
              units={SIZE_UNITS}
              tooltip={labels.codeInlineFontSizeTooltip}
              isDefault={inlineUnset('fontSize')}
              onReset={() => resetInline('fontSize')}
            />
            <ColorPicker
              label={labels.colorLabel}
              value={inline.color ?? body.color}
              onChange={(color) => setInline({ color })}
              isDefault={inlineUnset('color')}
              onReset={() => resetInline('color')}
              fieldId="code-inline-color"
            />
            <ToggleSwitch
              label={labels.codeInlineFill}
              checked={inline.background !== undefined}
              onChange={(v) => (v ? setInline({ background: { hex: '#eeeeee', model: 'hex' } }) : resetInline('background'))}
              tooltip={labels.codeInlineFillTooltip}
              isDefault={inlineUnset('background')}
              onReset={() => resetInline('background')}
            />
            {inline.background && (
              <>
                <ColorPicker
                  label={labels.calloutStyleBackgroundColor}
                  value={inline.background}
                  onChange={(background) => setInline({ background })}
                  isDefault={false}
                  fieldId="code-inline-background"
                />
                <DimensionInput
                  label={labels.codeInlinePaddingX}
                  value={inline.paddingX}
                  onChange={(v) => setInline({ paddingX: v })}
                  min={0}
                  step={0.05}
                  units={SIZE_UNITS}
                  isDefault={inlineUnset('paddingX')}
                  onReset={() => resetInline('paddingX')}
                />
                <DimensionInput
                  label={labels.calloutStyleBorderRadius}
                  value={inline.borderRadius}
                  onChange={(v) => setInline({ borderRadius: v })}
                  min={0}
                  step={0.05}
                  units={SIZE_UNITS}
                  isDefault={inlineUnset('borderRadius')}
                  onReset={() => resetInline('borderRadius')}
                />
              </>
            )}
          </NestedGroup>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
});
