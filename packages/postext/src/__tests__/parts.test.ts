import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { computePartValues } from '../pipeline/placeholders';
import { derivePartResolvedConfig, parsePartNumber, planParts } from '../pipeline/parts';
import { parseMarkdown } from '../parse';
import { resolveAllConfig } from '../pipeline/config';
import { dimensionToPx } from '../units';
import { stripConfigDefaults } from '../defaults';
import { resolvePartsConfig, stripPartsDefaults } from '../defaults/parts';
import type { DesignElement, PostextConfig } from '../types';
import type { VDTDesignTextBlock } from '../vdt';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const DPI = 300;
const px = (value: number) => dimensionToPx(pt(value), DPI);

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `Paragraph ${i} with enough words to consume vertical space and force the column and page to overflow onto following pages.`,
  ).join('\n\n');

/** Small two-column page; H1 breaks before with plain odd parity so the
 *  page sequence around a part is easy to predict. */
const base: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(240),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
  },
  layout: { layoutType: 'double' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
  parts: { margins: { top: pt(60), left: pt(30), right: pt(24), bottom: pt(12) } },
};

const partDoc = `${filler(2)}

:::part{number="I" title="Foundations"}
The chapters of this part.

- First chapter
- Second chapter

1. Numbered one
2. Numbered two
:::

# One

${filler(2)}`;

const textEl = (
  content: string,
  pages?: DesignElement['pages'],
): DesignElement => ({
  kind: 'text', id: `el-${content}`, pages, content, fontSize: pt(8), overflow: 'ellipsis-end',
  placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
});

