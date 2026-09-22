import { describe, expect, it } from 'vitest';
import type { VDTDocument } from 'postext';
import { bandTitleBlocks } from './bandTitle';

const textBlock = (id: string, sourceStart?: number) => ({
  kind: 'text', id, bbox: { x: 0, y: 0, width: 10, height: 10 }, lines: [], fontString: '12px x', color: '#000',
  ...(sourceStart !== undefined ? { sourceStart, sourceEnd: sourceStart + 5 } : {}),
});

describe('bandTitleBlocks', () => {
  it('collects sourced design text from the opener band, running heads and heading overlays of the page', () => {
    const doc = {
      pages: [{
        index: 0,
        openerBand: { bbox: {}, blocks: [textBlock('band', 10), textBlock('decor')] },
        header: { bbox: {}, blocks: [textBlock('head', 20)] },
        footer: { bbox: {}, blocks: [{ kind: 'box', id: 'rule' }] },
        floats: [{ pageIndex: 0, designOverlay: { bbox: {}, blocks: [textBlock('float', 40)] } }],
      }],
      blocks: [
        { pageIndex: 0, designOverlay: { bbox: {}, blocks: [textBlock('cover-title', 30)] } },
        { pageIndex: 1, designOverlay: { bbox: {}, blocks: [textBlock('other-page', 50)] } },
        { pageIndex: 0 },
      ],
    } as unknown as VDTDocument;
    expect(bandTitleBlocks(doc, 0).map((b) => (b as unknown as { id: string }).id)).toEqual(['band', 'head', 'cover-title', 'float']);
    expect(bandTitleBlocks(doc, 2)).toEqual([]);
  });
});
