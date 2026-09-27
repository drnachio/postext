// The table style's header group offers the letter case and the letter
// spacing of the header cells (EF-174), and the caption and note alignment
// offer right as well as left and centre (EF-166).

import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { resolveBodyTextConfig, resolveCaptionStyleConfig, resolveTableStyleConfig, type TableStyleConfig } from 'postext';
import { SandboxStoreContext } from '../../context/SandboxContext';
import { DEFAULT_LABELS } from '../../types/defaultLabels';
import { TableStyleFields } from './TableStyleSection';
import { CaptionStyleFields } from './CaptionStyleFields';

function wrap(node: ReturnType<typeof h>): string {
  const state = { config: {}, resources: [], labels: DEFAULT_LABELS, locale: 'en' };
  const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
  return renderToString(h(SandboxStoreContext, { value: store as never }, node));
}

function tableFields(raw?: TableStyleConfig): string {
  const resolved = resolveTableStyleConfig(raw, resolveBodyTextConfig(undefined));
  return wrap(h(TableStyleFields, {
    raw,
    resolved,
    onChange: () => {},
    onResetField: () => {},
    sectionIdPrefix: 'test-table',
    fieldIdPrefix: 'test-table',
  }));
}

describe('table header controls', () => {
  it('shows the header letter case and letter spacing', () => {
    const html = tableFields();
    expect(html).toContain(DEFAULT_LABELS.tableHeaderTextTransform);
    expect(html).toContain(DEFAULT_LABELS.tableHeaderLetterSpacing);
  });
});

describe('caption alignment', () => {
  it('offers right alignment', () => {
    const cs = resolveCaptionStyleConfig({ align: 'right', note: { align: 'right' } }, resolveBodyTextConfig(undefined));
    const html = wrap(h(CaptionStyleFields, {
      raw: { align: 'right', note: { align: 'right' } },
      resolved: cs,
      update: () => {},
      resetField: () => {},
      sectionIdPrefix: 'test-caption',
      fieldIdPrefix: 'test-caption',
    }));
    expect(html).toContain(DEFAULT_LABELS.alignRight);
  });
});