describe(':::part placement', () => {
  it('opens a dedicated single-column page at parts.margins', () => {
    const doc = buildDocument({ markdown: partDoc }, base);
    const part = doc.pages.find((p) => p.partInfo);
    expect(part).toBeDefined();
    expect(part!.partInfo).toMatchObject({ number: 'I', title: 'Foundations' });
    // The title maps back to the `title="…"` attribute of the fence.
    expect(partDoc.slice(part!.partInfo!.titleSourceStart, part!.partInfo!.titleSourceEnd)).toBe('Foundations');
    const titleBlock = part!.openerBand?.blocks.find(
      (b): b is VDTDesignTextBlock => b.kind === 'text' && b.sourceStart !== undefined,
    );
    expect(titleBlock).toBeDefined();
    expect(partDoc.slice(titleBlock!.sourceStart, titleBlock!.sourceEnd)).toBe('Foundations');
    expect(part!.role).toBe('part');
    // Odd page (breakBefore.parity defaults to 'odd').
    expect((part!.index + 1) % 2).toBe(1);
    expect(part!.columns).toHaveLength(1);
    const col = part!.columns[0]!;
    expect(col.bbox.x).toBeCloseTo(px(30), 3);
    expect(col.bbox.y).toBeCloseTo(px(60), 3);
    expect(col.bbox.width).toBeCloseTo(px(360 - 30 - 24), 3);
    expect(col.bbox.height).toBeCloseTo(px(240 - 60 - 12), 3);
    expect(part!.contentArea).toEqual(col.bbox);
    // Regular pages keep the two-column layout and the page margins.
    expect(doc.pages[0]!.columns).toHaveLength(2);
    expect(doc.pages[0]!.contentArea.x).toBeCloseTo(px(18), 3);
  });

  it('flows the part body in that column with bodyStyle typography', () => {
    const cfg: PostextConfig = {
      ...base,
      parts: {
        ...base.parts,
        bodyStyle: {
          fontFamily: 'Literata',
          fontSize: pt(14),
          color: { hex: '#123456', model: 'hex' },
          bulletColor: { hex: '#ABCDEF', model: 'hex' },
          numberColor: { hex: '#FEDCBA', model: 'hex' },
        },
      },
    };
    const doc = buildDocument({ markdown: partDoc }, cfg);
    const part = doc.pages.find((p) => p.partInfo)!;
    const blocks = part.columns[0]!.blocks;
    const para = blocks.find((b) => b.type === 'paragraph')!;
    expect(para.fontString).toBe(`400 ${px(14)}px Literata`);
    expect(para.color).toBe('#123456');
    expect(para.bbox.x).toBeCloseTo(px(30), 3);
    const bullets = blocks.filter((b) => b.type === 'listItem' && b.listKind === 'unordered');
    expect(bullets.length).toBe(2);
    for (const b of bullets) expect(b.bulletColor).toBe('#ABCDEF');
    const numbers = blocks.filter((b) => b.type === 'listItem' && b.listKind === 'ordered');
    expect(numbers.length).toBe(2);
    for (const b of numbers) {
      expect(b.bulletColor).toBe('#FEDCBA');
      expect(b.bulletFontString).toContain('700 ');
      expect(b.fontString).toBe(`400 ${px(14)}px Literata`);
    }
    // Blocks outside the part keep the body typography.
    const outside = doc.pages[0]!.columns[0]!.blocks[0]!;
    expect(outside.fontString).not.toContain('Literata');
  });

  it('breakAfter moves the following content to a new page; the next chapter\'s odd parity adds the blank verso', () => {
    const doc = buildDocument({ markdown: partDoc }, base);
    const roles = doc.pages.map((p) => p.role);
    // filler → parity blank → part (odd) → parity blank (verso) → chapter (odd)
    expect(roles).toEqual(['body', 'blank', 'part', 'blank', 'opener']);
    expect(doc.pages[1]!.blankForParity).toBe(true);
    expect(doc.pages[3]!.blankForParity).toBe(true);
    const h1 = doc.blocks.find((b) => b.type === 'heading' && b.headingLevel === 1)!;
    expect(h1.pageIndex).toBe(4);
  });

  it('breakAfter disabled keeps the following content on the part page', () => {
    const cfg: PostextConfig = { ...base, parts: { ...base.parts, breakAfter: { enabled: false } } };
    const md = `${filler(1)}\n\n:::part{number="I" title="Foundations"}\nIntro.\n:::\n\nAfter the part.`;
    const doc = buildDocument({ markdown: md }, cfg);
    const part = doc.pages.find((p) => p.partInfo)!;
    const texts = part.columns[0]!.blocks.map((b) => b.lines.map((l) => l.text).join(' '));
    expect(texts).toEqual(['Intro.', 'After the part.']);
  });

  it('breakBefore parity inserts a blank only when needed', () => {
    // Content on page 0 (odd); next page is even → one parity blank.
    const odd = buildDocument({ markdown: `${filler(1)}\n\n:::part{title="P"}\n:::` }, base);
    expect(odd.pages.map((p) => p.role)).toEqual(['body', 'blank', 'part']);
    // parity 'any' → no blank.
    const any = buildDocument(
      { markdown: `${filler(1)}\n\n:::part{title="P"}\n:::` },
      { ...base, parts: { ...base.parts, breakBefore: { parity: 'any' } } },
    );
    expect(any.pages.map((p) => p.role)).toEqual(['body', 'part']);
    // A part at the document start lands on page 1 (no leading blank).
    const first = buildDocument({ markdown: `:::part{title="P"}\n:::\n\n${filler(1)}` }, base);
    expect(first.pages[0]!.partInfo).toMatchObject({ number: '', title: 'P' });
    expect(first.pages[0]!.role).toBe('part');
  });

  it('an empty-body part page still counts as content — consecutive parts never share a page', () => {
    const md = `:::part{number="I" title="A"}\n:::\n\n:::part{number="II" title="B"}\n:::`;
    const doc = buildDocument(
      { markdown: md },
      { ...base, parts: { ...base.parts, breakBefore: { parity: 'any' } } },
    );
    const parts = doc.pages.filter((p) => p.partInfo);
    expect(parts.map((p) => p.partInfo!.number)).toEqual(['I', 'II']);
    expect(parts.map((p) => p.role)).toEqual(['part', 'part']);
    expect(parts[0]!.index).not.toBe(parts[1]!.index);
  });

  it('is excluded from column balancing (forced break, single column)', () => {
    const doc = buildDocument({ markdown: partDoc }, base);
    expect(doc.converged).toBe(true);
    const part = doc.pages.find((p) => p.partInfo)!;
    // Blocks sit at the top of the single column, not stretched to the bottom.
    const col = part.columns[0]!;
    expect(col.blocks[0]!.bbox.y).toBeCloseTo(col.bbox.y, 3);
    expect(col.availableHeight).toBeGreaterThan(0);
  });
});

