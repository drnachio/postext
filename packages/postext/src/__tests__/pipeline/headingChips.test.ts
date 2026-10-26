import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { parseMarkdown } from '../../parse/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import type { PostextConfig, VDTDocument } from '../../index.js';
import { CHIP_PLACEHOLDER, withoutChips } from '../../parse/inlineFormatting.js';
import { blockLinesText } from '../../pipeline/pages/placeholders.js';
import { defaultOpenerTitle } from '../../pipeline/pages/headerFooter.js';

// #1100: `:chip[…]{style}` in a heading, as in a paragraph.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d*\.?\d+)px/.exec(this.font);
    return { width: s.length * (m ? Number(m[1]) : 16) * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (more: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false } },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'left', hyphenation: { enabled: false } },
  chipStyles: [{ id: 'mark', background: { hex: '#cc3300', model: 'hex' }, paddingX: pt(2) }],
  ...more,
});
const build = (md: string, cfg: PostextConfig = config()): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());

describe(':chip[…] in headings (#1100)', () => {
  it('parses a chip span with its style and words', () => {
    const [h] = parseMarkdown('## :chip[///]{style=mark} Title');
    expect(h!.type).toBe('heading');
    const chip = h!.spans.find((s) => s.chip);
    expect(chip?.chip?.style).toBe('mark');
    expect(chip?.chip?.spans.map((s) => s.text).join('')).toBe('///');
    expect(h!.spans.map((s) => (s.chip ? '' : s.text)).join('')).toBe(' Title');
    // The source map points past the directive at the title's words.
    const md = '## :chip[///]{style=mark} Title';
    expect(h!.sourceMap[h!.text.indexOf('T')]).toBe(md.indexOf('Title'));
    expect(h!.sourceMap[0]).toBe(md.indexOf(':chip['));
  });

  it('measures and paints the chip box', () => {
    const doc = build('## :chip[///]{style=mark} Title\n\nText.');
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    const seg = heading.lines.flatMap((l) => l.segments ?? []).find((s) => s.kind === 'chip');
    expect(seg?.chip).toBeDefined();
    expect(seg!.width).toBeGreaterThan(0);
    expect(heading.lines.map((l) => l.text)).toEqual([CHIP_PLACEHOLDER + ' Title']);
    const html = renderToHtml(doc);
    expect(html).toContain('#cc3300');
    expect(html).not.toContain(':chip[');
  });

  it('lists the plain title in the contents and the running heads', () => {
    const run = { kind: 'text', id: 'run', content: '{chapterTitle}', fontSize: pt(9), placement: { anchor: { to: 'container', edge: 'top-left' } } };
    const cfg = config({ header: { elements: [run] } } as Partial<PostextConfig>);
    const doc = build(':::toc\n\n# :chip[///]{style=mark} Title\n\nText.\n\n# Middle :chip[x]{style=mark} chip\n\nMore.', cfg);
    const toc = doc.blocks.filter((b) => b.type === 'listItem').map((b) => b.lines.map((l) => l.text).join(' '));
    expect(toc[0]).toMatch(/^Title\b/);
    expect(toc[1]).toMatch(/^Middle chip\b/);
    expect(toc.join('')).not.toContain(CHIP_PLACEHOLDER);
    const heads = doc.pages.flatMap((p) => p.header?.blocks ?? []).flatMap((b) => ('lines' in b ? b.lines.map((l) => l.text) : []));
    expect(heads).toContain('Title');
    expect(heads.join('')).not.toContain(CHIP_PLACEHOLDER);
    // The heading itself still sets the chip.
    const heading = doc.blocks.find((b) => b.type === 'heading')!;
    expect(heading.lines[0]!.segments!.some((sg) => sg.kind === 'chip')).toBe(true);
  });

  it('reads the title without chips in the plain readers', () => {
    expect(withoutChips(`${CHIP_PLACEHOLDER} Title`)).toBe('Title');
    expect(withoutChips(`A ${CHIP_PLACEHOLDER} B`)).toBe('A B');
    expect(withoutChips(`Title ${CHIP_PLACEHOLDER}`)).toBe('Title');
    const doc = build('# :chip[///]{style=mark} Title\n\nText.');
    expect(blockLinesText(doc.blocks.find((b) => b.type === 'heading')!, { plainTitleBreaks: true })).toBe('Title');
  });

  it('gives a heading design the title without the chip', () => {
    const lines = [{ text: `${CHIP_PLACEHOLDER} Title`, segments: [{ text: CHIP_PLACEHOLDER }, { text: ' ' }, { text: 'Title' }] }];
    expect(defaultOpenerTitle(lines as never, '', undefined, 7).titleText).toBe('Title');
    const numbered = [{ text: `1 ${CHIP_PLACEHOLDER} Two\u2028Lines`, segments: [{ text: '1' }, { text: ' ' }, { text: CHIP_PLACEHOLDER }, { text: ' ' }, { text: 'Two' }, { text: '\u2028' }, { text: 'Lines' }] }];
    // The forced break at index 5 of the raw title ("\uE1A0 Two\u2028Lines").
    expect(defaultOpenerTitle(numbered as never, '1', [5], 11).titleText).toBe('Two\nLines');
  });
});
