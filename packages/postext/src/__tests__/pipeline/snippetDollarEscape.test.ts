import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { mapInlineSnippet, parseInlineSnippetSpans } from '../../parse/inlineSnippet';
import type { PostextConfig, Resource } from '../../types';
import type { ResolvedResourceBlock, VDTDocument } from '../../vdt';

// EF-151: `\$` prints a dollar sign in the body (the maths pass unescapes
// it), and it did not in table cells, captions and notes, which are not
// parsed for maths: they printed the backslash too. One escaped string now
// reads the same in both places.

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

const TEXT = 'Price \\$4.50 and \\*star\\* here.';
const config: PostextConfig = { layout: { layoutType: 'single' } };

const table = (extra: Partial<Resource> = {}): Resource => ({
  id: 't', typeId: 'table', kind: 'table', placement: { position: 'here' }, createdAt: 0, updatedAt: 0,
  table: { model: { rows: [[{ content: TEXT }]] } },
  ...extra,
});

function resourceBlocks(doc: VDTDocument): ResolvedResourceBlock[] {
  return doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])])
    .map((b) => b.resourceBlock)
    .filter((rb): rb is ResolvedResourceBlock => rb !== undefined);
}

describe('EF-151: \\$ in table cells, captions and notes', () => {
  it('prints a dollar sign in a cell, as the same text does in a paragraph', () => {
    const doc = buildDocument({ markdown: `${TEXT}\n\n::resource{id="t"}\n`, resources: [table()] }, config);
    const para = doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'paragraph')!;
    expect(para.lines.map((l) => l.text).join(' ')).toBe('Price $4.50 and *star* here.');
    const [rb] = resourceBlocks(doc);
    expect(rb!.table!.cells[0]!.lines.map((l) => l.text).join(' ')).toBe('Price $4.50 and *star* here.');
  });

  it('prints a dollar sign in a caption and a note', () => {
    const doc = buildDocument({
      markdown: '::resource{id="t"}\n',
      resources: [table({ caption: 'Fees in \\$ per head.', note: 'Rates at \\$1.20.' })],
    }, config);
    const [rb] = resourceBlocks(doc);
    expect(rb!.captionLines.map((l) => l.text).join(' ')).toBe('Table\u00A01. Fees in $ per head.');
    expect((rb!.noteLines ?? []).map((l) => l.text).join(' ')).toBe('Rates at $1.20.');
  });

  it('keeps the backslash inside inline code, and a forced break before a dollar stays a break', () => {
    expect(parseInlineSnippetSpans('`\\$` and \\$').map((s) => s.text).join('')).toBe('\\$ and $');
    const spans = parseInlineSnippetSpans('a\\\\$5');
    const text = spans.map((s) => s.text).join('');
    expect(text.endsWith('$5')).toBe(true);
    expect(text).not.toContain('\\');
  });

  it('maps the dollar back to its place in the snippet (Sandbox click-to-edit)', () => {
    const m = mapInlineSnippet('A \\$5 fee');
    expect(m.text).toBe('A $5 fee');
    expect(m.sourceMap[m.text.indexOf('$')]).toBe(3);
    expect(m.sourceMap[m.text.indexOf('5')]).toBe(4);
  });

  it('leaves a lone dollar (no maths in snippets) as it was', () => {
    expect(parseInlineSnippetSpans('From $5 to $6').map((s) => s.text).join('')).toBe('From $5 to $6');
  });

  it('prints a ref\'s text="…" as written, in a caption and a cell as in a paragraph', () => {
    // The value is data: the body prints it as written, backslash and all,
    // and a snippet must not leave a private-use placeholder in it.
    const REF = 'See :ref{id="t" text="\\$5 table"} now.';
    const doc = buildDocument({
      markdown: `${REF}\n\n::resource{id="t"}\n`,
      resources: [table({ caption: REF, table: { model: { rows: [[{ content: REF }]] } } })],
    }, config);
    const para = doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'paragraph')!;
    expect(para.lines.map((l) => l.text).join(' ')).toBe('See \\$5 table now.');
    const [rb] = resourceBlocks(doc);
    expect(rb!.captionLines.map((l) => l.text).join(' ')).toBe('Table\u00A01. See \\$5 table now.');
    expect(rb!.table!.cells[0]!.lines.map((l) => l.text).join(' ')).toBe('See \\$5 table now.');
    for (const text of [...rb!.captionLines, ...rb!.table!.cells[0]!.lines].map((l) => l.text)) {
      expect(text).not.toMatch(/[\ue100-\ue17f]/);
    }
  });

  it('prints a ref\'s text="…" holding inline code as written', () => {
    // Inline code is protected before the refs are read; its placeholders
    // used to reach the label.
    const REF = 'See :ref{id="t" text="the `a:b` table"} now.';
    const doc = buildDocument({
      markdown: `${REF}\n\n::resource{id="t"}\n`,
      resources: [table({ caption: REF })],
    }, config);
    const para = doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'paragraph')!;
    expect(para.lines.map((l) => l.text).join(' ')).toBe('See the `a:b` table now.');
    const [rb] = resourceBlocks(doc);
    expect(rb!.captionLines.map((l) => l.text).join(' ')).toBe('Table\u00A01. See the `a:b` table now.');
  });

  it('prints a dollar sign for \\$ in a chip\'s label, in a cell as in a paragraph', () => {
    const CHIP = 'Fee :chip[\\$5] each.';
    const chipText = (spans: { chip?: { spans: { text: string }[] } }[]) =>
      spans.filter((s) => s.chip).map((s) => s.chip!.spans.map((c) => c.text).join(''));
    expect(chipText(parseInlineSnippetSpans(CHIP))).toEqual(['$5']);
    const doc = buildDocument({ markdown: `${CHIP}\n\n::resource{id="t"}\n`, resources: [table()] }, config);
    const para = doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'paragraph')!;
    const chipSegs = para.lines.flatMap((l) => l.segments ?? []).filter((s) => s.chip);
    expect(chipSegs.map((s) => s.chip!.runs.map((r) => r.text).join(''))).toEqual(['$5']);
  });

  it('leaves a link destination to the link: an escaped backslash before a dollar stays one', () => {
    const hrefs = (content: string) => parseInlineSnippetSpans(content).flatMap((s) => (s.links ?? []).map((l) => l.href));
    // CommonMark: `\\` is a backslash and `\$` a dollar sign.
    expect(hrefs('[c](https://x.org/c\\\\$d)')).toEqual(['https://x.org/c\\$d']);
    expect(hrefs('[a](https://x.org/a\\$b)')).toEqual(['https://x.org/a$b']);
    // The link's text is text: its `\$` is a dollar sign.
    expect(parseInlineSnippetSpans('[cost \\$5](https://x.org/)').map((s) => s.text).join('')).toBe('cost $5');
  });
});
