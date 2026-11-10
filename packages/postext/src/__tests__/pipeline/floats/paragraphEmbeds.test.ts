import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { insertParagraphEmbeds } from '../../../pipeline/floats/paragraphEmbeds.js';
import { defaultResourceTypes } from '../../../defaults/resources/resourceTypes.js';
import { parseMarkdownMemo } from '../../../parse/blockParser.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { VDTDocument } from '../../../vdt.js';
import type { PostextConfig, Resource, ResourceType } from '../../../types.js';

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

/** A figure placed after the paragraph that cites it
 *  (`placement.position: 'paragraph'`): inline, no directive needed. */

const TYPES: ResourceType[] = defaultResourceTypes();
const fig = (position: 'paragraph' | 'auto' = 'paragraph'): Resource => ({
  id: 'f', typeId: 'figure', kind: 'svg', caption: 'A figure.', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'f.svg', width: 600, height: 200 },
  placement: { position },
});
const kinds = (md: string, r: Resource[] = [fig()]) =>
  insertParagraphEmbeds(parseMarkdownMemo(md), r, TYPES).map((b) => (b.type === 'resourceBlock' ? `R:${b.resourceId}` : b.type === 'paragraph' ? `P:${b.text.slice(0, 3)}` : b.type));

describe('insertParagraphEmbeds', () => {
  it('sets the resource right after the paragraph that first cites it', () => {
    expect(kinds('First.\n\nSee :ref{id="f"} here.\n\nAfter.')).toEqual(['P:Fir', 'P:See', 'R:f', 'P:Aft']);
  });

  it('waits for the end of the list a citing item opens', () => {
    expect(kinds('- One :ref{id="f"}\n- Two\n- Three\n\nAfter.')).toEqual(['listItem', 'listItem', 'listItem', 'R:f', 'P:Aft']);
  });

  it('steps out of the box the citation sits in', () => {
    const k = kinds(':::callout\nIn a box :ref{id="f"}.\n:::\n\nAfter.');
    expect(k.indexOf('R:f')).toBe(k.indexOf('containerEnd') + 1);
  });

  it('keeps a resource first referred to by its directive there, and drops later directives', () => {
    expect(kinds('::resource{id="f"}\n\nSee :ref{id="f"}.')).toEqual(['R:f', 'P:See']);
    expect(kinds('See :ref{id="f"}.\n\nMore.\n\n::resource{id="f"}\n\nEnd.')).toEqual(['P:See', 'R:f', 'P:Mor', 'P:End']);
  });

  it('leaves other positions alone, and resources the preceding content took in', () => {
    const md = 'See :ref{id="f"}.\n\nAfter.';
    expect(kinds(md, [fig('auto')])).toEqual(['P:See', 'P:Aft']);
    const blocks = parseMarkdownMemo(md);
    expect(insertParagraphEmbeds(blocks, [fig()], TYPES, new Set(['f']))).toBe(blocks);
  });
});

describe('a figure placed after its paragraph, laid out', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const config: PostextConfig = {
    page: { dpi: 96, sizePreset: '17x24' },
    layout: { layoutType: 'single' },
    bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  };
  const md = 'Opening paragraph.\n\nThe figure is cited here :ref{id="f"} in this paragraph.\n\nThe text after the figure.';
  const doc: VDTDocument = buildDocument({ markdown: md, resources: [fig()] }, config, createMeasurementCache());
  const block = (pred: (b: VDTDocument['blocks'][number]) => boolean) => doc.blocks.find(pred)!;

  it('stands between the citing paragraph and the next, in the column, not as a float', () => {
    const citing = block((b) => b.lines.some((l) => l.text.includes('cited here')));
    const after = block((b) => b.lines.some((l) => l.text.includes('text after')));
    const figure = block((b) => b.resourceBlock?.resource.id === 'f');
    expect(doc.pages.flatMap((p) => p.floats ?? []).some((b) => b.resourceBlock?.resource.id === 'f')).toBe(false);
    expect(figure.bbox.y).toBeGreaterThan(citing.bbox.y + citing.bbox.height - 0.01);
    expect(after.bbox.y).toBeGreaterThan(figure.bbox.y + figure.bbox.height - 0.01);
  });
});
