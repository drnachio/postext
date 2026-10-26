// The notes' own rule between CJK characters (#705): shown in a Chinese,
// Japanese or Korean document, or once the notes set it, as on a paragraph
// style.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../../context/SandboxContext.js';
import { DEFAULT_LABELS } from '../../../types/defaultLabels.js';
import { FootnotesSection } from './FootnotesSection.js';

function render(config: PostextConfig): string {
  const state = { config, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(FootnotesSection)));
}

describe('footnotes section: line breaks between CJK characters', () => {
  it('shows in a Chinese or Japanese document, with the document\'s rule', () => {
    const zh = render({ locale: 'zh-Hant' });
    expect(zh).toContain(DEFAULT_LABELS.cjkWordBreak);
    expect(zh).toContain(DEFAULT_LABELS.cjkWordBreakNormal);
    expect(render({ locale: 'ja' })).toContain(DEFAULT_LABELS.cjkWordBreak);
    // Unset, the control reads the document's `cjk.wordBreak`.
    expect(render({ locale: 'ja', cjk: { wordBreak: 'keep-all' } })).toContain(DEFAULT_LABELS.cjkWordBreakKeepAll);
  });

  it('stays out of a document in another language until the notes set it', () => {
    expect(render({ locale: 'en' })).not.toContain(DEFAULT_LABELS.cjkWordBreak);
    const set = render({ locale: 'en', footnotes: { wordBreak: 'keep-all' } });
    expect(set).toContain(DEFAULT_LABELS.cjkWordBreak);
    expect(set).toContain(DEFAULT_LABELS.cjkWordBreakKeepAll);
  });
});
