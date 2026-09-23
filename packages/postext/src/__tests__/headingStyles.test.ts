import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { continuationAfter } from '../pipeline/continuation';
import { parseMarkdown } from '../parse';
import { resolveAllConfig } from '../pipeline/config';
import { computeSectionStyles, planHeadingSections } from '../pipeline/headingStyles';
import { resolveHeadingStylesConfig, stripHeadingStylesDefaults } from '../defaults/headingStyles';
import { stripConfigDefaults } from '../defaults';
import { dimensionToPx } from '../units';
import type { DesignElement, HeadingStyleConfig, PostextConfig } from '../types';
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

const textEl = (id: string, content: string): DesignElement => ({
  kind: 'text', id, content, fontSize: pt(8), overflow: 'ellipsis-end',
  placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
});

const frontStyle: HeadingStyleConfig = {
  id: 'front',
  numbered: false,
  breakBefore: { enabled: true, parity: 'odd' },
  header: { elements: [textEl('frontHead', 'FRONT {chapterTitle} {chapterNumber}')] },
  margins: { left: pt(60), right: pt(18) },
  layout: { layoutType: 'single' },
  palette: { band: '#123456' },
};

/** Small two-column page; H1 breaks before with plain odd parity. */
const base: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(240),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
  },
  layout: { layoutType: 'double' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] },
  header: { elements: [textEl('bodyHead', 'BODY {chapterTitle} {chapterNumber}')] },
  headingStyles: [frontStyle],
};

const doc = `# Preface {style="front"}

${filler(40)}

# One

${filler(2)}

# Two

${filler(1)}`;

const headerText = (page: { header?: { blocks: { kind: string }[] } }): string =>
  (page.header?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text').map((b) => b.lines.map((l) => l.text).join(' ')).join(' | ');

describe('heading styles', () => {
  it('resolve merges level overrides and inherits section fields from the page and body', () => {
    const resolved = resolveAllConfig(base);
    const [front] = resolved.headingStyles;
    expect(front!.numbered).toBe(false);
    expect(front!.toc).toBe(true);
    expect(front!.overrides.breakBefore).toEqual({ enabled: true, parity: 'odd' });
    expect(front!.margins).toEqual({ top: pt(18), bottom: pt(18), left: pt(60), right: pt(18), mirror: false });
    expect(front!.layout?.layoutType).toBe('single');
    expect(front!.header?.elements).toHaveLength(1);
    expect(front!.footer).toBeUndefined();
    expect(front!.palette).toEqual({ band: '#123456' });
  });

  it('plans the section of every block up to the next heading of the same level', () => {
    const resolved = resolveAllConfig(base);
    const blocks = parseMarkdown(doc);
    const plan = planHeadingSections(blocks, resolved);
    const oneIdx = blocks.findIndex((b) => b.type === 'heading' && b.text === 'One');
    expect(plan.byBlock[0]?.id).toBe('front');
    expect(plan.byBlock[oneIdx - 1]?.id).toBe('front');
    expect(plan.byBlock[oneIdx]).toBeUndefined();
    expect(plan.any).toBe(true);
  });

  it('a part divider closes the section open before it', () => {
    // Front matter styled as a section, then a part whose chapters are
    // H2s: without the part closing it, the front matter's single column
    // would run on through every chapter of the part.
    const md = `# Contents {style="front"}\n\n${filler(2)}\n\n:::part{number="I" title="First"}\n1. One\n:::\n\n## One\n\n${filler(2)}`;
    const resolved = resolveAllConfig(base);
    const blocks = parseMarkdown(md);
    const plan = planHeadingSections(blocks, resolved);
    const partIdx = blocks.findIndex((b) => b.type === 'containerStart' && b.containerName === 'part');
    const oneIdx = blocks.findIndex((b) => b.type === 'heading' && b.text === 'One');
    expect(plan.byBlock[partIdx - 1]?.id).toBe('front');
    expect(plan.byBlock[partIdx]).toBeUndefined();
    expect(plan.byBlock[oneIdx]).toBeUndefined();
    // Laid out, the chapter's pages take the document's two columns again.
    const out = buildDocument({ markdown: md }, base);
    const onePage = out.pages[out.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('One'))!.pageIndex]!;
    expect(onePage.columns.filter((c) => c.kind !== 'span')).toHaveLength(2);
  });

  it('an unnumbered heading advances no counter: the first numbered chapter is 1', () => {
    const built = buildDocument({ markdown: doc }, base);
    const headers = built.pages.map(headerText);
    const preface = built.pages.find((p) => p.role === 'opener')!;
    expect(headers[preface.index]).toBe('FRONT Preface ');
    const one = built.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('One'))!;
    expect(headers[one.pageIndex]).toBe('BODY One 1');
    const two = built.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('Two'))!;
    expect(headers[two.pageIndex]).toBe('BODY Two 2');
    // The continuation counts the same way.
    expect(continuationAfter({ markdown: doc }, base).headings?.h1).toBe(2);
    expect(continuationAfter({ markdown: '# Preface {style="front"}\n\nText.' }, base).headings?.h1).toBe(0);
  });

  it('the section pages take the style geometry, running heads and palette', () => {
    const built = buildDocument({ markdown: doc }, base);
    const preface = built.pages.find((p) => p.role === 'opener')!;
    expect(preface.columns).toHaveLength(1);
    expect(preface.contentArea.x).toBeCloseTo(px(60), 3);
    // Page 2 (a body page of the front section) keeps the geometry; the
    // first chapter page returns to two columns at the page margins.
    const second = built.pages[preface.index + 1]!;
    expect(second.role).toBe('body');
    expect(second.columns).toHaveLength(1);
    const one = built.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('One'))!;
    const onePage = built.pages[one.pageIndex]!;
    expect(onePage.columns).toHaveLength(2);
    expect(onePage.contentArea.x).toBeCloseTo(px(18), 3);
    expect(one.headingStyleId).toBeUndefined();
    const prefaceBlock = built.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('Preface'))!;
    expect(prefaceBlock.headingStyleId).toBe('front');
    expect(prefaceBlock.unnumbered).toBe(true);
    const sections = computeSectionStyles(built.blocks, built.pages.length, built.pages, built.config);
    expect(sections[preface.index]?.id).toBe('front');
    expect(sections[one.pageIndex]).toBeUndefined();
  });

  it('strip drops the defaults and keeps what the style sets', () => {
    expect(stripHeadingStylesDefaults(undefined)).toBeUndefined();
    expect(stripHeadingStylesDefaults([])).toBeUndefined();
    expect(stripHeadingStylesDefaults([{ id: 'a', name: 'a', numbered: true, toc: true, palette: {} }])).toEqual([{ id: 'a' }]);
    expect(stripHeadingStylesDefaults([{ id: 'a', numbered: false, margins: { left: pt(5) } }]))
      .toEqual([{ id: 'a', numbered: false, margins: { left: pt(5) } }]);
    const stripped = stripConfigDefaults({ headingStyles: [frontStyle] });
    expect(stripped.headingStyles).toHaveLength(1);
    expect(stripConfigDefaults({ headingStyles: [] }).headingStyles).toBeUndefined();
    const resolved = resolveHeadingStylesConfig([{ id: 'x' }], resolveAllConfig().page, resolveAllConfig().bodyText, resolveAllConfig().unorderedLists, resolveAllConfig().orderedLists);
    expect(resolved[0]).toMatchObject({ id: 'x', name: 'x', numbered: true, toc: true, overrides: {}, palette: {} });
  });
});
