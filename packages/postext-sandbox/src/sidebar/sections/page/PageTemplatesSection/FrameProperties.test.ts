// A frame's overlap (#1081, C2's `FrameConfig.overlap`) is a switch of the
// frame editor beside its layer: on writes 'allow', which the overlap
// checks (frameCovered, frameOutsideArea) leave out; off writes 'check'.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../../types/defaultLabels.js';
import { FrameProperties } from './FrameProperties.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });

function render(overlap?: 'allow' | 'check'): { html: string } {
  const config: PostextConfig = {
    pageTemplates: [{
      id: 'card',
      frames: [
        { name: 'photo', height: mm(60) },
        { name: 'caption', height: mm(8), ...(overlap ? { overlap } : {}), placement: { anchor: { to: '#photo', edge: 'bottom-left' } } },
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
  const html = renderToString(h(SandboxStoreContext, { value: store as never }, h(FrameProperties, { templateId: 'card', scope: 'base', name: 'caption', onRenamed: () => {}, onRemoved: () => {} })));
  return { html };
}

/** The markup of the switch row whose label is `label`. */
function switchRow(html: string, label: string): string {
  const at = html.indexOf(label);
  expect(at).toBeGreaterThan(-1);
  const row = html.slice(at, at + 6000);
  return row.slice(0, row.indexOf('role="switch"') + 200);
}

describe('the frame editor\'s overlap switch', () => {
  it('is off for a frame the checks look at', () => {
    const { html } = render();
    expect(switchRow(html, DEFAULT_LABELS.pageTemplatesFrameOverlap)).toMatch(/aria-checked="false"/);
    // Beside the layer, in the frame's look.
    expect(html.indexOf(DEFAULT_LABELS.pageTemplatesFrameLayer)).toBeLessThan(html.indexOf(DEFAULT_LABELS.pageTemplatesFrameOverlap));
  });

  it('is on for a frame that may overlap on purpose, and off for an explicit check', () => {
    expect(switchRow(render('allow').html, DEFAULT_LABELS.pageTemplatesFrameOverlap)).toMatch(/aria-checked="true"/);
    expect(switchRow(render('check').html, DEFAULT_LABELS.pageTemplatesFrameOverlap)).toMatch(/aria-checked="false"/);
  });

  it('says what it silences', () => {
    expect(DEFAULT_LABELS.pageTemplatesFrameOverlapTooltip).toContain(DEFAULT_LABELS.warningsFrameCoveredTitle);
    expect(DEFAULT_LABELS.pageTemplatesFrameOverlapTooltip).toContain(DEFAULT_LABELS.warningsFrameOutsideTitle);
  });
});
