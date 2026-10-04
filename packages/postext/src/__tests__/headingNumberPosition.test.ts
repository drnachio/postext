import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { computeOutlineFor } from '../pipeline/outline';
import { parseMarkdown } from '../parse';
import { collectConfigWarnings } from '../configWarnings';
import { stripConfigDefaults } from '../defaults';
import type { PostextConfig } from '../types';
import type { VDTDocument } from '../vdt';

// #401: `numberPosition: 'replace'` — the generated number is the whole
// title (Arabic nights: `# Night` under `الليلة {1:ordinal-feminine}`
// prints الليلة الثانية), in the column, the contents, the running heads
// and the bookmarks.

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
const NIGHTS = 'الليلة {1:ordinal-feminine}';

function config(extra: Partial<PostextConfig> = {}): PostextConfig {
  return {
    locale: 'ar',
    page: { width: pt(300), height: pt(400), margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
    layout: { layoutType: 'single' },
    headingStyles: [{ id: 'front', numbered: false, toc: false }, { id: 'plain-title', numberPosition: 'before' }],
    headings: {
      levels: [
        { level: 1, numberingTemplate: NIGHTS, numberSeparator: ': ', numberPosition: 'replace', breakBefore: { enabled: true, parity: 'any' } },
        { level: 2, numberingTemplate: '{1}.{2}' },
      ],
    },
    header: { elements: [{ kind: 'text', id: 'rh', content: '{chapterTitle}', fontSize: pt(8), overflow: 'wrap', placement: { anchor: { to: 'container', edge: 'bottom' } } }] },
    ...extra,
  };
}
const MD = '# المحتويات {style="front"}\n\n:::toc\n\n# Night\n\nText.\n\n## Sub\n\nMore.\n\n# Night\n\nText.\n\n# Prologue {style="front"}\n\nText.';
const headings = (doc: VDTDocument) => doc.blocks.filter((b) => b.type === 'heading').map((b) => [b.lines.map((l) => l.text).join(' '), b.numberPrefix ?? null]);

describe('#401: heading numberPosition', () => {
  it("prints the number alone, with no separator, as the heading's title", () => {
    const doc = buildDocument({ markdown: MD }, config());
    expect(headings(doc)).toEqual([
      ['المحتويات', null],
      ['الليلة الأولى', null],
      ['١.١ Sub', '١.١'],
      ['الليلة الثانية', null],
      ['Prologue', null],
    ]);
    // The counter still counts: the second night is night 2.
    expect(doc.blocks.filter((b) => b.type === 'heading' && b.headingLevel === 1).map((b) => b.headingNumber ?? null)).toEqual([null, 1, 2, null]);
  });

  it('lists the number as the title in the outline and the contents', () => {
    const outline = computeOutlineFor(parseMarkdown(MD), config()).filter((e) => e.kind === 'heading' && e.level === 1 && e.numbered);
    expect(outline.map((e) => [e.title, e.number, e.counter])).toEqual([['الليلة الأولى', '', 1], ['الليلة الثانية', '', 2]]);
    const doc = buildDocument({ markdown: MD }, config());
    const rows = doc.blocks.filter((b) => b.tocEntry !== undefined).map((b) => [b.lines[0]!.text, b.bulletText ?? null]);
    expect(rows[0]![0]).toMatch(/^الليلة الأولى [١٢]$/);
    expect(rows[0]![1]).toBeNull();
    expect(rows.some(([text]) => (text as string).includes('Night'))).toBe(false);
  });

  it('runs the number as the chapter title in the running heads', () => {
    const doc = buildDocument({ markdown: MD }, config());
    const heads = doc.pages.map((p) => p.header?.blocks?.flatMap((b) => (b.kind === 'text' ? b.lines.map((l) => l.text) : [])).join('') ?? '');
    expect(heads).toContain('الليلة الثانية');
    expect(heads.some((h) => h.includes('Night'))).toBe(false);
  });

  it('keeps the title of a style that sets the number before it, and of an unnumbered heading', () => {
    const doc = buildDocument({ markdown: '# Night {style="plain-title"}\n\nText.\n\n# Prologue {style="front"}\n\nText.' }, config());
    expect(headings(doc)).toEqual([['الليلة الأولى: Night', 'الليلة الأولى'], ['Prologue', null]]);
  });

  it('keeps the title of a level with no template', () => {
    const doc = buildDocument({ markdown: '## Sub only' }, config({ headings: { levels: [{ level: 2, numberPosition: 'replace' }] } }));
    expect(headings(doc)).toEqual([['Sub only', null]]);
  });

  it('is saved when set, and an unknown value warns and reads as before', () => {
    expect(stripConfigDefaults({ headings: { levels: [{ level: 1, numberPosition: 'replace' }] } })?.headings).toEqual({ levels: [{ level: 1, numberPosition: 'replace' }] });
    expect(stripConfigDefaults({ headings: { levels: [{ level: 1, numberPosition: 'before' }] } })?.headings).toBeUndefined();
    const warnings = collectConfigWarnings({ headings: { levels: [{ level: 1, numberPosition: 'after' as never }] } });
    expect(warnings.filter((w) => w.kind === 'unknownConfigValue')).toEqual([
      { kind: 'unknownConfigValue', path: 'headings.levels[0].numberPosition', value: 'after', used: 'before' },
    ]);
  });
});
