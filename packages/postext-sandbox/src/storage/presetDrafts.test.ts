import { describe, expect, it, vi } from 'vitest';
import type { Resource } from 'postext';
import type { AppliedPresetSnapshot } from '../presets/types';
import { snapshotForApply } from '../presets/apply';
import type { LoadedPreset } from '../presets/types';
import type { BlobRecord } from './blobStore';
import {
  decideDraftSave,
  draftFileId,
  preserveDraftBlobs,
  presetDraftKey,
  readDraftRecord,
  remapDraftBlobs,
  type PresetDraftRecord,
} from './presetDrafts';
import { PROJECT_RECORD_VERSION } from './projectMigration';

const chapter = (id: string, markdown: string) => ({ id, title: id, markdown, createdAt: 0, updatedAt: 0 });
const fig = (id: string, fileId: string): Resource => ({ id, typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId } });

const loaded: LoadedPreset = {
  summary: { id: 'emp', name: 'EMP', source: 'public', available: true },
  locale: 'es',
  chapters: [chapter('c1', '# Uno')],
  config: {},
  resources: [fig('f1', 'preset:emp:f1-svg')],
  blobs: [],
  fonts: [],
};
const snapshot: AppliedPresetSnapshot = snapshotForApply(loaded, {
  parts: 'all',
  fingerprint: 'fp1',
  current: { chapters: [], config: {}, resources: [] },
});

function draft(over: Partial<PresetDraftRecord> = {}): PresetDraftRecord {
  return {
    version: PROJECT_RECORD_VERSION,
    key: presetDraftKey('emp', 'es'),
    presetId: 'emp',
    locale: 'es',
    snapshot,
    chapters: [chapter('c1', '# Uno editado')],
    activeChapterId: 'c1',
    config: {},
    resources: [fig('f1', 'preset:emp:f1-svg'), fig('f2', 'user-blob')],
    updatedAt: 1,
    ...over,
  };
}

describe('decideDraftSave', () => {
  const base = { activeProjectId: null, activePresetId: 'emp', snapshot, liveDraftKey: null };

  it('writes a draft for an edited preset, keyed by preset and locale', () => {
    const d = decideDraftSave({ ...base, content: { chapters: [chapter('c1', '# Otro')], config: {}, resources: loaded.resources } });
    expect(d).toEqual({ action: 'put', key: 'emp::es' });
  });

  it('does nothing for an untouched original', () => {
    const d = decideDraftSave({ ...base, content: { chapters: loaded.chapters, config: {}, resources: loaded.resources } });
    expect(d).toEqual({ action: 'none' });
  });

  it('drops the live draft once every edit is undone — only that one', () => {
    const content = { chapters: loaded.chapters, config: {}, resources: loaded.resources };
    expect(decideDraftSave({ ...base, content, liveDraftKey: 'emp::es' })).toEqual({ action: 'delete', key: 'emp::es' });
    expect(decideDraftSave({ ...base, content, liveDraftKey: 'emp::en' })).toEqual({ action: 'none' });
  });

  it('never writes for a project, or a snapshot of another preset', () => {
    const content = { chapters: [chapter('c1', 'x')], config: {}, resources: [] };
    expect(decideDraftSave({ ...base, activeProjectId: 'p1', content })).toEqual({ action: 'none' });
    expect(decideDraftSave({ ...base, activePresetId: 'other', content })).toEqual({ action: 'none' });
    expect(decideDraftSave({ ...base, snapshot: null, content })).toEqual({ action: 'none' });
  });
});

describe('readDraftRecord', () => {
  it('reads a stored draft and rejects malformed ones', () => {
    expect(readDraftRecord(draft())?.key).toBe('emp::es');
    expect(readDraftRecord({ key: 'x' })).toBeNull();
    expect(readDraftRecord(null)).toBeNull();
    expect(readDraftRecord({ ...draft(), chapters: [] })).toBeNull();
  });
});

describe('remapDraftBlobs', () => {
  it('repoints the moved blobs only', () => {
    const next = remapDraftBlobs(draft(), new Map([['preset:emp:f1-svg', 'draft:emp::es:preset:emp:f1-svg']]));
    expect(next.resources.map((r) => r.svg?.fileId)).toEqual(['draft:emp::es:preset:emp:f1-svg', 'user-blob']);
  });
});

describe('preserveDraftBlobs', () => {
  const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
  function store(initial: Record<string, string>) {
    const blobs = new Map<string, BlobRecord>(Object.entries(initial).map(([k, v]) => [k, { fileId: k, contentType: 'image/svg+xml', bytes: bytes(v) }]));
    return {
      blobs,
      deps: {
        getBlob: vi.fn(async (id: string) => blobs.get(id) ?? null),
        putBlobAt: vi.fn(async (id: string, b: ArrayBuffer, type: string) => { blobs.set(id, { fileId: id, bytes: b, contentType: type }); }),
      },
    };
  }

  it('gives a draft its own copy of a blob whose bytes are about to change', async () => {
    const { blobs, deps } = store({ 'preset:emp:f1-svg': '<svg>old</svg>' });
    const putDraft = vi.fn(async () => undefined);
    const out = await preserveDraftBlobs([{ fileId: 'preset:emp:f1-svg', bytes: bytes('<svg>new</svg>') }], {
      ...deps,
      listDrafts: async () => [draft()],
      putDraft,
    });
    const moved = draftFileId('emp::es', 'preset:emp:f1-svg');
    expect(out).toHaveLength(1);
    expect(out[0]!.resources[0]!.svg?.fileId).toBe(moved);
    expect(new TextDecoder().decode(blobs.get(moved)!.bytes)).toBe('<svg>old</svg>');
    expect(putDraft).toHaveBeenCalledOnce();
  });

  it('leaves drafts alone when the bytes do not change, or the draft is being discarded', async () => {
    const { deps } = store({ 'preset:emp:f1-svg': '<svg>same</svg>' });
    const putDraft = vi.fn(async () => undefined);
    const same = await preserveDraftBlobs([{ fileId: 'preset:emp:f1-svg', bytes: bytes('<svg>same</svg>') }], {
      ...deps, listDrafts: async () => [draft()], putDraft,
    });
    expect(same).toEqual([]);
    const discarded = await preserveDraftBlobs([{ fileId: 'preset:emp:f1-svg', bytes: bytes('<svg>new</svg>') }], {
      ...deps, listDrafts: async () => [draft()], putDraft,
    }, 'emp::es');
    expect(discarded).toEqual([]);
    expect(putDraft).not.toHaveBeenCalled();
    expect(deps.putBlobAt).not.toHaveBeenCalled();
  });
});