describe(':::part furniture and design', () => {
  it("part page has role 'part' and body-only header elements are hidden", () => {
    const cfg: PostextConfig = {
      ...base,
      header: { elements: [textEl('{pageNumber}', 'body'), textEl('PART', 'part')] },
    };
    const doc = buildDocument({ markdown: partDoc }, cfg);
    const part = doc.pages.find((p) => p.partInfo)!;
    expect(part.role).toBe('part');
    expect(part.header?.blocks).toHaveLength(1);
    expect(part.header?.blocks[0]).toMatchObject({ kind: 'text', lines: [{ text: 'PART' }] });
    const body = doc.pages[0]!;
    expect(body.header?.blocks).toHaveLength(1);
    expect(body.header?.blocks[0]).toMatchObject({ kind: 'text', lines: [{ text: '1' }] });
  });

  it('synthesises a default opener band with the number and title', () => {
    const doc = buildDocument({ markdown: partDoc }, base);
    const part = doc.pages.find((p) => p.partInfo)!;
    expect(part.openerBand).toBeDefined();
    // Container is the trim box (no cut lines → the page).
    expect(part.openerBand!.bbox).toEqual({ x: 0, y: 0, width: part.width, height: part.height });
    const text = part.openerBand!.blocks[0];
    expect(text).toMatchObject({ kind: 'text', lines: [{ text: 'I Foundations' }] });
    // Sits at the part body origin; the body column is not pushed down by it.
    expect(text!.bbox.x).toBeCloseTo(px(30), 3);
    expect(text!.bbox.y).toBeCloseTo(px(60), 3);
    expect(part.columns[0]!.bbox.y).toBeCloseTo(px(60), 3);
  });

  it('lays out parts.design against the page with the heading placeholder set (roman → {numberDecimal})', () => {
    const cfg: PostextConfig = {
      ...base,
      parts: {
        ...base.parts,
        design: {
          elements: [{
            kind: 'text', id: 'num', content: 'Part {numberDecimal}: {titleText} ({partNumber}/{chapterTitle})',
            fontSize: pt(8), overflow: 'ellipsis-end',
            placement: { anchor: { to: 'page', edge: 'top-right' }, size: { width: 'auto', height: 'auto' } },
          }],
        },
      },
    };
    const md = `# Zero\n\n${filler(1)}\n\n:::part{number="IV" title="Four"}\n:::\n\n# One\n\nBody.`;
    const doc = buildDocument({ markdown: md }, cfg);
    const part = doc.pages.find((p) => p.partInfo)!;
    expect(part.openerBand?.blocks[0]).toMatchObject({ kind: 'text', lines: [{ text: 'Part 4: Four (IV/Zero)' }] });
  });

  it('{partTitle}/{partNumber} resolve on following pages and on preceding blankForParity pages', () => {
    const cfg: PostextConfig = { ...base, footer: { elements: [textEl('{partNumber}-{partTitle}')] } };
    const doc = buildDocument({ markdown: partDoc }, cfg);
    const footers = doc.pages.map((p) => (p.footer?.blocks[0] as { lines: { text: string }[] }).lines[0]!.text);
    expect(doc.pages.map((p) => p.role)).toEqual(['body', 'blank', 'part', 'blank', 'opener']);
    expect(footers).toEqual(['-', 'I-Foundations', 'I-Foundations', 'I-Foundations', 'I-Foundations']);
  });
});

describe('computePartValues', () => {
  it('starts at the part page, propagates forward, and walks back over parity blanks only', () => {
    const pages = [
      {},
      { blankForForce: true },
      { blankForParity: true },
      { partInfo: { number: 'I', title: 'One' } },
      {},
      { blankForParity: true },
      { partInfo: { number: 'II', title: 'Two' } },
      { blankForForce: true },
    ];
    const { partTitleByPageIndex, partNumberByPageIndex } = computePartValues(pages);
    expect(partTitleByPageIndex).toEqual(['', '', 'One', 'One', 'One', 'Two', 'Two', 'Two']);
    expect(partNumberByPageIndex).toEqual(['', '', 'I', 'I', 'I', 'II', 'II', 'II']);
  });
});

describe('parsePartNumber', () => {
  it('parses decimals and roman numerals (either case), else undefined', () => {
    expect(parsePartNumber('7')).toBe(7);
    expect(parsePartNumber('IV')).toBe(4);
    expect(parsePartNumber('xii')).toBe(12);
    expect(parsePartNumber('MCMXCIV')).toBe(1994);
    expect(parsePartNumber('')).toBeUndefined();
    expect(parsePartNumber('A')).toBeUndefined();
    expect(parsePartNumber('IIII')).toBeUndefined();
  });
});

