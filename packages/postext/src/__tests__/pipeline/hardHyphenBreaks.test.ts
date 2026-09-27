import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../pipeline';
import { computeChapterTitles } from '../../pipeline/placeholders';
import { setHyphenationLocale } from '../../hyphenate';
import { uppercasePreservingLength } from '../../pipeline/buildBlockKind';
import type { VDTBlock, VDTLine } from '../../vdt';

// EF-140: a line broken after a hard hyphen ("meta-" | "analyses") is flagged
// `hyphenated` like a syllable break, although the hyphen is the text's own.
// Readers that drop an added hyphen (the Sandbox caret, running heads) then
// dropped a character of the text. Such a line now also carries
// `hardHyphen`, and its source range covers the hyphen.

// Deterministic stub: every character, the space included, is 7 px wide;
// bold ones 8 px, so a bold word sends the paragraph to the rich breaker.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * (/bold|700/.test(this.font) ? 8 : 7) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

afterEach(() => setHyphenationLocale('en-us'));

const MD = 'The **difference** points the same way as the meta-analyses of Delgado and the well-known self-regulated study of peer-reviewed long-term follow-up data, which the co-authors re-examined.';

// The same paragraph without formatting: set by the plain breakers.
const MD_PLAIN = MD.replace(/\*\*/g, '');

const mm = (value: number) => ({ value, unit: 'mm' as const });

function docAt(markdown: string, width: number, textAlign: 'left' | 'justify', hyphenate: boolean) {
  return buildDocument({ markdown }, {
    page: { width: mm(width), height: mm(400), margins: { top: mm(5), bottom: mm(5), left: mm(5), right: mm(5) } },
    layout: { layoutType: 'single' },
    bodyText: { textAlign, firstLineIndent: mm(0), hyphenation: { enabled: hyphenate, ragged: hyphenate } },
    header: { elements: [] },
    footer: { elements: [] },
  });
}

function linesAt(width: number, textAlign: 'left' | 'justify', hyphenate: boolean, markdown = MD): VDTLine[] {
  return docAt(markdown, width, textAlign, hyphenate).blocks.flatMap((b) => b.lines);
}

/** The source a line covers, with the bold markers taken out. */
const sourceOf = (line: VDTLine, markdown = MD): string => markdown.slice(line.sourceStart, line.sourceEnd).replace(/\*\*/g, '');

describe('a line broken after a hard hyphen (EF-140)', () => {
  for (const [textAlign, markdown] of [['justify', MD], ['left', MD], ['left', MD_PLAIN]] as const) {
    it(`carries hardHyphen and keeps its source aligned (${textAlign}${markdown === MD_PLAIN ? ', no formatting' : ''})`, () => {
      let hardBreaks = 0;
      for (let width = 40; width <= 90; width += 2) {
        for (const hyphenate of [true, false]) {
          const lines = linesAt(width, textAlign, hyphenate, markdown);
          for (const [i, line] of lines.entries()) {
            const src = sourceOf(line, markdown);
            const last = i === lines.length - 1;
            // A line that ends after a hyphen of the text.
            const onTextHyphen = !last && line.text.endsWith('-') && src.endsWith('-');
            if (onTextHyphen) {
              hardBreaks++;
              expect(line.hardHyphen, `${width} mm: ${JSON.stringify(line.text)}`).toBe(true);
            } else {
              expect(line.hardHyphen, `${width} mm: ${JSON.stringify(line.text)}`).toBeUndefined();
            }
            // The source holds what the line prints, less a hyphen the break
            // added.
            const printed = line.hyphenated && !line.hardHyphen ? line.text.replace(/-$/, '') : line.text;
            expect(src, `${width} mm`).toBe(printed.trimEnd());
          }
        }
      }
      expect(hardBreaks).toBeGreaterThan(0);
    });
  }
});

