import { describe, it, expect } from 'vitest';
import { layoutDesignSlot, type ResolvedTextPrimitive } from '../../design/layout';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement, DesignTextElement, TextOverflow } from '../../types';
import type { VDTPage } from '../../vdt';

// EF-76: a truncated design text dropped the space before the ellipsis
// only by luck and cut mid-word ("The history of th…"). The cut now falls
// on the last word boundary that fits — mid-word only when that would
// throw away more than half of what fits (one long word) — and the spaces
// and joining punctuation beside the ellipsis go.

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

const DPI = 72;
const pt = (value: number) => ({ value, unit: 'pt' as const });
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };

/** `chars` characters wide (7 px each, the ellipsis included). */
const truncated = (content: string, chars: number, overflow: TextOverflow = 'ellipsis-end', extra: Partial<DesignTextElement> = {}): string => {
  const el = {
    kind: 'text', id: 't', content, fontSize: pt(10), overflow,
    placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(chars * 7) } },
    ...extra,
  } as DesignElement;
  const p = layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container: { x: 0, y: 0, width: 400, height: 100 }, dpi: DPI, placeholders }, 0)
    .primitives[0] as ResolvedTextPrimitive;
  return p.lines.map((l) => l.text).join('|');
};

const TITLE = 'The history of the Spanish nation';

describe('EF-76: ellipsis-end', () => {
  it('drops the space before the ellipsis', () => {
    // "The history of " fits with the ellipsis: the space goes.
    expect(truncated(TITLE, 16)).toBe('The history of…');
  });

  it('cuts at the last word boundary rather than mid-word', () => {
    expect(truncated(TITLE, 18)).toBe('The history of…');
    expect(truncated(TITLE, 26)).toBe('The history of the…');
  });

  it('cuts one long word mid-word (a boundary would keep less than half)', () => {
    expect(truncated('Supercalifragilistic', 10)).toBe('Supercali…');
    expect(truncated('A supercalifragilistic word', 10)).toBe('A superca…');
  });

  it('drops joining punctuation before the ellipsis', () => {
    expect(truncated('Rivers, lakes and seas', 10)).toBe('Rivers…');
    expect(truncated('Part one — the rivers', 13)).toBe('Part one…');
    expect(truncated('Rivers (and lakes)', 11)).toBe('Rivers…');
  });

  it('never cuts at a no-break space', () => {
    // "Population 225 000 people": the boundary before "000" is glued.
    expect(truncated('Population 225 000 people', 18)).toBe('Population…');
  });

  it('never cuts after a no-break hyphen', () => {
    // A hyphen is a word boundary ...
    expect(truncated('ABCDEF-GHIJ', 10)).toBe('ABCDEF…');
    // ... U+2011 glues its neighbours, like a no-break space: one word.
    expect(truncated('ABCDEF\u2011GHIJ', 10)).toBe('ABCDEF\u2011GH…');
    expect(truncated('ABCDEF\u2011GHIJ', 10, 'ellipsis-end', { inlineMarks: true })).toBe('ABCDEF\u2011GH…');
    expect(truncated('MS\u2011DOS commands', 6)).toBe('MS\u2011DO…');
  });

  it('keeps at least half of what fits after dropping the punctuation', () => {
    // "http://exampl" fits; the last boundary ("http://") trimmed to "http"
    // keeps less than half of it, so the long word is cut where it must.
    expect(truncated('http://example.com/path', 14)).toBe('http://exampl…');
    expect(truncated('http://example.com/path', 14, 'ellipsis-end', { inlineMarks: true })).toBe('http://exampl…');
    // "AB — CDE" fits; "AB" alone would be a quarter of it.
    expect(truncated('AB — CDEFGHIJ', 9)).toBe('AB — CDE…');
    // A boundary that keeps half or more still wins.
    expect(truncated('1990-2000 statistics', 14)).toBe('1990-2000…');
  });

  it('a text that fits is untouched', () => {
    expect(truncated('Short title ', 20)).toBe('Short title ');
  });

  it('follows the same rules with inline marks', () => {
    expect(truncated('The *history* of the Spanish nation', 18, 'ellipsis-end', { inlineMarks: true })).toBe('The history of…');
    expect(truncated('The **history** of the Spanish nation', 16, 'ellipsis-end', { inlineMarks: true })).toBe('The history of…');
    expect(truncated('**Supercalifragilistic**', 10, 'ellipsis-end', { inlineMarks: true })).toBe('Supercali…');
  });
});

describe('EF-76: ellipsis-start and ellipsis-middle', () => {
  it('ellipsis-start starts at a word boundary, with no space after the ellipsis', () => {
    expect(truncated(TITLE, 16, 'ellipsis-start')).toBe('…Spanish nation');
    expect(truncated(TITLE, 18, 'ellipsis-start')).toBe('…Spanish nation');
    expect(truncated('Supercalifragilistic', 10, 'ellipsis-start')).toBe('…agilistic');
    expect(truncated(TITLE, 16, 'ellipsis-start', { inlineMarks: true })).toBe('…Spanish nation');
  });

  it('ellipsis-start never starts after a no-break hyphen', () => {
    expect(truncated('ABCD-EFGHIJ', 10, 'ellipsis-start')).toBe('…EFGHIJ');
    expect(truncated('ABCD\u2011EFGHIJ', 10, 'ellipsis-start')).toBe('…CD\u2011EFGHIJ');
    expect(truncated('ABCD\u2011EFGHIJ', 10, 'ellipsis-start', { inlineMarks: true })).toBe('…CD\u2011EFGHIJ');
  });

  it('ellipsis-start keeps at least half of what fits after dropping the punctuation', () => {
    // "e.com/path" fits; the next boundary ("path") keeps less than half
    // once the slash goes, so the tail is cut mid-word.
    expect(truncated('http://example.com/path', 11, 'ellipsis-start')).toBe('…e.com/path');
    expect(truncated('ABCDEFGH — IJ', 9, 'ellipsis-start')).toBe('…FGH — IJ');
    expect(truncated('ABCDEFGH — IJ', 9, 'ellipsis-start', { inlineMarks: true })).toBe('…FGH — IJ');
  });

  it('ellipsis-middle drops the spaces beside the ellipsis', () => {
    // "The " + "…" + "tion": the space before the ellipsis goes.
    expect(truncated(TITLE, 9, 'ellipsis-middle')).toBe('The…tion');
    // "The hist" + "…" + " nation": the space after it goes.
    expect(truncated(TITLE, 16, 'ellipsis-middle')).toBe('The hist…nation');
    expect(truncated(TITLE, 9, 'ellipsis-middle', { inlineMarks: true })).toBe('The…tion');
    expect(truncated(TITLE, 16, 'ellipsis-middle', { inlineMarks: true })).toBe('The hist…nation');
  });
});
