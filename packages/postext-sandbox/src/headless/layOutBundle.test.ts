import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDocument, type PostextConfig, type PostextContent, type VDTDocument } from 'postext';
import { createBundle } from 'postext/bundle';
import type { LayoutWorkerHandle } from 'postext/worker';

// #736: a bundle laid out by the Sandbox's own functions, outside the
// interface. The steps are the provider's, in its order: the bundle's font
// files stored and declared, the font loader's steps of a preview before
// its build, then every chapter through the layout service, each one
// continuing the one before.

const calls = vi.hoisted(() => [] as string[]);

vi.mock('../controls/fonts/fontLoader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../controls/fonts/fontLoader.js')>();
  const note = (name: string) => async (config: PostextConfig) => {
    calls.push(`${name}${config.bodyText?.hyphenation?.locale ? ` (${config.bodyText.hyphenation.locale})` : ''}`);
    return false as never;
  };
  return {
    ...actual,
    setCustomFonts: (list: { name: string }[] | undefined, options?: { newBook?: boolean }) => {
      calls.push(`setCustomFonts ${(list ?? []).map((f) => f.name).join(',')}${options?.newBook ? ' newBook' : ''}`);
    },
    preloadConfigFonts: note('preloadConfigFonts'),
    ensureConfigFontsLoaded: note('ensureConfigFontsLoaded'),
    loadVerticalTwins: note('loadVerticalTwins'),
    declareStandIns: note('declareStandIns'),
    // What the layout service sends the worker: the three files of the
    // house family (its own, as the bundle carries them), and one file per
    // weight and slant asked of a family of the catalogue (#757).
    getCustomFontFamily: (family: string) => (family === 'House Serif' ? { name: family, variants: [] } : undefined),
    collectFontPayloadsForFamilies: async (families: string[]) => families.flatMap((family) => [
      { family, weight: '400', style: 'normal', buffer: new ArrayBuffer(1) },
      { family, weight: '400', style: 'normal', buffer: new ArrayBuffer(1) },
      { family, weight: '700', style: 'normal', buffer: new ArrayBuffer(1) },
    ]),
    familyCutFaces: async (family: string, uses: { weight: number; style: string }[], options?: { standard?: boolean }) => {
      const standard = options?.standard ? [400, 700].flatMap((weight) => ['normal', 'italic'].map((style) => ({ weight, style }))) : [];
      return [...new Map([...uses, ...standard].map((u) => [`${u.weight}|${u.style}`, u])).values()]
        .map((u) => ({ family, weight: String(u.weight), style: u.style, url: `${family}-${u.weight}-${u.style}` }));
    },
    fetchFacePayloads: async (faces: { family: string; weight: string; style: string }[]) =>
      faces.map((f) => ({ family: f.family, weight: f.weight, style: f.style, buffer: new ArrayBuffer(1) })),
    loadFont: async () => {},
    collectStandInPayloads: async () => [],
    onCustomFontsChanged: () => () => {},
  };
});

vi.mock('../storage/fontStorage.js', () => ({
  putFontFile: async (file: { fileId: string }) => { calls.push(`putFontFile ${file.fileId.replace(/^project-font:[^:]+:/, '')}`); },
  getFontFile: async () => null,
}));

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

import { layOutBundle } from './layOutBundle.js';

/** A worker handle that lays out with the engine on this thread. */
function engineHandle() {
  const builds: { content: PostextContent; config: PostextConfig | undefined }[] = [];
  const registered: string[] = [];
  const handle: LayoutWorkerHandle = {
    registerFonts: async (faces) => {
      calls.push(`registerFonts ${faces.length}`);
      registered.push(...faces.map((f) => `${f.family} ${f.weight}`));
    },
    unregisterFonts: async () => {},
    dispose: () => { calls.push('dispose'); },
    warm: async () => {},
    build: async (content, config) => {
      calls.push('build');
      builds.push({ content, config });
      return buildDocument(content, config);
    },
  };
  return { handle, builds, registered };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(240), height: pt(320), margins: { top: pt(24), bottom: pt(24), left: pt(24), right: pt(24) } },
  bodyText: { fontFamily: 'House Serif' },
  headings: { fontFamily: 'House Serif' },
};
const paragraph = 'The quick brown fox jumps over the lazy dog and keeps running along the river bank until the evening. ';

