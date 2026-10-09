// The Sandbox side of a Word import: pictures stored as blobs and turned
// into bitmap / SVG resources, tables into table resources, and the import
// templates kept in the browser.

import { useCallback, useState } from 'react';
import type { Resource, ResourceType } from 'postext';
import { putBlob } from '../storage/blobStore';
import { isValidSvg, svgIntrinsicSize } from '../panels/resources/svgIntrinsic';
import { parseTemplate, type ImportResult, type WordTemplate } from 'postext/word';

const BITMAP_FORMATS: Record<string, 'png' | 'jpeg' | 'webp' | 'gif'> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const typeFor = (types: readonly ResourceType[], wanted: string): string =>
  types.find((t) => t.id === wanted)?.id ?? types[0]?.id ?? wanted;

/** Copy into a buffer of its own (a zip entry is a view on the archive). */
const own = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer as ArrayBuffer;

/** Resources for the pictures and tables of an import, blobs stored. */
export async function importedResources(result: ImportResult, types: readonly ResourceType[]): Promise<Resource[]> {
  const now = Date.now();
  const out: Resource[] = [];
  const figure = typeFor(types, 'figure');
  for (const pic of result.pictures) {
    const meta = {
      ...(pic.caption ? { caption: pic.caption } : {}),
      ...(pic.alt ? { altText: pic.alt } : {}),
      createdAt: now,
      updatedAt: now,
    };
    try {
      if (pic.media.contentType === 'image/svg+xml') {
        const text = new TextDecoder().decode(pic.media.bytes);
        if (!isValidSvg(text)) continue;
        const fileId = await putBlob(own(pic.media.bytes), 'image/svg+xml');
        out.push({ id: pic.id, typeId: figure, kind: 'svg', svg: { fileId, ...svgIntrinsicSize(text) }, ...meta });
        continue;
      }
      const format = BITMAP_FORMATS[pic.media.contentType];
      if (!format) continue;
      let width = 0;
      let height = 0;
      try {
        const bitmap = await createImageBitmap(new Blob([own(pic.media.bytes)], { type: pic.media.contentType }));
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
      } catch {
        // Undecodable here (an odd GIF): the engine reads the size later.
      }
      const fileId = await putBlob(own(pic.media.bytes), pic.media.contentType);
      out.push({ id: pic.id, typeId: figure, kind: 'bitmap', bitmap: { fileId, format, width, height }, ...meta });
    } catch {
      // A picture that cannot be stored is left out; its `::resource` line
      // stays and the warnings panel names the missing resource.
    }
  }
  const table = typeFor(types, 'table');
  for (const t of result.tables) {
    out.push({
      id: t.id,
      typeId: table,
      kind: 'table',
      table: { model: t.model },
      ...(t.caption ? { caption: t.caption } : {}),
      createdAt: now,
      updatedAt: now,
    });
  }
  return out;
}

const LAST_TEMPLATE_KEY = 'postext-sandbox-word-last-template';

export function loadLastTemplateId(): string | null {
  try {
    return window.localStorage.getItem(LAST_TEMPLATE_KEY);
  } catch {
    return null;
  }
}

export function saveLastTemplateId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(LAST_TEMPLATE_KEY, id);
    else window.localStorage.removeItem(LAST_TEMPLATE_KEY);
  } catch {
    // A private window keeps no choice; the dialog falls back to automatic.
  }
}

/** The saved import templates, newest first. `save` and `remove` answer
 *  whether the browser kept the change. */
export function useWordTemplates(): {
  templates: WordTemplate[];
  save: (t: WordTemplate) => boolean;
  remove: (id: string) => boolean;
} {
  const [templates, setTemplates] = useState<WordTemplate[]>(() => loadTemplates());
  const save = useCallback((t: WordTemplate): boolean => {
    const list = [t, ...loadTemplates().filter((x) => x.id !== t.id)];
    setTemplates(list);
    return saveTemplates(list);
  }, []);
  const remove = useCallback((id: string): boolean => {
    const list = loadTemplates().filter((x) => x.id !== id);
    setTemplates(list);
    return saveTemplates(list);
  }, []);
  return { templates, save, remove };
}

// ---------------------------------------------------------------------------
// Browser storage
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'postext-sandbox-word-templates';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadTemplates(): WordTemplate[] {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.map(parseTemplate).filter((t): t is WordTemplate => !!t && !!t.id);
  } catch {
    return [];
  }
}

export function saveTemplates(list: readonly WordTemplate[]): boolean {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
