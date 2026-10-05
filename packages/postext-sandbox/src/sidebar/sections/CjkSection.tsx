'use client';

import { memo, useState } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  DEFAULT_CJK_CONFIG,
  cjkRegionOf,
  defaultCjkBookTitleMark,
  defaultCjkWarichuBrackets,
  defaultCjkCompression,
  defaultCjkEmphasis,
  defaultCjkHangingPunctuation,
  defaultCjkLineBreak,
  defaultCjkParagraphStartBracket,
  defaultCjkPunctuationWidth,
  defaultCjkSpaceAfterQuestion,
  dimensionsEqual,
  isCjkLanguage,
  resolveBodyTextConfig,
} from 'postext';
import type { CjkConfig, CjkGridConfig, CjkRubyConfig, CjkWarichuConfig } from 'postext';
import { CollapsibleSection, ColorPicker, DimensionInput, FieldGroup, FontPicker, NumberInput, SelectInput, TextInput, ToggleSwitch } from '../../controls';
import { Button } from '../../ui';
import { useSettingsSearch } from '../search/SearchContext';
import { gridMarginsText, mmText, useCjkGrid } from './cjkGridReadout';
import { documentLocaleLabel } from './BodyTextSection/constants';
import { defaultDocumentLocale } from '../../controls/hyphenation';

/**
 * East Asian typography (`cjk`): the regional conventions Chinese text
 * follows, where its lines may break, how wide its marks are set, whether
 * they hang, where a bracket that opens a paragraph goes, the space between
 * Han and Latin and after ？！, the numbers set upright in
 * vertical text, what emphasis and book-title markup print, the look of
 * ruby readings and warichu notes, and the character grid.
 * `Auto` follows the document language; the option shows what it resolves
 * to. In a document whose language is not Chinese, Japanese or Korean and
 * that sets none of these, a line says so instead of the fields (a button
 * shows them, and a search always does). The writing mode and the binding
 * are in Language and direction, the section before this one.
 */
