'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { resolveCrossRefsConfig } from 'postext';
import type { CrossRefsConfig } from 'postext';
import { CollapsibleSection, SelectInput, TextInput } from '../../controls';

type Template = 'chapter' | 'section' | 'page';

/**
 * Cross-references to headings and anchors (#266): the words around the
 * number of a chapter, a section and a page, and the style a `:ref` without
 * `style=` takes. An empty template shows the document language's words.
 */
export const CrossRefsSection = memo(function CrossRefsSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.crossRefs);
  const locale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale);
  const words = resolveCrossRefsConfig(undefined, locale);
  const resolved = resolveCrossRefsConfig(raw, locale);

  const write = (next: CrossRefsConfig | undefined) => {
    const empty = !next || Object.keys(next).length === 0;
    dispatch({ type: 'UPDATE_CONFIG', payload: { crossRefs: empty ? undefined : next } });
  };
  const resetField = (field: keyof CrossRefsConfig) => {
    if (!raw) return;
    const next = { ...raw };
    delete next[field];
    write(next);
  };
  const setTemplate = (field: Template, value: string) => {
    if (value.trim().length === 0) resetField(field);
    else write({ ...raw, [field]: value });
  };
  const hasOverrides = raw !== undefined && Object.keys(raw).length > 0;

  const template = (field: Template, label: string, tooltip: string) => (
    <TextInput
      label={label}
      value={raw?.[field] ?? ''}
      placeholder={words[field].replace(/ /g, ' ')}
      onChange={(v) => setTemplate(field, v)}
      tooltip={tooltip}
      isDefault={raw?.[field] === undefined}
      onReset={() => resetField(field)}
    />
  );

  return (
    <CollapsibleSection
      title={labels.crossRefsSection}
      sectionId="crossRefs"
      onReset={() => write(undefined)}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SelectInput
        label={labels.crossRefsDefaultStyle}
        value={resolved.defaultStyle}
        stacked
        options={[
          { value: 'default', label: labels.crossRefsStyleDefault },
          { value: 'number', label: labels.crossRefsStyleNumber },
          { value: 'title', label: labels.crossRefsStyleTitle },
          { value: 'page', label: labels.crossRefsStylePage },
        ]}
        onChange={(v) => write({ ...raw, defaultStyle: v as CrossRefsConfig['defaultStyle'] })}
        tooltip={labels.crossRefsDefaultStyleTooltip}
        isDefault={resolved.defaultStyle === 'default'}
        onReset={() => resetField('defaultStyle')}
      />
      {template('chapter', labels.crossRefsChapter, labels.crossRefsChapterTooltip)}
      {template('section', labels.crossRefsSectionLabel, labels.crossRefsSectionTooltip)}
      {template('page', labels.crossRefsPage, labels.crossRefsPageTooltip)}
    </CollapsibleSection>
  );
});
