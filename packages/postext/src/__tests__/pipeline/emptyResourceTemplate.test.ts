import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, ResourceType } from '../../types';
import type { ResolvedResourceBlock, VDTDocument } from '../../vdt';

// EF-149: a resource type whose `numberingTemplate` is empty prints no
// number. Its caption used to read "Do .Lines…" (a no-break space and a
// full stop where the number goes, and no space before the description)
// and its references "Do " (a trailing no-break space).

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

const doType = (extra: Partial<ResourceType> = {}): ResourceType => ({
  id: 'do', name: 'Do', shortLabel: 'Do', captionPrefix: 'Do', numberingTemplate: '', resetOn: 'never', counterFormat: 'decimal',
  ...extra,
});

const svg = (caption: string): Resource => ({
  id: 'do-grid', typeId: 'do', kind: 'svg', placement: { position: 'here' }, createdAt: 0, updatedAt: 0,
  caption, svg: { fileId: 'grid.svg', width: 20, height: 10 },
});

function build(type: ResourceType, caption: string, markdown = 'See :ref{id="do-grid"} and :ref{id="do-grid" style="full"} here.\n\n::resource{id="do-grid"}\n'): VDTDocument {
  const config: PostextConfig = { layout: { layoutType: 'single' }, resourceTypes: [type] };
  return buildDocument({ markdown, resources: [svg(caption)] }, config);
}

const resourceBlock = (doc: VDTDocument): ResolvedResourceBlock =>
  doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])])
    .map((b) => b.resourceBlock)
    .find((rb): rb is ResolvedResourceBlock => rb !== undefined)!;

const paragraphText = (doc: VDTDocument): string =>
  doc.pages[0]!.columns[0]!.blocks.find((b) => b.type === 'paragraph')!.lines.map((l) => l.text).join(' ');

describe('EF-149: an empty resource numberingTemplate', () => {
  it('sets the caption as "<prefix>. <caption>"', () => {
    const doc = build(doType(), 'Lines at 0°');
    expect(resourceBlock(doc).number).toBe('');
    expect(resourceBlock(doc).captionLines.map((l) => l.text).join(' ')).toBe('Do. Lines at 0°');
  });

  it('prints the label alone in a reference, short and full', () => {
    const doc = build(doType({ name: 'Diagram' }), 'Lines at 0°');
    expect(paragraphText(doc)).toBe('See Do and Diagram here.');
  });

  it('adds no second full stop after a prefix that ends in one', () => {
    const doc = build(doType({ captionPrefix: 'Pl.' }), 'Lines at 0°');
    expect(resourceBlock(doc).captionLines.map((l) => l.text).join(' ')).toBe('Pl. Lines at 0°');
  });

  it('counts a colon, a question or exclamation mark and an ellipsis as a stop', () => {
    for (const prefix of ['Note:', 'Why?', 'Look!', 'Fig…', '図：']) {
      const doc = build(doType({ captionPrefix: prefix }), 'Lines at 0°');
      expect(resourceBlock(doc).captionLines.map((l) => l.text).join(' ')).toBe(`${prefix} Lines at 0°`);
    }
  });

  it('drops spaces at the end of the prefix before the stop', () => {
    const doc = build(doType({ captionPrefix: 'Do ' }), 'Lines at 0°');
    expect(resourceBlock(doc).captionLines.map((l) => l.text).join(' ')).toBe('Do. Lines at 0°');
    const stopped = build(doType({ captionPrefix: 'Pl. ' }), 'Lines at 0°');
    expect(resourceBlock(stopped).captionLines.map((l) => l.text).join(' ')).toBe('Pl. Lines at 0°');
  });

  it('leaves a numbered caption and reference as they were', () => {
    const doc = build(doType({ numberingTemplate: '{n}' }), 'Lines at 0°');
    expect(resourceBlock(doc).captionLines.map((l) => l.text).join(' ')).toBe('Do\u00A01. Lines at 0°');
    expect(paragraphText(doc)).toBe('See Do\u00A01 and Do\u00A01 here.');
  });
});