export const CjkSection = memo(function CjkSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.cjk);
  // The document language as the previews read it: a book that names none
  // is in the interface's (Chinese in the Chinese interface).
  const locale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale ?? defaultDocumentLocale(s.locale));
  const grid = useCjkGrid();
  const uiLocale = useSandboxSelector((s) => s.locale);
  const rawBody = useSandboxSelector((s) => s.config.bodyText);
  const body = resolveBodyTextConfig(rawBody);
  const search = useSettingsSearch();
  const [showAnyway, setShowAnyway] = useState(false);
  const hasKeys = raw !== undefined && Object.keys(raw).length > 0;
  const showFields = isCjkLanguage(locale) || hasKeys || showAnyway || search.active;

  const write = (next: CjkConfig | undefined) => {
    const empty = !next || Object.keys(next).length === 0;
    dispatch({ type: 'UPDATE_CONFIG', payload: { cjk: empty ? undefined : next } });
  };
  const resetField = (field: keyof CjkConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    write(next);
  };
  /** Merge `partial` into `cjk[key]`, dropping fields set back to unset. */
  const writeNested = <K extends 'ruby' | 'warichu'>(key: K, partial: Partial<NonNullable<CjkConfig[K]>>) => {
    const next = { ...raw?.[key], ...partial } as Record<string, unknown>;
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
    const cjk: CjkConfig = { ...raw, [key]: next };
    if (Object.keys(next).length === 0) delete cjk[key];
    write(cjk);
  };
  const writeRuby = (partial: Partial<CjkRubyConfig>) => writeNested('ruby', partial);
  const writeWarichu = (partial: Partial<CjkWarichuConfig>) => writeNested('warichu', partial);
  const writeGrid = (partial: Partial<CjkGridConfig>) => {
    const next: CjkGridConfig = { ...raw?.grid, ...partial };
    for (const key of Object.keys(next) as (keyof CjkGridConfig)[]) if (next[key] === undefined) delete next[key];
    const cjk: CjkConfig = { ...raw, grid: next };
    if (Object.keys(next).length === 0) delete cjk.grid;
    write(cjk);
  };

  const regionNames = {
    mainland: labels.cjkRegionMainland,
    taiwan: labels.cjkRegionTaiwan,
    hongkong: labels.cjkRegionHongKong,
    japan: labels.cjkRegionJapan,
  };
  const lineBreakNames = {
    none: labels.cjkLineBreakNone,
    basic: labels.cjkLineBreakBasic,
    gb: labels.cjkLineBreakGb,
    strict: labels.cjkLineBreakStrict,
    'ja-very-strict': labels.cjkLineBreakJaVeryStrict,
    'ja-strict': labels.cjkLineBreakJaStrict,
    'ja-loose': labels.cjkLineBreakJaLoose,
  };
  const widthNames = {
    kaiming: labels.cjkPunctuationWidthKaiming,
    fullwidth: labels.cjkPunctuationWidthFull,
    lineEndHalf: labels.cjkPunctuationWidthLineEndHalf,
    halfwidth: labels.cjkPunctuationWidthHalf,
  };
  const region = raw?.region ?? DEFAULT_CJK_CONFIG.region;
  const lineBreak = raw?.lineBreak ?? DEFAULT_CJK_CONFIG.lineBreak;
  const punctuationWidth = raw?.punctuationWidth ?? DEFAULT_CJK_CONFIG.punctuationWidth;
  const compressAdjacent = raw?.compressAdjacent ?? DEFAULT_CJK_CONFIG.compressAdjacent;
  const trimLineStart = raw?.trimLineStart ?? DEFAULT_CJK_CONFIG.trimLineStart;
  const hanging = raw?.hangingPunctuation ?? DEFAULT_CJK_CONFIG.hangingPunctuation;
  const spaceAfterQuestion = raw?.spaceAfterQuestion ?? DEFAULT_CJK_CONFIG.spaceAfterQuestion;
  const paragraphStartBracket = raw?.paragraphStartBracket ?? DEFAULT_CJK_CONFIG.paragraphStartBracket;
  const latinSpacing = raw?.latinSpacing ?? DEFAULT_CJK_CONFIG.latinSpacing;
  const uprightDigits = raw?.uprightDigits ?? DEFAULT_CJK_CONFIG.uprightDigits;
  const autoRegion = cjkRegionOf(locale) ?? 'mainland';
  const resolvedRegion = region === 'auto' ? autoRegion : region;
  const autoLineBreak = defaultCjkLineBreak(resolvedRegion);
  const autoWidth = defaultCjkPunctuationWidth(resolvedRegion);
  const autoCompression = defaultCjkCompression(resolvedRegion);
  const hangingNames = { none: labels.cjkHangingNone, allow: labels.cjkHangingAllow, force: labels.cjkHangingForce };
  const autoHanging = defaultCjkHangingPunctuation(resolvedRegion);
  const autoSpaceAfterQuestion = defaultCjkSpaceAfterQuestion(resolvedRegion);
  const bracketNames = {
    half: labels.cjkParagraphStartBracketHalf,
    indent: labels.cjkParagraphStartBracketIndent,
    flush: labels.cjkParagraphStartBracketFlush,
  };
  const autoBracket = defaultCjkParagraphStartBracket(resolvedRegion);
  const emphasis = raw?.emphasis ?? DEFAULT_CJK_CONFIG.emphasis;
  const autoEmphasis = defaultCjkEmphasis(locale);
  const emphasisNames = { italic: labels.cjkEmphasisItalic, dots: labels.cjkEmphasisDots };
  const bookTitleMark = raw?.bookTitleMark ?? DEFAULT_CJK_CONFIG.bookTitleMark;
  const autoBookTitle = defaultCjkBookTitleMark(resolvedRegion);
  const autoWarichu = defaultCjkWarichuBrackets(resolvedRegion);
  const bookTitleNames = { brackets: labels.cjkBookTitleBrackets, wavy: labels.cjkBookTitleWavy, none: labels.cjkBookTitleNone };
  const markColor = raw?.annotationColor ?? body.color;
  const ruby = raw?.ruby;
  const warichu = raw?.warichu;
  const auto = (name: string) => labels.cjkAuto.replace('__value__', name);
  const onOff = (v: boolean) => (v ? labels.cjkOn : labels.cjkOff);
  const tri = (v: 'auto' | boolean) => (v === 'auto' ? 'auto' : v ? 'on' : 'off');
  const fromTri = (v: string): 'auto' | boolean => (v === 'auto' ? 'auto' : v === 'on');

  const gridOn = raw?.grid?.enabled === true;
  const readout = grid
    ? labels.cjkGridReadout
      .replace('__chars__', String(grid.charsPerLine))
      .replace('__lines__', String(grid.linesPerPage))
      .replace('__width__', mmText(grid.vertical ? grid.block : grid.inline, grid.dpi, uiLocale))
      .replace('__height__', mmText(grid.vertical ? grid.inline : grid.block, grid.dpi, uiLocale))
    : '';

  return (
    <CollapsibleSection
      title={labels.cjkSection}
      sectionId="cjk"
      onReset={() => write(undefined)}
      hasOverrides={hasKeys}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      {!showFields ? (
        <div className="flex flex-col items-start gap-1.5">
          <p className="text-[0.68rem] leading-[1.4] text-(--slate) [text-wrap:pretty]">
            {labels.cjkNotCjkHint.replace('__language__', documentLocaleLabel(locale))}
          </p>
          <Button variant="outline" size="xs" onClick={() => setShowAnyway(true)}>{labels.cjkShowSettings}</Button>
        </div>
      ) : (
        <>
          <SelectInput
            label={labels.cjkRegion}
            value={region}
            options={[
              { value: 'auto', label: auto(regionNames[autoRegion]) },
              { value: 'mainland', label: regionNames.mainland },
              { value: 'taiwan', label: regionNames.taiwan },
              { value: 'hongkong', label: regionNames.hongkong },
              { value: 'japan', label: regionNames.japan },
            ]}
            onChange={(v) => write({ ...raw, region: v as CjkConfig['region'] })}
            tooltip={labels.cjkRegionTooltip}
            isDefault={region === DEFAULT_CJK_CONFIG.region}
            onReset={() => resetField('region')}
          />
          <FieldGroup title={labels.cjkGroupLineEdges}>
            <SelectInput
              label={labels.cjkLineBreak}
              value={lineBreak}
              options={[
                { value: 'auto', label: auto(lineBreakNames[autoLineBreak]) },
                { value: 'none', label: lineBreakNames.none },
                { value: 'basic', label: lineBreakNames.basic },
                { value: 'gb', label: lineBreakNames.gb },
                { value: 'strict', label: lineBreakNames.strict },
                { value: 'ja-very-strict', label: lineBreakNames['ja-very-strict'] },
                { value: 'ja-strict', label: lineBreakNames['ja-strict'] },
                { value: 'ja-loose', label: lineBreakNames['ja-loose'] },
              ]}
              onChange={(v) => write({ ...raw, lineBreak: v as CjkConfig['lineBreak'] })}
              tooltip={labels.cjkLineBreakTooltip}
              isDefault={lineBreak === DEFAULT_CJK_CONFIG.lineBreak}
              onReset={() => resetField('lineBreak')}
            />
            <SelectInput
              label={labels.cjkTrimLineStart}
              value={tri(trimLineStart)}
              options={[
                { value: 'auto', label: auto(onOff(autoCompression)) },
                { value: 'on', label: labels.cjkOn },
                { value: 'off', label: labels.cjkOff },
              ]}
              onChange={(v) => write({ ...raw, trimLineStart: fromTri(v) })}
              tooltip={labels.cjkTrimLineStartTooltip}
              isDefault={trimLineStart === DEFAULT_CJK_CONFIG.trimLineStart}
              onReset={() => resetField('trimLineStart')}
            />
            <SelectInput
              label={labels.cjkParagraphStartBracket}
              value={paragraphStartBracket}
              options={[
                { value: 'auto', label: auto(autoBracket ? bracketNames[autoBracket] : labels.cjkParagraphStartBracketLineStart) },
                { value: 'half', label: bracketNames.half },
                { value: 'indent', label: bracketNames.indent },
                { value: 'flush', label: bracketNames.flush },
              ]}
              onChange={(v) => write({ ...raw, paragraphStartBracket: v as CjkConfig['paragraphStartBracket'] })}
              tooltip={labels.cjkParagraphStartBracketTooltip}
              isDefault={paragraphStartBracket === DEFAULT_CJK_CONFIG.paragraphStartBracket}
              onReset={() => resetField('paragraphStartBracket')}
            />
            <SelectInput
              label={labels.cjkHanging}
              value={hanging}
              options={[
                { value: 'auto', label: auto(hangingNames[autoHanging]) },
                { value: 'none', label: hangingNames.none },
                { value: 'allow', label: hangingNames.allow },
                { value: 'force', label: hangingNames.force },
              ]}
              onChange={(v) => write({ ...raw, hangingPunctuation: v as CjkConfig['hangingPunctuation'] })}
              tooltip={labels.cjkHangingTooltip}
              isDefault={hanging === DEFAULT_CJK_CONFIG.hangingPunctuation}
              onReset={() => resetField('hangingPunctuation')}
            />
          </FieldGroup>
          <FieldGroup title={labels.cjkGroupPunctuation}>
            <SelectInput
              label={labels.cjkPunctuationWidth}
              value={punctuationWidth}
              options={[
                { value: 'auto', label: auto(widthNames[autoWidth]) },
                { value: 'kaiming', label: widthNames.kaiming },
                { value: 'fullwidth', label: widthNames.fullwidth },
                { value: 'lineEndHalf', label: widthNames.lineEndHalf },
                { value: 'halfwidth', label: widthNames.halfwidth },
              ]}
              onChange={(v) => write({ ...raw, punctuationWidth: v as CjkConfig['punctuationWidth'] })}
              tooltip={labels.cjkPunctuationWidthTooltip}
              isDefault={punctuationWidth === DEFAULT_CJK_CONFIG.punctuationWidth}
              onReset={() => resetField('punctuationWidth')}
            />
            <SelectInput
              label={labels.cjkCompressAdjacent}
              value={tri(compressAdjacent)}
              options={[
                { value: 'auto', label: auto(onOff(autoCompression)) },
                { value: 'on', label: labels.cjkOn },
                { value: 'off', label: labels.cjkOff },
              ]}
              onChange={(v) => write({ ...raw, compressAdjacent: fromTri(v) })}
              tooltip={labels.cjkCompressAdjacentTooltip}
              isDefault={compressAdjacent === DEFAULT_CJK_CONFIG.compressAdjacent}
              onReset={() => resetField('compressAdjacent')}
            />
          </FieldGroup>
          <FieldGroup title={labels.cjkGroupSpacing}>
            <DimensionInput
              label={labels.cjkLatinSpacing}
              value={latinSpacing}
              onChange={(dim) => write({ ...raw, latinSpacing: dim })}
              min={0}
              step={latinSpacing.unit === 'em' ? 0.05 : 0.1}
              units={['em', 'pt', 'mm']}
              tooltip={labels.cjkLatinSpacingTooltip}
              isDefault={dimensionsEqual(latinSpacing, DEFAULT_CJK_CONFIG.latinSpacing)}
              onReset={() => resetField('latinSpacing')}
            />
            <SelectInput
              label={labels.cjkSpaceAfterQuestion}
              value={tri(spaceAfterQuestion)}
              options={[
                { value: 'auto', label: auto(onOff(autoSpaceAfterQuestion)) },
                { value: 'on', label: labels.cjkOn },
                { value: 'off', label: labels.cjkOff },
              ]}
              onChange={(v) => write({ ...raw, spaceAfterQuestion: fromTri(v) })}
              tooltip={labels.cjkSpaceAfterQuestionTooltip}
              isDefault={spaceAfterQuestion === DEFAULT_CJK_CONFIG.spaceAfterQuestion}
              onReset={() => resetField('spaceAfterQuestion')}
            />
          </FieldGroup>
          <FieldGroup title={labels.cjkGroupVertical}>
            <SelectInput
              label={labels.cjkUprightDigits}
              value={String(uprightDigits)}
              options={[
                { value: '0', label: labels.cjkOff },
                ...[2, 3, 4].map((n) => ({ value: String(n), label: labels.cjkUprightDigitsCount.replace('__count__', String(n)) })),
              ]}
              onChange={(v) => write({ ...raw, uprightDigits: Number(v) as CjkConfig['uprightDigits'] })}
              tooltip={labels.cjkUprightDigitsTooltip}
              isDefault={uprightDigits === DEFAULT_CJK_CONFIG.uprightDigits}
              onReset={() => resetField('uprightDigits')}
            />
          </FieldGroup>
          <FieldGroup title={labels.cjkGroupAnnotations}>
            <SelectInput
              label={labels.cjkEmphasis}
              value={emphasis}
              options={[
                { value: 'auto', label: auto(emphasisNames[autoEmphasis]) },
                { value: 'dots', label: emphasisNames.dots },
                { value: 'italic', label: emphasisNames.italic },
              ]}
              onChange={(v) => write({ ...raw, emphasis: v as CjkConfig['emphasis'] })}
              tooltip={labels.cjkEmphasisTooltip}
              isDefault={emphasis === DEFAULT_CJK_CONFIG.emphasis}
              onReset={() => resetField('emphasis')}
            />
            <SelectInput
              label={labels.cjkBookTitleMark}
              value={bookTitleMark}
              options={[
                { value: 'auto', label: auto(bookTitleNames[autoBookTitle]) },
                { value: 'brackets', label: bookTitleNames.brackets },
                { value: 'wavy', label: bookTitleNames.wavy },
                { value: 'none', label: bookTitleNames.none },
              ]}
              onChange={(v) => write({ ...raw, bookTitleMark: v as CjkConfig['bookTitleMark'] })}
              tooltip={labels.cjkBookTitleMarkTooltip}
              isDefault={bookTitleMark === DEFAULT_CJK_CONFIG.bookTitleMark}
              onReset={() => resetField('bookTitleMark')}
            />
            <ColorPicker
              label={labels.cjkAnnotationColor}
              value={markColor}
              onChange={(v) => write({ ...raw, annotationColor: v })}
              tooltip={labels.cjkAnnotationColorTooltip}
              isDefault={raw?.annotationColor === undefined}
              onReset={() => resetField('annotationColor')}
              fieldId="cjk-annotationColor"
            />
          </FieldGroup>
          <FieldGroup title={labels.cjkRuby} description={labels.cjkRubyDescription}>
            <FontPicker
              label={labels.cjkRubyFont}
              value={ruby?.fontFamily ?? body.fontFamily}
              onChange={(v) => writeRuby({ fontFamily: v })}
              tooltip={labels.cjkRubyFontTooltip}
              isDefault={ruby?.fontFamily === undefined}
              onReset={() => writeRuby({ fontFamily: undefined })}
              searchPlaceholder={labels.bodyFontSearch}
              noResultsLabel={labels.bodyFontNoResults}
            />
            <DimensionInput
              label={labels.cjkRubySize}
              value={ruby?.fontSize ?? DEFAULT_CJK_CONFIG.ruby.fontSize!}
              onChange={(dim) => writeRuby({ fontSize: dim })}
              min={0.1}
              step={0.05}
              units={['em', 'pt', 'mm']}
              tooltip={labels.cjkRubySizeTooltip}
              isDefault={ruby?.fontSize === undefined || dimensionsEqual(ruby.fontSize, DEFAULT_CJK_CONFIG.ruby.fontSize!)}
              onReset={() => writeRuby({ fontSize: undefined })}
            />
            <ColorPicker
              label={labels.cjkRubyColor}
              value={ruby?.color ?? markColor}
              onChange={(v) => writeRuby({ color: v })}
              tooltip={labels.cjkRubyColorTooltip}
              isDefault={ruby?.color === undefined}
              onReset={() => writeRuby({ color: undefined })}
              fieldId="cjk-ruby-color"
            />
            <SelectInput
              label={labels.cjkRubyPosition}
              value={ruby?.position ?? 'auto'}
              options={[
                { value: 'auto', label: labels.cjkRubyPositionAuto },
                { value: 'over', label: labels.cjkRubyOver },
                { value: 'under', label: labels.cjkRubyUnder },
                { value: 'right', label: labels.cjkRubyRight },
              ]}
              onChange={(v) => writeRuby({ position: v === 'auto' ? undefined : (v as CjkRubyConfig['position']) })}
              tooltip={labels.cjkRubyPositionTooltip}
              isDefault={(ruby?.position ?? 'auto') === 'auto'}
              onReset={() => writeRuby({ position: undefined })}
            />
          </FieldGroup>
          <FieldGroup title={labels.cjkWarichu} description={labels.cjkWarichuDescription}>
            <DimensionInput
              label={labels.cjkWarichuSize}
              value={warichu?.fontSize ?? DEFAULT_CJK_CONFIG.warichu.fontSize!}
              onChange={(dim) => writeWarichu({ fontSize: dim })}
              min={0.1}
              step={0.05}
              units={['em', 'pt', 'mm']}
              tooltip={labels.cjkWarichuSizeTooltip}
              isDefault={warichu?.fontSize === undefined || dimensionsEqual(warichu.fontSize, DEFAULT_CJK_CONFIG.warichu.fontSize!)}
              onReset={() => writeWarichu({ fontSize: undefined })}
            />
            <ColorPicker
              label={labels.cjkWarichuColor}
              value={warichu?.color ?? markColor}
              onChange={(v) => writeWarichu({ color: v })}
              tooltip={labels.cjkWarichuColorTooltip}
              isDefault={warichu?.color === undefined}
              onReset={() => writeWarichu({ color: undefined })}
              fieldId="cjk-warichu-color"
            />
            <TextInput
              label={labels.cjkWarichuOpen}
              value={warichu?.open ?? ''}
              onChange={(v) => writeWarichu({ open: v === '' ? undefined : v })}
              placeholder={autoWarichu.open || '〔'}
              widthCh={4}
              tooltip={labels.cjkWarichuOpenTooltip}
              isDefault={!warichu?.open}
              onReset={() => writeWarichu({ open: undefined })}
            />
            <TextInput
              label={labels.cjkWarichuClose}
              value={warichu?.close ?? ''}
              onChange={(v) => writeWarichu({ close: v === '' ? undefined : v })}
              placeholder={autoWarichu.close || '〕'}
              widthCh={4}
              tooltip={labels.cjkWarichuCloseTooltip}
              isDefault={!warichu?.close}
              onReset={() => writeWarichu({ close: undefined })}
            />
          </FieldGroup>
          <FieldGroup title={labels.cjkGrid} description={labels.cjkGridDescription}>
            <ToggleSwitch
              label={labels.cjkGridEnabled}
              checked={gridOn}
              onChange={(v) => writeGrid({ enabled: v ? true : undefined })}
              tooltip={labels.cjkGridEnabledTooltip}
              isDefault={!gridOn}
              onReset={() => writeGrid({ enabled: undefined })}
            />
            {gridOn && (
              <>
                <NumberInput
                  label={labels.cjkGridChars}
                  value={raw?.grid?.charsPerLine ?? 0}
                  onChange={(v) => writeGrid({ charsPerLine: v > 0 ? Math.round(v) : undefined })}
                  min={0}
                  max={80}
                  tooltip={labels.cjkGridCharsTooltip}
                  isDefault={raw?.grid?.charsPerLine === undefined}
                  onReset={() => writeGrid({ charsPerLine: undefined })}
                />
                <NumberInput
                  label={labels.cjkGridLines}
                  value={raw?.grid?.linesPerPage ?? 0}
                  onChange={(v) => writeGrid({ linesPerPage: v > 0 ? Math.round(v) : undefined })}
                  min={0}
                  max={120}
                  tooltip={labels.cjkGridLinesTooltip}
                  isDefault={raw?.grid?.linesPerPage === undefined}
                  onReset={() => writeGrid({ linesPerPage: undefined })}
                />
                <ToggleSwitch
                  label={labels.cjkGridShow}
                  checked={raw?.grid?.show === true}
                  onChange={(v) => writeGrid({ show: v ? true : undefined })}
                  tooltip={labels.cjkGridShowTooltip}
                  isDefault={raw?.grid?.show !== true}
                  onReset={() => writeGrid({ show: undefined })}
                />
                {grid && (
                  <p className="mt-1 text-[0.66rem] leading-[1.35] text-(--slate) [text-wrap:pretty]">
                    <span className="font-semibold">{readout}</span>
                    <br />
                    {gridMarginsText(labels.cjkGridMargins, grid, uiLocale)}
                  </p>
                )}
              </>
            )}
          </FieldGroup>
        </>
      )}
    </CollapsibleSection>
  );
});
