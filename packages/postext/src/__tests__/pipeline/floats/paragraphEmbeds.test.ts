import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { insertParagraphEmbeds, paragraphResourcesCitedInNotes } from '../../../pipeline/floats/paragraphEmbeds.js';
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
const fig = (position: 'paragraph' | 'auto' = 'paragraph', id = 'f'): Resource => ({
  id, typeId: 'figure', kind: 'svg', caption: 'A figure.', createdAt: 0, updatedAt: 0,
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

  it('steps out of the box when the citation stands in its middle', () => {
    const k = kinds(':::callout\nIn a box :ref{id="f"}.\n\nMore in the box.\n:::\n\nAfter.');
    expect(k.slice(-3)).toEqual(['containerEnd', 'R:f', 'P:Aft']);
  });

  it('steps out of the outermost box of a nested pair', () => {
    const k = kinds(':::callout\nOuter.\n\n:::callout\nInner :ref{id="f"}.\n:::\n\nStill outer.\n:::\n\nAfter.');
    expect(k.slice(-3)).toEqual(['containerEnd', 'R:f', 'P:Aft']);
    expect(k.filter((x) => x === 'containerEnd')).toHaveLength(2);
  });

  it('sets two resources cited in one paragraph after it, in citation order', () => {
    const r = [fig('paragraph', 'g'), fig('paragraph', 'f')];
    expect(kinds('See :ref{id="f"} and :ref{id="g"}.\n\nAfter.', r)).toEqual(['P:See', 'R:f', 'R:g', 'P:Aft']);
  });

  it('never parts a heading from the paragraph it opens', () => {
    expect(kinds('# Title :ref{id="f"}\n\nIntro.\n\nMore.')).toEqual(['heading', 'P:Int', 'R:f', 'P:Mor']);
    expect(kinds('# Title :ref{id="f"}\n\n## Sub\n\nIntro.\n\nMore.')).toEqual(['heading', 'heading', 'P:Int', 'R:f', 'P:Mor']);
    expect(kinds('# Title :ref{id="f"}\n\n- One\n- Two\n\nMore.')).toEqual(['heading', 'listItem', 'listItem', 'R:f', 'P:Mor']);
  });

  it('places nothing after a note, and says which resources only notes cite', () => {
    const split = (md: string) => {
      const all = parseMarkdownMemo(md);
      return { flow: all.filter((b) => b.footnoteDef === undefined), notes: all.filter((b) => b.footnoteDef !== undefined) };
    };
    const one = split('Text[^n] goes on.\n\nMore.\n\n[^n]: See :ref{id="f"}.');
    // A note left in the blocks is passed over too.
    expect(insertParagraphEmbeds([...one.flow, ...one.notes], [fig()], TYPES).some((b) => b.type === 'resourceBlock')).toBe(false);
    const blocks = insertParagraphEmbeds(one.flow, [fig()], TYPES);
    expect(paragraphResourcesCitedInNotes(blocks, one.notes, [fig()], TYPES).map((r) => r.resourceId)).toEqual(['f']);
    // Cited in the text too: set after that paragraph, and no word of it.
    const two = split('Text[^n] goes on.\n\nLater :ref{id="f"}.\n\n[^n]: See :ref{id="f"}.');
    const both = insertParagraphEmbeds(two.flow, [fig()], TYPES);
    expect(both.some((b) => b.type === 'resourceBlock' && b.resourceId === 'f')).toBe(true);
    expect(paragraphResourcesCitedInNotes(both, two.notes, [fig()], TYPES)).toEqual([]);
    // Taken in by the content before: nothing to say.
    expect(paragraphResourcesCitedInNotes(blocks, one.notes, [fig()], TYPES, new Set(['f']))).toEqual([]);
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

describe('a figure placed after its paragraph and cited only in a note', () => {
  it('is reported by the build, with the range of its reference', () => {
    const md = 'Text with a note[^n] in it.\n\n[^n]: See :ref{id="f"}.';
    const doc = buildDocument({ markdown: md, resources: [fig()] }, { page: { dpi: 96 }, layout: { layoutType: 'single' } }, createMeasurementCache());
    const w = (doc.contentWarnings ?? []).find((x) => x.kind === 'paragraphCitedInNote');
    expect(w).toMatchObject({ kind: 'paragraphCitedInNote', resourceId: 'f' });
    expect(md.slice(w!.sourceStart, w!.sourceEnd)).toContain(':ref');
  });
});
