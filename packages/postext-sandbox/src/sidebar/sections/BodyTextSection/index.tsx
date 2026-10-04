'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext';
import { resolveBodyTextConfig, DEFAULT_BODY_TEXT_CONFIG, dimensionsEqual, colorsEqual, isCjkLanguage } from 'postext';
import type { BodyTextConfig, ColonListRoom, EmphasisStyle, HyphenationConfig, TashkilMode } from 'postext';
import { ChevronRight } from 'lucide-react';
import {
  CollapsibleSection,
  FieldGroup,
  ColorPicker,
  DimensionInput,
  FontPicker,
  NumberInput,
  SelectInput,
  ToggleSwitch,
  FieldRow,
  useFieldIds,
} from '../../../controls';
import { documentLocaleLabel, TEXT_SIZE_UNITS, LINE_HEIGHT_UNITS, INDENT_UNITS } from './constants';
import { defaultDocumentLocale } from '../../../controls/hyphenation';
import { useOpenSettingsGroup } from '../../../context/settingsNavigation';
import { JustificationSubsection, RaggedBreakingSubsection } from './JustificationSubsection';
import { BlockquoteSubsection } from './BlockquoteSubsection';
import { RaggedHyphenationSubsection } from './HyphenationFields';
import { TypeSample } from '../../settings/TypeSample';
import { AlignPicture } from '../../settings/pictures';
import { OrphansSubsection, WidowsSubsection, RuntsSubsection } from './OrphansWidowsRuntsSubsections';
import { isArabicScriptLanguage } from '../../../context/arabicDefaults';
import { flowSideLabels, useRightToLeftFlow } from '../../settings/flowSides';

const D = DEFAULT_BODY_TEXT_CONFIG;

