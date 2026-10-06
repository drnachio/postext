import { describe, it, expect, beforeAll } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { contentHasMath, mapInlineSnippet, parseInlineSnippetSpans } from '../../parse';
import { initMathEngine } from '../../math';
import { renderToHtmlIndexed } from '../../html-backend';
import type { PostextConfig, Resource, ResolvedResourceBlock, VDTDocument, VDTLine } from '../../index';

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

beforeAll(async () => {
  await initMathEngine();
}, 60_000);

const pt = (value: number) => ({ value, unit: 'pt' as const });
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
};

const table: Resource = {
  id: 't', typeId: 'table', kind: 'table', placement: { position: 'here' }, createdAt: 0, updatedAt: 0,
  caption: 'Fits of $\\chi^2$ per source.',
  note: 'Errors as $36^{+5}_{-4}$.',
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [{ content: 'Source' }, { content: '$M_\\odot$', align: 'right' }],
        [{ content: 'A' }, { content: '$36^{+5}_{-4}$', align: 'right' }],
        [{ content: 'B costs $5 to $10' }, { content: 'mass $\\eta_c$ here', align: 'center' }],
      ],
    },
  },
};

const build = (config: PostextConfig = PAGE): VDTDocument =>
  buildDocument({ markdown: 'Text.\n\n::resource{id="t"}\n', resources: [table] }, config, createMeasurementCache());

const resourceOf = (doc: VDTDocument): ResolvedResourceBlock => doc.blocks.find((b) => b.resourceBlock)!.resourceBlock!;
const mathSegs = (lines: readonly VDTLine[]) => lines.flatMap((l) => (l.segments ?? []).filter((s) => s.kind === 'math'));

describe('maths in snippets (#541)', () => {
  it('parses $…$ by Pandoc\'s rule', () => {
    const spans = parseInlineSnippetSpans('Fit $\\chi^2$ and $36^{+5}_{-4}$.');
    expect(spans.filter((s) => s.math).map((s) => s.math!.tex)).toEqual(['\\chi^2', '36^{+5}_{-4}']);
    // Prices stay text: a space after the opening dollar, a digit after
    // the closing one.
    expect(parseInlineSnippetSpans('From $5 to $10.').some((s) => s.math)).toBe(false);
    expect(parseInlineSnippetSpans('$5–$10').some((s) => s.math)).toBe(false);
    expect(parseInlineSnippetSpans('A lone $ sign').map((s) => s.text).join('')).toBe('A lone $ sign');
    // An escaped dollar is a dollar sign; a chip's label takes no maths.
    expect(parseInlineSnippetSpans('\\$x$ y').some((s) => s.math)).toBe(false);
    const chip = parseInlineSnippetSpans(':chip[$x$]').find((s) => s.chip);
    expect(chip?.chip?.spans.some((s) => s.math)).toBe(false);
  });

  it('maps a formula to its opening dollar', () => {
    // A price beside a formula takes the escape.
    const content = '\\$5 or $\\eta$ now';
    const { text, sourceMap } = mapInlineSnippet(content);
    expect(text.startsWith('$5 or ')).toBe(true);
    expect(sourceMap[text.indexOf('￼')]).toBe(content.indexOf('$\\eta'));
    expect(sourceMap[text.length - 1]).toBe(content.length - 1);
  });

  it('says when a resource holds maths', () => {
    expect(contentHasMath({ markdown: 'No maths.', resources: [table] })).toBe(true);
    expect(contentHasMath({ markdown: 'No maths.', resources: [{ ...table, caption: 'x', note: '', table: { model: { rows: [[{ content: 'a' }]] } } }] })).toBe(false);
  });

  it('sets formulas in cells, measured in line, with the cell\'s alignment', () => {
    const rb = resourceOf(build());
    const cells = rb.table!.cells;
    const cell = (r: number, c: number) => cells.find((x) => x.row === r && x.col === c)!;
    const head = mathSegs(cell(0, 1).lines);
    expect(head).toHaveLength(1);
    expect(head[0]!.width).toBeGreaterThan(0);
    expect(head[0]!.mathRender?.tex).toBe('M_\\odot');
    expect(head[0]!.mathRender?.paths.length).toBeGreaterThan(0);
    // Right-aligned: the line ends at the cell's text edge.
    const right = cell(1, 1);
    const line = right.lines[0]!;
    expect(mathSegs(right.lines)[0]!.mathRender?.tex).toBe('36^{+5}_{-4}');
    const textWidth = cell(1, 1).rect.width;
    expect(line.bbox.x + line.bbox.width).toBeGreaterThan(textWidth / 2);
    // In line with text, centred.
    const mixed = cell(2, 1).lines[0]!;
    expect(mixed.segments!.map((s) => s.kind)).toContain('math');
    expect(mixed.bbox.width).toBeCloseTo(mixed.segments!.reduce((w, s) => w + s.width, 0), 3);
    expect(mixed.bbox.x).toBeGreaterThan(0);
    // The formula sits on the line's baseline.
    const m = mathSegs([mixed])[0]!;
    expect(m.mathRender!.ascentPx).toBeLessThanOrEqual(mixed.baseline - mixed.bbox.y + 1);
    // Prices stay text.
    expect(mathSegs(cell(2, 0).lines)).toHaveLength(0);
  });

  it('sets formulas in the caption and the note', () => {
    const rb = resourceOf(build());
    expect(mathSegs(rb.captionLines).map((s) => s.mathRender?.tex)).toEqual(['\\chi^2']);
    expect(mathSegs(rb.noteLines).map((s) => s.mathRender?.tex)).toEqual(['36^{+5}_{-4}']);
    expect(mathSegs(rb.captionLines)[0]!.width).toBeGreaterThan(0);
  });

  it('prints the TeX as written with maths off', () => {
    const rb = resourceOf(build({ ...PAGE, math: { enabled: false } }));
    expect(mathSegs(rb.captionLines)).toHaveLength(0);
    expect(rb.captionLines.map((l) => l.text).join(' ')).toContain('$\\chi^2$');
  });

  it('paints them in the HTML', () => {
    const html = renderToHtmlIndexed(build(), { mode: 'single' }).pages[0]!.innerHtml;
    // Caption, note and three cells.
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
