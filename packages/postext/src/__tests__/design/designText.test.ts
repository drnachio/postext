import { describe, it, expect } from 'vitest';
import { layoutDesignSlot, type ResolvedTextPrimitive } from '../../design/layout';
import { resolveDesignSlot } from '../../defaults/headerFooter';
import { layoutSlotToVdt } from '../../pipeline/headerFooter';
import { buildDocument } from '../../pipeline';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement, DesignTextElement, PostextConfig } from '../../types';
import type { VDTDesignTextBlock, VDTPage } from '../../vdt';

// Deterministic text measurement stub (no DOM in the node test env): every
// character is 7px wide whatever the font, so widths read as char counts.
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

const DPI = 72; // 1pt = 1px keeps the arithmetic readable.
const pt = (value: number) => ({ value, unit: 'pt' as const });
const container = { x: 0, y: 0, width: 300, height: 200 };
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = {
  kind: 'header',
  page: stubPage,
  allPages: [stubPage],
  metadata: {},
  chapterTitleByPageIndex: [],
};

const text = (content: string, extra: Partial<DesignTextElement> = {}): DesignElement => ({
  kind: 'text',
  id: 't',
  content,
  fontSize: pt(10),
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(200) } },
  ...extra,
} as DesignElement);

const layoutOne = (el: DesignElement): ResolvedTextPrimitive =>
  layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container, dpi: DPI, placeholders }, 0).primitives[0] as ResolvedTextPrimitive;

const linesOf = (p: ResolvedTextPrimitive) => p.lines.map((l) => l.text);

