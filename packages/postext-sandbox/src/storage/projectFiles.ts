// Project-owned copies of binary payloads. Preset blobs and fonts live under
// deterministic `preset:<id>:…` ids that every preset reload overwrites, so a
// project duplicated from a preset must own its own copies — otherwise the
// project's images would silently change when the bundle is edited on disk.

import type { CustomFontFormat, PostextConfig, Resource } from 'postext';
import { slugify } from '../panels/resources/slugify';
import { getBlob, putBlobAt } from './blobStore';
import { getFontFile, putFontFile } from './fontStorage';
import type { ProjectContent } from './projects';

export function projectFileId(projectId: string, file: string): string {
  return `project:${projectId}:${slugify(file)}`;
}

export function projectFontFileId(projectId: string, file: string): string {
  return `project-font:${projectId}:${slugify(file)}`;
}

export type FileIdMapper = (oldId: string, kind: 'blob' | 'font', hint: string) => string;

export interface RemappedContent {
  content: ProjectContent;
  /** `[oldId, newId]` for every blob whose id changed. */
  blobPairs: [string, string][];
  /** `[oldId, newId, format]` for every font file whose id changed. */
  fontPairs: [string, string, CustomFontFormat][];
}

/** Rewrite every `fileId` in `content` through `map`. Pure: returns fresh
 *  objects and the id pairs a caller needs to copy the bytes. Ids the mapper
 *  leaves unchanged produce no pair. */
export function remapContentFileIds(content: ProjectContent, map: FileIdMapper): RemappedContent {
  const blobPairs: [string, string][] = [];
  const fontPairs: [string, string, CustomFontFormat][] = [];
  const blobSeen = new Map<string, string>();

  const resources: Resource[] = content.resources.map((r) => {
    const fileId = r.bitmap?.fileId ?? r.svg?.fileId;
    if (!fileId) return r;
    let next = blobSeen.get(fileId);
    if (next === undefined) {
      const ext = r.kind === 'svg' ? 'svg' : (r.bitmap?.format ?? 'bin');
      next = map(fileId, 'blob', `${r.id}.${ext}`);
      blobSeen.set(fileId, next);
      if (next !== fileId) blobPairs.push([fileId, next]);
    }
    if (next === fileId) return r;
    if (r.bitmap) return { ...r, bitmap: { ...r.bitmap, fileId: next } };
    if (r.svg) return { ...r, svg: { ...r.svg, fileId: next } };
    return r;
  });

  const fontSeen = new Map<string, string>();
  const customFonts = content.config.customFonts?.map((family) => ({
    ...family,
    variants: family.variants.map((v) => {
      let next = fontSeen.get(v.fileId);
      if (next === undefined) {
        const hint = v.fileName ?? `${family.name}-${v.weight}-${v.style}.${v.format}`;
        next = map(v.fileId, 'font', hint);
        fontSeen.set(v.fileId, next);
        if (next !== v.fileId) fontPairs.push([v.fileId, next, v.format]);
      }
      return next === v.fileId ? v : { ...v, fileId: next };
    }),
  }));

  const config: PostextConfig = customFonts ? { ...content.config, customFonts } : content.config;
  return { content: { markdown: content.markdown, config, resources }, blobPairs, fontPairs };
}

export interface CopiedFiles {
  missingBlobs: string[];
  missingFonts: string[];
}

/** Copy bytes in IndexedDB for each pair. Sources that no longer exist are
 *  skipped and reported so the caller can warn. */
export async function copyContentFiles(
  pairs: Pick<RemappedContent, 'blobPairs' | 'fontPairs'>,
): Promise<CopiedFiles> {
  const missingBlobs: string[] = [];
  const missingFonts: string[] = [];
  await Promise.all([
    ...pairs.blobPairs.map(async ([from, to]) => {
      const rec = await getBlob(from).catch(() => null);
      if (!rec) { missingBlobs.push(from); return; }
      await putBlobAt(to, rec.bytes, rec.contentType);
    }),
    ...pairs.fontPairs.map(async ([from, to]) => {
      const rec = await getFontFile(from).catch(() => null);
      if (!rec) { missingFonts.push(from); return; }
      await putFontFile({ ...rec, fileId: to });
    }),
  ]);
  return { missingBlobs, missingFonts };
}

/** Give `content` its own copies of every referenced file under
 *  `newProjectId`. Used by "new project from current" and "duplicate". */
export async function cloneContentForProject(
  content: ProjectContent,
  newProjectId: string,
): Promise<{ content: ProjectContent; missing: CopiedFiles }> {
  const remapped = remapContentFileIds(content, (_old, kind, hint) =>
    kind === 'blob' ? projectFileId(newProjectId, hint) : projectFontFileId(newProjectId, hint),
  );
  const missing = await copyContentFiles(remapped);
  return { content: remapped.content, missing };
}
