import { describe, it, expect } from 'vitest';
import { parseInlineFormatting, stripInlineFormatting } from '../../parse/inlineFormatting.js';
import { parseInline } from '../../word/inline.js';

const text = (spans: { text: string }[]) => spans.map((s) => s.text).join('');
const italics = (spans: { text: string; italic: boolean }[]) => spans.filter((s) => s.italic).map((s) => s.text);
const bolds = (spans: { text: string; bold: boolean }[]) => spans.filter((s) => s.bold).map((s) => s.text);

// CommonMark's flanking rules for `*` (#1444): a `*` after a word and
// before a space or punctuation can only close emphasis, so a star name
// such as "Sgr A*" or "M87*" is text, not the start of italics.
describe('asterisks open and close by CommonMark flanking', () => {
  it('keeps a trailing star of a name as text', () => {
    const src = 'The first image of Sgr A* at press conferences, the M87 black hole (M87*), and Sgr A*. Then more text.';
    const spans = parseInlineFormatting(src);
    expect(text(spans)).toBe(src);
    expect(italics(spans)).toEqual([]);
    expect(stripInlineFormatting(src)).toBe(src);
  });

  it('still closes emphasis after a word', () => {
    // CommonMark reads this as emphasis up to `A`: the star after a word
    // closes the one before `Along`; the last one has no partner.
    const spans = parseInlineFormatting('“*Along with Sgr A* having a structure.*”');
    expect(italics(spans)).toEqual(['Along with Sgr A']);
    expect(text(spans)).toBe('“Along with Sgr A having a structure.*”');
  });

  it('reads emphasis that starts or ends beside punctuation', () => {
    expect(italics(parseInlineFormatting('“*What we see,*” said she.'))).toEqual(['What we see,']);
    expect(italics(parseInlineFormatting('(*aside*) and *word*.'))).toEqual(['aside', 'word']);
    expect(italics(parseInlineFormatting('un*believ*able'))).toEqual(['believ']);
  });

  it('does not open before a space nor close after one', () => {
    const spans = parseInlineFormatting('a * b * c and *x *y');
    expect(italics(spans)).toEqual([]);
    expect(text(spans)).toBe('a * b * c and *x *y');
  });

  it('applies the same rules to bold and bold italics', () => {
    expect(bolds(parseInlineFormatting('**bold** and **A** B** C'))).toEqual(['bold', 'A']);
    const spans = parseInlineFormatting('x ***both*** y');
    expect(spans.filter((s) => s.bold && s.italic).map((s) => s.text)).toEqual(['both']);
  });

  it('judges a run of stars as a whole', () => {
    // Neither star of a `**` before a space opens, so no italic starts
    // inside a bold marker that failed to open.
    for (const src of ['** foo**', 'foo ** bar', 'a **']) {
      const spans = parseInlineFormatting(src);
      expect(text(spans)).toBe(src);
      expect(spans.some((s) => s.italic || s.bold)).toBe(false);
    }
    const nested = parseInlineFormatting('**bold *it***');
    expect(bolds(nested)).toEqual(['bold ', 'it']);
    expect(italics(nested)).toEqual(['it']);
    const run = parseInlineFormatting('***Abstract***—Text');
    expect(run.filter((s) => s.bold && s.italic).map((s) => s.text)).toEqual(['Abstract']);
    expect(text(run)).toBe('Abstract—Text');
  });

  it('keeps emphasis between CJK letters and punctuation', () => {
    expect(bolds(parseInlineFormatting('中文**粗体。**中文'))).toEqual(['粗体。']);
    expect(italics(parseInlineFormatting('中文*强调*中文'))).toEqual(['强调']);
    expect(bolds(parseInlineFormatting('第3.0回GDP**粗**'))).toEqual(['粗']);
    expect(bolds(parseInlineFormatting('是 **《**officer**》** x'))).toEqual(['《', '》']);
  });

  it('reads the same in the Word importer’s parser', () => {
    const runs = parseInline('Sgr A* at the centre, and *italic* text.');
    expect(runs.filter((r) => r.italic).map((r) => r.text)).toEqual(['italic']);
    expect(runs.map((r) => r.text).join('')).toBe('Sgr A* at the centre, and italic text.');
  });
});