describe('design text line breaks (EF-01)', () => {
  // The two characters `\` `n`, as an attribute value carries them.
  const ADDRESS = 'Firma X\\nStrasse 1\\n10115 Berlin';

  it('the `\\n` escape starts a new line in a plain wrapping text', () => {
    const p = layoutOne(text(ADDRESS, { overflow: 'wrap' }));
    expect(linesOf(p)).toEqual(['Firma X', 'Strasse 1', '10115 Berlin']);
    expect(p.height).toBeCloseTo(3 * 10 * 1.2, 5);
  });

  it('a line break starts a new line in the single-line overflow modes too', () => {
    // Default overflow (`ellipsis-end`): each line is truncated on its own.
    const narrow = { anchor: { to: 'container' as const, edge: 'top-left' as const }, size: { width: pt(56) } };
    const p = layoutOne(text(ADDRESS, { placement: narrow }));
    // Cut at the word boundary, with no space before the ellipsis (EF-76).
    expect(linesOf(p)).toEqual(['Firma X', 'Strasse…', '10115…']);
    const clipped = layoutOne(text('One\nTwo words', { overflow: 'clip', placement: narrow }));
    expect(linesOf(clipped)).toEqual(['One', 'Two words']);
    expect(clipped.needsClip).toBe(true);
    expect(clipped.lines[1]!.topY).toBeCloseTo(12, 5);
  });

  it('a text element that leaves fontSize out gets the documented 8pt (EF-54)', () => {
    const el = { kind: 'text', id: 't', content: 'Folio', placement: { anchor: { to: 'container', edge: 'top-left' } } } as unknown as DesignElement;
    const p = layoutOne(el);
    expect(p.fontSizePx).toBe(8);
    expect(p.fontString).toBe('8px EB Garamond');
    expect(p.height).toBeCloseTo(8 * 1.2, 5);
  });

  it('a text without line breaks is laid out as before', () => {
    const p = layoutOne(text('A running head'));
    expect(linesOf(p)).toEqual(['A running head']);
    expect(p.lines[0]!.runs).toBeUndefined();
  });

  it('a heading attribute with `\\n` prints one line per part in an opener', () => {
    const config: PostextConfig = {
      page: { width: pt(400), height: pt(600), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } },
      header: { elements: [] },
      footer: { elements: [] },
      headings: {
        levels: [{
          level: 1,
          span: 'page',
          breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: {
            enabled: true,
            slot: { elements: [text('{attr.to}', { id: 'to', overflow: 'wrap' })] },
          },
        }],
      },
    };
    const doc = buildDocument({ markdown: '# Letter {to="Firma X\\nStrasse 1\\n10115 Berlin"}\n\nDear Sirs.' }, config);
    const band = doc.pages[0]!.openerBand!;
    const block = band.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock;
    expect(block.lines.map((l) => l.text)).toEqual(['Firma X', 'Strasse 1', '10115 Berlin']);
  });

  it('a `\\\\` title break splits an opener title in the default overflow mode too', () => {
    const config: PostextConfig = {
      page: { width: pt(400), height: pt(600), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } },
      header: { elements: [] },
      footer: { elements: [] },
      headings: {
        levels: [{
          level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: { enabled: true, slot: { elements: [text('{titleText}', { id: 'ttl' })] } },
        }],
      },
    };
    const doc = buildDocument({ markdown: '# Concepts of health \\\\ Community health\n\nText.' }, config);
    const block = doc.pages[0]!.openerBand!.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock;
    expect(block.lines.map((l) => l.text)).toEqual(['Concepts of health', 'Community health']);
  });

  // The escape belongs to what the author writes in the design: the
  // element's own content and heading attribute values. Document text
  // that merely contains the two characters (a code span in a title, a
  // frontmatter value) is printed as written.
  const escapesConfig = (titleExtra: Partial<DesignTextElement> = {}): PostextConfig => ({
    page: { width: pt(500), height: pt(600), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } },
    layout: { layoutType: 'single' },
    header: {
      elements: [
        text('{chapterTitle}', { id: 'rh', overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: pt(400) } } }),
        text('{title}', { id: 'book', overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(400) } } }),
      ],
    },
    footer: { elements: [] },
    headings: {
      levels: [{
        level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
        advancedDesign: { enabled: true, slot: { elements: [text('{titleText}', { id: 'ttl', overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(400) } }, ...titleExtra })] } },
      }],
    },
  });
  const ESCAPES_MD = '---\ntitle: Notes on \\n escapes\n---\n\n# Escapes: `\\n` and `\\t`\n\n' + 'Body text. '.repeat(400);
  const headerTexts = (doc: ReturnType<typeof buildDocument>) => doc.pages
    .flatMap((p) => p.header?.blocks ?? [])
    .filter((b): b is VDTDesignTextBlock => b.kind === 'text')
    .map((b) => b.lines.map((l) => l.text));

  it('document text holding the characters `\\n` stays on one line in running heads and openers', () => {
    const doc = buildDocument({ markdown: ESCAPES_MD }, escapesConfig());
    const opener = doc.pages[0]!.openerBand!.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock;
    expect(opener.lines.map((l) => l.text)).toEqual(['Escapes: \\n and \\t']);
    const heads = headerTexts(doc);
    expect(heads).toContainEqual(['Escapes: \\n and \\t']);
    expect(heads).toContainEqual(['Notes on \\n escapes']);
    expect(heads.every((lines) => lines.length === 1)).toBe(true);
  });

  it('the paragraph path (indent, drop cap) leaves document text as written too', () => {
    const indented = buildDocument({ markdown: ESCAPES_MD }, escapesConfig({ paragraphIndent: pt(12) }));
    const a = indented.pages[0]!.openerBand!.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock;
    expect(a.lines.map((l) => l.text)).toEqual(['Escapes: \\n and \\t']);
    const capped = buildDocument({ markdown: ESCAPES_MD }, escapesConfig({ dropCap: { lines: 1 } }));
    const main = capped.pages[0]!.openerBand!.blocks.filter((b) => b.kind === 'text') as VDTDesignTextBlock[];
    expect(main.map((b) => b.lines.map((l) => l.text).join('|'))).toContain('scapes: \\n and \\t');
  });

  it('the escape still applies to the content template and, in headers, to the chapter attribute', () => {
    const upper = layoutOne(text('Line one\\nline two', { overflow: 'wrap', textTransform: 'uppercase' }));
    expect(linesOf(upper)).toEqual(['LINE ONE', 'LINE TWO']);
    const config: PostextConfig = {
      page: { width: pt(400), height: pt(600), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } },
      header: { elements: [text('{attr.to}', { id: 'to', overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: pt(300) } } })] },
      footer: { elements: [] },
    };
    const doc = buildDocument({ markdown: '# Letter {to="Firma X\\nStrasse 1"}\n\n' + 'Dear Sirs. '.repeat(300) }, config);
    const lines = doc.pages.flatMap((p) => p.header?.blocks ?? []).filter((b) => b.kind === 'text').map((b) => (b as VDTDesignTextBlock).lines.map((l) => l.text));
    expect(lines).toContainEqual(['Firma X', 'Strasse 1']);
  });

  it('inline marks in a heading attribute become runs in the opener', () => {
    const config: PostextConfig = {
      page: { width: pt(400), height: pt(600), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } },
      header: { elements: [] },
      footer: { elements: [] },
      headings: {
        levels: [{
          level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: { enabled: true, slot: { elements: [text('{attr.authors}', { id: 'authors', inlineMarks: true, overflow: 'wrap' })] } },
        }],
      },
    };
    const doc = buildDocument({ markdown: '# Snow {authors="Ana Ruiz^1^, Luis Gil^2^"}\n\nText.' }, config);
    const block = doc.pages[0]!.openerBand!.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock;
    expect(block.lines[0]!.text).toBe('Ana Ruiz1, Luis Gil2');
    expect(block.lines[0]!.runs!.filter((r) => r.baselineShift !== undefined).map((r) => r.text)).toEqual(['1', '2']);
    // The source range still maps back to the attribute, without a
    // per-character map (the markers are gone from the printed text).
    expect(block.sourceStart).toBeDefined();
    expect(block.sourceMap).toBeUndefined();
  });

  it('keeps the per-character source map when inline marks leave the mapped value as it is', () => {
    const config = (content: string): PostextConfig => ({
      page: { width: pt(400), height: pt(600), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(40), right: pt(40) } },
      header: { elements: [] },
      footer: { elements: [] },
      headings: {
        levels: [{
          level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' },
          advancedDesign: { enabled: true, slot: { elements: [text(content, { id: 'ttl', inlineMarks: true, overflow: 'wrap' })] } },
        }],
      },
    });
    const titleOf = (markdown: string, content: string) =>
      buildDocument({ markdown }, config(content)).pages[0]!.openerBand!.blocks.find((b) => b.kind === 'text') as VDTDesignTextBlock;
    // A title with no markers, with the option on.
    const plain = titleOf('# Snow cover\n\nText.', '{titleText}');
    expect(plain.sourceText).toBe('Snow cover');
    expect(plain.sourceMap).toEqual([...'Snow cover'].map((_, i) => 2 + i));
    // Marks around the placeholder style the value but keep its characters.
    const bold = titleOf('# Snow cover\n\nText.', '**{titleText}**');
    expect(bold.lines[0]!.runs![0]!.fontString).toMatch(/^700 /);
    expect(bold.sourceMap).toHaveLength('Snow cover'.length);
    // A title's own marks are gone from `{titleText}` already, and its map
    // skips them. (A value whose markers the element drops keeps only its
    // range: see the attribute test above.)
    const marked = titleOf('# E = mc^2^\n\nText.', '{titleText}');
    expect(marked.lines[0]!.text).toBe('E = mc2');
    expect(marked.sourceMap).toEqual([2, 3, 4, 5, 6, 7, 9]);
  });
});

