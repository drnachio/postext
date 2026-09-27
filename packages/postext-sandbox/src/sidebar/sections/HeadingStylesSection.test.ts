// The heading style card shows the runningChapter switch (EF-188): on by
// default, off for a style that sets `runningChapter: false`.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HeadingStyleConfig } from 'postext';
import { SandboxStoreContext } from '../../context/SandboxContext';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import { HeadingStylesSection } from './HeadingStylesSection';

function render(headingStyles: HeadingStyleConfig[]): string {
  const state = { config: { headingStyles }, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(HeadingStylesSection)));
}

/** The markup of the switch row whose label is `label`. */
function switchRow(html: string, label: string): string {
  const at = html.indexOf(label);
  expect(at).toBeGreaterThan(-1);
  const row = html.slice(at, at + 2000);
  return row.slice(0, row.indexOf('role="switch"') + 200);
}

describe('HeadingStylesSection', () => {
  it('shows the running-chapter switch on by default', () => {
    const row = switchRow(render([{ id: 'plate' }]), DEFAULT_LABELS.headingStyleRunningChapter);
    expect(row).toMatch(/aria-checked="true"/);
  });

  it('shows it off for a style with runningChapter: false', () => {
    const row = switchRow(render([{ id: 'plate', runningChapter: false }]), DEFAULT_LABELS.headingStyleRunningChapter);
    expect(row).toMatch(/aria-checked="false"/);
  });
});
