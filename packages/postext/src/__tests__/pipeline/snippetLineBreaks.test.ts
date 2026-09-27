import { describe, it, expect } from 'vitest';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { mapInlineSnippet } from '../../parse/inlineSnippet';
import type { PostextConfig, Resource, TableModel } from '../../types';
import type { VDTLine } from '../../vdt';

// EF-95: a caption, a note or a table cell can break a line where the author
// says — `\\` (the forced break of titles) or a backslash at the end of a
// line (Markdown's hard break). A plain newline stays a space in captions and
// notes, as before.

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

const COLUMN_WIDTH = 600;

const figure = (extra: Partial<Resource> = {}): Resource => ({
  id: 'fig-1',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A figure.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'fig-1.png', format: 'png', width: 400, height: 300 },
  ...extra,
});

function layout(resource: Resource, config?: PostextConfig) {
  const resourceTypes = defaultResourceTypes();
  const resolved = resolveAllConfig(config);
  return layoutResourceBlock({
    resource,
    resourceType: resourceTypes.find((t) => t.id === resource.typeId),
    number: '1',
    resolved,
    columnWidth: COLUMN_WIDTH,
    resourceNumbering: { [resource.id]: { number: '1', typeId: resource.typeId, heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    resourceTypes,
    resources: [resource],
  });
}

const texts = (lines: readonly VDTLine[]) => lines.map((l) => l.text.trim());

describe('EF-95: forced line breaks in captions, notes and table cells', () => {
  it('`\\\\` breaks a note into lines (the footnotes of a page-wide table)', () => {
    const { block } = layout(figure({ note: '¹ First note. \\\\ ² Second note. \\\\ ³ Third note.' }));
    expect(texts(block.noteLines)).toEqual(['¹ First note.', '² Second note.', '³ Third note.']);
    // One line pitch apart, in order.
    const ys = block.noteLines.map((l) => l.bbox.y);
    expect(ys[1]! - ys[0]!).toBeCloseTo(ys[2]! - ys[1]!, 5);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(0);
  });

  it('a backslash at the end of a line breaks it, as in Markdown', () => {
    const { block } = layout(figure({ note: 'Source: survey.\\\nPhoto: archive.' }));
    expect(texts(block.noteLines)).toEqual(['Source: survey.', 'Photo: archive.']);
  });

  it('a plain newline is still a space', () => {
    const { block } = layout(figure({ note: 'Source: survey.\nPhoto: archive.' }));
    expect(block.noteLines).toHaveLength(1);
    expect(block.noteLines[0]!.text).toMatch(/^Source: survey\.\sPhoto: archive\.$/);
  });

  it('breaks a caption after its label, and the block grows by the extra lines', () => {
    const one = layout(figure({ caption: 'Title of the figure. Credit line.' }));
    const two = layout(figure({ caption: 'Title of the figure. \\\\ Credit line.' }));
    expect(one.block.captionLines).toHaveLength(1);
    expect(two.block.captionLines).toHaveLength(2);
    expect(two.block.captionLines[0]!.text).toContain('Title of the figure.');
    expect(two.block.captionLines[0]!.text).toMatch(/^Figure/);
    expect(texts(two.block.captionLines)[1]).toBe('Credit line.');
    const pitch = two.block.captionLines[1]!.bbox.y - two.block.captionLines[0]!.bbox.y;
    expect(two.totalHeight - one.totalHeight).toBeCloseTo(pitch, 5);
  });

  it('keeps inline marks and references across the break', () => {
    const { block } = layout(figure({ caption: '**Bold** start \\\\ *italic* end' }));
    expect(texts(block.captionLines)[1]).toBe('italic end');
    const seg = block.captionLines[1]!.segments!.find((s) => s.text === 'italic');
    expect(seg?.italic).toBe(true);
  });

  it('never breaks inside inline code', () => {
    const { block } = layout(figure({ note: 'Type `a \\\\ b` here.' }));
    expect(block.noteLines).toHaveLength(1);
    expect(block.noteLines[0]!.text).toContain('a \\\\ b');
  });

  it('drops an empty line between two breaks', () => {
    const { block } = layout(figure({ note: 'One. \\\\ \\\\ Two.' }));
    expect(texts(block.noteLines)).toEqual(['One.', 'Two.']);
  });

  it('breaks a table cell like a newline does', () => {
    const model: TableModel = { rows: [[{ content: 'Top \\\\ bottom' }, { content: 'x' }]] };
    const table: Resource = { id: 't', typeId: 'table', kind: 'table', caption: 'T.', createdAt: 0, updatedAt: 0, table: { model } };
    const { block } = layout(table);
    const cell = block.table!.cells.find((c) => c.lines.some((l) => l.text.includes('Top')))!;
    expect(texts(cell.lines)).toEqual(['Top', 'bottom']);
  });

  it('maps the break back to the `\\\\` in the snippet (click-to-edit)', () => {
    const content = 'One \\\\ Two';
    const { text, sourceMap } = mapInlineSnippet(content);
    const at = text.indexOf('\u2028');
    expect(at).toBeGreaterThan(0);
    expect(content.slice(sourceMap[at]!, sourceMap[at]! + 2)).toBe('\\\\');
    expect(content[sourceMap[text.indexOf('T')]!]).toBe('T');
    const nl = mapInlineSnippet('One\\\nTwo');
    const at2 = nl.text.indexOf('\u2028');
    expect(at2).toBe(3);
    expect(nl.sourceMap[at2]).toBe(3);
    expect(nl.sourceMap[nl.text.indexOf('T')]).toBe(5);
  });
});

describe('EF-95: forced breaks, edge cases', () => {
  const cellLines = (content: string) => {
    const model: TableModel = { rows: [[{ content }, { content: 'x' }]] };
    const table: Resource = { id: 't', typeId: 'table', kind: 'table', caption: 'T.', createdAt: 0, updatedAt: 0, table: { model } };
    const { block } = layout(table);
    return block.table!.cells.find((c) => c.lines.some((l) => l.text.includes('nested')))!.lines;
  };

  it('keeps the indentation after `\\\\` and a newline in a cell, so a nested item stays nested', () => {
    const plain = cellLines('• a\n  • nested');
    const forced = cellLines('• a \\\\\n  • nested');
    expect(forced.map((l) => l.text)).toEqual(plain.map((l) => l.text));
    expect(forced.map((l) => l.bbox.x)).toEqual(plain.map((l) => l.bbox.x));
    // The nested item is indented past the first one.
    expect(forced.at(-1)!.bbox.x).toBeGreaterThan(forced[0]!.bbox.x);
  });

  it('a backslash ending a line in a cell keeps the next line\'s indentation too', () => {
    const plain = cellLines('• a\n  • nested');
    const forced = cellLines('• a\\\n  • nested');
    expect(forced.map((l) => l.text)).toEqual(plain.map((l) => l.text));
    expect(forced.map((l) => l.bbox.x)).toEqual(plain.map((l) => l.bbox.x));
  });

  it('an indented line after a break in a note starts at the measure\'s edge', () => {
    const { block } = layout(figure({ note: 'Source: survey. \\\\\n    Photo: archive.' }));
    expect(texts(block.noteLines)).toEqual(['Source: survey.', 'Photo: archive.']);
    expect(block.noteLines[1]!.bbox.x).toBeCloseTo(block.noteLines[0]!.bbox.x, 5);
  });

  it('leaves `\\\\` inside a link destination to the URL', () => {
    const { block } = layout(figure({ note: 'See [the share](https://example.org/a\\\\b) now.' }));
    expect(block.noteLines).toHaveLength(1);
    const hrefs = block.noteLines[0]!.segments!.map((s) => s.href).filter(Boolean);
    expect(hrefs.length).toBeGreaterThan(0);
    // `\\` is an escaped backslash in a destination, as in CommonMark.
    expect(hrefs[0]).toBe('https://example.org/a\\b');
  });

  it('still breaks in a link label, and both lines keep the link', () => {
    const { block } = layout(figure({ note: 'See [the \\\\ share](https://example.org/) now.' }));
    expect(texts(block.noteLines)).toEqual(['See the', 'share now.']);
    expect(block.noteLines.every((l) => l.segments!.some((s) => s.href === 'https://example.org/'))).toBe(true);
  });

  it('leaves `\\\\` inside a directive\'s attributes (a ref\'s text) as written', () => {
    const { block } = layout(figure({ note: 'See :ref{id="fig-1" text="Plate \\\\ one"} here.' }));
    expect(block.noteLines).toHaveLength(1);
    expect(block.noteLines[0]!.text).toContain('Plate \\\\ one');
  });

  it('sets a break inside a chip label as a space (a chip is one line)', () => {
    const { block } = layout(figure({ note: 'Tag :chip[a \\\\ b] end.' }));
    expect(block.noteLines).toHaveLength(1);
  });

  it('maps an indented line after `\\\\` and a newline back to its own chars', () => {
    const content = 'One \\\\  \n  Two';
    const { text, sourceMap } = mapInlineSnippet(content);
    const at = text.indexOf(' ');
    expect(content.slice(sourceMap[at]!, sourceMap[at]! + 2)).toBe('\\\\');
    // Every char after the break maps to the same char in the source, the
    // indentation to the next line's own spaces.
    for (let p = at + 1; p < text.length; p++) expect(content[sourceMap[p]!]).toBe(text[p]);
    expect(sourceMap.slice(at + 1)).toEqual([content.indexOf('\n') + 1, content.indexOf('\n') + 2, content.indexOf('T'), content.indexOf('w'), content.indexOf('o')]);
    // Same for a backslash ending a line.
    const src = 'One\\\n  Two';
    const nl = mapInlineSnippet(src);
    const at2 = nl.text.indexOf(' ');
    for (let p = at2 + 1; p < nl.text.length; p++) expect(src[nl.sourceMap[p]!]).toBe(nl.text[p]);
  });
});