describe('inline marks in design text (EF-25)', () => {
  it('leaves markers literal unless inlineMarks is on', () => {
    const p = layoutOne(text('**Bold** and ^1^'));
    expect(linesOf(p)).toEqual(['**Bold** and ^1^']);
    expect(p.lines[0]!.runs).toBeUndefined();
  });

  it('sets superscripts smaller and raised, in runs painted one after another', () => {
    const p = layoutOne(text('Ana Ruiz^1^, Luis Gil^2^', { inlineMarks: true }));
    expect(linesOf(p)).toEqual(['Ana Ruiz1, Luis Gil2']);
    const runs = p.lines[0]!.runs!;
    expect(runs.map((r) => r.text)).toEqual(['Ana Ruiz', '1', ', Luis Gil', '2']);
    expect(runs[0]!.fontString).toBe(p.fontString);
    expect(runs[0]!.baselineShift).toBeUndefined();
    // The script size and shift of the body text: 0.583 and 0.333 of 10px.
    expect(runs[1]!.fontString).toMatch(/^5\.8\d*px /);
    expect(runs[1]!.baselineShift).toBeCloseTo(-3.33, 2);
    expect(p.lines[0]!.width).toBeCloseTo(runs.reduce((s, r) => s + r.width, 0), 5);
  });

  it('sets bold at weight 700 and flips the slant of italic runs', () => {
    const bold = layoutOne(text('A **strong** word', { inlineMarks: true }));
    expect(bold.lines[0]!.runs!.map((r) => r.text)).toEqual(['A ', 'strong', ' word']);
    expect(bold.lines[0]!.runs![1]!.fontString).toMatch(/^700 10px /);
    // An italic element: `*…*` sets roman, as emphasis inside italic does.
    const italic = layoutOne(text('In *Don Quijote* now', { inlineMarks: true, italic: true }));
    const runs = italic.lines[0]!.runs!;
    expect(runs[0]!.fontString).toMatch(/^italic /);
    expect(runs[1]!.text).toBe('Don Quijote');
    expect(runs[1]!.fontString).not.toMatch(/italic/);
    // A heavier element keeps its weight in bold runs.
    const heavy = layoutOne(text('**x**', { inlineMarks: true, fontWeight: 900 }));
    expect(heavy.lines[0]!.runs![0]!.fontString).toMatch(/^900 10px /);
  });

  it('wraps marked text by words, carrying the runs across lines', () => {
    const p = layoutOne(text('aaa **bbb** ccc', {
      inlineMarks: true,
      overflow: 'wrap',
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(60) } },
    }));
    expect(linesOf(p)).toEqual(['aaa bbb', 'ccc']);
    expect(p.lines[0]!.runs!.map((r) => r.text)).toEqual(['aaa ', 'bbb']);
    expect(p.lines[1]!.runs!.map((r) => r.text)).toEqual(['ccc']);
    expect(p.lines[1]!.topY).toBeCloseTo(12, 5);
  });

  it('keeps the drop cap and paragraph indents on marked text', () => {
    const p = layoutDesignSlot(resolveDesignSlot({
      elements: [text('Once **upon** a time\\nThe *end* came', {
        inlineMarks: true,
        overflow: 'wrap',
        dropCap: { lines: 1, gap: pt(0) },
        paragraphIndent: pt(14),
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(300) } },
      })],
    }), { container, dpi: DPI, placeholders }, 0).primitives as ResolvedTextPrimitive[];
    const [main, cap] = p;
    expect(cap!.lines[0]!.text).toBe('O');
    expect(main!.lines.map((l) => l.text)).toEqual(['nce upon a time', 'The end came']);
    expect(main!.lines[0]!.runs!.map((r) => r.text)).toEqual(['nce ', 'upon', ' a time']);
    expect(main!.lines[0]!.xOffset).toBeGreaterThan(0); // beside the cap
    expect(main!.lines[1]!.xOffset).toBe(14); // the second paragraph's indent
    expect(main!.lines[1]!.runs!.map((r) => r.text)).toEqual(['The ', 'end', ' came']);
  });

  it('breaks an overlong marked word by character when it cannot wrap at a space', () => {
    const p = layoutOne(text('**abcdefghij**', {
      inlineMarks: true,
      overflow: 'wrap',
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(30) } },
    }));
    expect(linesOf(p)).toEqual(['abcd', 'efgh', 'ij']);
    expect(p.lines.every((l) => l.runs!.length === 1 && l.runs![0]!.fontString.startsWith('700 '))).toBe(true);
  });

  it('truncates marked text with an ellipsis in the style of the last visible run', () => {
    const p = layoutOne(text('**abcdefgh**', {
      inlineMarks: true,
      placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(40) } },
    }));
    expect(linesOf(p)).toEqual(['abcd…']);
    const runs = p.lines[0]!.runs!;
    expect(runs).toHaveLength(1);
    expect(runs[0]!.fontString).toMatch(/^700 /);
  });

  it('reads marks in placeholder values too', () => {
    const heading: DesignPlaceholderContext = {
      ...placeholders,
      kind: 'heading',
      heading: { titleText: 'T', formattedNumber: '', chapterNumber: '', attrs: { authors: 'Ana^1^' } },
    };
    const el = text('{attr.authors}', { inlineMarks: true });
    const p = layoutDesignSlot(resolveDesignSlot({ elements: [el] }), { container, dpi: DPI, placeholders: heading }, 0)
      .primitives[0] as ResolvedTextPrimitive;
    expect(p.lines[0]!.runs!.map((r) => r.text)).toEqual(['Ana', '1']);
  });

  it('carries the runs to the VDT block, which keeps the plain line text', () => {
    const slot = layoutSlotToVdt(
      resolveDesignSlot({ elements: [text('H~2~O', { inlineMarks: true })] }),
      container,
      0,
      placeholders,
      DPI,
    )!;
    const block = slot.blocks[0] as VDTDesignTextBlock;
    expect(block.lines[0]!.text).toBe('H2O');
    expect(block.lines[0]!.runs!.map((r) => [r.text, r.baselineShift !== undefined && r.baselineShift > 0])).toEqual([
      ['H', false],
      ['2', true],
      ['O', false],
    ]);
  });
});

