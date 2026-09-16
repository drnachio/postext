import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { contentOutline } from '../pipeline/continuation';
import { computeOutline, hasTocDirective, outlineFromDoc, outlineKey, sameOutline } from '../pipeline/outline';
import { expandTocDirectives } from '../pipeline/toc';
import { parseMarkdown } from '../parse';
import { resolveAllConfig } from '../pipeline/config';
import { resolveTocConfig, stripTocDefaults } from '../defaults/toc';
import { dimensionToPx } from '../units';
import type { PostextConfig } from '../types';
import type { VDTBlock, VDTDesignTextBlock } from '../vdt';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const DPI = 300;

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `Paragraph ${i} with enough words to consume vertical space and force the column and page to overflow onto following pages.`,
  ).join('\n\n');

const base: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(300),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
    pageNumbering: { format: 'lower-roman', startAt: 1 },
  },
  layout: { layoutType: 'single' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
  headingStyles: [{ id: 'front', numbered: false }],
  toc: { subtitle: { enabled: true, attr: 'author' }, parts: { enabled: true } },
};

const book = `# Contents {style="front" toc="false"}

:::toc

# Preface {style="front"}

${filler(2)}

:::numbering{format="decimal" startAt=1}

:::part{number="I" title="Foundations" palette="band=#112233"}
:::

# The *lantern* {author="A. Author"}

${filler(3)}

# Trimming {author="B. Author"}

${filler(1)}`;

const tocBlocks = (doc: { blocks: VDTBlock[] }): VDTBlock[] => doc.blocks.filter((b) => b.contentIndex !== undefined && b.pageIndex === 0 && b.type !== 'heading');

