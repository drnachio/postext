// The heading style card shows the runningChapter switch (EF-188): on by
// default, off for a style that sets `runningChapter: false`; and where the
// section the style opens ends (#1014).

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HeadingStyleConfig } from 'postext';
import { SandboxStoreContext } from '../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../types/defaultLabels.js';
import { HeadingStylesSection } from './HeadingStylesSection.js';

function render(headingStyles: HeadingStyleConfig[]): string {
  const state = { config: { headingStyles }, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(HeadingStylesSection)));
}

/** The markup of the switch row whose label is `label`. */
function switchRow(html: string, label: string): string {
  const at = html.indexOf(label);
  expect(at).toBeGreaterThan(-1);
  const row = html.slice(at, at + 6000);
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

  // #1014: the section a style opens ends at the next heading of the same
  // or a higher level, or at the next heading of any level.
  describe('section end', () => {
    /** The visible text of the select row whose label is `label`. */
    const selectRow = (html: string, label: string): string => {
      const at = html.indexOf(label);
      expect(at).toBeGreaterThan(-1);
      return html.slice(at, at + 4000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    };

    it('shows the same-or-higher level by default', () => {
      const row = selectRow(render([{ id: 'plate' }]), DEFAULT_LABELS.headingStyleSectionEnd);
      expect(row.indexOf(DEFAULT_LABELS.headingStyleSectionEndLevel)).toBeGreaterThan(-1);
      expect(row).not.toContain('(changed)');
    });

    it('shows the next heading of any level for a style that sets it', () => {
      const row = selectRow(render([{ id: 'cover', sectionEnd: 'heading' }]), DEFAULT_LABELS.headingStyleSectionEnd);
      expect(row.startsWith(`${DEFAULT_LABELS.headingStyleSectionEnd} ( changed ) ${DEFAULT_LABELS.headingStyleSectionEndHeading}`)).toBe(true);
    });
  });
});
