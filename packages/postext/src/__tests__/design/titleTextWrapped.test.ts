import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { defaultOpenerTitle, headingTitleText } from '../../pipeline/headerFooter';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDesignSlot, VDTDesignTextBlock, VDTDocument } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env): each
// character is half the font size wide, so a larger face wraps sooner.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const size = m ? Number(m[1]) : 16;
    return { width: s.length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });

/** The Cookbook's repro (dictionary-thumb-index): a 150 × 200 mm page in two
 *  columns, a level-1 heading set at `size` whose design prints
 *  `{titleText}` at 20 pt across the band. */
function configFor(span: 'page' | 'column', size: number, designed = true): PostextConfig {
  return {
    page: { width: mm(150), height: mm(200) },
    layout: { layoutType: 'double', gutterWidth: mm(4) },
    headings: {
      levels: [{
        level: 1,
        span,
        fontSize: pt(size),
        advancedDesign: {
          enabled: designed,
          slot: {
            elements: [{
              kind: 'text', id: 't', content: '{titleText}', fontSize: pt(20), overflow: 'wrap',
              placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } },
            }],
          },
        },
      }],
    },
  };
}

const heading = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'heading')!;
const titleLines = (slot: VDTDesignSlot | undefined): string[] =>
  (slot?.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')?.lines ?? []).map((l) => l.text);
const bandOf = (doc: VDTDocument): VDTDesignSlot | undefined => {
  const h = heading(doc);
  return doc.pages[h.pageIndex]!.openerBand ?? h.designOverlay;
};

describe('{titleText} of a heading that wraps in its column (EF-162)', () => {
  const markdown = '# The Sailor’s Word-Book\n\nText.';

  it('keeps a word broken at its own hyphen whole in an opener band', () => {
    const doc = buildDocument({ markdown }, configFor('page', 40));
    // The heading's hidden lines wrap at the column width, one word a line.
    expect(heading(doc).lines.map((l) => l.text.trim())).toEqual(['The', 'Sailor’s', 'Word-', 'Book']);
    // Up to postext 1.4 the band printed 'The Sailor’s Word- Book'.
    expect(titleLines(bandOf(doc))).toEqual(['The Sailor’s Word-Book']);
    // The same text as a heading that fits its column on one line.
    expect(titleLines(bandOf(buildDocument({ markdown }, configFor('page', 8))))).toEqual(['The Sailor’s Word-Book']);
  });

  it('does the same in an in-column design', () => {
    const doc = buildDocument({ markdown }, configFor('column', 40));
    expect(heading(doc).lines.length).toBeGreaterThan(1);
    expect(titleLines(bandOf(doc)).join(' ')).toBe('The Sailor’s Word-Book');
  });

  it('does the same on the rich path, where the hyphen line is flagged hardHyphen', () => {
    const doc = buildDocument({ markdown: '# The *Sailor’s* Word-Book\n\nText.' }, configFor('page', 40));
    const hyphenLine = heading(doc).lines.find((l) => l.text.trim() === 'Word-');
    expect(hyphenLine?.hardHyphen).toBe(true);
    expect(titleLines(bandOf(doc))).toEqual(['The Sailor’s Word-Book']);
  });

  it('joins a word the column cut for width without a space', () => {
    const doc = buildDocument({ markdown: '# Understanding the extraordinary circumstances\n\nText.' }, configFor('column', 40));
    // 'Understanding' is wider than the column at 40 pt: the heading cuts it.
    expect(heading(doc).lines[0]!.text).toBe('Understa');
    expect(titleLines(bandOf(doc)).join(' ')).toBe('Understanding the extraordinary circumstances');
  });

  it('keeps a forced break once the lines join back into the title', () => {
    // The joined title has the parsed title's length again, so the `\\`
    // break lands where it was written (up to postext 1.4 the extra space
    // after 'Word-' dropped the break, and the band read 'Word- Book of the Sea').
    const doc = buildDocument({ markdown: '# The Sailor’s Word-Book \\\\ of the Sea\n\nText.' }, configFor('page', 40));
    expect(titleLines(bandOf(doc))).toEqual(['The Sailor’s Word-Book', 'of the Sea']);
  });

  it('reads the default opener the same way', () => {
    // At 72 pt the heading's own lines cut the compound for width and at
    // its hyphens: 'Seafaring' | '-Word-' | 'Book-' | 'Collectio' | 'n'.
    const doc = buildDocument({ markdown: '# Seafaring-Word-Book-Collection\n\nText.' }, configFor('page', 72, false));
    expect(heading(doc).lines.length).toBeGreaterThan(3);
    const text = bandOf(doc)!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
    // The opener now sets the title as written, which maps back to the
    // source character by character, and divides it by its own rules. Up
    // to postext 1.4 it printed the heading's cut pieces joined with
    // spaces, a line opening on '-Word-'.
    expect(text.sourceText).toBe('Seafaring-Word-Book-Collection');
    expect(text.lines.every((l) => !l.text.startsWith('-'))).toBe(true);
  });

  it('matches {chapterTitle}, which already joined the lines this way', () => {
    const config: PostextConfig = {
      ...configFor('page', 40),
      header: {
        elements: [{
          kind: 'text', id: 'rh', content: '{chapterTitle}', fontSize: pt(8), overflow: 'wrap',
          placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'fill' } },
        }],
      },
    };
    const doc = buildDocument({ markdown: `${markdown}\n\n${'Body text. '.repeat(400)}` }, config);
    const lastPage = doc.pages[doc.pages.length - 1]!;
    expect(titleLines(lastPage.header)).toEqual(['The Sailor’s Word-Book']);
  });
});

