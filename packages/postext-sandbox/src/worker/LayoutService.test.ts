import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayoutWorkerHandle } from 'postext/worker';
import type { VDTDocument } from 'postext';

/** What the font loader answers: the faces a build's configuration asks
 *  of each family, the files of a cut (one per subset in `subsets`), the
 *  custom families, and the stand-ins not sent yet (#688). */
const fontLoader = vi.hoisted(() => ({
  uses: {} as Record<string, { weight: number; style: 'normal' | 'italic' }[]>,
  subsets: ['latin'] as string[],
  custom: [] as string[],
  /** Families cut by slices: no regular, bold and italics beyond the faces asked. */
  sliced: [] as string[],
  standIns: [] as { family: string; weight: string; style: string; buffer: ArrayBuffer }[],
  changed: null as ((families: string[]) => void) | null,
  /** The faces the page was told to declare. */
  pageLoads: [] as string[],
  /** The faces the page was told to load for a document's characters, with those characters. */
  textLoads: [] as { faces: string[]; text: string }[],
  /** What the page's load of them waits for. */
  pageFiles: null as Promise<void> | null,
  /** What the files of a registration wait for before they are had. */
  files: null as Promise<void> | null,
  /** The files the network does not give (by URL), and the requests made
   *  for files. */
  failing: new Set<string>(),
  fileRequests: [] as string[][],
  /** The requests the network did not answer (the others in `failing` got a 404). */
  unanswered: new Set<string>(),
}));

vi.mock('../controls/fontLoader.js', () => {
  const STANDARD = [{ weight: 400, style: 'normal' }, { weight: 700, style: 'normal' }, { weight: 400, style: 'italic' }, { weight: 700, style: 'italic' }] as const;
  const key = (p: { family: string; weight: string; style: string; unicodeRange?: string }) => `${p.family}|${p.weight}|${p.style}|${p.unicodeRange ?? ''}`;
  return {
    configFontUses: () => new Map(Object.entries(fontLoader.uses)),
    getCustomFontFamily: (family: string) => (fontLoader.custom.includes(family) ? { name: family, variants: [] } : undefined),
    collectFontPayloadsForFamilies: async (families: string[]) => families.map((family) => ({ family, weight: '400', style: 'normal', buffer: new ArrayBuffer(1) })),
    // Every file of each cut asked, light to heavy, upright first.
    familyCutFaces: async (family: string, uses: { weight: number; style: string }[], options?: { standard?: boolean }) => {
      const asked = [...uses, ...(options?.standard && !fontLoader.sliced.includes(family) ? STANDARD : [])];
      const cuts = [...new Map(asked.map((u) => [`${u.weight}|${u.style}`, u])).values()]
        .sort((a, b) => a.weight - b.weight || (a.style === b.style ? 0 : a.style === 'normal' ? -1 : 1));
      return cuts.flatMap((u) => fontLoader.subsets.map((subset) => ({ family, weight: String(u.weight), style: u.style, unicodeRange: subset, url: `${family}-${subset}-${u.weight}-${u.style}` })));
    },
    fetchFacePayloads: async (faces: { family: string; weight: string; style: string; unicodeRange?: string; url: string }[]) => {
      fontLoader.fileRequests.push(faces.map((f) => f.url));
      if (fontLoader.files) await fontLoader.files;
      return faces
        .filter((f) => !fontLoader.failing.has(f.url))
        .map((f) => ({ family: f.family, weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, buffer: new ArrayBuffer(1) }));
    },
    FONT_RETRY_MS: 30_000,
    fontRequestsUnanswered: (_family: string, urls: string[]) => urls.some((url) => fontLoader.unanswered.has(url)),
    collectStandInPayloads: async (_config: unknown, _content: unknown, sent: ReadonlySet<string>) =>
      fontLoader.standIns.filter((p) => !sent.has(key(p))),
    fontPayloadKey: key,
    asFeaturePayloads: (_family: string, payloads: unknown[]) => payloads,
    loadFont: async (family: string, uses: { weight: number; style: string }[]) => {
      fontLoader.pageLoads.push(...uses.map((u) => `${family} ${u.weight} ${u.style}`));
    },
    loadFacesForText: async (uses: Iterable<[string, { weight: number; style: string }[]]>, text: string) => {
      fontLoader.textLoads.push({ faces: [...uses].flatMap(([family, list]) => list.map((u) => `${family} ${u.weight} ${u.style}`)), text });
      if (fontLoader.pageFiles) await fontLoader.pageFiles;
    },
    onCustomFontsChanged: (cb: (families: string[]) => void) => {
      fontLoader.changed = cb;
      return () => {};
    },
  };
});

