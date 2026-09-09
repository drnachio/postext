import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { referencedFileIds, toSummary, type ProjectRecord } from './projects';
import { projectFileId, projectFontFileId, remapContentFileIds } from './projectFiles';

const config: PostextConfig = {
  customFonts: [
    {
      name: 'Body',
      variants: [
        { weight: 400, style: 'normal', fileId: 'font-a', format: 'ttf', fileName: 'Body.ttf' },
        { weight: 700, style: 'normal', fileId: 'font-a', format: 'ttf' },
      ],
    },
  ],
};
const resources: Resource[] = [
  { id: 'pic', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'blob-1', format: 'png', width: 1, height: 1 } },
  { id: 'draw', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'blob-2' } },
  { id: 'tbl', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, table: { model: { rows: [] } } },
];

describe('referencedFileIds', () => {
  it('collects blob and font ids, deduplicated', () => {
    const refs = referencedFileIds({ resources, config });
    expect([...refs.blobIds]).toEqual(['blob-1', 'blob-2']);
    expect([...refs.fontIds]).toEqual(['font-a']);
  });
});

describe('remapContentFileIds', () => {
  it('rewrites every fileId through the mapper and reports the pairs once', () => {
    const out = remapContentFileIds(
      { markdown: 'x', config, resources },
      (_old, kind, hint) => (kind === 'blob' ? projectFileId('p1', hint) : projectFontFileId('p1', hint)),
    );
    expect(out.content.resources[0].bitmap?.fileId).toBe('project:p1:pic-png');
    expect(out.content.resources[1].svg?.fileId).toBe('project:p1:draw-svg');
    expect(out.content.resources[2]).toBe(resources[2]);
    expect(out.blobPairs).toEqual([['blob-1', 'project:p1:pic-png'], ['blob-2', 'project:p1:draw-svg']]);
    const variants = out.content.config.customFonts![0].variants;
    expect(variants.map((v) => v.fileId)).toEqual(['project-font:p1:body-ttf', 'project-font:p1:body-ttf']);
    expect(out.fontPairs).toEqual([['font-a', 'project-font:p1:body-ttf', 'ttf']]);
    // Inputs untouched.
    expect(resources[0].bitmap?.fileId).toBe('blob-1');
    expect(config.customFonts![0].variants[0].fileId).toBe('font-a');
  });

  it('leaves untouched ids alone and emits no pairs', () => {
    const out = remapContentFileIds({ markdown: '', config, resources }, (old) => old);
    expect(out.blobPairs).toEqual([]);
    expect(out.fontPairs).toEqual([]);
    expect(out.content.resources[0]).toBe(resources[0]);
  });
});

describe('toSummary', () => {
  it('drops the content slices', () => {
    const record: ProjectRecord = {
      id: 'p', name: 'P', description: 'd', locale: 'es', bundleId: 'b', sourcePresetId: 's',
      createdAt: 1, updatedAt: 2, markdown: '# x', config, resources,
    };
    expect(toSummary(record)).toEqual({
      id: 'p', name: 'P', description: 'd', locale: 'es', bundleId: 'b', sourcePresetId: 's', createdAt: 1, updatedAt: 2,
    });
  });
});