async function bundle(extra: Partial<PostextConfig> = {}): Promise<Uint8Array> {
  const created = await createBundle({
    id: 'house-book', name: 'House book', locale: 'en',
    config: {
      ...config, ...extra,
      customFonts: [{ name: 'House Serif', variants: [{ weight: 400, style: 'normal', fileId: 'house.ttf', format: 'ttf' }] }],
    },
    chapters: [
      { title: 'One', markdown: `# One\n\n${Array.from({ length: 60 }, () => paragraph.repeat(4)).join('\n\n')}` },
      { title: 'Two', markdown: `# Two\n\n${paragraph.repeat(3)}\n\n::resource{id="nowhere"}` },
    ],
    files: new Map([['house.ttf', new Uint8Array([0, 1, 0, 0])]]),
  });
  return created.bytes;
}

beforeEach(() => { calls.length = 0; });

describe('layOutBundle (#736)', () => {
  it('lays every chapter out through the layout service, each continuing the one before', async () => {
    const { handle, builds } = engineHandle();
    const out = await layOutBundle(await bundle(), { locale: 'en', handle });
    expect(out.settled).toBe(true);
    expect(out.chapters.map((c) => c.title)).toEqual(['One', 'Two']);
    expect(out.chapters[0]!.pages).toBeGreaterThan(1);
    // The second chapter starts on the page after the first one's last.
    const second = builds.filter((b) => b.content.markdown.includes('# Two')).pop()!;
    expect(second.content.continuation?.pageIndexOffset).toBe(out.chapters[0]!.pages);
    expect(out.builds).toBe(builds.length);
    // Its warnings, by kind when the host gives no key of its own.
    expect(out.chapters[1]!.warnings).toContain('unknownResourceId');
    expect(out.chapters[0]!.warnings).toEqual([]);
  });

  it('does what the provider does with the fonts of a bundle that carries a family, in its order', async () => {
    const { handle, registered } = engineHandle();
    const out = await layOutBundle(await bundle(), { locale: 'es', handle });
    const firstBuild = calls.indexOf('build');
    expect(calls.slice(0, firstBuild)).toEqual([
      // importBundleBytes: the files into the font store; applyRecord: the families declared.
      'putFontFile fonts-house-serif-400-normal-ttf',
      'setCustomFonts House Serif newBook',
      // A preview before its build, with the document's language where it names none.
      'preloadConfigFonts',
      'ensureConfigFontsLoaded (es)',
      'loadVerticalTwins (es)',
      'declareStandIns (es)',
      // The layout service: the worker gets its faces before it builds,
      // the house family's three files, then the catalogue's.
      'registerFonts 3',
      `registerFonts ${registered.length - 3}`,
    ]);
    expect(registered.length).toBeGreaterThan(3);
    expect(calls.at(-1)).toBe('dispose');
    expect(registered.filter((face) => face.startsWith('House Serif'))).toEqual(['House Serif 400', 'House Serif 400', 'House Serif 700']);
    expect(out.fonts['House Serif']).toEqual({ page: [], worker: ['400 normal ×2', '700 normal'] });
  });

  it('reads the document in the interface language when the bundle names none, and leaves a named one alone', async () => {
    const unnamed = engineHandle();
    await layOutBundle(await bundle(), { locale: 'es', handle: unnamed.handle });
    expect(unnamed.builds[0]!.config?.bodyText?.hyphenation?.locale).toBe('es');
    const named = engineHandle();
    await layOutBundle(await bundle({ locale: 'en-us' }), { locale: 'es', handle: named.handle });
    expect(named.builds[0]!.config?.locale).toBe('en-us');
    expect(named.builds[0]!.config?.bodyText?.hyphenation?.locale).toBeUndefined();
  });

  it('keys layouts and warnings as its host asks', async () => {
    const { handle } = engineHandle();
    const out = await layOutBundle(await bundle(), {
      locale: 'en', handle,
      layoutHash: (doc: VDTDocument) => `h${doc.pages.length}`,
      linesHash: (doc: VDTDocument) => `l${doc.pages.length}`,
      warningsOf: (doc: VDTDocument) => (doc.contentWarnings ?? []).map((w) => `${w.kind}!`),
    });
    expect(out.chapters.map((c) => c.hash)).toEqual([`h${out.chapters[0]!.pages}`, `h${out.chapters[1]!.pages}`]);
    // The lines of a chapter, keyed apart from its boxes (#736).
    expect(out.chapters.map((c) => c.lines)).toEqual([`l${out.chapters[0]!.pages}`, `l${out.chapters[1]!.pages}`]);
    expect(out.chapters[1]!.warnings).toContain('unknownResourceId!');
  });

  it('fails as the Sandbox does on bytes that are not a bundle', async () => {
    const { handle } = engineHandle();
    await expect(layOutBundle(new Uint8Array([1, 2, 3]), { locale: 'en', handle })).rejects.toThrow();
  });
});