export const BodyTextSection = memo(function BodyTextSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.bodyText);
  const locale = useSandboxSelector((s) => s.locale);
  const documentLocale = useSandboxSelector((s) => s.config.locale);
  const defaultLocale = defaultDocumentLocale(locale);

  // The document language is the hyphenation fallback; the app locale
  // stands in for it while neither is explicitly set.
  const effectiveHyphenationLocale = raw?.hyphenation?.locale ?? documentLocale ?? defaultLocale;
  const effectiveDocumentLocale = documentLocale ?? defaultLocale;
  // A Chinese interface reads an unnamed document as Chinese, which sets
  // it without hyphenation: the switch shows what the previews do.
  const resolvingLocale = documentLocale ?? (isCjkLanguage(defaultLocale) ? defaultLocale : undefined);
  const bodyText = resolveBodyTextConfig(raw, resolvingLocale);

  const updateBodyText = (partial: Partial<BodyTextConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: { ...raw, ...partial } },
    });
  };

  // The document language is kept: it is set under Writing system.
  const resetBodyText = () => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: undefined },
    });
  };

  const resetField = (field: keyof BodyTextConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { bodyText: hasKeys ? next : undefined },
    });
  };

  const updateHyphenation = (partial: Partial<HyphenationConfig>) => {
    const next: HyphenationConfig = { ...raw?.hyphenation, ...partial };
    // Chinese, Japanese and Korean have no patterns: turning hyphenation on
    // in such a document names the language of its Latin words, English
    // until the author picks another.
    if (partial.enabled === true && isCjkLanguage(next.locale ?? effectiveDocumentLocale)) next.locale = 'en-us';
    updateBodyText({ hyphenation: next });
  };

  const handleTextAlignChange = (value: string) => {
    const textAlign = value as BodyTextConfig['textAlign'];
    // Going ragged drops the justified-only hyphenation settings, unless
    // ragged text hyphenates too.
    if (textAlign === 'left' && !raw?.hyphenation?.ragged) {
      const next: BodyTextConfig = { ...raw, textAlign };
      delete next.hyphenation;
      const hasKeys = Object.keys(next).length > 0;
      dispatch({
        type: 'UPDATE_CONFIG',
        payload: { bodyText: hasKeys ? next : undefined },
      });
    } else {
      updateBodyText({ textAlign });
    }
  };

  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;
  const isFontDefault = bodyText.fontFamily === D.fontFamily;
  const isSizeDefault = dimensionsEqual(bodyText.fontSize, D.fontSize);
  const isLineHeightDefault = dimensionsEqual(bodyText.lineHeight, D.lineHeight);
  const isParagraphSpacingDefault = bodyText.paragraphSpacing === D.paragraphSpacing;
  const isColorDefault = colorsEqual(bodyText.color, D.color);
  const isBoldColorDefault = raw?.boldColor === undefined;
  const isItalicColorDefault = raw?.italicColor === undefined;
  const DEFAULT_BOLD_COLOR = bodyText.boldColor ?? bodyText.color;
  const DEFAULT_ITALIC_COLOR = bodyText.italicColor ?? bodyText.color;
  const DEFAULT_REFERENCE_COLOR = bodyText.referenceColor;
  const isReferenceColorDefault = raw?.referenceColor === undefined;
  const isReferenceBoldDefault = bodyText.referenceBold === D.referenceBold;
  const isReferenceItalicDefault = bodyText.referenceItalic === D.referenceItalic;
  const isTextAlignDefault = bodyText.textAlign === D.textAlign;
  const isFontWeightDefault = bodyText.fontWeight === D.fontWeight;
  const isBoldFontWeightDefault = bodyText.boldFontWeight === D.boldFontWeight;
  // Off by default in a Chinese, Japanese or Korean document.
  const isHyphenationEnabledDefault = bodyText.hyphenation.enabled === resolveBodyTextConfig(undefined, resolvingLocale).hyphenation.enabled;
  const isHyphenationLocaleDefault = effectiveHyphenationLocale === defaultLocale;
  const isFirstLineIndentDefault = dimensionsEqual(bodyText.firstLineIndent, D.firstLineIndent);
  const isHangingIndentDefault = bodyText.hangingIndent === D.hangingIndent;
  const isIndentAfterHeadingDefault = bodyText.indentAfterHeading === D.indentAfterHeading;
  const isMaxWordSpacingDefault = bodyText.maxWordSpacing === D.maxWordSpacing;
  const isMinWordSpacingDefault = bodyText.minWordSpacing === D.minWordSpacing;
  const isOptimalLineBreakingDefault = bodyText.optimalLineBreaking === D.optimalLineBreaking;
  const isAvoidOrphansDefault = bodyText.avoidOrphans === D.avoidOrphans;
  const isOrphanMinLinesDefault = bodyText.orphanMinLines === D.orphanMinLines;
  const isOrphanPenaltyDefault = bodyText.orphanPenalty === D.orphanPenalty;
  const isAvoidOrphansInListsDefault = bodyText.avoidOrphansInLists === D.avoidOrphansInLists;
  const isAvoidWidowsDefault = bodyText.avoidWidows === D.avoidWidows;
  const isWidowMinLinesDefault = bodyText.widowMinLines === D.widowMinLines;
  const isWidowPenaltyDefault = bodyText.widowPenalty === D.widowPenalty;
  const isAvoidWidowsInListsDefault = bodyText.avoidWidowsInLists === D.avoidWidowsInLists;
  const isSlackWeightDefault = bodyText.slackWeight === D.slackWeight;
  const isAvoidRuntsDefault = bodyText.avoidRunts === D.avoidRunts;
  const isRuntMinCharactersDefault = bodyText.runtMinCharacters === D.runtMinCharacters;
  const isRuntPenaltyDefault = bodyText.runtPenalty === D.runtPenalty;
  const isAvoidRuntsInListsDefault = bodyText.avoidRuntsInLists === D.avoidRuntsInLists;
  const isKeepColonWithListDefault = bodyText.keepColonWithList === D.keepColonWithList;
  const isColonListRoomDefault = bodyText.colonListRoom === D.colonListRoom;

  // `*…*` is set in bold by default in a language written in Arabic script
  // (the engine's `defaultEmphasisFor`): Auto names what it gives.
  const arabicScript = isArabicScriptLanguage(effectiveDocumentLocale);
  const emphasisName = (e: EmphasisStyle) =>
    e === 'bold' ? labels.bodyEmphasisBold : e === 'color' ? labels.bodyEmphasisColor : e === 'overline' ? labels.bodyEmphasisOverline : labels.bodyEmphasisItalic;
  const emphasis = raw?.emphasis === 'italic' || raw?.emphasis === 'bold' || raw?.emphasis === 'color' || raw?.emphasis === 'overline' ? raw.emphasis : 'auto';
  const EMPHASIS_OPTIONS = [
    { value: 'auto', label: labels.cjkAuto.replace('__value__', emphasisName(arabicScript ? 'bold' : 'italic')) },
    { value: 'italic', label: labels.bodyEmphasisItalic },
    { value: 'bold', label: labels.bodyEmphasisBold },
    { value: 'color', label: labels.bodyEmphasisColor },
    { value: 'overline', label: labels.bodyEmphasisOverline },
  ];
  const tashkil: TashkilMode = raw?.tashkil === 'strip' || raw?.tashkil === 'strip-vowels' ? raw.tashkil : 'keep';
  const TASHKIL_OPTIONS = [
    { value: 'keep', label: labels.bodyTashkilKeep },
    { value: 'strip', label: labels.bodyTashkilStrip },
    { value: 'strip-vowels', label: labels.bodyTashkilStripVowels },
  ];

  const COLON_LIST_ROOM_OPTIONS = [
    { value: 'item', label: labels.bodyColonListRoomItem },
    { value: 'line', label: labels.bodyColonListRoomLine },
  ];

  // In a right-to-left book `left` is the start: flush right, ragged left.
  const rtl = useRightToLeftFlow();
  const ALIGN_OPTIONS = [
    { value: 'left', label: flowSideLabels(rtl, labels.bodyTextAlignLeft, labels.headingsTextAlignRight).left, icon: <AlignPicture align={rtl ? 'right' : 'left'} /> },
    { value: 'justify', label: labels.bodyTextAlignJustify, icon: <AlignPicture align="justify" /> },
  ];

  return (
    <CollapsibleSection
      title={labels.bodyText}
      sectionId="bodyText"
      onReset={resetBodyText}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <TypeSample body={bodyText} lang={effectiveDocumentLocale} />
      <FieldGroup title={labels.bodyGroupTypeface}>
        <FontPicker
          label={labels.bodyFont}
          value={bodyText.fontFamily}
          onChange={(font) => updateBodyText({ fontFamily: font })}
          tooltip={labels.bodyFontTooltip}
          isDefault={isFontDefault}
          onReset={() => resetField('fontFamily')}
          searchPlaceholder={labels.bodyFontSearch}
          noResultsLabel={labels.bodyFontNoResults}
        />
        <DimensionInput
          label={labels.bodyFontSize}
          value={bodyText.fontSize}
          onChange={(dim) => updateBodyText({ fontSize: dim })}
          min={1}
          step={0.5}
          tooltip={labels.bodyFontSizeTooltip}
          isDefault={isSizeDefault}
          onReset={() => resetField('fontSize')}
          units={TEXT_SIZE_UNITS}
        />
        <DimensionInput
          label={labels.bodyLineHeight}
          value={bodyText.lineHeight}
          onChange={(dim) => updateBodyText({ lineHeight: dim })}
          min={0.5}
          max={5}
          step={0.1}
          tooltip={labels.bodyLineHeightTooltip}
          isDefault={isLineHeightDefault}
          onReset={() => resetField('lineHeight')}
          units={LINE_HEIGHT_UNITS}
        />
        <NumberInput
          label={labels.bodyFontWeight}
          value={bodyText.fontWeight}
          onChange={(w) => updateBodyText({ fontWeight: w })}
          min={100}
          max={900}
          step={10}
          tooltip={labels.bodyFontWeightTooltip}
          isDefault={isFontWeightDefault}
          onReset={() => resetField('fontWeight')}
        />
        <NumberInput
          label={labels.bodyBoldFontWeight}
          value={bodyText.boldFontWeight}
          onChange={(w) => updateBodyText({ boldFontWeight: w })}
          min={100}
          max={900}
          step={10}
          tooltip={labels.bodyBoldFontWeightTooltip}
          isDefault={isBoldFontWeightDefault}
          onReset={() => resetField('boldFontWeight')}
        />
        <SelectInput
          label={labels.bodyEmphasis}
          value={emphasis}
          options={EMPHASIS_OPTIONS}
          onChange={(v) => (v === 'auto' ? resetField('emphasis') : updateBodyText({ emphasis: v as EmphasisStyle }))}
          tooltip={labels.bodyEmphasisTooltip}
          isDefault={emphasis === 'auto'}
          onReset={() => resetField('emphasis')}
        />
      </FieldGroup>
      <FieldGroup title={labels.bodyGroupParagraph}>
        <SelectInput
          label={labels.bodyTextAlign}
          value={bodyText.textAlign}
          options={ALIGN_OPTIONS}
          variant="segmented"
          onChange={handleTextAlignChange}
          tooltip={labels.bodyTextAlignTooltip}
          isDefault={isTextAlignDefault}
          onReset={() => {
            if (!raw) return;
            const next = { ...raw };
            delete next.textAlign;
            delete next.hyphenation;
            dispatch({ type: 'UPDATE_CONFIG', payload: { bodyText: Object.keys(next).length > 0 ? next : undefined } });
          }}
        />
        {bodyText.textAlign === 'justify' && (
          <JustificationSubsection
            bodyText={bodyText}
            raw={raw}
            effectiveHyphenationLocale={effectiveHyphenationLocale}
            isHyphenationEnabledDefault={isHyphenationEnabledDefault}
            isHyphenationLocaleDefault={isHyphenationLocaleDefault}
            isMaxWordSpacingDefault={isMaxWordSpacingDefault}
            isMinWordSpacingDefault={isMinWordSpacingDefault}
            isOptimalLineBreakingDefault={isOptimalLineBreakingDefault}
            updateBodyText={updateBodyText}
            updateHyphenation={updateHyphenation}
            resetField={resetField}
            labels={labels}
          />
        )}
        {bodyText.textAlign !== 'justify' && (
          <RaggedHyphenationSubsection
            bodyText={bodyText}
            raw={raw}
            updateBodyText={updateBodyText}
            updateHyphenation={updateHyphenation}
            labels={labels}
            effectiveHyphenationLocale={effectiveHyphenationLocale}
            isHyphenationLocaleDefault={isHyphenationLocaleDefault}
          />
        )}
        {bodyText.textAlign !== 'justify' && (
          <RaggedBreakingSubsection
            bodyText={bodyText}
            updateBodyText={updateBodyText}
            resetField={resetField}
            labels={labels}
          />
        )}
        <ToggleSwitch
          label={labels.bodyBreakAfterDashes}
          checked={bodyText.breakAfterDashes}
          onChange={(checked) => updateBodyText({ breakAfterDashes: checked })}
          tooltip={labels.bodyBreakAfterDashesTooltip}
          isDefault={bodyText.breakAfterDashes === D.breakAfterDashes}
          onReset={() => resetField('breakAfterDashes')}
        />
        <ToggleSwitch
          label={labels.bodyBreakAfterHyphens}
          checked={bodyText.breakAfterHyphens}
          onChange={(checked) => updateBodyText({ breakAfterHyphens: checked })}
          tooltip={labels.bodyBreakAfterHyphensTooltip}
          isDefault={bodyText.breakAfterHyphens === D.breakAfterHyphens}
          onReset={() => resetField('breakAfterHyphens')}
        />
        <ToggleSwitch
          label={labels.bodyRepeatHyphen}
          checked={bodyText.repeatHyphen}
          onChange={(checked) => updateBodyText({ repeatHyphen: checked })}
          tooltip={labels.bodyRepeatHyphenTooltip}
          isDefault={bodyText.repeatHyphen === D.repeatHyphen}
          onReset={() => resetField('repeatHyphen')}
        />
        <DimensionInput
          label={labels.bodyFirstLineIndent}
          value={bodyText.firstLineIndent}
          onChange={(dim) => updateBodyText({ firstLineIndent: dim })}
          min={0}
          step={0.25}
          tooltip={labels.bodyFirstLineIndentTooltip}
          isDefault={isFirstLineIndentDefault}
          onReset={() => resetField('firstLineIndent')}
          units={INDENT_UNITS}
        />
        <ToggleSwitch
          label={labels.bodyIndentAfterHeading}
          checked={bodyText.indentAfterHeading}
          onChange={(checked) => updateBodyText({ indentAfterHeading: checked })}
          tooltip={labels.bodyIndentAfterHeadingTooltip}
          isDefault={isIndentAfterHeadingDefault}
          onReset={() => resetField('indentAfterHeading')}
        />
        <ToggleSwitch
          label={labels.bodyHangingIndent}
          checked={bodyText.hangingIndent}
          onChange={(checked) => updateBodyText({ hangingIndent: checked })}
          tooltip={labels.bodyHangingIndentTooltip}
          isDefault={isHangingIndentDefault}
          onReset={() => resetField('hangingIndent')}
        />
        <ToggleSwitch
          label={labels.bodyParagraphSpacing}
          checked={bodyText.paragraphSpacing}
          onChange={(checked) => updateBodyText({ paragraphSpacing: checked })}
          tooltip={labels.bodyParagraphSpacingTooltip}
          isDefault={isParagraphSpacingDefault}
          onReset={() => resetField('paragraphSpacing')}
        />
      </FieldGroup>
      <FieldGroup title={labels.bodyGroupColor}>
        <ColorPicker
          label={labels.bodyColor}
          value={bodyText.color}
          onChange={(color) => updateBodyText({ color })}
          tooltip={labels.bodyColorTooltip}
          isDefault={isColorDefault}
          onReset={() => resetField('color')}
          fieldId="bodyText-color"
        />
        <ColorPicker
          label={labels.bodyBoldColor}
          value={DEFAULT_BOLD_COLOR}
          onChange={(color) => updateBodyText({ boldColor: color })}
          tooltip={labels.bodyBoldColorTooltip}
          isDefault={isBoldColorDefault}
          onReset={() => resetField('boldColor')}
          fieldId="bodyText-boldColor"
        />
        <ColorPicker
          label={labels.bodyItalicColor}
          value={DEFAULT_ITALIC_COLOR}
          onChange={(color) => updateBodyText({ italicColor: color })}
          tooltip={labels.bodyItalicColorTooltip}
          isDefault={isItalicColorDefault}
          onReset={() => resetField('italicColor')}
          fieldId="bodyText-italicColor"
        />
      </FieldGroup>
      <FieldGroup title={labels.bodyGroupLanguage}>
        {/* Moved to Writing system; the row says where, and opens it. */}
        <FieldRow label={labels.documentLocale} tooltip={labels.bodyDocumentLocaleMoved} isDefault>
          <DocumentLocalePointer tag={effectiveDocumentLocale} />
        </FieldRow>
        {/* Arabic vowel marks: offered in a book written in Arabic script,
            or wherever they were set. */}
        {(arabicScript || tashkil !== 'keep') && (
          <SelectInput
            label={labels.bodyTashkil}
            value={tashkil}
            options={TASHKIL_OPTIONS}
            onChange={(v) => (v === 'keep' ? resetField('tashkil') : updateBodyText({ tashkil: v as TashkilMode }))}
            tooltip={labels.bodyTashkilTooltip}
            isDefault={tashkil === 'keep'}
            onReset={() => resetField('tashkil')}
          />
        )}
      </FieldGroup>
      <CollapsibleSection title={labels.bodyGroupLineControl} sectionId="bodyText-lineControl" variant="subsection">
        <ToggleSwitch
          label={labels.bodyAvoidOrphans}
          checked={bodyText.avoidOrphans}
          onChange={(checked) => updateBodyText({ avoidOrphans: checked })}
          tooltip={labels.bodyAvoidOrphansTooltip}
          isDefault={isAvoidOrphansDefault}
          onReset={() => resetField('avoidOrphans')}
        />
        {bodyText.avoidOrphans && (
          <OrphansSubsection
            bodyText={bodyText}
            isOrphanMinLinesDefault={isOrphanMinLinesDefault}
            isOrphanPenaltyDefault={isOrphanPenaltyDefault}
            isAvoidOrphansInListsDefault={isAvoidOrphansInListsDefault}
            updateBodyText={updateBodyText}
            resetField={resetField}
            labels={labels}
          />
        )}
        <ToggleSwitch
          label={labels.bodyAvoidWidows}
          checked={bodyText.avoidWidows}
          onChange={(checked) => updateBodyText({ avoidWidows: checked })}
          tooltip={labels.bodyAvoidWidowsTooltip}
          isDefault={isAvoidWidowsDefault}
          onReset={() => resetField('avoidWidows')}
        />
        {bodyText.avoidWidows && (
          <WidowsSubsection
            bodyText={bodyText}
            isWidowMinLinesDefault={isWidowMinLinesDefault}
            isWidowPenaltyDefault={isWidowPenaltyDefault}
            isAvoidWidowsInListsDefault={isAvoidWidowsInListsDefault}
            updateBodyText={updateBodyText}
            resetField={resetField}
            labels={labels}
          />
        )}
        <ToggleSwitch
          label={labels.bodyAvoidRunts}
          checked={bodyText.avoidRunts}
          onChange={(checked) => updateBodyText({ avoidRunts: checked })}
          tooltip={labels.bodyAvoidRuntsTooltip}
          isDefault={isAvoidRuntsDefault}
          onReset={() => resetField('avoidRunts')}
        />
        {bodyText.avoidRunts && (
          <RuntsSubsection
            bodyText={bodyText}
            isRuntMinCharactersDefault={isRuntMinCharactersDefault}
            isRuntPenaltyDefault={isRuntPenaltyDefault}
            isAvoidRuntsInListsDefault={isAvoidRuntsInListsDefault}
            updateBodyText={updateBodyText}
            resetField={resetField}
            labels={labels}
          />
        )}
        <NumberInput
          label={labels.bodySlackWeight}
          value={bodyText.slackWeight}
          onChange={(v) => updateBodyText({ slackWeight: v })}
          min={0}
          max={1000}
          step={1}
          tooltip={labels.bodySlackWeightTooltip}
          isDefault={isSlackWeightDefault}
          onReset={() => resetField('slackWeight')}
        />
        <ToggleSwitch
          label={labels.bodyKeepColonWithList}
          checked={bodyText.keepColonWithList}
          onChange={(checked) => updateBodyText({ keepColonWithList: checked })}
          tooltip={labels.bodyKeepColonWithListTooltip}
          isDefault={isKeepColonWithListDefault}
          onReset={() => resetField('keepColonWithList')}
        />
        {bodyText.keepColonWithList && (
          <SelectInput
            label={labels.bodyColonListRoom}
            value={bodyText.colonListRoom}
            options={COLON_LIST_ROOM_OPTIONS}
            onChange={(value) => updateBodyText({ colonListRoom: value as ColonListRoom })}
            tooltip={labels.bodyColonListRoomTooltip}
            isDefault={isColonListRoomDefault}
            onReset={() => resetField('colonListRoom')}
          />
        )}
      </CollapsibleSection>
      <BlockquoteSubsection bodyText={bodyText} raw={raw} updateBodyText={updateBodyText} labels={labels} />
      <CollapsibleSection title={labels.bodyGroupReferences} sectionId="bodyText-references" variant="subsection">
        <ColorPicker
          label={labels.bodyReferenceColor}
          value={DEFAULT_REFERENCE_COLOR}
          onChange={(color) => updateBodyText({ referenceColor: color })}
          tooltip={labels.bodyReferenceColorTooltip}
          isDefault={isReferenceColorDefault}
          onReset={() => resetField('referenceColor')}
          fieldId="bodyText-referenceColor"
        />
        <ToggleSwitch
          label={labels.bodyReferenceBold}
          checked={bodyText.referenceBold}
          onChange={(checked) => updateBodyText({ referenceBold: checked })}
          tooltip={labels.bodyReferenceBoldTooltip}
          isDefault={isReferenceBoldDefault}
          onReset={() => resetField('referenceBold')}
        />
        <ToggleSwitch
          label={labels.bodyReferenceItalic}
          checked={bodyText.referenceItalic}
          onChange={(checked) => updateBodyText({ referenceItalic: checked })}
          tooltip={labels.bodyReferenceItalicTooltip}
          isDefault={isReferenceItalicDefault}
          onReset={() => resetField('referenceItalic')}
        />
      </CollapsibleSection>
    </CollapsibleSection>
  );
});

/** The document language, named in its own language: a link to Writing
 *  system, where it is set. Plain text outside the Design panel. */
function DocumentLocalePointer({ tag }: { tag: string }) {
  const labels = useSandboxLabels();
  const openGroup = useOpenSettingsGroup();
  const ids = useFieldIds();
  const name = documentLocaleLabel(tag);
  if (!openGroup) return <span lang={tag} className="text-[0.8rem] text-(--foreground)">{name}</span>;
  return (
    <button
      id={ids?.controlId}
      type="button"
      onClick={() => openGroup('writing')}
      aria-describedby={ids?.descriptionId}
      title={labels.settingsOpenGroup.replace('__group__', labels.settingsGroupWriting)}
      className="inline-flex h-7 pt-large:h-11 max-w-[10.5rem] cursor-pointer items-center gap-1 rounded-md px-1.5 text-[0.8rem] text-(--foreground) transition-colors hover:bg-(--surface) focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)"
    >
      <span lang={tag} className="min-w-0 truncate">{name}</span>
      <span className="sr-only"> — {labels.settingsOpenGroup.replace('__group__', labels.settingsGroupWriting)}</span>
      <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-(--slate)" />
    </button>
  );
}
