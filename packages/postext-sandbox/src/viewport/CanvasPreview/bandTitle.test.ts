import { describe, expect, it } from 'vitest';
import type { VDTDesignTextBlock, VDTDocument } from 'postext';
import { bandLineBoxes, bandPlainToSource, bandSourceToPlain, bandTitleBlocks } from './bandTitle';

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

describe('a title printed after a number (#546)', () => {
  // `# La contaminación del suelo` printed as "4. La contaminación del suelo":
  // the title starts at offset 2 of the source, the number takes 3 characters.
  const title = 'La contaminación del suelo';
  const text = `4. ${title}`;
  const block = {
    kind: 'text', id: 'title', bbox: { x: 0, y: 0, width: 300, height: 40 }, fontString: '20px x', color: '#000',
    lines: [
      { text: '4. La contaminación', xOffset: 0, baselineY: 16, width: 190 },
      { text: 'del suelo', xOffset: 0, baselineY: 36, width: 90 },
    ],
    sourceStart: 2,
    sourceEnd: 2 + title.length,
    sourceText: text,
    sourceMap: [2, 2, 2, ...[...title].map((_, i) => 2 + i)],
    sourcePrefixLen: 3,
  } as unknown as VDTDesignTextBlock;

  it('finds every printed line in the printed text', () => {
    expect(bandLineBoxes(block).map((b) => b.plainStart)).toEqual([0, text.indexOf('del suelo')]);
  });

  it('puts a source offset on its own printed character, after the number', () => {
    const word = 2 + title.indexOf('contaminación');
    expect(text.slice(bandSourceToPlain(block, word), bandSourceToPlain(block, word + 'contaminación'.length))).toBe('contaminación');
    // The title's start is after the number; past its end, at the end.
    expect(bandSourceToPlain(block, 2)).toBe(3);
    expect(bandSourceToPlain(block, 0)).toBe(3);
    expect(bandSourceToPlain(block, 999)).toBe(text.length);
  });

  it('maps a click on the number to the title start', () => {
    expect(bandPlainToSource(block, 1)).toBe(2);
    expect(bandPlainToSource(block, 3 + title.indexOf('del'))).toBe(2 + title.indexOf('del'));
  });
});