describe('a title glued by a no-break space wider than its column (EF-162 review)', () => {
  const NBSP = ' ';
  const title = `Capítulo${NBSP}XVIII: la vuelta a casa`;
  /** `configFor`, with `{titleText}` set small enough for one line and a
   *  running head printing `{chapterTitle}`. */
  function glued(span: 'page' | 'column', size: number, designed = true): PostextConfig {
    const base = configFor(span, size, designed);
    const level = base.headings!.levels![0]!;
    return {
      ...base,
      headings: {
        levels: [{
          ...level,
          advancedDesign: {
            enabled: designed,
            slot: {
              elements: [{
                kind: 'text', id: 't', content: '[{titleText}]', fontSize: pt(8), overflow: 'wrap',
                placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } },
              }],
            },
          },
        }],
      },
      header: {
        elements: [{
          kind: 'text', id: 'rh', content: '[{chapterTitle}]', fontSize: pt(8), overflow: 'wrap',
          placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'fill' } },
        }],
      },
    };
  }
  const build = (markdown: string, config: PostextConfig): VDTDocument =>
    buildDocument({ markdown: `${markdown}\n\n${'Body text. '.repeat(400)}` }, config);
  const runningHead = (doc: VDTDocument): string[] => titleLines(doc.pages[doc.pages.length - 1]!.header);

  it('keeps the no-break space where the column parted the group', () => {
    for (const span of ['page', 'column'] as const) {
      const doc = build(`# ${title}`, glued(span, 40));
      // 'Capítulo XVIII:' is wider than the column at 40 pt: the heading
      // parts it at its no-break space and leaves the space out.
      expect(heading(doc).lines.slice(0, 2).map((l) => l.text)).toEqual(['Capítulo', 'XVIII:']);
      // The review's probe printed '[CapítuloXVIII: …]' in both.
      expect(titleLines(bandOf(doc))).toEqual([`[${title}]`]);
      expect(runningHead(doc)).toEqual([`[${title}]`]);
    }
  });

  it('does the same on the rich path, where the next line opens on the space', () => {
    const doc = build(`# *Capítulo*${NBSP}XVIII: la vuelta a casa`, glued('page', 40));
    const lines = heading(doc).lines;
    // The italic run and the one glued to it part where they meet, and the
    // second line opens on the no-break space. Its plain range starts
    // there too (the review's probe read 9–16, so 'XVIII:' touched 'la').
    expect(lines[1]!.text).toBe(`${NBSP}XVIII:`);
    expect([lines[1]!.plainStart, lines[1]!.plainEnd]).toEqual([8, 15]);
    expect(lines[2]!.plainStart).toBe(16);
    expect(titleLines(bandOf(doc))).toEqual([`[${title}]`]);
    expect(runningHead(doc)).toEqual([`[${title}]`]);
  });

  it('joins short glued titles and numbers the same way', () => {
    expect(titleLines(bandOf(build(`# Chapter${NBSP}One`, glued('page', 40))))).toEqual([`[Chapter${NBSP}One]`]);
    const doc = build(`# Los 300${NBSP}000`, glued('page', 60));
    expect(heading(doc).lines.map((l) => l.text)).toEqual(['Los', '300', '000']);
    expect(titleLines(bandOf(doc))).toEqual([`[Los 300${NBSP}000]`]);
    expect(runningHead(doc)).toEqual([`[Los 300${NBSP}000]`]);
  });

  it('keeps the default opener’s map back to the source', () => {
    // Without a design the heading is measured across the page, so the
    // glued group has to be wider than the page to be parted.
    const doc = build(`# ${title}`, glued('page', 72, false));
    expect(heading(doc).lines[0]!.text).toBe('Capítulo');
    const text = bandOf(doc)!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
    expect(text.sourceText).toBe(title);
    expect(text.sourceMap).toBeDefined();
  });
});