describe('text stroke (EF-25)', () => {
  it('resolves the outline to px and the text colour by default', () => {
    const el = text('1863', { stroke: { width: pt(1.5), hollow: true }, color: { hex: '#123456', model: 'hex' } });
    const p = layoutOne(el);
    expect(p.stroke).toEqual({ widthPx: 1.5, color: '#123456', hollow: true });
    const slot = layoutSlotToVdt(resolveDesignSlot({ elements: [el] }), container, 0, placeholders, DPI)!;
    expect((slot.blocks[0] as VDTDesignTextBlock).stroke).toEqual({ widthPx: 1.5, color: '#123456', hollow: true });
  });

  it('draws no outline for a zero width and follows a part palette override', () => {
    expect(layoutOne(text('x', { stroke: { width: pt(0) } })).stroke).toBeUndefined();
    const el = text('x', { stroke: { width: pt(1), color: { hex: '#000000', model: 'hex', paletteId: 'band' } } });
    const recoloured = layoutDesignSlot(
      resolveDesignSlot({ elements: [el] }),
      { container, dpi: DPI, placeholders: { ...placeholders, partPaletteByPageIndex: [{ band: '#ff0000' }] } },
      0,
    ).primitives[0] as ResolvedTextPrimitive;
    expect(recoloured.stroke).toEqual({ widthPx: 1, color: '#ff0000' });
  });
});
