import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../measure/rich';
import { measureBlock } from '../measure/plain';
import { setHyphenationLocale } from '../hyphenate';
import { buildDocument } from '../pipeline';
import { layoutSlotToVdt } from '../pipeline/headerFooter';
import { computeChapterTitles } from '../pipeline/placeholders';
import { resolveDesignSlot } from '../defaults/headerFooter';
import type { InlineSpan } from '../parse';
import type { DesignElement, PostextConfig } from '../types';
import type { VDTBlock, VDTDesignTextBlock, VDTLine, VDTPage } from '../vdt';

// EF-66: a no-break space (U+00A0), a narrow no-break space (U+202F), a
// figure space (U+2007) and a zero-width no-break space (U+FEFF) glue their
// neighbours. They used to be break opportunities wherever the text was laid
// out word by word — the rich breaker (any paragraph with inline formatting,
// a :ref, tracking or a hyphenation zone), its Knuth–Plass path and design
// text — because JavaScript's `\s` matches them.

// Deterministic text measurement stub (no DOM in the node test env): every
// character, the space included, is 7 px wide.
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

const FONT = '16px Test';
const NBSP = '\u00A0';
const NNBSP = '\u202F';
const FIGURE = '\u2007';
const run = (text: string, bold = false): InlineSpan => ({ text, bold, italic: false });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });

afterEach(() => setHyphenationLocale('en-us'));

/** The pairs `a`–`b` a line may not separate: no line ends on `a` (or on
 *  the glue after it) while the next one opens with `b`. */
function splitPairs(lines: readonly { text: string }[], glued: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const end = lines[i - 1]!.text;
    const start = lines[i]!.text;
    for (const g of glued) {
      const [a, b] = g.split(/[\u00A0\u202F\u2007\uFEFF]/) as [string, string];
      if (end.replace(/[\s\u00A0\u202F\u2007\uFEFF]+$/, '').endsWith(a) && start.replace(/^[\s\u00A0\u202F\u2007\uFEFF]+/, '').startsWith(b)) {
        out.push(`${JSON.stringify(end)} / ${JSON.stringify(start)}`);
      }
    }
  }
  return out;
}

const WORDS = ['at', `37${NBSP}°C`, 'the', 'rate', `0.08${NNBSP}%`, 'and', `225${FIGURE}000`, 'km', 'of', `p.${NBSP}12`, 'more'];
const TEXT = Array.from({ length: 40 }, (_, i) => WORDS[i % WORDS.length]).join(' ');
const GLUED = [`37${NBSP}°C`, `0.08${NNBSP}%`, `225${FIGURE}000`, `p.${NBSP}12`];
const OPTIONS = [
  { textAlign: 'justify' as const, hyphenate: true, optimal: true },
  { textAlign: 'justify' as const, hyphenate: true, optimal: true, maxStretchRatio: 3 },
  { textAlign: 'justify' as const, hyphenate: true },
  { textAlign: 'left' as const, hyphenate: true },
  { textAlign: 'left' as const, hyphenate: true, hyphenationZonePx: 21 },
];

