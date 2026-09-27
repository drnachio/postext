import { describe, it, expect } from 'vitest';
import { parseInlineFormatting, stripInlineFormatting } from '../../parse/inlineFormatting';
import { buildDocument } from '../../pipeline';

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

const text = (spans: { text: string }[]) => spans.map((s) => s.text).join('');
const italics = (spans: { text: string; italic: boolean }[]) => spans.filter((s) => s.italic).map((s) => s.text);

// CommonMark: `_` opens or closes emphasis only at a word boundary. An
// underscore between two letters or digits — a URL's file name, a
// snake_case identifier — is text.
describe('underscores inside a word', () => {
  it('keeps intraword underscores as text, in URLs and identifiers', () => {
    const spans = parseInlineFormatting('See https://ec.europa.eu/SR_AIRQUALITY_EN.pdf and snake_case_name.');
    expect(text(spans)).toBe('See https://ec.europa.eu/SR_AIRQUALITY_EN.pdf and snake_case_name.');
    expect(italics(spans)).toEqual([]);
  });

  it('still reads _emphasis_ and __strong__ at word boundaries', () => {
    const spans = parseInlineFormatting('An _italic_ word, (_aside_), __bold__ and _two_words_ here.');
    expect(text(spans)).toBe('An italic word, (aside), bold and two_words here.');
    expect(italics(spans)).toEqual(['italic', 'aside', 'two_words']);
    expect(spans.filter((s) => s.bold).map((s) => s.text)).toEqual(['bold']);
  });

  it('asterisks still work inside a word', () => {
    expect(italics(parseInlineFormatting('un*believ*able'))).toEqual(['believ']);
  });

  it('heading text keeps them too', () => {
    expect(stripInlineFormatting('Retrato_del_cardenal and _real_ emphasis')).toBe('Retrato_del_cardenal and real emphasis');
  });

  // Markup taken out next to an `_` leaves a word boundary, as CommonMark
  // reads it: the `_` follows a `*`, `)`, `]` or backtick, not a letter.
  it('an _ right after bold, a link, small caps, an image or code opens emphasis in headings and paragraphs alike', () => {
    const cases: [string, string, string[]][] = [
      ['**Nota**_bene_ final', 'Notabene final', ['bene']],
      ['*Nota*_bene_', 'Notabene', ['Nota', 'bene']],
      ['[Link](https://x.org)_bis_', 'Linkbis', ['bis']],
      [':smallcaps[Nota]_bene_', 'Notabene', ['bene']],
      ['x![i](y.png)_a_', 'xa', ['a']],
      ['`code`_x_', 'codex', ['x']],
    ];
    for (const [source, plain, italic] of cases) {
      expect(stripInlineFormatting(source)).toBe(plain);
      const spans = parseInlineFormatting(source);
      expect(text(spans)).toBe(plain);
      expect(italics(spans)).toEqual(italic);
    }
  });

  it('a heading prints the same text', () => {
    for (const [markdown, heading] of [['# **Nota**_bene_ final\n', 'Notabene final'], ['# [Link](https://x.org)_bis_\n', 'Linkbis']]) {
      const doc = buildDocument({ markdown: markdown! }, {});
      expect(doc.blocks.find((b) => b.type === 'heading')!.lines.map((l) => l.text).join(' ').trim()).toBe(heading);
    }
  });

  it('a laid-out line prints the URL whole', () => {
    const doc = buildDocument({ markdown: 'Source: commons.wikimedia.org/wiki/File:Retrato_del_cardenal_(El_Greco).jpg\n' }, {});
    const lines = doc.blocks.flatMap((b) => b.lines.map((l) => l.text)).join(' ');
    expect(lines.replace(/\s+/g, '')).toContain('Retrato_del_cardenal_(El_Greco).jpg');
  });
});
