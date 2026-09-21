'use client';

import { memo, useEffect, useState } from 'react';
import { useSandboxDispatch, useSandboxLabels, useSandboxSelector } from '../../context/SandboxContext';
import {
  resolveHtmlViewerConfig,
  DEFAULT_HTML_VIEWER_CONFIG,
} from 'postext';
import type { HtmlViewerConfig, HtmlViewerOverrides } from 'postext';
import {
  CollapsibleSection,
  NumberInput,
  ToggleSwitch,
} from '../../controls';
import { FieldRow } from '../../controls/FieldRow';

function overridesText(overrides: HtmlViewerOverrides | undefined): string {
  return overrides && Object.keys(overrides).length > 0 ? JSON.stringify(overrides, null, 2) : '';
}

/** Parse the screen-only overrides typed as JSON: an object, or nothing.
 *  Returns `null` when the text is not a JSON object. */
function parseOverrides(text: string): HtmlViewerOverrides | undefined | null {
  if (text.trim().length === 0) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const rest = { ...(value as Record<string, unknown>) };
    delete rest.htmlViewer; // never nest the viewer config inside its own overrides
    return Object.keys(rest).length > 0 ? (rest as HtmlViewerOverrides) : undefined;
  } catch {
    return null;
  }
}

export const HtmlViewerSection = memo(function HtmlViewerSection() {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxLabels();
  const rawHtmlViewer = useSandboxSelector((s) => s.config.htmlViewer);
  const htmlViewer = resolveHtmlViewerConfig(rawHtmlViewer);

  const updateHtmlViewer = (partial: Partial<HtmlViewerConfig>) => {
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { htmlViewer: { ...rawHtmlViewer, ...partial } },
    });
  };

  const resetField = (field: keyof HtmlViewerConfig) => {
    if (!rawHtmlViewer) return;
    const next = { ...rawHtmlViewer };
    delete next[field];
    const hasKeys = Object.keys(next).length > 0;
    dispatch({
      type: 'UPDATE_CONFIG',
      payload: { htmlViewer: hasKeys ? next : undefined },
    });
  };

  const resetSection = () => {
    dispatch({ type: 'UPDATE_CONFIG', payload: { htmlViewer: undefined } });
  };

  const D = DEFAULT_HTML_VIEWER_CONFIG;
  const isMaxCharsDefault = htmlViewer.maxCharsPerLine === D.maxCharsPerLine;
  const isColumnGapDefault = htmlViewer.columnGap === D.columnGap;
  const isOptimalLineBreakingDefault =
    htmlViewer.optimalLineBreaking === D.optimalLineBreaking;

  const hasOverrides =
    rawHtmlViewer !== undefined && Object.keys(rawHtmlViewer).length > 0;

  // The screen-only overrides are a free partial config, edited as JSON.
  // The draft is local until it parses; an external change (import, preset
  // load, reset) replaces the draft.
  const committedText = overridesText(rawHtmlViewer?.overrides);
  const [draft, setDraft] = useState(committedText);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(committedText);
    setInvalid(false);
  }, [committedText]);
  const commitOverrides = () => {
    const parsed = parseOverrides(draft);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (overridesText(parsed) === committedText) return;
    if (parsed === undefined) resetField('overrides');
    else updateHtmlViewer({ overrides: parsed });
  };

  return (
    <CollapsibleSection
      title={labels.htmlViewer}
      sectionId="htmlViewer"
      onReset={resetSection}
      hasOverrides={hasOverrides}
      resetLabel={labels.reset}
      resetConfirmMessage={labels.resetSectionConfirm}
    >
      <NumberInput
        label={labels.htmlViewerMaxCharsPerLine}
        value={htmlViewer.maxCharsPerLine}
        onChange={(v) => updateHtmlViewer({ maxCharsPerLine: v })}
        min={20}
        max={200}
        step={1}
        tooltip={labels.htmlViewerMaxCharsPerLineTooltip}
        isDefault={isMaxCharsDefault}
        onReset={() => resetField('maxCharsPerLine')}
      />
      <NumberInput
        label={labels.htmlViewerColumnGap}
        value={htmlViewer.columnGap}
        onChange={(v) => updateHtmlViewer({ columnGap: v })}
        min={0}
        max={200}
        step={1}
        tooltip={labels.htmlViewerColumnGapTooltip}
        isDefault={isColumnGapDefault}
        onReset={() => resetField('columnGap')}
        suffix="px"
      />
      <ToggleSwitch
        label={labels.htmlViewerOptimalLineBreaking}
        checked={htmlViewer.optimalLineBreaking}
        onChange={(checked) =>
          updateHtmlViewer({ optimalLineBreaking: checked })
        }
        tooltip={labels.htmlViewerOptimalLineBreakingTooltip}
        isDefault={isOptimalLineBreakingDefault}
        onReset={() => resetField('optimalLineBreaking')}
      />
      <FieldRow
        stacked
        label={labels.htmlViewerOverrides}
        hint={invalid ? labels.htmlViewerOverridesInvalid : labels.htmlViewerOverridesHint}
        tooltip={labels.htmlViewerOverridesTooltip}
        isDefault={rawHtmlViewer?.overrides === undefined}
        onReset={() => resetField('overrides')}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitOverrides}
          spellCheck={false}
          rows={6}
          aria-label={labels.htmlViewerOverrides}
          aria-invalid={invalid || undefined}
          placeholder={'{ "headings": { "levels": [ { "level": 1, "span": "column" } ] } }'}
          className="min-w-0 w-full resize-y rounded border bg-transparent px-1.5 py-1 font-mono text-xs"
          style={{ borderColor: invalid ? 'var(--destructive)' : 'var(--rule)', color: 'var(--foreground)' }}
        />
      </FieldRow>
    </CollapsibleSection>
  );
});
