import { describe, it, expect } from 'vitest';
import { buildDocumentPass } from '../../pipeline/build';
import type { PostextConfig, VDTBlock } from '../../index';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const px = (value: number) => ({ value, unit: 'px' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

/** A single justified column, hyphenated (so a looser setting has breaks to
 *  work with), and a generous runt threshold so the fixture's short last
 *  line counts as one. */
const CONFIG = (avoidRunts: boolean): PostextConfig => ({
  page: {
    width: px(400), height: px(600),
    margins: { top: px(20), bottom: px(20), left: px(20), right: px(20) },
  },
  layout: { layoutType: 'single' },
  bodyText: {
    fontSize: pt(9), lineHeight: pt(12), textAlign: 'justify',
    optimalLineBreaking: true, firstLineIndent: px(0),
    hyphenation: { enabled: true, locale: 'es' },
    avoidRunts, runtMinCharacters: 30,
  },
  headings: { balancing: { enabled: false } },
});

const SENTENCE = 'composicion tipografica editorial exige columnas alineadas ';
const MARKDOWN = `${SENTENCE.repeat(4)}de la casa gr`;

function paragraph(avoidRunts: boolean, loose: boolean): VDTBlock {
  const hints = loose ? { balanceLooseness: new Map([[0, 1]]) } : {};
  const result = buildDocumentPass({ markdown: MARKDOWN }, CONFIG(avoidRunts), undefined, undefined, hints);
  return result.doc.pages[0]!.columns[0]!.blocks[0]!;
}

describe('running a paragraph long (column balancing)', () => {
  it('refuses a looser setting whose extra line would be a runt', () => {
    const natural = paragraph(true, false);
    // The fixture's own setting ends on a full line…
    expect(natural.lines[natural.lines.length - 1]!.bbox.width).toBeGreaterThan(210);

    // …and the looser one would leave a short line at the foot of the
    // paragraph, so the lever is refused: filling a column is no reason to
    // strand a few characters.
    const runtsOff = paragraph(false, true);
    expect(runtsOff.lines.length).toBe(natural.lines.length + 1);
    expect(runtsOff.lines[runtsOff.lines.length - 1]!.bbox.width).toBeLessThan(210);

    const runtsOn = paragraph(true, true);
    expect(runtsOn.lines.length).toBe(natural.lines.length);
  });
});
