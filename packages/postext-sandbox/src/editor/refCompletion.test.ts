import { describe, expect, it } from 'vitest';
import type { Resource, ResourceType } from 'postext';
import { anchorsOf, buildRefOptions, referencesOf, refMicroformat } from './refCompletion';

const types: ResourceType[] = [
  { id: 'figure', name: 'Figura', shortLabel: 'Fig.', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Figura' },
  { id: 'table', name: 'Tabla', shortLabel: 'Tabla', numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', captionPrefix: 'Tabla' },
];

function res(id: string, typeId: string, caption?: string): Resource {
  return { id, typeId, kind: typeId === 'table' ? 'table' : 'svg', caption, createdAt: 0, updatedAt: 0 };
}

const resources = [
  res('layout-pipeline', 'figure', 'The **layout** pipeline'),
  res('feature-comparison', 'table', 'Feature comparison'),
  res('measurement-speed', 'figure', 'Medición de velocidad'),
];

describe('buildRefOptions', () => {
  it('lists every resource in panel order for a bare @', () => {
    expect(buildRefOptions({ resources, types }, '').map((o) => o.label)).toEqual([
      'layout-pipeline',
      'feature-comparison',
      'measurement-speed',
    ]);
  });

  it('ranks id prefix over id substring over caption over type name', () => {
    const labels = buildRefOptions({ resources, types }, 'fea').map((o) => o.label);
    expect(labels).toEqual(['feature-comparison']);
    // "tabla" only matches the type name of the table resource
    expect(buildRefOptions({ resources, types }, 'tabla').map((o) => o.label)).toEqual(['feature-comparison']);
  });

  it('matches captions case- and accent-insensitively, with spaces', () => {
    expect(buildRefOptions({ resources, types }, 'medicion de').map((o) => o.label)).toEqual(['measurement-speed']);
  });

  it('strips inline marks from the caption preview and names the type', () => {
    const [opt] = buildRefOptions({ resources, types }, 'layout');
    expect(opt?.caption).toBe('The layout pipeline');
    expect(opt?.detail).toBe('Figura');
  });

  it('returns nothing when no resource matches', () => {
    expect(buildRefOptions({ resources, types }, 'zzz')).toEqual([]);
  });
});

describe('refMicroformat', () => {
  it('emits the inline :ref directive', () => {
    expect(refMicroformat('layout-pipeline')).toBe(':ref{id="layout-pipeline" style="full"}');
  });
});

describe('headings and anchors in the @ picker (#262)', () => {
  it('lists every heading id and anchor of the book, first setting kept', () => {
    const anchors = anchorsOf(['# One {#one}\n\nThe [claim]{#claim} and :anchor{#spot}.', ':::callout{#box title="Box"}\nIn.\n:::\n\n## Two {#one}']);
    expect(anchors).toEqual([
      { id: 'one', kind: 'heading', title: 'One' },
      { id: 'claim', kind: 'anchor', title: 'claim' },
      { id: 'spot', kind: 'anchor', title: '' },
      { id: 'box', kind: 'anchor', title: 'Box' },
    ]);
  });

  it('offers them after the resources and inserts a :ref', () => {
    const options = buildRefOptions({ resources: [], types: [], anchors: () => [{ id: 'sec-intro', kind: 'heading', title: 'Introduction' }] }, 'intro');
    expect(options.map((o) => o.label)).toEqual(['sec-intro']);
  });
});

describe('references in the @ picker (#268)', () => {
  const md = '---\nreferences:\n  - {id: garcia2020, author: ["García, Ana"], title: Tipografía, issued: 2020}\n---\n# One\n\n:::references{format=bibtex}\n@book{knuth84, author={Knuth, Donald}, title={The TeXbook}, year=1984}\n:::\n';

  it('lists the references of every chapter, labelled by author and year', () => {
    expect(referencesOf([md])).toEqual([
      { id: 'garcia2020', title: 'García 2020 — Tipografía' },
      { id: 'knuth84', title: 'Knuth 1984 — The TeXbook' },
    ]);
  });

  it('offers them before the resources and writes a citation', () => {
    const options = buildRefOptions({ resources, types, references: () => referencesOf([md]) }, 'kn');
    expect(options[0]!.label).toBe('knuth84');
  });
});
