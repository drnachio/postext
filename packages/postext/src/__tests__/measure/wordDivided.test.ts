import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { measureRichSnippet } from '../../measure/rich.js';
import { initHyphenator } from '../../measure/font.js';
import { formatWarning } from '../../pipeline/contentWarnings.js';
import type { ContentWarning } from '../../vdt.js';
import type { PostextConfig } from '../../types.js';

// #1150: a word wider than its whole line is cut to fit, at a syllable or,
// where none fits, between two of its characters ("CL" | "IMA"). The line
// says how (`wordDivided`), and the build reports it: a character cut is a
// warning, a syllable cut a note, in the flow and in design texts alike.

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

const FONT = '10px serif';
const lines = (text: string, width: number, hyphenate = true) =>
  measureRichSnippet([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, width, 12, { textAlign: 'left', hyphenate }).lines;

const divided = (warnings: readonly ContentWarning[] | undefined) =>
  (warnings ?? []).filter((w) => w.kind === 'wordDividedByCharacter' || w.kind === 'wordDividedBySyllable');

describe('#1150: the line says how its word was cut', () => {
  it('flags a cut between two characters', () => {
    // No syllable of "CLIMAX" fits 3 characters (21 px) with its hyphen.
    const ls = lines('CLIMAX', 21, false);
    expect(ls.map((l) => l.text)).toEqual(['CL-', 'IM-', 'AX']);
    expect(ls.map((l) => l.wordDivided)).toEqual(['character', 'character', undefined]);
  });

  it('flags a cut at a syllable', () => {
    initHyphenator('en');
    // Hyphenation off: the word is not broken at syllables as usual, but
    // one wider than the whole line is still divided at one.
    const ls = lines('extraordinarily', 70, false);
    expect(ls.length).toBeGreaterThan(1);
    expect(ls[0]!.text.endsWith('-')).toBe(true);
    expect(ls[0]!.wordDivided).toBe('syllable');
  });

  it('flags nothing for a word that fits, nor for a cut at a no-break space', () => {
    expect(lines('A short line of words', 400).every((l) => l.wordDivided === undefined)).toBe(true);
    const ls = lines('300 000 000', 56, false);
    expect(ls.length).toBeGreaterThan(1);
    expect(ls[0]!.wordDivided).toBeUndefined();
  });
});

describe('#1150: wordDivided warnings', () => {
  const base: PostextConfig = { page: { dpi: 72 }, layout: { layoutType: 'single' } };

  it('warns on a character cut in the flow and notes a syllable cut, with messages', () => {
    const doc = buildDocument({ markdown: 'Xqzvbnmkwplrtgh' }, { ...base, page: { ...base.page, width: { value: 60, unit: 'pt' }, margins: { top: { value: 10, unit: 'pt' }, bottom: { value: 10, unit: 'pt' }, left: { value: 10, unit: 'pt' }, right: { value: 10, unit: 'pt' } } }, bodyText: { firstLineIndent: { value: 0, unit: 'pt' } } } as PostextConfig);
    const ws = divided(doc.contentWarnings);
    expect(ws.length).toBeGreaterThan(0);
    expect(ws.every((w) => w.kind === 'wordDividedByCharacter')).toBe(true);
    expect(formatWarning(ws[0]!)).toContain('cut between two of its letters');
    expect(formatWarning({ kind: 'wordDividedBySyllable', text: 'extra-' })).toContain('divided at a syllable');
  });

  it('reports a running head cut to fit once, as for a word that runs past', () => {
    const long = 'Electroencephalography';
    const doc = buildDocument({ markdown: `# ${long}\n\nText.\n\n:::pagebreak\n:::\n\nMore text.` }, {
      ...base,
      header: { elements: [{ kind: 'text', id: 'rh', content: '{chapterTitle}', fontSize: { value: 10, unit: 'pt' }, overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: { value: 40, unit: 'pt' } } } }] },
    } as PostextConfig);
    const head = doc.pages[0]!.header!.blocks.find((b) => b.kind === 'text');
    expect(head && head.kind === 'text' && head.lines.some((l) => l.wordDivided === 'character')).toBe(true);
    const ws = divided(doc.contentWarnings).filter((w) => w.pageIndex !== undefined && doc.pages[w.pageIndex]?.header);
    const texts = ws.map((w) => w.text);
    expect(new Set(texts).size).toBe(texts.length);
    expect(ws.some((w) => w.kind === 'wordDividedByCharacter')).toBe(true);
  });
});
