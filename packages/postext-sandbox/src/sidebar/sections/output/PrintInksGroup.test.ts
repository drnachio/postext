// The ink table's cards (#1469): one per ink with its fields, and the inks
// the book's colours use that the table lacks offered to add.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../types/defaultLabels.js';
import { setCardsOpen } from '../../../controls/index.js';
import { PrintInksGroup } from './PrintInksGroup.js';

const spot = (name: string) => ({ hex: '#0033a0', model: 'spot', spot: { name, cmyk: { c: 100, m: 70, y: 0, k: 0 }, tint: 100 } });

function render(config: PostextConfig): string {
  const state = { config, resources: [], labels: DEFAULT_LABELS, locale: 'en', chapters: [], activeChapterId: null, markdown: '', selection: null };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(PrintInksGroup)));
}

describe('the ink table cards', () => {
  it('say the table is empty and offer the inks the colours use', () => {
    const html = render({ bodyText: { color: spot('PANTONE 286 C') } } as never);
    expect(html).toContain(DEFAULT_LABELS.printInksEmpty);
    expect(html).toContain(DEFAULT_LABELS.printInksUsed);
    expect(html).toContain('Add “PANTONE 286 C” to the ink table');
  });

  it('draw one card per ink with its fields, and offer no ink the table lists as an alias', () => {
    setCardsOpen('printInks', ['0'], true);
    const html = render({
      bodyText: { color: spot('Corporate blue') },
      print: { inks: [{ name: 'PANTONE 286 C', aliases: ['Corporate blue'], pdfName: 'P 286', overprint: false, cmyk: { c: 100, m: 60, y: 0, k: 0 } }] },
    } as never);
    expect(html).not.toContain(DEFAULT_LABELS.printInksUsed);
    expect(html).toContain('value="PANTONE 286 C"');
    expect(html).toContain('value="Corporate blue"');
    expect(html).toContain('value="P 286"');
    for (const key of ['printInkName', 'printInkAliases', 'printInkPdfName', 'printInkOutput', 'printInkCmykSet', 'printInkOverprint', 'printInkOverprintOff'] as const) {
      expect(html, key).toContain(DEFAULT_LABELS[key]);
    }
  });

  it('show each ink’s finish: the card’s own, and the one the colours give an ink they use (#1570)', () => {
    setCardsOpen('printInks', ['0'], true);
    const gold = { hex: '#b39249', model: 'spot', spot: { name: 'Gold', cmyk: { c: 0, m: 20, y: 60, k: 30 }, tint: 100, finish: { kind: 'metallic' } } };
    const html = render({
      bodyText: { color: gold },
      print: { inks: [{ name: 'Varnish', finish: { kind: 'varnish', sheen: 'softTouch' } }] },
    } as never);
    expect(html).toContain(DEFAULT_LABELS.inkFinish);
    expect(html).toContain(DEFAULT_LABELS.inkSheen);
    expect(html).toContain('· Metallic');
    expect(html).toContain('Add “Gold” to the ink table (Metallic)');
  });
});
