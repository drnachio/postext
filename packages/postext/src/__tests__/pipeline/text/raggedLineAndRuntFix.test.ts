import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { formatWarning, raggedLineWarnings } from '../../../pipeline/contentWarnings.js';
import type { PostextConfig } from '../../../types.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';

// Two things the engine did without saying so.
//
// #732: a justified line whose word spaces would stretch past 3× is set
// ragged. Five reviewers of #660 found such a line "left short" in a
// justified paragraph, and nothing reported it: the flag it carried
// (`ragged`) is also a tabbed line's, a code line's and a CJK line's.
//
// #733: a paragraph set one line shorter to take up a runt carried only a
// `letterSpacing`, which a heading style and the balancing lever set too,
// and nothing at all when the word spaces alone carried the line.

// Widths that vary by character, so the breaks fall in many places.
const W = (ch: string): number => {
  if (ch === ' ') return 0.25;
  if ('il.,;:!|\'()'.includes(ch)) return 0.28;
  if ('mwMW'.includes(ch)) return 0.8;
  if (/[A-Z]/.test(ch)) return 0.66;
  return 0.5;
};
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '10');
    let w = 0;
    for (const ch of s) w += W(ch) * size;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px; a measure of 140 px. A box with no padding has it too.
const config = (bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
  page: { width: pt(160), height: pt(900), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), textAlign: 'justify', hyphenation: { enabled: false }, ...bodyText },
  calloutStyles: [{ id: 'n', padding: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } }],
});
// Short words: every line fills its measure with a little give in its spaces.
const PLAIN = 'it is so and we go on to the end of it all as one and all do in the way we know it is to be so.';
const paragraphs = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'paragraph');

describe('a justified line set ragged is reported (#732)', () => {
  // The first line cannot take the next word: two words and one space
  // across 140 px.
  const STORY = 'The Marrowick Harbourboardcommissioners decided today that the ferry is to make all its crossings.';

  it('keeps the ratio the line would have needed, and warns with its text and its page', () => {
    const doc = buildDocument({ markdown: STORY }, config());
    const [first, second] = paragraphs(doc)[0]!.lines;
    expect(first!.text).toBe('The Marrowick');
    expect(first!.ragged).toBe(true);
    expect(first!.justifiedSpaceRatio).toBeUndefined();
    expect(first!.raggedSpaceRatio).toBeGreaterThan(3);
    expect(second!.raggedSpaceRatio).toBeUndefined();
    expect(doc.contentWarnings).toEqual([
      { kind: 'raggedLine', text: 'The Marrowick', ratio: first!.raggedSpaceRatio, sourceStart: 0, sourceEnd: 13, pageIndex: 0 },
    ]);
    expect(formatWarning(doc.contentWarnings![0]!)).toContain(`The justified line "The Marrowick" would need its word spaces at ${Math.round(first!.raggedSpaceRatio! * 10) / 10}× their width: it is set ragged`);
  });

  it('reports the line of a box paragraph and of a note at the column foot', () => {
    const doc = buildDocument({ markdown: `:::callout{style=n}\n${STORY}\n:::\n\nA text cites.[^n]\n\n[^n]: ${STORY}` }, config());
    const warnings = (doc.contentWarnings ?? []).filter((w) => w.kind === 'raggedLine') as { text: string; ratio: number }[];
    expect(warnings.map((w) => w.text)).toContain('The Marrowick');
    expect(warnings.some((w) => w.text.startsWith('1') && w.text.includes('The Marrowick'))).toBe(true);
    for (const w of warnings) expect(w.ratio).toBeGreaterThan(3);
  });

  it('says nothing of a paragraph set ragged, of a last line or of a line within 3×', () => {
    expect(buildDocument({ markdown: STORY }, config({ textAlign: 'left' })).contentWarnings ?? []).toEqual([]);
    const plain = buildDocument({ markdown: PLAIN }, config());
    expect(plain.contentWarnings ?? []).toEqual([]);
    expect(paragraphs(plain)[0]!.lines.every((l) => l.raggedSpaceRatio === undefined)).toBe(true);
  });

  it('is not raised by the other lines that are ragged: a tab stop, a code listing, a CJK line at its cap', () => {
    const line = (extra: object) => ({ text: 'x', bbox: { x: 0, y: 0, width: 10, height: 10 }, baseline: 8, ragged: true, ...extra });
    const doc = { blocks: [{ pageIndex: 0, lines: [line({ tabbed: true }), line({ cjkLoose: true }), line({}), line({ raggedSpaceRatio: 4.1, sourceStart: 3, sourceEnd: 9 })] }] } as unknown as VDTDocument;
    expect(raggedLineWarnings(doc)).toEqual([{ kind: 'raggedLine', text: 'x', ratio: 4.1, sourceStart: 3, sourceEnd: 9, pageIndex: 0 }]);
    const code = buildDocument({ markdown: '```\nconst a = 1;\nconst b = 2;\n```' }, config());
    expect((code.contentWarnings ?? []).filter((w) => w.kind === 'raggedLine')).toEqual([]);
  });
});

