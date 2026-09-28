'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import { DEFAULT_CJK_CONFIG, cjkRegionOfLocale, defaultCjkLineBreak } from 'postext';
import type { CjkConfig } from 'postext';
import { CollapsibleSection, SelectInput } from '../../controls';

/**
 * East Asian typography (`cjk`): the regional conventions Chinese text
 * follows and where its lines may break. `Auto` follows the document
 * language; the option shows what it resolves to.
 */
export const CjkSection = memo(function CjkSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const raw = useSandboxSelector((s) => s.config.cjk);
  const locale = useSandboxSelector((s) => s.config.locale ?? s.config.bodyText?.hyphenation?.locale);

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
  const autoRegion = cjkRegionOfLocale(locale) ?? 'mainland';
  const resolvedRegion = region === 'auto' ? autoRegion : region;
  const autoLineBreak = defaultCjkLineBreak(resolvedRegion);
  const auto = (name: string) => labels.cjkAuto.replace('__value__', name);

  return (
    <CollapsibleSection
      title={labels.cjkSection}
      sectionId="cjk"
      onReset={() => write(undefined)}
      hasOverrides={raw !== undefined && Object.keys(raw).length > 0}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
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
