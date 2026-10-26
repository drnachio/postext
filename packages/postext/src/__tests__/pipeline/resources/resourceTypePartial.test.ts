import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { completeResourceType, effectiveResourceTypes } from '../../../defaults/resources/resourceTypes.js';
import { collectConfigWarnings } from '../../../checks/configWarnings.js';
import type { PostextConfig, Resource, ResourceType } from '../../../types.js';

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

// #916: a resource type written in part (no `resetOn`, `counterFormat`,
// `shortLabel`) used to abort the book with a TypeError in the numbering.
const partial = { id: 'foto', name: 'Foto', numberingTemplate: '{n}', captionPrefix: 'Foto', defaultPlacement: { position: 'here' } } as unknown as ResourceType;
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50"/></svg>';
const resources: Resource[] = [
  { id: 'a', typeId: 'foto', kind: 'svg', svg, caption: 'Uno', placement: { position: 'here' }, createdAt: 0, updatedAt: 0 } as unknown as Resource,
  { id: 'b', typeId: 'foto', kind: 'svg', svg, caption: 'Dos', placement: { position: 'here' }, createdAt: 0, updatedAt: 0 } as unknown as Resource,
];

describe('a resource type written in part (#916)', () => {
  it('lays the book out and numbers its resources, resetting on every h1', () => {
    const config: PostextConfig = { resourceTypes: [partial] };
    const markdown = '# Uno\n\n::resource{id="a"}\n\n# Dos\n\n::resource{id="b"}\n';
    const doc = buildDocument({ markdown, resources }, config);
    expect(doc.pages.length).toBeGreaterThan(0);
    const numbers: string[] = [];
    for (const page of doc.pages) {
      for (const col of page.columns) for (const b of col.blocks) if (b.resourceBlock) numbers.push(`${b.resourceBlock.captionPrefix} ${b.resourceBlock.number}`);
      for (const f of page.floats ?? []) if (f.resourceBlock) numbers.push(`${f.resourceBlock.captionPrefix} ${f.resourceBlock.number}`);
    }
    expect(numbers).toEqual(['Foto 1', 'Foto 1']);
  });

  it('takes the missing fields from the built-in numbering, and the labels from its name', () => {
    expect(completeResourceType(partial)).toMatchObject({ id: 'foto', name: 'Foto', shortLabel: 'Foto', captionPrefix: 'Foto', numberingTemplate: '{n}', resetOn: 'h1', counterFormat: 'decimal' });
    expect(completeResourceType({ id: 'x' })).toMatchObject({ name: 'x', shortLabel: 'x', captionPrefix: 'x', numberingTemplate: '{h1}.{n}' });
  });

  it('takes the built-in type of the same id first, in the document language', () => {
    const [figure] = effectiveResourceTypes({ locale: 'es', resourceTypes: [{ id: 'figure' } as unknown as ResourceType] });
    expect(figure).toMatchObject({ name: 'Figura', shortLabel: 'Fig.', captionPrefix: 'Figura', resetOn: 'h1', numberingTemplate: '{h1}.{n}' });
  });

  // #1037: before #916 a type with no `shortLabel` was cited by its `name`;
  // the built-in short label of the same id must not replace a name the type gives.
  it('cites a type that names itself by that name, not by the built-in short label', () => {
    const [figure] = effectiveResourceTypes({ locale: 'es', resourceTypes: [{ id: 'figure', name: 'Lámina' } as unknown as ResourceType] });
    expect(figure).toMatchObject({ name: 'Lámina', shortLabel: 'Lámina', captionPrefix: 'Figura', resetOn: 'h1', numberingTemplate: '{h1}.{n}' });
    const table = { id: 'table', name: 'Table', captionPrefix: 'Table', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal' } as unknown as ResourceType;
    const config: PostextConfig = { locale: 'en-us', resourceTypes: [table] };
    const markdown = 'The roofs made most of it (:ref{id="a"}).\n\n::resource{id="a"}\n';
    const doc = buildDocument({ markdown, resources: [{ ...resources[0]!, typeId: 'table' }] }, config);
    const text = doc.pages.flatMap((page) => page.columns.flatMap((col) => col.blocks.flatMap((b) => b.lines.map((l) => l.text)))).join(' ');
    expect(text).toMatch(/\(Table\s1\)/); // a no-break space before the number
    expect(text).not.toMatch(/Tab\.\s1/);
  });

  it('returns the same list when every type is whole', () => {
    const whole: ResourceType[] = [{ id: 'f', name: 'F', shortLabel: 'F', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'F' }];
    expect(effectiveResourceTypes({ resourceTypes: whole })).toBe(whole);
  });

  it('reports a resetOn that names no level', () => {
    const warnings = collectConfigWarnings({ resourceTypes: [{ ...partial, resetOn: 'h7' } as unknown as ResourceType] });
    expect(warnings).toContainEqual(expect.objectContaining({ kind: 'unknownConfigValue', path: 'resourceTypes[0].resetOn', value: 'h7', used: 'h1' }));
    expect(completeResourceType({ ...partial, resetOn: 'chapter' } as unknown as ResourceType).resetOn).toBe('h1');
  });
});