describe('a paragraph set a line short to take up a runt says so (#733)', () => {
  // Four lines set naturally, the last a runt; three with 10‰ of tracking.
  const TEXT = 'and within a is its within lets left its osmosis a left and within a is its within lets left its.';
  // Three lines with a runt at a low runt penalty; two with tighter word spaces alone.
  const SPACES = 'then and within of will left left is lets stone will lets all make is.';
  // Two lines set naturally, the second a one-word runt; one with 5‰ of tracking.
  const NOTE = 'and within a is its within then';

  it('records the tracking that carried the line, in thousandths of an em', () => {
    const block = paragraphs(buildDocument({ markdown: TEXT }, config()))[0]!;
    expect(block.lines).toHaveLength(3);
    expect(block.runtFix).toEqual({ tracking: 10 });
    // 10‰ of a 10 px em.
    expect(block.letterSpacing).toBeCloseTo(-0.1, 5);
  });

  it('records a fix the word spaces made alone, which no letter spacing shows', () => {
    const block = paragraphs(buildDocument({ markdown: SPACES }, config({ runtPenalty: 1 })))[0]!;
    expect(block.lines).toHaveLength(2);
    expect(block.runtFix).toEqual({ tracking: 0 });
    expect(block.letterSpacing).toBeUndefined();
  });

  it('records nothing for a paragraph with no runt, or with the fix off', () => {
    const plain = paragraphs(buildDocument({ markdown: PLAIN }, config()))[0]!;
    expect(plain.runtFix).toBeUndefined();
    const off = paragraphs(buildDocument({ markdown: TEXT }, config({ tightenRunts: false })))[0]!;
    expect(off.lines).toHaveLength(4);
    expect(off.runtFix).toBeUndefined();
  });

  it('is carried by a box paragraph and by a note at the column foot', () => {
    const box = buildDocument({ markdown: `:::callout{style=n}\n${TEXT}\n:::` }, config());
    expect(paragraphs(box)[0]!.runtFix).toEqual({ tracking: 10 });
    expect(box.blocks.find((b) => b.type === 'callout')!.runtFix).toBeUndefined();
    const noted = buildDocument({ markdown: `The text cites a work.[^n]\n\n[^n]: ${NOTE}` }, { ...config({ textAlign: 'left' }), footnotes: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left' } });
    const note = noted.blocks.find((b) => b.footnoteNote !== undefined)!;
    expect(note.runtFix).toEqual({ tracking: 5 });
    expect(note.letterSpacing).toBeCloseTo(-0.05, 5);
  });

  it('is carried by a second build from the measurement cache', () => {
    const cache = createMeasurementCache();
    const first = paragraphs(buildDocument({ markdown: TEXT }, config(), cache))[0]!;
    const again = paragraphs(buildDocument({ markdown: TEXT }, config(), cache))[0]!;
    expect(first.runtFix).toEqual({ tracking: 10 });
    expect(again.runtFix).toEqual({ tracking: 10 });
    expect(again.letterSpacing).toBeCloseTo(-0.1, 5);
  });

  it('is carried by each part of a paragraph split over two pages', () => {
    // A page of four lines: the paragraph before fills two, so this one is split.
    const short: PostextConfig = { ...config(), page: { ...config().page!, height: pt(20 + 14 * 4) } };
    const doc = buildDocument({ markdown: `One line and then another one to fill two lines here.\n\n${TEXT}` }, short);
    const parts = paragraphs(doc).filter((b) => b.runtFix !== undefined);
    expect(parts.length).toBeGreaterThanOrEqual(1);
    for (const part of parts) expect(part.runtFix).toEqual({ tracking: 10 });
    if (parts.length > 1) expect(new Set(parts.map((p) => p.contentIndex)).size).toBe(1);
  });
});