describe('planParts', () => {
  it('maps start/end markers and the enclosed blocks', () => {
    const blocks = parseMarkdown('Before.\n\n:::part{number="II" title="Two"}\nInside.\n:::\n\nAfter.');
    const plan = planParts(blocks);
    expect(plan.byStart.size).toBe(1);
    const [[startIdx, part]] = [...plan.byStart.entries()];
    expect(part).toMatchObject({ number: 'II', title: 'Two', startIdx });
    expect(plan.byEnd.get(part.endIdx)).toBe(part);
    expect(plan.byBlock[startIdx + 1]).toBe(part);
    expect(plan.byBlock[0]).toBeUndefined();
    expect(plan.byBlock[part.endIdx + 1]).toBeUndefined();
  });
});

describe('parts config defaults', () => {
  it('inherits margins from the page and typography from body/list configs', () => {
    const r = resolveAllConfig(base);
    expect(r.parts.breakBefore).toEqual({ parity: 'odd' });
    expect(r.parts.breakAfter).toEqual({ enabled: true, parity: 'any' });
    expect(r.parts.margins).toEqual({ top: pt(60), bottom: pt(12), left: pt(30), right: pt(24), mirror: false });
    expect(r.parts.design).toEqual({ elements: [] });
    expect(r.parts.bodyStyle.fontFamily).toBe(r.bodyText.fontFamily);
    expect(r.parts.bodyStyle.bulletColor).toEqual(r.unorderedLists.color);
    expect(r.parts.bodyStyle.numberColor).toEqual(r.orderedLists.color);
    const plain = resolveAllConfig();
    expect(plain.parts.margins).toEqual(plain.page.margins);
    expect(resolvePartsConfig(undefined, plain.page, plain.bodyText, plain.unorderedLists, plain.orderedLists))
      .toEqual(plain.parts);
  });

  it('strips static defaults and drops an empty section', () => {
    expect(stripPartsDefaults({ breakBefore: { parity: 'odd' }, breakAfter: { enabled: true, parity: 'any' } })).toBeUndefined();
    expect(stripPartsDefaults({ breakBefore: { parity: 'even' }, margins: { top: pt(60) } }))
      .toEqual({ breakBefore: { parity: 'even' }, margins: { top: pt(60) } });
    expect(stripConfigDefaults({ parts: { design: { elements: [] } } }).parts).toBeUndefined();
    expect(stripConfigDefaults({ parts: { bodyStyle: { fontFamily: 'Literata' } } }).parts)
      .toEqual({ bodyStyle: { fontFamily: 'Literata' } });
  });

  it('keeps list overrides as given and drops empty ones', () => {
    const ol = { separator: ')', separatorColor: { hex: '#FF0000', model: 'hex' as const }, levels: [{ level: 2, separatorGap: pt(1) }] };
    expect(stripPartsDefaults({ bodyStyle: { orderedLists: ol } })).toEqual({ bodyStyle: { orderedLists: ol } });
    expect(stripPartsDefaults({ bodyStyle: { orderedLists: {}, unorderedLists: { levels: [{ level: 2 }] } } })).toBeUndefined();
    const r = resolveAllConfig({ parts: { bodyStyle: { unorderedLists: { bulletChar: '–' } } } });
    expect(r.parts.bodyStyle.unorderedLists).toEqual({ bulletChar: '–' });
    expect(r.parts.bodyStyle.orderedLists).toBeUndefined();
  });
});