import { builtWithoutFaces, createLayoutService, documentCharacters, FONT_WAIT_CEILING_MS, fontsPending, onFontsPending, onLateFonts } from './LayoutService.js';

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
    warm: (content, config, opts) => handle.build(content, config, { ...opts, wantDoc: false }).then(() => undefined),
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

  it('sends the stand-in faces after the families\' own, each once (#688)', async () => {
    const { handle, builds } = fakeHandle();
    const registered: string[][] = [];
    handle.registerFonts = async (faces) => {
      registered.push(faces.map((f) => `${f.family} ${f.weight} ${f.style}`));
    };
    fontLoader.custom = ['Bangers'];
    fontLoader.uses = { Bangers: [{ weight: 400, style: 'normal' }] };
    fontLoader.standIns = [{ family: 'Bangers', weight: '600 900', style: 'normal', buffer: new ArrayBuffer(1) }];
    try {
      const service = createLayoutService({ handle });
      const first = service.build({ clientId: 'canvas', priority: 'preview', content: content('WHAM'), config: {} });
      await tick();
      expect(registered).toEqual([['Bangers 400 normal'], ['Bangers 600 900 normal']]);
      builds[0]!.finish();
      await first;
      // The next build has nothing new to send.
      const second = service.build({ clientId: 'canvas', priority: 'preview', content: content('WHAM!'), config: {} });
      await tick();
      builds[1]!.finish();
      await second;
      expect(registered).toHaveLength(2);
      // A family whose files change is sent again, its stand-ins too.
      fontLoader.changed?.(['Bangers']);
      const third = service.build({ clientId: 'canvas', priority: 'preview', content: content('WHAM!!'), config: {} });
      await tick();
      builds[2]!.finish();
      await third;
      expect(registered.slice(2)).toEqual([['Bangers 400 normal'], ['Bangers 600 900 normal']]);
      // A slice the text comes to need (a character of another file of
      // the face) is sent before the build that sets it, to the worker
      // that has measured with the family: its next build measures with
      // it (#760).
      fontLoader.standIns = [...fontLoader.standIns, { family: 'Bangers', weight: '600 900', style: 'italic', buffer: new ArrayBuffer(1) }];
      const fourth = service.build({ clientId: 'canvas', priority: 'preview', content: content('*WHAM*'), config: {} });
      await tick();
      expect(registered.slice(4)).toEqual([['Bangers 600 900 italic']]);
      expect(builds).toHaveLength(4);
      builds[3]!.finish();
      await fourth;
      service.dispose();
    } finally {
      fontLoader.custom = [];
      fontLoader.uses = {};
      fontLoader.standIns = [];
    }
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

// #757: a catalogue family is a file per weight, style and subset. The
// worker is sent the cuts a build is set in before it lays it out, each
// with all its files. A face its pages name that it was not sent goes to
// the same worker, and the document is laid out again: the engine's worker
// measures with a face that arrives after a build (#760).
describe('the static cuts a build is sent (#757)', () => {
  /** A document whose text is set in `fonts` (CSS font shorthands). */
  const docSetIn = (...fonts: string[]) => ({
    pages: [],
    blocks: fonts.map((fontString) => ({ fontString, lines: [{ segments: [] }] })),
  }) as unknown as VDTDocument;

  /** A handle that records what it is sent. */
  function recording() {
    const { handle, builds } = fakeHandle();
    const registered: string[][] = [];
    const unregistered: string[][] = [];
    handle.registerFonts = async (faces) => {
      registered.push(faces.map((f) => `${f.family} ${f.weight} ${f.style} ${f.unicodeRange}`));
    };
    handle.unregisterFonts = async (families) => {
      unregistered.push(families);
    };
    return { handle, builds, registered, unregistered };
  }

  const reset = () => {
    fontLoader.uses = {};
    fontLoader.subsets = ['latin'];
    fontLoader.sliced = [];
    fontLoader.pageLoads = [];
    fontLoader.textLoads = [];
    fontLoader.pageFiles = null;
  };

  it('sends every file of each cut the configuration asks for, and of the regular, the bold and their italics, before the build', async () => {
    const { handle, builds, registered, unregistered } = recording();
    fontLoader.uses = { 'Source Serif 4': [{ weight: 600, style: 'normal' }] };
    fontLoader.subsets = ['latin', 'latin-ext'];
    try {
      const service = createLayoutService({ handle });
      const first = service.build({ clientId: 'canvas', priority: 'preview', content: content('One'), config: {} });
      await tick();
      // One message, the cuts in order, every subset of each: the worker
      // has them all before it measures a word.
      expect(registered).toEqual([[
        'Source Serif 4 400 normal latin', 'Source Serif 4 400 normal latin-ext',
        'Source Serif 4 400 italic latin', 'Source Serif 4 400 italic latin-ext',
        'Source Serif 4 600 normal latin', 'Source Serif 4 600 normal latin-ext',
        'Source Serif 4 700 normal latin', 'Source Serif 4 700 normal latin-ext',
        'Source Serif 4 700 italic latin', 'Source Serif 4 700 italic latin-ext',
      ]]);
      expect(builds).toHaveLength(1);
      builds[0]!.finish(docSetIn('600 20px "Source Serif 4"', 'italic 400 12px "Source Serif 4"'));
      await first;
      expect(builds).toHaveLength(1);
      // Nothing more for the same faces; a weight the configuration gains
      // is sent alone, before the build that sets it.
      fontLoader.uses = { 'Source Serif 4': [{ weight: 600, style: 'normal' }, { weight: 300, style: 'normal' }] };
      const second = service.build({ clientId: 'canvas', priority: 'preview', content: content('Two'), config: {} });
      await tick();
      expect(registered.slice(1)).toEqual([['Source Serif 4 300 normal latin', 'Source Serif 4 300 normal latin-ext']]);
      expect(unregistered).toEqual([]);
      // The page declares the cut too: it paints with what the worker measures with.
      expect(fontLoader.pageLoads).toEqual(['Source Serif 4 600 normal', 'Source Serif 4 400 italic', 'Source Serif 4 300 normal']);
      builds[1]!.finish(docSetIn('300 20px "Source Serif 4"'));
      await second;
      service.dispose();
    } finally {
      reset();
    }
  });

  it('sends a feature family (a style\'s figures, #1237) as its base family\'s files, under its name', async () => {
    const { handle, builds, registered } = recording();
    fontLoader.uses = { 'Lora@onum': [{ weight: 400, style: 'normal' }] };
    fontLoader.fileRequests = [];
    try {
      const service = createLayoutService({ handle });
      const first = service.build({ clientId: 'canvas', priority: 'preview', content: content('One'), config: {} });
      await tick();
      // The files are the base family's; the faces are the feature family's.
      expect(fontLoader.fileRequests).toEqual([['Lora-latin-400-normal', 'Lora-latin-400-italic', 'Lora-latin-700-normal', 'Lora-latin-700-italic']]);
      expect(registered).toEqual([['Lora@onum 400 normal latin', 'Lora@onum 400 italic latin', 'Lora@onum 700 normal latin', 'Lora@onum 700 italic latin']]);
      // The page declares the feature family's faces too.
      expect(fontLoader.pageLoads).toEqual(['Lora@onum 400 normal']);
      builds[0]!.finish(docSetIn('400 20px "Lora@onum"'));
      await first;
      service.dispose();
    } finally {
      reset();
      fontLoader.fileRequests = [];
    }
  });

  it('sends the worker a face its pages name that it was not sent, and lays the document out again', async () => {
    const { handle, builds, registered, unregistered } = recording();
    fontLoader.uses = { Geist: [{ weight: 600, style: 'normal' }] };
    try {
      const service = createLayoutService({ handle });
      const build = service.build({ clientId: 'canvas', priority: 'preview', content: content('# A *title*'), config: {}, cacheKey: 'k' });
      await tick();
      expect(registered).toHaveLength(1);
      // The pages set the italic of the heading weight: no file of it was sent.
      builds[0]!.finish(docSetIn('600 20px Geist', 'italic 600 20px Geist'));
      await tick();
      await tick();
      // The page declares it, and the worker it has gets its files: no
      // other face is sent again, none is taken away.
      expect(fontLoader.pageLoads).toEqual(['Geist 600 normal', 'Geist 600 italic']);
      expect(registered.slice(1)).toEqual([['Geist 600 italic latin']]);
      expect(unregistered).toEqual([]);
      expect(builds.map((b) => b.cacheKey)).toEqual(['k', 'k']);
      const again = docSetIn('600 20px Geist', 'italic 600 20px Geist');
      builds[1]!.finish(again);
      await expect(build).resolves.toBe(again);
      // The next build of the book has its faces from the start.
      const next = service.build({ clientId: 'canvas', priority: 'preview', content: content('# B'), config: {} });
      await tick();
      builds[2]!.finish(docSetIn('italic 600 20px Geist'));
      await next;
      expect(registered).toHaveLength(2);
      expect(builds).toHaveLength(3);
      service.dispose();
    } finally {
      reset();
    }
  });

  it('builds once when the pages are set in the faces the worker has: the regular, the bold and their italics need no asking', async () => {
    const { handle, builds, registered } = recording();
    fontLoader.uses = { Geist: [{ weight: 500, style: 'normal' }] };
    try {
      const service = createLayoutService({ handle });
      const build = service.build({ clientId: 'canvas', priority: 'preview', content: content('A **bold** *word*'), config: {} });
      await tick();
      const doc = docSetIn('500 12px Geist', '700 12px Geist', 'italic 400 12px Geist', 'italic 700 12px Geist');
      builds[0]!.finish(doc);
      await expect(build).resolves.toBe(doc);
      expect(builds).toHaveLength(1);
      expect(registered).toHaveLength(1);
      // The page is told all the same: it declares a cut when it is set.
      expect(fontLoader.pageLoads.sort()).toEqual(['Geist 400 italic', 'Geist 500 normal', 'Geist 700 italic', 'Geist 700 normal']);
      service.dispose();
    } finally {
      reset();
    }
  });

  // #770: the worker has the regular, the bold and their italics of a
  // family from the start, so a face the pages alone name (the italic the
  // contents set their summaries in by default) asks for no second layout:
  // the document went back at once, the page had declared that cut a moment
  // before and loaded its Latin file, and the first paint set the Arabic
  // summaries in the system's face until the Arabic file came.
  it('hands a document back once the page has loaded the faces its pages name, for the characters it sets', async () => {
    const { handle, builds, registered } = recording();
    fontLoader.uses = { Amiri: [{ weight: 400, style: 'normal' }, { weight: 700, style: 'normal' }] };
    let landed!: () => void;
    fontLoader.pageFiles = new Promise<void>((resolve) => { landed = resolve; });
    try {
      const service = createLayoutService({ handle });
      let done = false;
      const build = service.build({ clientId: 'canvas', priority: 'preview', content: content(':::toc'), config: {} });
      void build.then(() => { done = true; });
      await tick();
      // A contents page: its summaries come from the other chapters.
      const doc = {
        pages: [],
        blocks: [{ fontString: '400 12px Amiri', lines: [
          { text: 'لماذا', segments: [{ text: 'لماذا' }] },
          { text: 'الفجوة', segments: [{ text: 'الفجوة', fontString: 'italic 400 10px Amiri' }] },
        ] }],
      } as unknown as VDTDocument;
      builds[0]!.finish(doc);
      await tick();
      await tick();
      // The worker lacks nothing, so there is one layout; the page is asked
      // for the italic, with the letters of the summary.
      expect(registered).toHaveLength(1);
      expect(builds).toHaveLength(1);
      expect(fontLoader.textLoads.map((l) => l.faces)).toEqual([['Amiri 400 italic']]);
      for (const ch of 'الفجوة') expect(fontLoader.textLoads[0]!.text).toContain(ch);
      // Held while the page's file is on its way.
      expect(done).toBe(false);
      expect(service.state!().fonts?.step).toBe('the faces the page loads for the document\'s text');
      landed();
      await expect(build).resolves.toBe(doc);
      // The same face in a later document is not waited for again.
      const next = service.build({ clientId: 'canvas', priority: 'preview', content: content(':::toc'), config: {} });
      await tick();
      builds[1]!.finish(doc);
      await next;
      expect(fontLoader.textLoads).toHaveLength(1);
      service.dispose();
    } finally {
      reset();
    }
  });

  it('hands the document back when the page cannot load them', async () => {
    const { handle, builds } = recording();
    fontLoader.uses = { Amiri: [{ weight: 400, style: 'normal' }] };
    fontLoader.pageFiles = Promise.reject(new Error('offline'));
    fontLoader.pageFiles.catch(() => {});
    try {
      const service = createLayoutService({ handle });
      const build = service.build({ clientId: 'canvas', priority: 'preview', content: content(':::toc'), config: {} });
      await tick();
      const doc = docSetIn('400 12px Amiri', 'italic 400 10px Amiri');
      builds[0]!.finish(doc);
      await expect(build).resolves.toBe(doc);
      expect(builtWithoutFaces(doc)).toBe(false);
      service.dispose();
    } finally {
      reset();
    }
  });

  it('asks a family cut by slices for the faces set alone, and sends the bold its pages bring', async () => {
    const { handle, builds, registered } = recording();
    fontLoader.uses = { 'Noto Serif JP': [{ weight: 400, style: 'normal' }] };
    fontLoader.subsets = ['latin', '119', '118'];
    fontLoader.sliced = ['Noto Serif JP'];
    try {
      const service = createLayoutService({ handle });
      const build = service.build({ clientId: 'canvas', priority: 'preview', content: content('本'), config: {} });
      await tick();
      expect(registered).toEqual([['Noto Serif JP 400 normal latin', 'Noto Serif JP 400 normal 119', 'Noto Serif JP 400 normal 118']]);
      builds[0]!.finish(docSetIn('400 12px "Noto Serif JP"', '700 12px "Noto Serif JP"'));
      await tick();
      await tick();
      expect(registered.slice(1)).toEqual([['Noto Serif JP 700 normal latin', 'Noto Serif JP 700 normal 119', 'Noto Serif JP 700 normal 118']]);
      builds[1]!.finish(docSetIn('400 12px "Noto Serif JP"', '700 12px "Noto Serif JP"'));
      await build;
      service.dispose();
    } finally {
      reset();
    }
  });

  it('gives up after two more layouts when every one names another face', async () => {
    const { handle, builds } = recording();
    fontLoader.uses = { Geist: [{ weight: 400, style: 'normal' }] };
    try {
      const service = createLayoutService({ handle });
      const build = service.build({ clientId: 'canvas', priority: 'preview', content: content('x'), config: {} });
      for (const weight of [300, 500, 800]) {
        await tick();
        await tick();
        builds.at(-1)!.finish(docSetIn(`${weight} 12px Geist`));
      }
      await build;
      expect(builds).toHaveLength(3);
      service.dispose();
    } finally {
      reset();
    }
  });
});

describe('a build and a file that is slow or does not come (#757)', () => {
  const reset = () => {
    fontLoader.uses = { Lora: [{ weight: 400, style: 'normal' }] };
    fontLoader.subsets = ['latin'];
    fontLoader.sliced = ['Lora'];
    fontLoader.pageLoads = [];
    fontLoader.files = null;
    fontLoader.failing = new Set();
    fontLoader.fileRequests = [];
    fontLoader.unanswered = new Set();
  };
  /** The network does not answer for `urls`. */
  const unansweredFor = (...urls: string[]) => {
    fontLoader.failing = new Set(urls);
    fontLoader.unanswered = new Set(urls);
  };
  /** A handle that records, in order, what the worker is asked. */
  function ordered() {
    const { handle, builds } = fakeHandle();
    const log: string[] = [];
    const build = handle.build;
    handle.build = (content, config, opts) => {
      log.push(`build ${content.markdown}`);
      return build(content, config, opts).then((doc) => {
        log.push(`built ${content.markdown}`);
        return doc;
      });
    };
    handle.registerFonts = async (faces) => {
      log.push(`register ${faces.map((f) => `${f.family} ${f.weight}`).join(', ')}`);
    };
    return { handle, builds, log };
  }
  const late = () => {
    const told: string[][] = [];
    const off = onLateFonts((families) => told.push(families));
    return { told, off };
  };
  const request = (markdown = 'a') => ({ clientId: 'canvas', priority: 'preview' as const, content: content(markdown), config: {} });

  afterEach(() => {
    vi.useRealTimers();
    fontLoader.files = null;
    fontLoader.failing = new Set();
    fontLoader.unanswered = new Set();
    fontLoader.sliced = [];
  });

  it('waits for the files that come: they are registered before the build, the document is the chapter\'s and nobody is told', async () => {
    reset();
    const { handle, builds, log } = ordered();
    const { told, off } = late();
    const service = createLayoutService({ handle });
    const built = service.build(request());
    await tick();
    builds[0]!.finish();
    const doc = await built;
    expect(log).toEqual(['register Lora 400', 'build a', 'built a']);
    expect(builtWithoutFaces(doc)).toBe(false);
    expect(told).toEqual([]);
    expect(fontsPending()).toBe(false);
    off();
    service.dispose();
  });

  it('waits as long as the files are on their way: a book of many files on a slow line is not laid out in a fallback', async () => {
    reset();
    vi.useFakeTimers();
    let arrive!: () => void;
    fontLoader.files = new Promise<void>((resolve) => { arrive = resolve; });
    const { handle, builds, log } = ordered();
    const { told, off } = late();
    const pending: boolean[] = [];
    const offPending = onFontsPending(() => pending.push(fontsPending()));
    const service = createLayoutService({ handle });
    const built = service.build(request());
    // Two minutes, nine of them: the loader has not given the requests up, the build waits.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(log).toEqual([]);
    await vi.advanceTimersByTimeAsync(FONT_WAIT_CEILING_MS - 121_000);
    expect(log).toEqual([]);
    expect(fontsPending()).toBe(true);
    arrive();
    await vi.advanceTimersByTimeAsync(0);
    builds[0]!.finish();
    const doc = await built;
    expect(log).toEqual(['register Lora 400', 'build a', 'built a']);
    expect(builtWithoutFaces(doc)).toBe(false);
    expect(told).toEqual([]);
    expect(fontsPending()).toBe(false);
    // Unsettled from the first request to the last (the faces the pages
    // name are looked up after the build).
    expect(pending[0]).toBe(true);
    expect(pending[pending.length - 1]).toBe(false);
    expect(FONT_WAIT_CEILING_MS).toBeGreaterThanOrEqual(300_000);
    offPending();
    off();
    service.dispose();
  });

  it('past the ceiling lays the chapter out with the faces the worker has, says so of the document, registers the files once the build is over and tells the views', async () => {
    reset();
    vi.useFakeTimers();
    let arrive!: () => void;
    fontLoader.files = new Promise<void>((resolve) => { arrive = resolve; });
    const { handle, builds, log } = ordered();
    const { told, off } = late();
    const service = createLayoutService({ handle, fontCeilingMs: 500 });
    const built = service.build(request());
    await vi.advanceTimersByTimeAsync(499);
    expect(log).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(log).toEqual(['build a']);
    // The file lands while the worker lays out: its faces wait for the
    // build, which would otherwise be measured half with them.
    arrive();
    await vi.advanceTimersByTimeAsync(50);
    expect(log).toEqual(['build a']);
    expect(told).toEqual([]);
    builds[0]!.finish();
    const doc = await built;
    expect(builtWithoutFaces(doc)).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['build a', 'built a', 'register Lora 400']);
    expect(told).toEqual([['Lora']]);
    // Unsettled until the views have asked for their builds.
    expect(fontsPending()).toBe(true);
    const again = service.build(request());
    await vi.advanceTimersByTimeAsync(0);
    builds[1]!.finish();
    expect(builtWithoutFaces(await again)).toBe(false);
    expect(log.slice(3)).toEqual(['build a', 'built a']);
    expect(told).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fontsPending()).toBe(false);
    off();
    service.dispose();
  });

  it('waits for the files without a ceiling when the host asks so (the headless entry)', async () => {
    reset();
    vi.useFakeTimers();
    let arrive!: () => void;
    fontLoader.files = new Promise<void>((resolve) => { arrive = resolve; });
    const { handle, builds, log } = ordered();
    const service = createLayoutService({ handle, fontCeilingMs: Infinity });
    const built = service.build({ ...request(), clientId: 'headless', priority: 'background' });
    await vi.advanceTimersByTimeAsync(FONT_WAIT_CEILING_MS * 3);
    expect(log).toEqual([]);
    arrive();
    await vi.advanceTimersByTimeAsync(0);
    builds[0]!.finish();
    await built;
    expect(log).toEqual(['register Lora 400', 'build a', 'built a']);
    service.dispose();
  });

  it('says of a document that it went without a file the network gave up, asks again a while later, and tells the views when it arrives', async () => {
    reset();
    vi.useFakeTimers();
    fontLoader.uses = { Lora: [{ weight: 400, style: 'normal' }, { weight: 700, style: 'normal' }] };
    unansweredFor('Lora-latin-700-normal');
    const { handle, builds, log } = ordered();
    const { told, off } = late();
    const service = createLayoutService({ handle });
    const built = service.build(request());
    await vi.advanceTimersByTimeAsync(0);
    builds[0]!.finish();
    // Laid out with the regular alone: not the chapter's pages.
    expect(builtWithoutFaces(await built)).toBe(true);
    expect(log).toEqual(['register Lora 400', 'build a', 'built a']);
    // A try is due: the fonts are not settled.
    expect(fontsPending()).toBe(true);
    // Nobody builds; the network gives the file at the next try.
    unansweredFor();
    await vi.advanceTimersByTimeAsync(29_000);
    expect(fontLoader.fileRequests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2_500);
    expect(fontLoader.fileRequests).toEqual([['Lora-latin-400-normal', 'Lora-latin-700-normal'], ['Lora-latin-700-normal']]);
    expect(log).toEqual(['register Lora 400', 'build a', 'built a', 'register Lora 700']);
    expect(told).toEqual([['Lora']]);
    const again = service.build(request());
    await vi.advanceTimersByTimeAsync(0);
    builds[1]!.finish();
    expect(builtWithoutFaces(await again)).toBe(false);
    // Nothing is short any more: settled, and no further try.
    await vi.advanceTimersByTimeAsync(200_000);
    expect(fontLoader.fileRequests).toHaveLength(2);
    expect(fontsPending()).toBe(false);
    off();
    service.dispose();
  });

  it('tells the views when a later build, not a try of its own, brings the file', async () => {
    reset();
    vi.useFakeTimers();
    unansweredFor('Lora-latin-400-normal');
    const { handle, builds } = ordered();
    const { told, off } = late();
    const service = createLayoutService({ handle });
    const first = service.build(request('a'));
    await vi.advanceTimersByTimeAsync(0);
    builds[0]!.finish();
    expect(builtWithoutFaces(await first)).toBe(true);
    unansweredFor();
    // Another chapter is built before the try is due: its files come, and
    // the first chapter is to be laid out again.
    const second = service.build({ ...request('b'), clientId: 'paginator', priority: 'background' });
    await vi.advanceTimersByTimeAsync(0);
    builds[1]!.finish();
    expect(builtWithoutFaces(await second)).toBe(false);
    expect(told).toEqual([['Lora']]);
    off();
    service.dispose();
  });

  it('gives a file up after three more tries; the documents stay marked and the fonts settle', async () => {
    reset();
    vi.useFakeTimers();
    unansweredFor('Lora-latin-400-normal');
    const { handle, builds } = ordered();
    const { told, off } = late();
    const service = createLayoutService({ handle });
    const built = service.build(request());
    await vi.advanceTimersByTimeAsync(0);
    builds[0]!.finish();
    expect(builtWithoutFaces(await built)).toBe(true);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fontLoader.fileRequests).toHaveLength(4);
    expect(told).toEqual([]);
    expect(fontsPending()).toBe(false);
    const again = service.build(request());
    await vi.advanceTimersByTimeAsync(0);
    builds[1]!.finish();
    expect(builtWithoutFaces(await again)).toBe(true);
    off();
    service.dispose();
  });

  it('takes a file the server has not (a 404) for what it is: no try, the document is the chapter\'s', async () => {
    reset();
    vi.useFakeTimers();
    fontLoader.uses = { Lora: [{ weight: 400, style: 'normal' }, { weight: 700, style: 'normal' }] };
    fontLoader.failing = new Set(['Lora-latin-700-normal']);
    const { handle, builds } = ordered();
    const service = createLayoutService({ handle });
    const built = service.build(request());
    await vi.advanceTimersByTimeAsync(0);
    builds[0]!.finish();
    expect(builtWithoutFaces(await built)).toBe(false);
    expect(fontsPending()).toBe(false);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fontLoader.fileRequests).toHaveLength(1);
    service.dispose();
  });

  it('asks no more once disposed, and gives back what it held of the fonts\' state', async () => {
    reset();
    vi.useFakeTimers();
    unansweredFor('Lora-latin-400-normal');
    const { handle, builds } = ordered();
    const service = createLayoutService({ handle });
    const built = service.build(request());
    await vi.advanceTimersByTimeAsync(0);
    builds[0]!.finish();
    await built;
    expect(fontsPending()).toBe(true);
    service.dispose();
    expect(fontsPending()).toBe(false);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(fontLoader.fileRequests).toHaveLength(1);
  });

  it('says what it waits for: the step of the build under way, the files sent and what the worker has not answered', async () => {
    reset();
    let arrive!: () => void;
    fontLoader.files = new Promise<void>((resolve) => { arrive = resolve; });
    const { handle, builds } = ordered();
    const service = createLayoutService({ handle });
    const built = service.build(request());
    await tick();
    // Waiting for its files: the font queue says which.
    expect(service.state!()).toMatchObject({ active: { clientId: 'canvas', step: 'the files of its faces' }, fonts: { step: '1 files of Lora' }, worker: [], sent: {}, fontsPending: true });
    arrive();
    await tick();
    expect(service.state!()).toMatchObject({ active: { step: 'the worker\'s layout' }, fonts: null, sent: { Lora: 1 } });
    expect(service.state!().worker.map((w) => w.ask)).toEqual(['build']);
    builds[0]!.finish();
    await built;
    await tick();
    expect(service.state!()).toMatchObject({ active: null, queued: [], worker: [], short: [], retryDue: false, fontsPending: false });
    service.dispose();
  });
});

describe('documentCharacters (#770)', () => {
  it('gives every character the pages set, once: lines, segments, captions and running heads, not the configuration', () => {
    const doc = {
      config: { header: { elements: [{ text: 'ZZZ' }] } },
      blocks: [{
        lines: [{ text: 'ab', segments: [{ text: 'a', sourceMap: [0, 1] }, { text: 'b' }] }],
        resourceBlock: { captionLines: [{ text: 'cα' }], resource: { text: 'QQQ' } },
      }],
      pages: [{ header: { elements: [{ lines: [{ text: 'الجزء' }] }] }, columns: [{ sourceMap: [1, 2, 3] }] }],
    } as unknown as VDTDocument;
    const chars = documentCharacters(doc);
    expect([...chars].sort()).toEqual([...new Set('abcαالجزء')].sort());
  });
});
