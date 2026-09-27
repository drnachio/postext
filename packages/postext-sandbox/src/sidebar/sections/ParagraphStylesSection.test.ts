// The controls round 6 adds to the paragraph styles (EF-159/EF-181,
// EF-173, EF-184): the document-wide space under a container, shown once
// there is a style to use it, and each style's grid snap and letter case.

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { SandboxStoreContext } from '../../context/SandboxContext';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import { ParagraphStylesSection } from './ParagraphStylesSection';

function render(config: PostextConfig): string {
  const state = { config, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, h(ParagraphStylesSection)));
}

describe('paragraph styles section', () => {
  it('shows the space under a container once a style exists, with each style\'s snap and case', () => {
    const html = render({ paragraphStyles: [{ id: 'verse' }] });
    for (const label of [
      DEFAULT_LABELS.paragraphContainerSpacing,
      DEFAULT_LABELS.paragraphStyleSnapToGrid,
      DEFAULT_LABELS.paragraphStyleTextTransform,
    ]) expect(html).toContain(label);
  });

  it('leaves the container setting out when there is no style', () => {
    expect(render({})).not.toContain(DEFAULT_LABELS.paragraphContainerSpacing);
  });

  it('shows the value a pinned book reads with', () => {
    const html = render({ paragraphStyles: [{ id: 'verse' }], bodyText: { paragraphContainerSpacing: 'add' } });
    expect(html).toContain(DEFAULT_LABELS.paragraphContainerSpacingAdd);
  });
});
