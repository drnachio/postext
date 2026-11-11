import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from 'postext';
import { referencedFileIds, toSummary, type ProjectRecord } from './projects.js';
import { projectFileId, projectFontFileId, remapContentFileIds } from './projectFiles.js';
import { PROJECT_RECORD_VERSION } from './projectMigration.js';
import type { BookContent } from '../book/types.js';

const book: BookContent = { chapters: [{ id: 'c1', title: 'One', markdown: '# x', createdAt: 0, updatedAt: 0 }], activeChapterId: 'c1' };

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
  { id: 'draw', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'blob-2', pdfFileId: 'blob-3' } },
  { id: 'tbl', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0, table: { model: { rows: [] } } },
];

describe('referencedFileIds', () => {
  it('collects blob and font ids, deduplicated', () => {
    const refs = referencedFileIds({ resources, config });
    expect([...refs.blobIds]).toEqual(['blob-1', 'blob-2', 'blob-3']);
    expect([...refs.fontIds]).toEqual(['font-a']);
  });
  it('keeps the cover picture alive', () => {
    const refs = referencedFileIds({ resources, config, thumbnail: { fileId: 'blob-cover', mime: 'image/jpeg' } });
    expect([...refs.blobIds]).toContain('blob-cover');
  });
});

describe('remapContentFileIds', () => {
  it('rewrites every fileId through the mapper and reports the pairs once', () => {
    const out = remapContentFileIds(
      { ...book, config, resources },
      (_old, kind, hint) => (kind === 'blob' ? projectFileId('p1', hint) : projectFontFileId('p1', hint)),
    );
    expect(out.content.resources[0].bitmap?.fileId).toBe('project:p1:pic-png');
    expect(out.content.resources[1].svg).toEqual({ fileId: 'project:p1:draw-svg', pdfFileId: 'project:p1:draw-pdf' });
    expect(out.content.resources[2]).toBe(resources[2]);
    expect(out.blobPairs).toEqual([
      ['blob-1', 'project:p1:pic-png'],
      ['blob-2', 'project:p1:draw-svg'],
      ['blob-3', 'project:p1:draw-pdf'],
    ]);
    const variants = out.content.config.customFonts![0].variants;
    expect(variants.map((v) => v.fileId)).toEqual(['project-font:p1:body-ttf', 'project-font:p1:body-ttf']);
    expect(out.fontPairs).toEqual([['font-a', 'project-font:p1:body-ttf', 'ttf']]);
    // Inputs untouched.
    expect(resources[0].bitmap?.fileId).toBe('blob-1');
    expect(config.customFonts![0].variants[0].fileId).toBe('font-a');
  });

  it('carries a bitmap\'s print original under an id of its own', () => {
    const photo: Resource = { id: 'photo', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'blob-4', format: 'png', width: 1, height: 1, printFileId: 'blob-5', printFormat: 'tiff' } };
    expect([...referencedFileIds({ resources: [photo], config }).blobIds]).toEqual(['blob-4', 'blob-5']);
    const out = remapContentFileIds({ ...book, config, resources: [photo] }, (_old, kind, hint) => (kind === 'blob' ? projectFileId('p1', hint) : projectFontFileId('p1', hint)));
    expect(out.content.resources[0].bitmap).toMatchObject({ fileId: 'project:p1:photo-png', printFileId: 'project:p1:photo-tif', printFormat: 'tiff' });
    expect(out.blobPairs).toContainEqual(['blob-5', 'project:p1:photo-tif']);
  });

  it('leaves untouched ids alone and emits no pairs', () => {
    const out = remapContentFileIds({ ...book, config, resources }, (old) => old);
    expect(out.blobPairs).toEqual([]);
    expect(out.fontPairs).toEqual([]);
    expect(out.content.resources[0]).toBe(resources[0]);
  });
});

describe('toSummary', () => {
  it('drops the content slices', () => {
    const record: ProjectRecord = {
      version: PROJECT_RECORD_VERSION, id: 'p', name: 'P', description: 'd', locale: 'es', bundleId: 'b', sourcePresetId: 's',
      thumbnail: { fileId: 'blob-cover', mime: 'image/jpeg' },
      createdAt: 1, updatedAt: 2, ...book, config, resources,
    };
    expect(toSummary(record)).toEqual({
      id: 'p', name: 'P', description: 'd', locale: 'es', bundleId: 'b', sourcePresetId: 's',
      thumbnail: { fileId: 'blob-cover', mime: 'image/jpeg' },
      createdAt: 1, updatedAt: 2, chapterCount: 1,
    });
  });
});

describe('a picture\'s assigned profile in a project', () => {
  it('is kept alive and moves with the picture', () => {
    const withProfile: Resource[] = [{ id: 'pic', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'blob-1', format: 'png', width: 1, height: 1 }, printColor: { assignedRgbProfile: { name: 'Camera', fileId: 'blob-icc' } } }];
    expect([...referencedFileIds({ resources: withProfile, config }).blobIds]).toContain('blob-icc');
    const out = remapContentFileIds({ ...book, config, resources: withProfile }, (_old, kind, hint) => (kind === 'blob' ? projectFileId('p1', hint) : projectFontFileId('p1', hint)));
    expect(out.content.resources[0].printColor?.assignedRgbProfile).toEqual({ name: 'Camera', fileId: 'project:p1:pic-icc' });
  });
});
