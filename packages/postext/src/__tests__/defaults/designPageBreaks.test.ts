// The page breaks go with the elements shown on blank pages (#1523, #1532):
// a book whose running heads paint its blank versos keeps the breaks that
// leave those versos when a design replaces its headings and parts.
import { describe, it, expect } from 'vitest';
import type { DesignSlot, PostextConfig } from '../../index.js';
import { applyDesign, revertDesign } from '../../index.js';

const band = { hex: '#2b4acb', model: 'hex' as const };
const blankBand: DesignSlot = {
  elements: [{ kind: 'box', id: 'facing', pages: 'blank', parity: 'even', placement: { anchor: { to: 'bleed', point: 'top-left' } }, style: { backgroundColor: band } }],
} as unknown as DesignSlot;

const book: PostextConfig = {
  headings: { fontFamily: 'Lora', levels: [{ level: 1, breakBefore: { enabled: true, parity: 'even' }, fontSize: { value: 28, unit: 'pt' } }] },
  headingStyles: [{ id: 'cover', name: 'Cover', breakBefore: { enabled: true, parity: 'odd' } }],
  parts: { breakBefore: { parity: 'always-odd' }, breakAfter: { enabled: true, parity: 'even' } },
  header: blankBand,
} as PostextConfig;

const plainDesign = {
  parts: ['headings', 'parts'] as const,
  config: { headings: { fontFamily: 'Fraunces' }, headingStyles: [{ id: 'cover', name: 'Cover', breakBefore: { enabled: true, parity: 'always-odd' } }], parts: { margins: { top: { value: 40, unit: 'mm' } } } } as PostextConfig,
};

describe('applyDesign and blank pages', () => {
  it('leaves the book its breaks when the book keeps a blank-page element', () => {
    const after = applyDesign(book, { parts: [...plainDesign.parts], config: plainDesign.config });
    expect(after.headings?.fontFamily).toBe('Fraunces');
    expect(after.headings?.levels).toEqual([{ level: 1, breakBefore: { enabled: true, parity: 'even' } }]);
    expect(after.headingStyles?.[0]?.breakBefore).toEqual({ enabled: true, parity: 'odd' });
    expect(after.parts).toEqual({ margins: { top: { value: 40, unit: 'mm' } }, breakBefore: { parity: 'always-odd' }, breakAfter: { enabled: true, parity: 'even' } });
    expect(revertDesign(after, book, after)).toEqual(book);
  });

  it('applies the design\'s breaks when the design replaces the blank-page element too', () => {
    const after = applyDesign(book, { parts: [...plainDesign.parts, 'running'], config: plainDesign.config });
    expect(after.header).toBeUndefined();
    expect(after.headings).toEqual({ fontFamily: 'Fraunces' });
    expect(after.parts).toEqual({ margins: { top: { value: 40, unit: 'mm' } } });
  });

  it('brings the design\'s breaks with a blank-page element the design brings', () => {
    const design = { parts: ['running' as const], config: { header: blankBand, headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] } } as PostextConfig };
    const plain: PostextConfig = { headings: { fontFamily: 'Lora' } };
    const after = applyDesign(plain, design);
    expect(after.header).toEqual(blankBand);
    expect(after.headings).toEqual({ fontFamily: 'Lora', levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] });
  });

  it('changes nothing else when no blank-page element is involved', () => {
    const { header: _h, ...noBand } = book;
    void _h;
    const after = applyDesign(noBand, { parts: [...plainDesign.parts], config: plainDesign.config });
    expect(after.headings).toEqual({ fontFamily: 'Fraunces' });
  });
});
