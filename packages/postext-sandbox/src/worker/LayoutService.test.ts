import { describe, expect, it, vi } from 'vitest';
import type { LayoutWorkerHandle } from 'postext/worker';
import type { VDTDocument } from 'postext';

vi.mock('../controls/fontLoader', () => ({
  getConfigFontFamilies: () => [],
  collectFontPayloadsForFamilies: async () => [],
  onCustomFontsChanged: () => () => {},
}));

import { createLayoutService } from './LayoutService';

interface FakeBuild {
  markdown: string;
  cacheKey: string | undefined;
  finish: (doc?: VDTDocument) => void;
  aborted: boolean;
}

/** A worker handle whose builds finish when the test says so. */
function fakeHandle() {
  const builds: FakeBuild[] = [];
  const handle: LayoutWorkerHandle = {
    registerFonts: async () => {},
    unregisterFonts: async () => {},
    dispose: () => {},
    build: (content, _config, opts) =>
      new Promise<VDTDocument>((resolve, reject) => {
        const entry: FakeBuild = {
          markdown: content.markdown,
          cacheKey: opts?.cacheKey,
          aborted: false,
          finish: (doc) => resolve(doc ?? ({ pages: [], blocks: [] } as unknown as VDTDocument)),
        };
        opts?.signal?.addEventListener('abort', () => {
          entry.aborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
        builds.push(entry);
      }),
  };
  return { handle, builds };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const content = (markdown: string) => ({ markdown });

describe('createLayoutService', () => {
  it('runs one build at a time, more urgent first', async () => {
    const { handle, builds } = fakeHandle();
    const service = createLayoutService({ handle });
    const bg = service.build({ clientId: 'paginator', priority: 'background', content: content('bg'), config: {} });
    await tick();
    const pdf = service.build({ clientId: 'pdf', priority: 'pdf', content: content('pdf'), config: {} });
    const preview = service.build({ clientId: 'canvas', priority: 'preview', content: content('preview'), config: {} });
    await tick();
    // The background build was interrupted for the preview; nothing else started.
    expect(builds.map((b) => b.markdown)).toEqual(['bg', 'preview']);
    expect(builds[0]!.aborted).toBe(true);
    builds[1]!.finish();
    await preview;
    await tick();
    // Then the PDF, then the interrupted background chapter again — its
    // promise still pending, never rejected.
    expect(builds.map((b) => b.markdown)).toEqual(['bg', 'preview', 'pdf']);
    builds[2]!.finish();
    await pdf;
    await tick();
    expect(builds.map((b) => b.markdown)).toEqual(['bg', 'preview', 'pdf', 'bg']);
    builds[3]!.finish();
    await expect(bg).resolves.toBeTruthy();
    service.dispose();
  });

  it('lets the last request of a client win', async () => {
    const { handle, builds } = fakeHandle();
    const service = createLayoutService({ handle });
    const first = service.build({ clientId: 'canvas', priority: 'preview', content: content('v1'), config: {} });
    await tick();
    const second = service.build({ clientId: 'canvas', priority: 'preview', content: content('v2'), config: {} });
    const third = service.build({ clientId: 'canvas', priority: 'preview', content: content('v3'), config: {} });
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    await tick();
    // v2 never reached the worker; v3 runs once v1's cancel is acknowledged.
    expect(builds.map((b) => b.markdown)).toEqual(['v1', 'v3']);
    builds[1]!.finish();
    await expect(third).resolves.toBeTruthy();
    service.dispose();
  });

  it('passes the cache key through and cancels a client on request', async () => {
    const { handle, builds } = fakeHandle();
    const service = createLayoutService({ handle });
    const p = service.build({ clientId: 'canvas', priority: 'preview', content: content('x'), config: {}, cacheKey: 'k1' });
    await tick();
    expect(builds[0]!.cacheKey).toBe('k1');
    service.cancel('canvas');
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    service.dispose();
  });
});
