// "Hyphenate across columns": a composition rule since #1540, shown in the
// Composition group whatever the body's alignment.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveBodyTextConfig, type BodyTextConfig } from 'postext';
import { SandboxStoreContext } from '../../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../../types/defaultLabels.js';
import { HyphenateAcrossColumnsSwitch, JustificationSubsection, RaggedBreakingSubsection, acrossColumnsChoice, acrossColumnsValue } from './JustificationSubsection.js';

const LABEL = DEFAULT_LABELS.bodyHyphenateAcrossColumns;

function wrap(node: ReturnType<typeof h>): string {
  const state = { config: {}, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, node));
}

function ragged(raw: BodyTextConfig): string {
  const bodyText = resolveBodyTextConfig({ textAlign: 'left', ...raw });
  return wrap(h(RaggedBreakingSubsection, { bodyText, updateBodyText: () => {}, resetField: () => {}, labels: DEFAULT_LABELS }));
}

function justified(raw: BodyTextConfig): string {
  const bodyText = resolveBodyTextConfig({ textAlign: 'justify', ...raw });
  return wrap(h(JustificationSubsection, {
    bodyText,
    raw,
    effectiveHyphenationLocale: 'en-us',
    isHyphenationEnabledDefault: true,
    isHyphenationLocaleDefault: true,
    isMaxWordSpacingDefault: true,
    isMinWordSpacingDefault: true,
    isOptimalLineBreakingDefault: true,
    updateBodyText: () => {},
    updateHyphenation: () => {},
    resetField: () => {},
    labels: DEFAULT_LABELS,
  }));
}

function across(raw: BodyTextConfig): string {
  const bodyText = resolveBodyTextConfig(raw);
  return wrap(h(HyphenateAcrossColumnsSwitch, { bodyText, updateBodyText: () => {}, resetField: () => {}, labels: DEFAULT_LABELS }));
}

describe('Hyphenate across columns', () => {
  it('lives in the Composition rules, not under the body’s line breaking (#1540)', () => {
    expect(ragged({})).not.toContain(LABEL);
    expect(justified({ hyphenation: { enabled: true } })).not.toContain(LABEL);
    expect(across({})).toContain(LABEL);
  });

  it('has three states and stores the default as no value (#701)', () => {
    expect(acrossColumnsChoice(true)).toBe('always');
    expect(acrossColumnsChoice('withinPage')).toBe('withinPage');
    expect(acrossColumnsChoice(false)).toBe('never');
    expect(acrossColumnsValue('always')).toBeUndefined();
    expect(acrossColumnsValue('withinPage')).toBe('withinPage');
    expect(acrossColumnsValue('never')).toBe(false);
    // The control shows the state the document is in.
    expect(across({})).toContain(DEFAULT_LABELS.bodyHyphenateAcrossColumnsAlways);
    expect(across({ hyphenateAcrossColumns: 'withinPage' })).toContain(DEFAULT_LABELS.bodyHyphenateAcrossColumnsWithinPage);
    expect(across({ hyphenateAcrossColumns: false })).toContain(DEFAULT_LABELS.bodyHyphenateAcrossColumnsNever);
  });
});
