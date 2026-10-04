// #198 review: a permalink whose `lang=` is not the tag of the edition it
// opens (`zh-TW` for `zh-Hant`, a language the book lacks for its
// `openLocale`) keeps its chapter and page, and the fragment then names the
// edition by its own tag.
//
// The hook runs under a minimal React stand-in (refs, effects with deps,
// run after each render) over a fake store and a fake `window`, so the
// effects fire in the order React commits them.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Effect = { deps?: readonly unknown[]; cleanup?: () => void };

const rt = vi.hoisted(() => {
  const r = {
    refs: [] as { current: unknown }[],
    effects: [] as ({ deps?: readonly unknown[]; cleanup?: () => void } | undefined)[],
    selected: [] as unknown[],
    queue: [] as (() => void)[],
    ref: 0,
    effect: 0,
    select: 0,
    reset() {
      r.refs = [];
      r.effects = [];
      r.selected = [];
    },
  };
  return r;
});

vi.mock('react', () => ({
  useRef: (init: unknown) => {
    const k = rt.ref++;
    if (!rt.refs[k]) rt.refs[k] = { current: init };
    return rt.refs[k];
  },
  useEffect: (fn: () => void | (() => void), deps?: readonly unknown[]) => {
    const k = rt.effect++;
    const prev: Effect | undefined = rt.effects[k];
    const changed = !prev || !deps || !prev.deps || deps.some((d, n) => !Object.is(d, prev.deps![n]));
    if (!changed) return;
    rt.queue.push(() => {
      prev?.cleanup?.();
      const cleanup = fn();
      rt.effects[k] = { deps, cleanup: typeof cleanup === 'function' ? cleanup : undefined };
    });
  },
}));

interface FakeState {
  chapters: { id: string }[];
  activeChapterId: string;
  storeReady: boolean;
  bookVersion: number;
  activeViewport: 'canvas' | 'pdf' | 'folio' | 'html' | 'epub';
  canvasScope: 'chapter' | 'book';
  activeProjectId: string | null;
  activePresetId: string;
  presetApplied: { presetId: string; locale?: string } | null;
  presetSummaries: { id: string; locale?: string; locales?: string[]; openLocale?: string }[];
  projects: { id: string }[];
}

const store = vi.hoisted(() => ({
  state: null as unknown as FakeState,
  loadPreset: null as unknown as (id: string, locale?: string) => Promise<boolean>,
}));