describe(':::part list overrides', () => {
  const RED = { hex: '#FF0000', model: 'hex' as const };
  const cfg: PostextConfig = {
    ...base,
    orderedLists: { levels: [{ level: 2, color: { hex: '#123456', model: 'hex' } }] },
    parts: {
      ...base.parts,
      bodyStyle: {
        numberColor: { hex: '#FEDCBA', model: 'hex' },
        unorderedLists: { bulletChar: '–', color: RED },
        orderedLists: {
          fontFamily: 'Optima',
          separator: ')',
          separatorFontFamily: 'DIN Pro',
          separatorColor: RED,
          separatorGap: pt(2),
        },
      },
    },
  };

  it('applies the overrides on top of the document lists inside the part only', () => {
    const doc = buildDocument({ markdown: partDoc }, cfg);
    const part = doc.pages.find((p) => p.partInfo)!;
    const blocks = part.columns[0]!.blocks;
    const bullets = blocks.filter((b) => b.type === 'listItem' && b.listKind === 'unordered');
    expect(bullets.length).toBe(2);
    for (const b of bullets) {
      expect(b.bulletText).toBe('–');
      expect(b.bulletColor).toBe('#FF0000');
    }
    const numbers = blocks.filter((b) => b.type === 'listItem' && b.listKind === 'ordered');
    expect(numbers.length).toBe(2);
    numbers.forEach((b, i) => {
      // Distinct separator style → number and separator are separate runs.
      expect(b.bulletText).toBe(`${i + 1}`);
      expect(b.bulletFontString).toContain('Optima');
      // `numberColor` shortcut still applies (no `color` in the override).
      expect(b.bulletColor).toBe('#FEDCBA');
      expect(b.separatorText).toBe(')');
      expect(b.separatorFontString).toContain('DIN Pro');
      expect(b.separatorColor).toBe('#FF0000');
      expect(b.separatorX).toBeGreaterThan(b.bulletOffsetX!);
    });
    // Outside the part the document lists are untouched.
    const outside = doc.blocks.filter((b) => b.type === 'listItem' && b.pageIndex !== part.index);
    for (const b of outside) {
      expect(b.separatorText).toBeUndefined();
      expect(b.bulletFontString).not.toContain('Optima');
    }
  });

  it('propagates list-wide overrides to inherited levels and keeps explicit level values', () => {
    const derived = derivePartResolvedConfig(resolveAllConfig(cfg));
    const ol = derived.orderedLists;
    expect(ol.fontFamily).toBe('Optima');
    expect(ol.separator).toBe(')');
    expect(ol.separatorFontFamily).toBe('DIN Pro');
    expect(ol.fontWeight).toBe(derived.bodyText.boldFontWeight);
    for (const l of ol.levels) {
      expect(l.fontFamily).toBe('Optima');
      expect(l.separator).toBe(')');
      expect(l.separatorFontFamily).toBe('DIN Pro');
      expect(l.separatorColor.hex).toBe('#FF0000');
    }
    // Level 2 had its own colour → keeps it; level 1 follows `numberColor`.
    expect(ol.levels[0]!.color.hex).toBe('#FEDCBA');
    expect(ol.levels[1]!.color.hex).toBe('#123456');
    const ul = derived.unorderedLists;
    expect(ul.bulletChar).toBe('–');
    expect(ul.levels.every((l) => l.bulletChar === '–' && l.color.hex === '#FF0000')).toBe(true);
    // A separator style that inherited the number style follows a number override.
    const followed = derivePartResolvedConfig(
      resolveAllConfig({ parts: { bodyStyle: { orderedLists: { fontFamily: 'Optima', italic: true } } } }),
    );
    expect(followed.orderedLists.separatorFontFamily).toBe('Optima');
    expect(followed.orderedLists.separatorItalic).toBe(true);
    expect(followed.orderedLists.levels[0]!.separatorFontFamily).toBe('Optima');
    // Per-level entries apply to their level only.
    const perLevel = derivePartResolvedConfig(
      resolveAllConfig({ parts: { bodyStyle: { orderedLists: { levels: [{ level: 2, separator: ':' }] } } } }),
    );
    expect(perLevel.orderedLists.levels[0]!.separator).toBe('.');
    expect(perLevel.orderedLists.levels[1]!.separator).toBe(':');
  });
});

describe(':::part verso design', () => {
  it('decorates the blank page after a part page with parts.versoDesign', () => {
    const config: PostextConfig = {
      ...base,
      parts: {
        ...base.parts,
        versoDesign: {
          elements: [{
            kind: 'box', id: 'bg',
            placement: { anchor: { to: 'page', edge: 'top-left' }, size: { width: 'fill', height: 'fill' } },
            style: { backgroundColor: { hex: '#e3e0d6', model: 'hex' } },
          }],
        },
      },
    };
    const doc = buildDocument({ markdown: partDoc }, config);
    const partIdx = doc.pages.findIndex((p) => p.partInfo);
    const verso = doc.pages[partIdx + 1]!;
    expect(verso.columns.every((c) => c.blocks.length === 0)).toBe(true);
    expect(verso.openerBand).toBeDefined();
    expect(verso.openerBand!.blocks[0]!.kind).toBe('box');
    // Only the verso gets it: the next content page has no band.
    const next = doc.pages[partIdx + 2];
    expect(next?.openerBand).toBeUndefined();
  });

  it('leaves the verso plain when versoDesign is empty', () => {
    const doc = buildDocument({ markdown: partDoc }, base);
    const partIdx = doc.pages.findIndex((p) => p.partInfo);
    expect(doc.pages[partIdx + 1]!.openerBand).toBeUndefined();
  });
});
