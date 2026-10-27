// What a box grows with (#1117, `FrameConfig.growWith`) is a choice of the
// frame editor's Size group: no, the frames anchored inside it, or the
// frames chosen, which lists a checkbox per frame and group.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FrameConfig, PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../../types/defaultLabels.js';
import { FrameProperties } from './FrameProperties.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });

function render(growWith?: FrameConfig['growWith']): string {
  const config: PostextConfig = {
    pageTemplates: [{
      id: 'card',
      frames: [
        { name: 'box', style: 'note', width: mm(120), ...(growWith ? { growWith } : {}) },
        { name: 'photo', height: mm(30), placement: { anchor: { to: '#box', edge: 'top-left' } } },
        { name: 'caption', placement: { anchor: { to: '#photo', edge: 'below' } } },
      ],
    }],
  };
  const state = { config, resources: [], labels: DEFAULT_LABELS, locale: 'en', chapters: [], activeChapterId: null, markdown: '', activeProjectId: null };
  const store = {
    getSnapshot: () => state,
    subscribe: () => () => {},
    dispatch: () => {},
    projectActions: { renameFrameInEditions: () => {} },
    docRef: { current: null },
  };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(FrameProperties, { templateId: 'card', scope: 'base', name: 'box', onRenamed: () => {}, onRemoved: () => {} })));
}

describe('the frame editor\'s «Grows with the frames inside»', () => {
  it('is in the Size group, after the height limits, and says no by default', () => {
    const html = render();
    const at = html.indexOf(DEFAULT_LABELS.pageTemplatesFrameGrowWith);
    expect(at).toBeGreaterThan(html.indexOf(DEFAULT_LABELS.pageTemplatesMaxHeight));
    expect(html).not.toContain(DEFAULT_LABELS.pageTemplatesFrameGrowWithListLegend);
  });

  it('lists the frames to choose from only for a list, with the chosen ones checked', () => {
    expect(render('children')).not.toContain(DEFAULT_LABELS.pageTemplatesFrameGrowWithListLegend);
    const html = render(['caption']);
    const list = html.slice(html.indexOf(DEFAULT_LABELS.pageTemplatesFrameGrowWithListLegend));
    expect(list).toMatch(/<input type="checkbox"\/><span[^>]*>photo<\/span>/);
    expect(list).toMatch(/<input type="checkbox" checked=""\/><span[^>]*>caption<\/span>/);
  });
});