vi.mock('../context/SandboxContext', () => ({
  useSandboxDispatch: () => (action: { type: string; payload: unknown }) => {
    if (action.type === 'SET_ACTIVE_CHAPTER') store.state = { ...store.state, activeChapterId: action.payload as string };
  },
  useSandboxSelector: <T,>(selector: (s: FakeState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T => {
    const k = rt.select++;
    const next = selector(store.state);
    if (k in rt.selected && isEqual(rt.selected[k] as T, next)) return rt.selected[k] as T;
    rt.selected[k] = next;
    return next;
  },
  useSandboxBookActions: () => ({
    loadPreset: (id: string, locale?: string) => store.loadPreset(id, locale),
    activateProject: async () => undefined,
    openHashBundle: async () => false,
    hashBundleKeys: [],
  }),
}));

import { useChapterHashSync } from './useChapterHashSync';

/** The component under test: the hook alone. */
function Probe(): null {
  useChapterHashSync();
  return null;
}

/** Render the hook against the store as it is, then run its effects. */
function render(): void {
  rt.ref = 0;
  rt.effect = 0;
  rt.select = 0;
  rt.queue = [];
  Probe();
  for (const run of rt.queue) run();
}

/** Commit a state change and render until the hook stops dispatching. */
function commit(patch: Partial<FakeState> = {}): void {
  store.state = { ...store.state, ...patch };
  for (let i = 0; i < 5; i++) {
    const before = store.state;
    render();
    if (store.state === before) return;
  }
}

let listeners: (() => void)[] = [];
function installWindow(hash: string) {
  const location = { hash, pathname: '/es/sandbox', search: '' };
  (globalThis as { window?: unknown }).window = {
    location,
    history: {
      state: null,
      replaceState: (_s: unknown, _t: string, url: string) => {
        location.hash = url.startsWith('#') ? url : '';
      },
    },
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'hashchange') listeners.push(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      if (type === 'hashchange') listeners = listeners.filter((l) => l !== fn);
    },
  };
  return location;
}
/** A link pasted into the address bar. */
function paste(hash: string, location: { hash: string }) {
  location.hash = hash;
  for (const l of [...listeners]) l();
}

const chapters = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i + 1}` }));
const hlmSummary = { id: 'hlm', locale: 'zh-Hant', locales: ['zh-Hant', 'zh-Hans', 'en'], openLocale: 'zh-Hant' };
const guide = chapters(1, 'guide-');
const hant = chapters(121, 'hant-');
const hans = chapters(121, 'hans-');

function onScreen(locale: string, book = locale === 'zh-Hans' ? hans : hant): Partial<FakeState> {
  return {
    chapters: book,
    activeChapterId: book[0]!.id,
    activePresetId: 'hlm',
    presetApplied: { presetId: 'hlm', locale },
    bookVersion: store.state.bookVersion + 1,
  };
}

beforeEach(() => {
  rt.reset();
  listeners = [];
  store.loadPreset = vi.fn(async () => true);
  store.state = {
    chapters: guide,
    activeChapterId: guide[0]!.id,
    storeReady: false,
    bookVersion: 0,
    activeViewport: 'canvas',
    canvasScope: 'chapter',
    activeProjectId: null,
    activePresetId: 'postext-guide',
    presetApplied: { presetId: 'postext-guide', locale: 'es' },
    presetSummaries: [{ id: 'postext-guide', locales: ['es', 'en'] }, hlmSummary],
    projects: [],
  };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('useChapterHashSync — a link naming an edition by another tag', () => {
  it('opens the linked chapter and page when `lang=zh-TW` loads the zh-Hant edition', () => {
    const location = installWindow('#preset=hlm&lang=zh-TW&chapter=28&page=40');
    render();
    // The mount seeding loads the Traditional edition, then the store is ready.
    commit(onScreen('zh-Hant'));
    commit({ storeReady: true });
    expect(store.state.activeChapterId).toBe('hant-28');
    expect(location.hash).toBe('#preset=hlm&lang=zh-Hant&view=canvas&chapter=28&page=40');
  });

  it('reads a language the book lacks as its openLocale', () => {
    const location = installWindow('#preset=hlm&lang=es&chapter=28');
    render();
    commit(onScreen('zh-Hant'));
    commit({ storeReady: true });
    expect(store.state.activeChapterId).toBe('hant-28');
    expect(location.hash).toBe('#preset=hlm&lang=zh-Hant&view=canvas&chapter=28');
  });

  it('applies the link to the edition already on screen on reload', () => {
    const location = installWindow('#preset=hlm&lang=zh-TW&chapter=28&page=40');
    store.state = { ...store.state, ...onScreen('zh-Hant'), bookVersion: 0 };
    render();
    commit({ storeReady: true });
    expect(store.state.activeChapterId).toBe('hant-28');
    expect(location.hash).toBe('#preset=hlm&lang=zh-Hant&view=canvas&chapter=28&page=40');
  });

  it('follows a pasted `zh-TW` link inside the open zh-Hant book without reloading it', () => {
    const location = installWindow('#preset=hlm&lang=zh-Hant&chapter=1');
    store.state = { ...store.state, ...onScreen('zh-Hant'), bookVersion: 0 };
    render();
    commit({ storeReady: true });
    paste('#preset=hlm&lang=zh-TW&chapter=40&page=5', location);
    commit();
    expect(store.loadPreset).not.toHaveBeenCalled();
    expect(store.state.activeChapterId).toBe('hant-40');
    expect(location.hash).toBe('#preset=hlm&lang=zh-Hant&chapter=40&page=5');
  });

  it('applies a pasted link to the edition it opens, and never to another one', async () => {
    const location = installWindow('#preset=hlm&lang=zh-Hant&chapter=1');
    store.state = { ...store.state, ...onScreen('zh-Hant'), bookVersion: 0 };
    render();
    commit({ storeReady: true });

    // A link to the Simplified edition whose load never lands: another
    // switch (the English row) replaces the book instead.
    store.loadPreset = vi.fn(() => new Promise<boolean>(() => {}));
    paste('#preset=hlm&lang=zh-Hans&chapter=30', location);
    expect(store.loadPreset).toHaveBeenCalledWith('hlm', 'zh-Hans');
    commit(onScreen('en', chapters(57, 'en-')));
    expect(store.state.activeChapterId).toBe('en-1');
    expect(location.hash).toBe('#preset=hlm&lang=en&view=canvas&chapter=1');

    // The same link again, this time landing.
    store.loadPreset = vi.fn(async () => true);
    paste('#preset=hlm&lang=zh-CN&chapter=30', location);
    await Promise.resolve();
    commit(onScreen('zh-Hans'));
    expect(store.state.activeChapterId).toBe('hans-30');
    expect(location.hash).toBe('#preset=hlm&lang=zh-Hans&view=canvas&chapter=30');
  });

  it('leaves the chapter alone when the link names another book than the one that opened', () => {
    const location = installWindow('#preset=hlm&lang=zh-Hans&chapter=28');
    render();
    // The seeding could not open it and the stored book shows instead.
    commit({ storeReady: true });
    expect(store.state.activeChapterId).toBe('guide-1');
    expect(location.hash).toMatch(/^#preset=postext-guide&lang=es&view=canvas/);
  });
});

describe('useChapterHashSync — the tabs that build the book as a file', () => {
  const book = chapters(3, 'c');
  const open = (activeViewport: FakeState['activeViewport']) => {
    const location = installWindow('#preset=postext-guide&lang=es&chapter=1');
    store.state = { ...store.state, chapters: book, activeChapterId: 'c1', activeViewport, canvasScope: 'book' };
    render();
    commit({ storeReady: true });
    return location;
  };

  it.each(['pdf', 'epub'] as const)('writes a chapter switch under the %s tab, whatever the canvas scope', (view) => {
    const location = open(view);
    expect(location.hash).toBe(`#preset=postext-guide&lang=es&view=${view}&chapter=1`);
    commit({ activeChapterId: 'c3' });
    expect(location.hash).toBe(`#preset=postext-guide&lang=es&view=${view}&chapter=3`);
  });

  it('leaves the fragment to the canvas while it shows the whole book', () => {
    const location = open('canvas');
    commit({ activeChapterId: 'c3' });
    expect(location.hash).toBe('#preset=postext-guide&lang=es&view=canvas&chapter=1');
  });
});
