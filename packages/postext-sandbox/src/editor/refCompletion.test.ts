import { describe, expect, it } from 'vitest';
import type { Resource, ResourceType } from 'postext';
import { buildRefOptions, refMicroformat } from './refCompletion';

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
