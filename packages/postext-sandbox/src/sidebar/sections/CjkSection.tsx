'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { DEFAULT_CJK_CONFIG, cjkRegionOf, defaultCjkLineBreak } from 'postext';
import type { CjkConfig, LayoutConfig, PageConfig } from 'postext';
import { CollapsibleSection, SelectInput } from '../../controls';

/**
 * East Asian typography (`cjk`): the regional conventions Chinese text
 * follows and where its lines may break. `Auto` follows the document
 * language; the option shows what it resolves to. Also the writing mode
 * (`layout.writingMode`) and the binding (`page.binding`), which a
 * vertical Chinese book sets with them.
 */
export const CjkSection = memo(function CjkSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.cjk);
  const locale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale);
  const rawLayout = useSandboxSelector((s) => s.config.layout);
  const rawPage = useSandboxSelector((s) => s.config.page);
  const writingMode = rawLayout?.writingMode ?? 'horizontal-tb';
  const binding = rawPage?.binding ?? 'auto';
  const autoBinding = writingMode === 'vertical-rl' ? 'right' : 'left';

  const writeLayout = (next: LayoutConfig) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { layout: Object.keys(next).length > 0 ? next : undefined } });
  };
  const writePage = (next: PageConfig) => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { page: Object.keys(next).length > 0 ? next : undefined } });
  };
  const setWritingMode = (v: string) => {
    const next: LayoutConfig = { ...rawLayout };
    if (v === 'vertical-rl') next.writingMode = 'vertical-rl';
    else delete next.writingMode;
    writeLayout(next);
  };
  const setBinding = (v: string) => {
    const next: PageConfig = { ...rawPage };
    if (v === 'left' || v === 'right') next.binding = v;
    else delete next.binding;
    writePage(next);
  };

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

  const regionNames = {
    mainland: labels.cjkRegionMainland,
    taiwan: labels.cjkRegionTaiwan,
    hongkong: labels.cjkRegionHongKong,
  };
  const lineBreakNames = {
    none: labels.cjkLineBreakNone,
    basic: labels.cjkLineBreakBasic,
    gb: labels.cjkLineBreakGb,
    strict: labels.cjkLineBreakStrict,
  };
  const region = raw?.region ?? DEFAULT_CJK_CONFIG.region;
  const lineBreak = raw?.lineBreak ?? DEFAULT_CJK_CONFIG.lineBreak;
  const autoRegion = cjkRegionOf(locale) ?? 'mainland';
  const resolvedRegion = region === 'auto' ? autoRegion : region;
  const autoLineBreak = defaultCjkLineBreak(resolvedRegion);
  const auto = (name: string) => labels.cjkAuto.replace('__value__', name);

  return (
    <CollapsibleSection
      title={labels.cjkSection}
      sectionId="cjk"
      onReset={() => {
        write(undefined);
        if (rawLayout?.writingMode !== undefined) setWritingMode('horizontal-tb');
        if (rawPage?.binding !== undefined) setBinding('auto');
      }}
      hasOverrides={(raw !== undefined && Object.keys(raw).length > 0) || rawLayout?.writingMode !== undefined || rawPage?.binding !== undefined}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <SelectInput
        label={labels.writingMode}
        value={writingMode}
        options={[
          { value: 'horizontal-tb', label: labels.writingModeHorizontal },
          { value: 'vertical-rl', label: labels.writingModeVertical },
        ]}
        onChange={setWritingMode}
        tooltip={labels.writingModeTooltip}
        isDefault={writingMode === 'horizontal-tb'}
        onReset={() => setWritingMode('horizontal-tb')}
      />
      <SelectInput
        label={labels.binding}
        value={binding}
        options={[
          { value: 'auto', label: auto(autoBinding === 'right' ? labels.bindingRight : labels.bindingLeft) },
          { value: 'left', label: labels.bindingLeft },
          { value: 'right', label: labels.bindingRight },
        ]}
        onChange={setBinding}
        tooltip={labels.bindingTooltip}
        isDefault={binding === 'auto'}
        onReset={() => setBinding('auto')}
      />
      <SelectInput
        label={labels.cjkRegion}
        value={region}
        options={[
          { value: 'auto', label: auto(regionNames[autoRegion]) },
          { value: 'mainland', label: regionNames.mainland },
          { value: 'taiwan', label: regionNames.taiwan },
          { value: 'hongkong', label: regionNames.hongkong },
        ]}
        onChange={(v) => write({ ...raw, region: v as CjkConfig['region'] })}
        tooltip={labels.cjkRegionTooltip}
        isDefault={region === DEFAULT_CJK_CONFIG.region}
        onReset={() => resetField('region')}
      />
      <SelectInput
        label={labels.cjkLineBreak}
        value={lineBreak}
        options={[
          { value: 'auto', label: auto(lineBreakNames[autoLineBreak]) },
          { value: 'none', label: lineBreakNames.none },
          { value: 'basic', label: lineBreakNames.basic },
          { value: 'gb', label: lineBreakNames.gb },
          { value: 'strict', label: lineBreakNames.strict },
        ]}
        onChange={(v) => write({ ...raw, lineBreak: v as CjkConfig['lineBreak'] })}
        tooltip={labels.cjkLineBreakTooltip}
        isDefault={lineBreak === DEFAULT_CJK_CONFIG.lineBreak}
        onReset={() => resetField('lineBreak')}
      />
    </CollapsibleSection>
  );
});
