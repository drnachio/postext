'use client';

// The Composition rules (#1540): the rules a typesetting tradition sets on
// line breaking, gathered in a group of their own so a design saves and
// applies them apart from the type (the `composition` part). Word division
// (the letters a hyphen leaves, capitalised words, a hyphen at a column's
// foot), the hyphens of a paragraph (how dear each one is, ladders, the
// last word) and the line edges (stacks, citations and signs). At the top,
// the convention of the book's language, offered and never set.

import { memo } from 'react';
import { isCjkLanguage, resolveBodyTextConfig } from 'postext';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../../context/SandboxContext.js';
import { CollapsibleSection, FieldGroup } from '../../../controls/index.js';
import { defaultDocumentLocale } from '../../../controls/language/hyphenation.js';
import { createBodyTextWriters } from '../text/BodyTextSection/writers.js';
import { HyphenateCapitalizedField } from '../text/BodyTextSection/HyphenationFields.js';
import { HyphenateAcrossColumnsSwitch } from '../text/BodyTextSection/JustificationSubsection.js';
import { HyphenationLimitsFields, HyphenDistributionFields } from './HyphenRulesFields.js';
import { StacksSubsection } from './StacksSubsection.js';
import { SpaceBreaksSubsection } from './SpaceBreaksSubsection.js';
import { CompositionHint } from './CompositionHint.js';
import { holdsComposition, withoutComposition } from './compositionSlots.js';

export const CompositionSection = memo(function CompositionSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.bodyText);
  const hasOverrides = useSandboxSelector((s) => holdsComposition(s.config));
  const locale = useSandboxSelector((s) => s.locale);
  const documentLocale = useSandboxSelector((s) => s.config.locale);
  const defaultLocale = defaultDocumentLocale(locale);
  const effectiveDocumentLocale = documentLocale ?? defaultLocale;
  const effectiveHyphenationLocale = raw?.hyphenation?.locale ?? effectiveDocumentLocale;
  // As the Body text section reads it (a Chinese interface reads an
  // unnamed document as Chinese).
  const resolvingLocale = documentLocale ?? (isCjkLanguage(defaultLocale) ? defaultLocale : undefined);
  const bodyText = resolveBodyTextConfig(raw, resolvingLocale);
  const { updateBodyText, resetField, updateHyphenation } = createBodyTextWriters({ dispatch, raw, effectiveDocumentLocale });
  const ruleProps = { bodyText, raw, updateBodyText, updateHyphenation, labels };
  // The three levels of a composition rule (#749).
  const ruleOptions = [
    { value: 'allow', label: labels.compositionRuleAllow },
    { value: 'warn', label: labels.compositionRuleWarn },
    { value: 'avoid', label: labels.compositionRuleAvoid },
  ];
  const reset = () => dispatch({ type: 'UPDATE_CONFIG', payload: { bodyText: withoutComposition(raw) } });

  return (
    <CollapsibleSection
      title={labels.compositionSection}
      sectionId="composition"
      onReset={reset}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <CompositionHint fallbackLanguage={effectiveHyphenationLocale} />
      <FieldGroup title={labels.compositionGroupWordDivision}>
        <HyphenationLimitsFields {...ruleProps} />
        <HyphenateCapitalizedField {...ruleProps} />
        <HyphenateAcrossColumnsSwitch bodyText={bodyText} updateBodyText={updateBodyText} resetField={resetField} labels={labels} />
      </FieldGroup>
      <FieldGroup title={labels.compositionGroupHyphens}>
        {!bodyText.optimalLineBreaking && <p className="mb-2 text-[0.7rem] text-(--slate)">{labels.compositionHyphensNeedOptimal}</p>}
        <HyphenDistributionFields {...ruleProps} options={ruleOptions} />
      </FieldGroup>
      <FieldGroup title={labels.compositionGroupLineEdges}>
        <StacksSubsection bodyText={bodyText} options={ruleOptions} updateBodyText={updateBodyText} resetField={resetField} labels={labels} />
        <SpaceBreaksSubsection bodyText={bodyText} options={ruleOptions} updateBodyText={updateBodyText} resetField={resetField} labels={labels} />
      </FieldGroup>
    </CollapsibleSection>
  );
});
