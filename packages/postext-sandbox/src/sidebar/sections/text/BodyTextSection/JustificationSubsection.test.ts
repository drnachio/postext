// Where "Hyphenate across columns" shows: under hyphenation for a justified
// body, under optimal ragged breaking for a ragged one (round-5 review).

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveBodyTextConfig, type BodyTextConfig } from 'postext';
import { SandboxStoreContext } from '../../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../../types/defaultLabels.js';
import { JustificationSubsection, RaggedBreakingSubsection, acrossColumnsChoice, acrossColumnsValue } from './JustificationSubsection.js';

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

describe('Hyphenate across columns', () => {
  it('shows under a ragged body while Knuth–Plass sets it', () => {
    expect(ragged({})).toContain(LABEL);
    expect(ragged({ hyphenateAcrossColumns: false })).toContain(LABEL);
  });

  it('hides under a ragged body set line by line, where the engine does not re-break', () => {
    expect(ragged({ optimalRagged: false })).not.toContain(LABEL);
    expect(ragged({ optimalLineBreaking: false })).not.toContain(LABEL);
  });

  it('shows under a justified body with hyphenation on, once', () => {
    // A switch names itself more than once (its label and the control's).
    const count = (html: string) => html.split(LABEL).length - 1;
    const one = count(ragged({}));
    expect(one).toBeGreaterThan(0);
    expect(count(justified({ hyphenation: { enabled: true } }))).toBe(one);
    expect(justified({ hyphenation: { enabled: false } })).not.toContain(LABEL);
  });

  it('has three states and stores the default as no value (#701)', () => {
    expect(acrossColumnsChoice(true)).toBe('always');
    expect(acrossColumnsChoice('withinPage')).toBe('withinPage');
    expect(acrossColumnsChoice(false)).toBe('never');
    expect(acrossColumnsValue('always')).toBeUndefined();
    expect(acrossColumnsValue('withinPage')).toBe('withinPage');
    expect(acrossColumnsValue('never')).toBe(false);
    // The control shows the state the document is in.
    expect(ragged({})).toContain(DEFAULT_LABELS.bodyHyphenateAcrossColumnsAlways);
    expect(ragged({ hyphenateAcrossColumns: 'withinPage' })).toContain(DEFAULT_LABELS.bodyHyphenateAcrossColumnsWithinPage);
    expect(ragged({ hyphenateAcrossColumns: false })).toContain(DEFAULT_LABELS.bodyHyphenateAcrossColumnsNever);
  });
});
