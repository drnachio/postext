// The Resources panel previews a caption with the label the engine sets:
// "Figure #. ", with `#` for the number. It showed "Do #." for a type
// numbered with an empty template, where the engine sets "Do.", and fell
// back to the type's short label or name when the type has no caption
// prefix, where the engine sets no label.

import { describe, expect, it } from 'vitest';
import { buildDocument, defaultResourceTypes } from 'postext';
import type { Resource, ResourceType } from 'postext';
import { captionPreviewLabel } from './captionLabel';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** The caption the engine sets for a table of `type`, as one string. */
function engineCaption(type: ResourceType): string {
  const resource: Resource = {
    id: 'r1',
    typeId: type.id,
    kind: 'table',
    caption: 'Sizes.',
    createdAt: 0,
    updatedAt: 0,
    table: { model: { headerRowCount: 0, rows: [[{ content: 'A' }]] } },
    placement: { position: 'here' },
  };
  const doc = buildDocument(
    { markdown: 'Text.\n\n::resource{id="r1"}', resources: [resource] },
    { resourceTypes: [type], header: { elements: [] }, footer: { elements: [] } },
  );
  const block = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks)).find((b) => b.resourceBlock);
  return (block?.resourceBlock?.captionLines ?? []).map((l) => l.text).join(' ');
}

describe('captionPreviewLabel', () => {
  const table = defaultResourceTypes('en').find((t) => t.id === 'table')!;
  const cases: Array<[string, ResourceType]> = [
    ['a numbered type', table],
    ['an empty template', { ...table, id: 'doc', captionPrefix: 'Do', numberingTemplate: '' }],
    ['a prefix that ends in a stop', { ...table, id: 'plate', captionPrefix: 'Pl.', numberingTemplate: '' }],
    ['no prefix', { ...table, id: 'bare', captionPrefix: '', shortLabel: 'B.', numberingTemplate: '{n}' }],
  ];

  for (const [name, type] of cases) {
    it(`opens the caption as the engine does (${name})`, () => {
      const label = captionPreviewLabel(type);
      expect(engineCaption(type).replace(/\u00A0/g, ' ')).toBe(`${label.replace('#', '1')}Sizes.`.replace(/\u00A0/g, ' '));
    });
  }

  it('reads "Do. " for an empty template, and nothing without a prefix', () => {
    expect(captionPreviewLabel({ captionPrefix: 'Do', numberingTemplate: '' })).toBe('Do. ');
    expect(captionPreviewLabel({ captionPrefix: 'Pl. ', numberingTemplate: '' })).toBe('Pl. ');
    expect(captionPreviewLabel({ captionPrefix: 'Figure', numberingTemplate: '{h1}.{n}' })).toBe('Figure\u00A0#. ');
    expect(captionPreviewLabel({ captionPrefix: '', numberingTemplate: '{n}' })).toBe('');
    expect(captionPreviewLabel(undefined)).toBe('');
  });

  it('takes the caption style\'s gap and separator, a type\'s own first (#464)', () => {
    const figure = { captionPrefix: '図', numberingTemplate: '{h1}-{n}' };
    expect(captionPreviewLabel(figure, { labelNumberGap: '', labelSeparator: '　' })).toBe('図#　');
    expect(captionPreviewLabel({ ...figure, captionStyle: { labelSeparator: '：' } }, { labelNumberGap: '', labelSeparator: '　' })).toBe('図#：');
    expect(captionPreviewLabel({ captionPrefix: 'Do', numberingTemplate: '' }, { labelNumberGap: '', labelSeparator: '　' })).toBe('Do. ');
  });
});