describe(':::toc', () => {
  it('is a known directive and the parsed outline lists headings and parts in order', () => {
    const blocks = parseMarkdown(book);
    expect(hasTocDirective(blocks)).toBe(true);
    const outline = computeOutline(blocks, resolveAllConfig(base));
    expect(outline.map((e) => [e.kind, e.number, e.title, e.numbered, e.listed])).toEqual([
      ['heading', '', 'Contents', false, false],
      ['heading', '', 'Preface', false, true],
      ['part', 'I', 'Foundations', true, true],
      ['heading', '1', 'The lantern', true, true],
      ['heading', '2', 'Trimming', true, true],
    ]);
    // Headings carry no inline marks: the title is one plain run.
    expect(outline[3]!.spans).toEqual([{ text: 'The lantern', bold: false, italic: false }]);
    expect(outline[3]!.attrs).toEqual({ author: 'A. Author' });
    expect(outline[2]!.palette).toEqual({ band: '#112233' });
    expect(outline.every((e) => e.pageLabel === undefined)).toBe(true);
    // Continues the chapter ordinal of the content before it.
    const later = contentOutline({ markdown: '# Three' }, base, { headings: { h1: 2, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } });
    expect(later.outline[0]!.number).toBe('3');
    expect(later.hasToc).toBe(false);
  });

  it('expands into one block per listed entry, mapped back to the directive line', () => {
    const blocks = parseMarkdown(book);
    const resolved = resolveAllConfig(base);
    const outline = computeOutline(blocks, resolved);
    const expanded = expandTocDirectives(blocks, outline, resolved);
    const entries = expanded.filter((b) => b.toc);
    expect(entries.map((b) => [b.toc!.kind, b.text, b.toc!.number, b.toc!.subtitle])).toEqual([
      ['entry', 'Preface', '', undefined],
      ['part', '', 'I', undefined],
      ['entry', 'The lantern', '1', 'A. Author'],
      ['entry', 'Trimming', '2', 'B. Author'],
    ]);
    const directive = blocks.find((b) => b.type === 'directive' && b.directiveName === 'toc')!;
    for (const e of entries) {
      expect(e.sourceStart).toBe(directive.sourceStart);
      expect(e.sourceMap.every((o) => o === directive.sourceStart)).toBe(true);
    }
    expect(expanded.some((b) => b.type === 'directive' && b.directiveName === 'toc')).toBe(false);
    // Without an outline the blocks are returned untouched.
    expect(expandTocDirectives(blocks, undefined, resolved)).toBe(blocks);
  });

  it('lays the contents out with the page labels of the document itself', () => {
    const doc = buildDocument({ markdown: book }, base);
    // The numbering restarts at the part page (1); its blank verso is 2 and
    // the first chapter opens on 3.
    const one = doc.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('lantern'))!;
    const oneLabel = doc.pages[one.pageIndex]!.pageLabel;
    expect(oneLabel).toBe('3');
    expect(doc.pages.find((p) => p.partInfo)!.pageLabel).toBe('1');
    const preface = doc.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('Preface'))!;
    const prefaceLabel = doc.pages[preface.pageIndex]!.pageLabel;
    expect(prefaceLabel).toBe('iii');
    const entries = tocBlocks(doc);
    // Preface (unnumbered, flush), part row, two numbered entries.
    expect(entries).toHaveLength(4);
    const [pref, part, lantern, trimming] = entries;
    expect(pref!.type).toBe('paragraph');
    expect(pref!.lines[0]!.text).toBe(`Preface ${prefaceLabel}`);
    const label = pref!.lines[0]!.segments!.at(-1)!;
    expect(label.text).toBe(prefaceLabel);
    expect(label.fontString).toBeDefined();
    // The page number ends at the right edge of the column.
    const col = doc.pages[0]!.columns[0]!;
    const segs = pref!.lines[0]!.segments!;
    const width = segs.reduce((s, seg) => s + seg.width, 0);
    expect(pref!.lines[0]!.bbox.x + width).toBeCloseTo(col.bbox.x + col.bbox.width, 3);
    // Leader dots sit between the title and the number.
    expect(segs.some((s) => s.text.startsWith('...'))).toBe(true);
    // Part row: the design overlay carries number, title and page label.
    expect(part!.tocPart).toEqual({ number: 'I', title: 'Foundations', pageLabel: '1', palette: { band: '#112233' } });
    const overlayText = (part!.designOverlay!.blocks.filter((b) => b.kind === 'text') as VDTDesignTextBlock[]).map((b) => b.lines.map((l) => l.text).join(' '));
    expect(overlayText).toEqual(['I Foundations', '1']);
    const bodyPx = dimensionToPx(doc.config.bodyText.fontSize, DPI);
    expect(part!.bbox.height).toBeCloseTo(dimensionToPx(doc.config.toc.parts.height, DPI, bodyPx), 1);
    // Numbered entries: number as a right-aligned bullet, subtitle line under.
    expect(lantern!.type).toBe('listItem');
    expect(lantern!.bulletText).toBe('1');
    expect(lantern!.lines).toHaveLength(2);
    expect(lantern!.lines[0]!.text).toBe(`The lantern ${oneLabel}`);
    expect(lantern!.lines[1]!.text).toBe('A. Author');
    expect(lantern!.lines[1]!.segments![0]!.fontString).toContain('italic');
    expect(trimming!.bulletText).toBe('2');
    expect(trimming!.lines[0]!.text).toBe(`Trimming ${doc.pages[doc.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('Trimming'))!.pageIndex]!.pageLabel}`);
    // The outline derived from the document is what the contents printed.
    const outline = outlineFromDoc(doc, computeOutline(parseMarkdown(book), resolveAllConfig(base)));
    expect(outline.map((e) => e.pageLabel)).toEqual(['i', 'iii', '1', '3', trimming!.lines[0]!.text.split(' ').at(-1)]);
    expect(doc.pages[0]!.pageLabel).toBe('i');
  });

  it('spaces entries and part rows by their own margins, off the baseline grid', () => {
    const spaced: PostextConfig = {
      ...base,
      page: { ...base.page, baselineGrid: { enabled: true } },
      toc: {
        ...base.toc,
        levels: [{ level: 1, marginTop: pt(4) }],
        parts: { enabled: true, marginTop: pt(28), marginBottom: pt(4) },
      },
    };
    const doc = buildDocument({ markdown: book }, spaced);
    const [pref, part, lantern, trimming] = tocBlocks(doc);
    expect(pref!.tocEntry).toBe(true);
    expect(part!.tocEntry).toBeUndefined();
    expect(lantern!.tocEntry).toBe(true);
    const gap = (above: VDTBlock, below: VDTBlock) => below.bbox.y - (above.bbox.y + above.bbox.height);
    // The part row keeps its top margin (a paragraph-shaped block, whose
    // margin placement otherwise ignores) and its bottom margin.
    expect(gap(pref!, part!)).toBeCloseTo(dimensionToPx(pt(28), DPI), 1);
    expect(gap(part!, lantern!)).toBeCloseTo(dimensionToPx(pt(4), DPI), 1);
    // Consecutive entries sit one margin apart: an entry is not a list
    // tail snapped to the grid.
    expect(gap(lantern!, trimming!)).toBeCloseTo(dimensionToPx(pt(4), DPI), 1);
    expect(lantern!.snappedToGrid).toBe(false);
  });

  it('uses a host-supplied outline as is, without a second pass', () => {
    const outline = computeOutline(parseMarkdown(book), resolveAllConfig(base)).map((e) => ({ ...e, pageLabel: '42' }));
    const doc = buildDocument({ markdown: book, outline }, base);
    const entries = tocBlocks(doc);
    expect(entries[0]!.lines[0]!.text).toBe('Preface 42');
    expect(entries[1]!.tocPart!.pageLabel).toBe('42');
  });

  it('keys outlines by their content', () => {
    const a = computeOutline(parseMarkdown(book), resolveAllConfig(base));
    const b = computeOutline(parseMarkdown(book), resolveAllConfig(base));
    expect(sameOutline(a, b)).toBe(true);
    expect(outlineKey(a)).toBe(outlineKey(b));
    expect(sameOutline(a, a.map((e) => ({ ...e, pageLabel: '1' })))).toBe(false);
    expect(sameOutline(undefined, undefined)).toBe(true);
  });

  it('resolves and strips the toc config', () => {
    const resolved = resolveTocConfig(undefined, resolveAllConfig().bodyText);
    expect(resolved.levels.map((l) => l.level)).toEqual([1]);
    expect(resolved.leader).toEqual({ enabled: true, char: '.', gap: { value: 0.5, unit: 'em' } });
    expect(resolved.subtitle.enabled).toBe(false);
    expect(resolved.parts.enabled).toBe(true);
    expect(stripTocDefaults(undefined)).toBeUndefined();
    expect(stripTocDefaults({ levels: [{ level: 1 }], leader: { enabled: true, char: '.' }, parts: { enabled: true } })).toBeUndefined();
    expect(stripTocDefaults({ levels: [{ level: 1, fontWeight: 700 }], subtitle: { enabled: true } }))
      .toEqual({ levels: [{ level: 1, fontWeight: 700 }], subtitle: { enabled: true } });
  });
});