describe('a running head from a heading broken after a hard hyphen', () => {
  const block = (lines: Array<Pick<VDTLine, 'text' | 'hyphenated' | 'hardHyphen'>>): VDTBlock => ({
    id: 'h', type: 'heading', headingLevel: 1, pageIndex: 0, columnIndex: 0,
    bbox: { x: 0, y: 0, width: 0, height: 0 }, dirty: false, snappedToGrid: false,
    fontString: '', color: '', textAlign: 'left',
    lines: lines.map((l) => ({ ...l, bbox: { x: 0, y: 0, width: 0, height: 0 }, baseline: 0 })),
  });

  it('keeps the hyphen of the text and joins the word', () => {
    const titles = computeChapterTitles([block([
      { text: 'A well-', hyphenated: true, hardHyphen: true },
      { text: 'known tale', hyphenated: false },
    ])], 1);
    expect(titles[0]).toBe('A well-known tale');
  });

  it('drops a hyphen the break added', () => {
    const titles = computeChapterTitles([block([
      { text: 'A fa-', hyphenated: true },
      { text: 'mous tale', hyphenated: false },
    ])], 1);
    expect(titles[0]).toBe('A famous tale');
  });

  it('reads a heading without formatting as written, whatever its line breaks', () => {
    // Set first-fit by pretext: a line ending after a hyphen or a dash, or
    // inside a word cut for width, is not `hyphenated`; the plain offsets
    // tell it from a break at a space.
    const title = 'A well-known and long-winded self-regulated chapter title—one more time';
    const seen = new Set<string>();
    for (let width = 20; width <= 90; width += 1) {
      const doc = docAt(`# ${title}\n\nText.`, width, 'left', false);
      const heading = doc.blocks.filter((b) => b.type === 'heading');
      for (const line of heading[0]!.lines.slice(0, -1)) seen.add(line.text.trimEnd().slice(-1));
      expect(computeChapterTitles(heading, 1)[0], `${width} mm`).toBe(title);
    }
    // Lines ended after a hyphen and after the dash along the way.
    expect(seen.has('-')).toBe(true);
    expect(seen.has('—')).toBe(true);
  });

  it('reads a heading set in capitals as set, whatever its line breaks', () => {
    // The joins compare the lines' plain offsets. A heading's `uppercase`
    // keeps every character whose capital is longer (`ß`, the `ﬁ`
    // ligature) as it is, so the plain text keeps its length and the
    // offsets their meaning.
    const title = 'Die große Straße—eine well-known Geschichte der ﬁnsteren Hafenstadt am Fluss';
    const shown = uppercasePreservingLength(title);
    expect(shown).toBe('DIE GROßE STRAßE—EINE WELL-KNOWN GESCHICHTE DER ﬁNSTEREN HAFENSTADT AM FLUSS');
    let broken = 0;
    for (let width = 20; width <= 90; width += 1) {
      const doc = buildDocument({ markdown: `# ${title}\n\nText.` }, {
        page: { width: mm(width), height: mm(400), margins: { top: mm(5), bottom: mm(5), left: mm(5), right: mm(5) } },
        layout: { layoutType: 'single' },
        headings: { levels: [{ level: 1, textTransform: 'uppercase' }] },
        header: { elements: [] },
        footer: { elements: [] },
      });
      const heading = doc.blocks.filter((b) => b.type === 'heading');
      if (heading[0]!.lines.length > 1) broken++;
      expect(computeChapterTitles(heading, 1)[0], `${width} mm`).toBe(shown);
    }
    expect(broken).toBeGreaterThan(0);
  });
});

describe('a word wider than the line cut right after its own hyphen', () => {
  // The cut for width added a hyphen after the text's own ("fisica--").
  const URL_MD = 'See https://github.com/openstax/osbooks-fisica-universitaria/tree/main/modules/chapter-two for the data.';
  // A web address cut for width breaks the rest of it at its own joints
  // (before a hyphen); a code with no joint, in a formatted paragraph, is
  // the one cut right after its hyphen.
  const CODE_MD = '**Part** ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOP-0123456789012345678901234567890 fits.';
  it('adds no second hyphen and flags the text’s own', () => {
    let cutsOnHyphen = 0;
    for (const md of [URL_MD, CODE_MD]) {
      for (let width = 18; width <= 60; width += 1) {
        for (const textAlign of ['left', 'justify'] as const) {
          const lines = linesAt(width, textAlign, false, md);
          for (const [i, line] of lines.entries()) {
            expect(line.text, `${width} mm`).not.toMatch(/--$/);
            const src = sourceOf(line, md);
            if (i < lines.length - 1 && line.text.endsWith('-') && src.endsWith('-')) {
              cutsOnHyphen++;
              expect(line.hardHyphen, `${width} mm: ${line.text}`).toBe(true);
            }
            const printed = line.hyphenated && !line.hardHyphen ? line.text.replace(/-$/, '') : line.text;
            expect(src, `${width} mm`).toBe(printed.trimEnd());
          }
        }
      }
    }
    expect(cutsOnHyphen).toBeGreaterThan(0);
  });
});
