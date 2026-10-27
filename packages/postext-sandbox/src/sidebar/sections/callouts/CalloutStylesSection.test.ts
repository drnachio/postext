// A box style card carries a Design group (#1014): the heading design
// editor laid out in a band under the box title, with its minimum height
// and whether the design sets the box's content.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CalloutStyleConfig } from 'postext';
import { SandboxStoreContext } from '../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../types/defaultLabels.js';
import { COMMON_TAB_GLYPHS, CalloutStylesSection, labelIconKindPatch } from './CalloutStylesSection.js';

function render(calloutStyles: CalloutStyleConfig[]): string {
  const state = { config: { calloutStyles }, resources: [], labels: DEFAULT_LABELS, locale: 'en', chapters: [], activeChapterId: null };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(CalloutStylesSection)));
}

/** The markup of the switch row whose label is `label`. */
function switchRow(html: string, label: string): string {
  const at = html.indexOf(label);
  expect(at).toBeGreaterThan(-1);
  const row = html.slice(at, at + 6000);
  return row.slice(0, row.indexOf('role="switch"') + 200);
}

const practice: CalloutStyleConfig = {
  id: 'practice',
  design: {
    setsContent: true,
    slot: { elements: [{ kind: 'text', id: 'text1', content: '{boxText}', fontSize: { value: 12, unit: 'pt' }, placement: { anchor: { to: 'container', edge: 'top' } } }] },
  },
};

describe('CalloutStylesSection design group', () => {
  it('shows the design switched off for a style without one', () => {
    const html = render([{ id: 'note' }]);
    expect(html).toContain(DEFAULT_LABELS.calloutStyleDesignGroup);
    expect(switchRow(html, DEFAULT_LABELS.calloutStyleDesign)).toMatch(/aria-checked="false"/);
    expect(html).not.toContain(DEFAULT_LABELS.calloutStyleDesignSetsContent);
  });

  it('shows a style\'s design with its fields and elements', () => {
    const html = render([practice]);
    expect(switchRow(html, DEFAULT_LABELS.calloutStyleDesign)).toMatch(/aria-checked="true"/);
    expect(html).toContain(DEFAULT_LABELS.calloutStyleDesignMinHeight);
    expect(switchRow(html, DEFAULT_LABELS.calloutStyleDesignSetsContent)).toMatch(/aria-checked="true"/);
    expect(html).toContain('{boxText}');
    // A box design's elements count toward the band unless switched off.
    expect(html).toContain(DEFAULT_LABELS.headerFooterElementReserve);
  });

  it('shows a design switched off as off', () => {
    const html = render([{ ...practice, design: { ...practice.design!, enabled: false } }]);
    expect(switchRow(html, DEFAULT_LABELS.calloutStyleDesign)).toMatch(/aria-checked="false"/);
    expect(html).not.toContain(DEFAULT_LABELS.calloutStyleDesignSetsContent);
  });
});

// #1066: the label tab's icon is a picture or a glyph, chosen without JSON.
describe('CalloutStylesSection tab icon', () => {
  const tab = (icon: NonNullable<CalloutStyleConfig['label']>['icon']): CalloutStyleConfig => ({ id: 'card', label: { position: 'top-left', icon } });

  it('a glyph tab: the glyph field, the common symbols, face, weight, size and colour; no picture fields', () => {
    const html = render([tab({ kind: 'glyph', glyph: '◉' })]);
    expect(html).toContain(DEFAULT_LABELS.calloutStyleLabelIconKind);
    expect(html).toContain(DEFAULT_LABELS.calloutStyleLabelIconGlyph);
    expect(html).toContain(DEFAULT_LABELS.calloutStyleLabelIconGlyphCommon);
    expect(html).toContain(DEFAULT_LABELS.calloutStyleLabelIconScale);
    expect(html).toContain(DEFAULT_LABELS.calloutStyleIconFont);
    expect(html).toContain(DEFAULT_LABELS.calloutStyleIconWeight);
    expect(html).toContain(DEFAULT_LABELS.calloutStyleLabelIconGlyphPlacement);
    expect(html).not.toContain(`>${DEFAULT_LABELS.calloutStyleLabelIconTint}<`);
    // Every common symbol is a named button; the one set is pressed.
    for (const g of COMMON_TAB_GLYPHS) expect(html).toContain(`aria-label="${DEFAULT_LABELS.calloutStyleLabelIconGlyphUse.replace('__glyph__', g)}"`);
    expect(html).toMatch(/aria-label="Use ◉" aria-pressed="true"/);
    expect(html).toMatch(/aria-label="Use ★" aria-pressed="false"/);
  });

  it('a picture tab: the resource picker, no glyph fields', () => {
    const html = render([tab({ resourceId: 'ring' })]);
    expect(html).toContain(DEFAULT_LABELS.calloutStyleLabelIcon);
    expect(html).not.toContain(DEFAULT_LABELS.calloutStyleLabelIconGlyphCommon);
  });

  it('switching to a glyph starts from the first common symbol, and keeps a glyph already set', () => {
    expect(labelIconKindPatch(undefined, 'glyph')).toEqual({ kind: 'glyph', glyph: '◉' });
    expect(labelIconKindPatch({ glyph: '★' }, 'glyph')).toEqual({ kind: 'glyph' });
    expect(labelIconKindPatch({ glyph: '★' }, 'resource')).toEqual({ kind: 'resource' });
  });
});