describe('reading a heading’s lines back as its title', () => {
  const line = (text: string, extra: Record<string, unknown> = {}) => ({ segments: [{ text }], ...extra });

  it('drops the hyphen a dictionary or soft-hyphen break added', () => {
    const lines = [line('The Sai-', { hyphenated: true, plainStart: 0, plainEnd: 7 }), line('lor’s Book', { plainStart: 7, plainEnd: 17 })];
    expect(headingTitleText(lines, '', undefined, -1)).toBe('The Sailor’s Book');
  });

  it('keeps a hard hyphen and the dash of a closed dash break, with no space after', () => {
    expect(headingTitleText([line('Word-', { hyphenated: true, hardHyphen: true }), line('Book')], '', undefined, -1)).toBe('Word-Book');
    expect(headingTitleText([line('then—', { hyphenated: true }), line('now')], '', undefined, -1)).toBe('then—now');
  });

  it('puts back the space a break took, once, whether or not the line kept it', () => {
    expect(headingTitleText([line('The '), line('Book')], '', undefined, -1)).toBe('The Book');
    expect(headingTitleText([line('The', { plainStart: 0, plainEnd: 3 }), line('Book', { plainStart: 4, plainEnd: 8 })], '', undefined, -1)).toBe('The Book');
    // A line that keeps the space in its own range touches the next one in
    // the plain text, but its space still separates the words.
    expect(headingTitleText([line('The ', { plainStart: 0, plainEnd: 4 }), line('Book', { plainStart: 4, plainEnd: 8 })], '', undefined, -1)).toBe('The Book');
    // Without a space, a line that touches the next one runs into it.
    expect(headingTitleText([line('Underst', { plainStart: 0, plainEnd: 7 }), line('anding', { plainStart: 7, plainEnd: 13 })], '', undefined, -1)).toBe('Understanding');
  });

  it('gives back the no-break space a divided group lost at the break', () => {
    // A group glued by a no-break space, wider than the line, is parted at
    // the space, which neither line keeps: the line is flagged hyphenated,
    // ends without a hyphen, and the next line starts one character on.
    const lines = [line('Capítulo', { hyphenated: true, plainStart: 0, plainEnd: 8 }), line('XVIII', { plainStart: 9, plainEnd: 14 })];
    expect(headingTitleText(lines, '', undefined, -1)).toBe('Capítulo XVIII');
    // A divided word whose break took nothing still joins with nothing.
    expect(headingTitleText([line('Underst', { hyphenated: true, plainStart: 0, plainEnd: 7 }), line('anding', { plainStart: 7, plainEnd: 13 })], '', undefined, -1)).toBe('Understanding');
    // And a line that opens on the no-break space keeps it.
    expect(headingTitleText([line('Capítulo', { plainStart: 0, plainEnd: 8 }), line(' XVIII', { plainStart: 8, plainEnd: 14 })], '', undefined, -1)).toBe('Capítulo XVIII');
  });

  it('drops the number prefix and keeps the marked runs', () => {
    const lines = [
      { segments: [{ text: '1 The' }, { text: ' ' }, { text: 'Sai-', italic: true }], hyphenated: true },
      { segments: [{ text: 'lor', italic: true }, { text: ' Book' }] },
    ];
    const title = defaultOpenerTitle(lines, '1', undefined, -1);
    expect(title.titleText).toBe('The Sailor Book');
    expect(title.marked).toBe('The *Sailor* Book');
  });
});

describe('{titleText} and the default opener with repeatHyphen (EF-162)', () => {
  const md = '# Guarda-chuvas e bem-aventurados vencedores-mores\n\nTexto.';
  const cfg = (width: number, repeatHyphen: boolean): PostextConfig => ({
    page: { width: mm(width), height: mm(200), dpi: 100 },
    layout: { layoutType: 'double' },
    bodyText: { repeatHyphen },
    headings: { levels: [{ level: 1, span: 'page', fontSize: pt(30) }] },
  });
  const bandText = (doc: VDTDocument): string =>
    (bandOf(doc)?.blocks ?? [])
      .flatMap((b) => (b.kind === 'text' ? b.lines.map((l) => l.text) : []))
      .join('|');

  for (const width of [70, 80]) {
    it(`drops the repeated hyphen from the title at ${width} mm`, () => {
      const doc = buildDocument({ markdown: md }, cfg(width, true));
      const h = heading(doc);
      expect(h.lines.some((l) => l.repeatedHyphen)).toBe(true);
      expect(headingTitleText(h.lines, '', h.titleBreaks, h.titleLength ?? -1))
        .toBe('Guarda-chuvas e bem-aventurados vencedores-mores');
      expect(bandText(doc)).toMatch(/bem-/);
      expect(bandText(doc)).not.toContain('--');
    });
  }

  it('reads the same title with and without repeatHyphen', () => {
    const on = heading(buildDocument({ markdown: md }, cfg(70, true)));
    const off = heading(buildDocument({ markdown: md }, cfg(70, false)));
    expect(headingTitleText(on.lines, '', on.titleBreaks, on.titleLength ?? -1))
      .toBe(headingTitleText(off.lines, '', off.titleBreaks, off.titleLength ?? -1));
  });
});
