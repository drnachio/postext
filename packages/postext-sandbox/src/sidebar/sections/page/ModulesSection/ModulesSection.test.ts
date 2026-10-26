// The module library draws each module by its sheet (#1065). A module with
// a root and a grid repeating a branch under it is drawn with its branches
// in the grid's cells under the root, as the engine lays them (#1082), not
// with the grid's main frame at the module's top-left over the root.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../../types/defaultLabels.js';
import { ModulesSection } from './index.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });

const config: PostextConfig = {
  page: { sizePreset: 'custom', width: mm(200), height: mm(280), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  pageTemplates: [{
    id: 'tree',
    name: 'Tree of ideas',
    role: 'module',
    frames: [
      { name: 'root', width: mm(60), height: mm(20), placement: { anchor: { to: 'container', edge: 'top' } } },
      { name: 'branch', minHeight: mm(20), height: 'auto' },
    ],
    groups: [{ name: 'branches', kind: 'grid', columns: 3, columnGap: mm(6), rowGap: mm(6), repeat: { frames: ['branch'] }, placement: { anchor: { to: '#root', edge: 'below' }, offset: { y: mm(12) } } }],
  } as never],
};

function render(): string {
  const state = { config, resources: [], labels: DEFAULT_LABELS, locale: 'en', chapters: [], activeChapterId: null, markdown: '', selection: null };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(ModulesSection)));
}

/** The frame boxes of the drawing, in order: x, y, width, height (mm). */
function frameBoxes(html: string): number[][] {
  const at = html.indexOf('<svg viewBox="0 0 200 280"');
  expect(at).toBeGreaterThan(-1);
  const svg = html.slice(at, html.indexOf('</svg>', at));
  return [...svg.matchAll(/<g[^>]*><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => m.slice(1, 5).map(Number));
}

describe('the module library drawing of a module with a repeating grid', () => {
  it('lays the branches in the grid\'s cells under the root', () => {
    const html = render();
    expect(html).toContain('Tree of ideas');
    const [root, ...branches] = frameBoxes(html);
    expect(root).toEqual([70, 20, 60, 20]);
    expect(branches).toHaveLength(3);
    // The grid's box hangs below the root: from its left edge (70 mm) to
    // the area's right edge (180 mm), as the engine places it.
    const colW = (110 - 2 * 6) / 3;
    branches.forEach(([x, y, w, hgt], i) => {
      expect(x).toBeCloseTo(70 + i * (colW + 6));
      expect(y).toBeCloseTo(20 + 20 + 12);
      expect(w).toBeCloseTo(colW);
      expect(hgt).toBeGreaterThanOrEqual(20);
    });
  });
});