describe('no-break spaces (EF-66)', () => {
  it('the rich breaker never breaks at one, greedy or Knuth–Plass', () => {
    for (const options of OPTIONS) {
      for (let width = 70; width <= 280; width += 7) {
        // Inline formatting sends the paragraph down the rich path.
        const { lines } = measureRichBlock([run('Then', true), run(` ${TEXT}`)], FONT, FONT, FONT, FONT, width, 20, options);
        expect(splitPairs(lines, GLUED), `${JSON.stringify(options)} at ${width}px`).toEqual([]);
        // Nothing is lost: every glyph, the no-break spaces included, is set.
        expect(lines.map((l) => l.segments!.map((s) => s.text).join('')).join(' ')).toContain(`37${NBSP}°C`);
      }
    }
  });

  it('keeps the no-break space inside the word it glues, where justification leaves it alone', () => {
    const { lines } = measureRichBlock([run('Forty', true), run(` minutes later, at 37${NBSP}°C, the colours were mixed.`)], FONT, FONT, FONT, FONT, 150, 20, { textAlign: 'justify', optimal: true });
    const segs = lines.flatMap((l) => l.segments!);
    expect(segs.find((s) => s.text.includes(NBSP))).toMatchObject({ kind: 'text', text: `37${NBSP}°C,`, width: 7 * 6 });
    expect(segs.filter((s) => s.kind === 'space').every((s) => s.text === ' ')).toBe(true);
  });

  it('the plain breaker (pretext) keeps them too', () => {
    for (const options of OPTIONS.slice(0, 4)) {
      for (let width = 70; width <= 280; width += 7) {
        const { lines } = measureBlock(TEXT, FONT, width, 20, options);
        expect(splitPairs(lines, GLUED), `${JSON.stringify(options)} at ${width}px`).toEqual([]);
      }
    }
  });

  it('a glued group wider than the line breaks at its no-break space before any other cut', () => {
    // 8 characters per line: "300 000 000" (11) cannot fit whole.
    const { lines } = measureRichBlock([run('x', true), run(` 300${NBSP}000${NBSP}000 km`)], FONT, FONT, FONT, FONT, 56, 20, { textAlign: 'left', hyphenate: true });
    expect(lines.map((l) => l.text)).toEqual(['x', `300${NBSP}000`, '000 km']);
    for (const line of lines) expect(line.segments!.reduce((s, seg) => s + seg.width, 0)).toBeLessThanOrEqual(56);
  });

  it('so does one in a paragraph without inline formatting, which pretext would cut inside a number', () => {
    // Pretext cuts a word wider than the line between characters, glued or
    // not ("300 00" / "0 000"); a paragraph holding such a group is set
    // word by word instead, on every path, and breaks at its no-break spaces.
    const text = `x 300${NBSP}000${NBSP}000${NBSP}km`;
    for (const options of [{ textAlign: 'left' as const }, { textAlign: 'left' as const, hyphenate: true }, { textAlign: 'justify' as const }, { textAlign: 'justify' as const, hyphenate: true, optimal: true }]) {
      const { lines } = measureBlock(text, FONT, 45, 20, options);
      expect(lines.map((l) => l.text.trim()), JSON.stringify(options)).toEqual(['x', '300', '000', `000${NBSP}km`]);
    }
    // With a first-line indent the first line is the narrowest.
    const indented = measureBlock(`300${NBSP}000 then more`, FONT, 56, 20, { textAlign: 'left', firstLineIndentPx: 14 });
    expect(indented.lines.map((l) => l.text.trim())).toEqual(['300', `000 then`, 'more']);
    // A group that fits stays on the pretext path, glued.
    const fits = measureBlock(`a b c 300${NBSP}000 d`, FONT, 56, 20, { textAlign: 'left' });
    expect(fits.lines.map((l) => l.text.trim())).toEqual(['a b c', `300${NBSP}000`, 'd']);
  });

  it('holds in paragraphs with inline formatting, the case the Cookbook reports found (EF-66 addendum)', () => {
    // 1.4.1 kept U+00A0 in plain paragraphs but broke at it in any paragraph
    // with an italic or bold run: "right or" / "wrong," beside *flere omnes*.
    const glued = [`or${NBSP}wrong,`, `January${NBSP}1818`, `225${NNBSP}000`, `37${NBSP}°C`];
    const text = Array.from({ length: 12 }, (_, i) => `what is it that we do not lay the fault to, right or${NBSP}wrong, that we may quarrel ${i % 2 ? `in January${NBSP}1818 with 225${NNBSP}000 men` : `at 37${NBSP}°C`}`).join(' ');
    for (const options of OPTIONS) {
      for (let width = 70; width <= 280; width += 7) {
        const { lines } = measureRichBlock([run(text), { text: ' flere omnes', bold: false, italic: true }, run('.')], FONT, FONT, FONT, FONT, width, 20, options);
        expect(splitPairs(lines, glued), `${JSON.stringify(options)} at ${width}px`).toEqual([]);
      }
    }
  });

  it('holds in a whole document: a paragraph with a :ref and one with italics', () => {
    const config: PostextConfig = {
      page: { sizePreset: 'custom', width: mm(60), height: mm(200), dpi: 150, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
      bodyText: { fontFamily: 'Test', fontSize: pt(8), lineHeight: pt(11), textAlign: 'justify', firstLineIndent: pt(0) },
    };
    for (let w = 40; w <= 90; w += 1) {
      const doc = buildDocument({ markdown: `*Read* ${TEXT}\n\nSee :ref{id="fig"} and ${TEXT}` }, { ...config, page: { ...config.page!, width: mm(w + 20) } });
      const lines: VDTLine[] = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines)));
      expect(splitPairs(lines, GLUED), `${w} mm`).toEqual([]);
    }
  });

  it('design text (running heads, openers) keeps them too, with and without inline marks', () => {
    const page = { index: 0, pageLabel: '1' } as unknown as VDTPage;
    const context = { kind: 'header' as const, page, allPages: [page], metadata: {}, chapterTitleByPageIndex: [] };
    for (const content of [`Fig.${NBSP}3 and 37${NBSP}°C`, `**Fig.${NBSP}3** and 37${NBSP}°C`]) {
      // From 42 px on, "Fig. 3" (6 characters) fits a line.
      for (let width = 42; width <= 160; width += 7) {
        const el: DesignElement = {
          kind: 'text',
          id: 't',
          placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: pt(0), y: pt(0) }, size: { width: 'fill', height: 'auto' } },
          content,
          fontSize: pt(12),
          overflow: 'wrap',
          inlineMarks: content.includes('**'),
        };
        const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), { x: 0, y: 0, width, height: 300 }, 0, context, 72);
        const block = slot?.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text');
        expect(splitPairs(block!.lines, [`Fig.${NBSP}3`, `37${NBSP}°C`]), `${content} at ${width}px`).toEqual([]);
      }
      // Narrower, the group parts at its no-break space, which neither line keeps.
      const marked = content.includes('**');
      const el: DesignElement = {
        kind: 'text',
        id: 't',
        placement: { anchor: { to: 'container', edge: 'top-left' }, offset: { x: pt(0), y: pt(0) }, size: { width: 'fill', height: 'auto' } },
        content: marked ? `x **Fig.${NBSP}3**` : `x Fig.${NBSP}3`,
        fontSize: pt(12),
        overflow: 'wrap',
        inlineMarks: marked,
      };
      const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), { x: 0, y: 0, width: 35, height: 300 }, 0, context, 72);
      const block = slot?.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text');
      expect(block!.lines.map((l) => l.text)).toEqual(['x', 'Fig.', '3']);
    }
  });

  it('a running head keeps the no-break spaces of its heading', () => {
    const line = (text: string): VDTLine => ({ text, bbox: { x: 0, y: 0, width: 0, height: 0 }, baseline: 0, hyphenated: false });
    const h1 = { id: 'h1', type: 'heading', bbox: { x: 0, y: 0, width: 0, height: 0 }, lines: [line(`Chapter${NBSP}3: `), line(`37${NBSP}°C`)], pageIndex: 0, columnIndex: 0, dirty: false, snappedToGrid: false, fontString: '', color: '', textAlign: 'left', headingLevel: 1 } as VDTBlock;
    expect(computeChapterTitles([h1], 1)).toEqual([`Chapter${NBSP}3: 37${NBSP}°C`]);
  });

  it('a link over a glued group still reaches every glyph of it', () => {
    const config: PostextConfig = {
      page: { sizePreset: 'custom', width: mm(50), height: mm(200), dpi: 150, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
      bodyText: { fontFamily: 'Test', fontSize: pt(8), lineHeight: pt(11), textAlign: 'left', firstLineIndent: pt(0) },
    };
    const doc = buildDocument({ markdown: `*Warm* water at [37${NBSP}°C](https://example.org/t) mixes the colours.` }, config);
    const segs = doc.pages[0]!.columns[0]!.blocks[0]!.lines.flatMap((l) => l.segments ?? []);
    expect(segs.find((s) => s.text.startsWith('37'))).toMatchObject({ text: `37${NBSP}°C`, href: 'https://example.org/t' });
  });

  it('a no-break space beside a chip still keeps the chip style\'s gap', () => {
    const px = (value: number) => ({ value, unit: 'px' as const });
    const config: PostextConfig = {
      page: { width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
      bodyText: { textAlign: 'left', hyphenation: { enabled: false } },
      chipStyles: [{ id: 'c', gap: px(20) }],
    };
    const doc = buildDocument({ markdown: `word :chip[a]{style="c"}${NBSP}end and :chip[b]{style="c"}${NBSP}:chip[c]{style="c"} more` }, config);
    const chips = doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).filter((s) => s.kind === 'chip').map((s) => s.chip!);
    // 7 px no-break space, 20 px gap: 13 px inside the chip's advance.
    expect(chips[0]!.marginRight).toBeCloseTo(13, 6);
    // Between two chips the shortfall is shared.
    expect(chips[1]!.marginRight).toBeCloseTo(6.5, 6);
    expect(chips[2]!.marginLeft).toBeCloseTo(6.5, 6);
  });
});
