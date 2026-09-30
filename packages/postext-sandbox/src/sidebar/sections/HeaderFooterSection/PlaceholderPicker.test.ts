// The picker lists whatever the engine allows in a slot kind; each name
// needs a human label in both locales, or the button shows the raw name.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { allowedPlaceholdersFor } from 'postext';
import { SandboxStoreContext } from '../../../context/SandboxContext';
import { DEFAULT_LABELS } from '../../../types/defaultLabels';
import type { SandboxLabels } from '../../../types/labels';
import { PlaceholderPicker } from './PlaceholderPicker';
import type { SlotKind } from './placementAdapter';

// Loaded through a dynamic import (the package has no Node typings).
const spanishMessages = ((await import(/* @vite-ignore */ new URL('../../../../../../apps/web/messages/es.json', import.meta.url).href)) as {
  default: { Sandbox: Record<string, string> };
}).default;

function buttonLabels(slotKind: SlotKind, labels: SandboxLabels): Map<string, string> {
  const state = { labels };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  const html = renderToString(
    h(SandboxStoreContext, { value: store as never }, h(PlaceholderPicker, { onInsert: () => {}, slotKind })),
  );
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<button[^>]*title="\{([^}"]+)\}"[^>]*>([^<]*)<\/button>/g)) out.set(m[1]!, m[2]!);
  return out;
}

describe('PlaceholderPicker', () => {
  const locales: Array<[string, SandboxLabels]> = [
    ['en', DEFAULT_LABELS],
    ['es', { ...DEFAULT_LABELS, ...spanishMessages.Sandbox } as SandboxLabels],
  ];
  for (const [locale, labels] of locales) {
    for (const slotKind of ['header', 'footer', 'heading', 'part'] as const) {
      it(`labels every ${slotKind} placeholder (${locale})`, () => {
        const shown = buttonLabels(slotKind, labels);
        const names = [...allowedPlaceholdersFor(slotKind)];
        expect([...shown.keys()].sort()).toEqual([...names].sort());
        expect(names.filter((name) => shown.get(name) === name)).toEqual([]);
      });
    }
  }

  it('names the spelled-out heading counters', () => {
    const shown = buttonLabels('heading', DEFAULT_LABELS);
    expect(shown.get('numberWords')).toBe(DEFAULT_LABELS.headerFooterPlaceholderNumberWords);
    expect(shown.get('numberOrdinalWordsLower')).toBe(DEFAULT_LABELS.headerFooterPlaceholderNumberOrdinalWordsLower);
    expect(shown.get('numberHan')).toBe(DEFAULT_LABELS.headerFooterPlaceholderNumberHan);
  });
});
