'use client';

import { memo } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  resolveDebugConfig,
  DEFAULT_DEBUG_CONFIG,
} from 'postext';
import type { DebugConfig, WarningsToggleConfig } from 'postext';
import { CollapsibleSection, ToggleSwitch } from '../../controls';

export const WarningsConfigSection = memo(function WarningsConfigSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const rawDebug = useSandboxSelector((s) => s.config.debug);
  const debug = resolveDebugConfig(rawDebug);

  const updateWarningToggle = (key: keyof WarningsToggleConfig, value: boolean) => {
    const nextWarnings: WarningsToggleConfig = { ...rawDebug?.warnings, [key]: value };
    const nextDebug: DebugConfig = { ...rawDebug, warnings: nextWarnings };
    dispatch({ type: 'UPDATE_CONFIG', payload: { debug: nextDebug } });
  };

  const resetWarningToggle = (key: keyof WarningsToggleConfig) => {
    if (!rawDebug?.warnings) return;
    const next = { ...rawDebug.warnings };
    delete next[key];
    const hasKeys = Object.keys(next).length > 0;
    const nextDebug: DebugConfig = { ...rawDebug };
    if (hasKeys) {
      nextDebug.warnings = next;
    } else {
      delete nextDebug.warnings;
    }
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { debug: Object.keys(nextDebug).length > 0 ? nextDebug : undefined },
    });
  };

  const resetWarningsSection = () => {
    if (!rawDebug?.warnings) return;
    const nextDebug: DebugConfig = { ...rawDebug };
    delete nextDebug.warnings;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { debug: Object.keys(nextDebug).length > 0 ? nextDebug : undefined },
    });
  };

  const DD = DEFAULT_DEBUG_CONFIG.warnings;
  const w = debug.warnings;
  const isMissingFontDefault = w.missingFont === DD.missingFont;
  const isLooseLinesDefault = w.looseLines === DD.looseLines;
  const isHeadingHierarchyDefault = w.headingHierarchy === DD.headingHierarchy;
  const isConsecutiveHeadingsDefault = w.consecutiveHeadings === DD.consecutiveHeadings;
  const isListAfterHeadingDefault = w.listAfterHeading === DD.listAfterHeading;

  const hasOverrides = rawDebug?.warnings !== undefined && Object.keys(rawDebug.warnings).length > 0;

  return (
    <CollapsibleSection
      title={labels.warnings}
      sectionId="warnings"
      onReset={resetWarningsSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <ToggleSwitch
        label={labels.debugWarningsMissingFont}
        checked={w.missingFont}
        onChange={(v) => updateWarningToggle('missingFont', v)}
        tooltip={labels.debugWarningsMissingFontTooltip}
        isDefault={isMissingFontDefault}
        onReset={() => resetWarningToggle('missingFont')}
      />
      <ToggleSwitch
        label={labels.debugWarningsLooseLines}
        checked={w.looseLines}
        onChange={(v) => updateWarningToggle('looseLines', v)}
        tooltip={labels.debugWarningsLooseLinesTooltip}
        isDefault={isLooseLinesDefault}
        onReset={() => resetWarningToggle('looseLines')}
      />
      <ToggleSwitch
        label={labels.debugWarningsHeadingHierarchy}
        checked={w.headingHierarchy}
        onChange={(v) => updateWarningToggle('headingHierarchy', v)}
        tooltip={labels.debugWarningsHeadingHierarchyTooltip}
        isDefault={isHeadingHierarchyDefault}
        onReset={() => resetWarningToggle('headingHierarchy')}
      />
      <ToggleSwitch
        label={labels.debugWarningsConsecutiveHeadings}
        checked={w.consecutiveHeadings}
        onChange={(v) => updateWarningToggle('consecutiveHeadings', v)}
        tooltip={labels.debugWarningsConsecutiveHeadingsTooltip}
        isDefault={isConsecutiveHeadingsDefault}
        onReset={() => resetWarningToggle('consecutiveHeadings')}
      />
      <ToggleSwitch
        label={labels.debugWarningsListAfterHeading}
        checked={w.listAfterHeading}
        onChange={(v) => updateWarningToggle('listAfterHeading', v)}
        tooltip={labels.debugWarningsListAfterHeadingTooltip}
        isDefault={isListAfterHeadingDefault}
        onReset={() => resetWarningToggle('listAfterHeading')}
      />
    </CollapsibleSection>
  );
});
