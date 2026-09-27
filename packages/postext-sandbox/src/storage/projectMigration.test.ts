import { describe, expect, it } from 'vitest';
import { resolveHeadingsConfig, stripConfigDefaults } from 'postext';
import type { HeadingBreakBeforeConfig, PostextConfig } from 'postext';
import { PROJECT_RECORD_VERSION, migrateProjectRecord, normalizeBookContent, pinLegacyHeadingBreaks } from './projectMigration';

let n = 0;
const deps = { ids: () => `id${++n}`, untitled: (k: number) => `Chapter ${k}` };

describe('migrateProjectRecord', () => {
  it('turns a legacy single-document record into a one-chapter book', () => {
    const rec = migrateProjectRecord({ id: 'p', name: 'P', markdown: '# Intro\n\ntext', config: { page: {} }, resources: [], createdAt: 1, updatedAt: 2 }, deps)!;
    expect(rec.version).toBe(PROJECT_RECORD_VERSION);
    expect(rec.chapters).toHaveLength(1);
    expect(rec.chapters[0]!.title).toBe('Intro');
    expect(rec.chapters[0]!.markdown).toBe('# Intro\n\ntext');
    expect(rec.activeChapterId).toBe(rec.chapters[0]!.id);
    expect((rec as unknown as { markdown?: string }).markdown).toBeUndefined();
    expect(rec.createdAt).toBe(1);
  });
  it('passes a v2 record through and repairs a stale active id', () => {
    const rec = migrateProjectRecord({
      version: 2, id: 'p', name: 'P', config: {}, resources: [], createdAt: 1, updatedAt: 1,
      chapters: [{ id: 'a', title: 'A', markdown: '', createdAt: 1, updatedAt: 1 }],
      activeChapterId: 'gone', layoutScope: 'chapter',
    }, deps)!;
    expect(rec.activeChapterId).toBe('a');
    // The layout scope of earlier versions is dropped.
    expect((rec as unknown as { layoutScope?: string }).layoutScope).toBeUndefined();
    expect(rec.canvasScope).toBeUndefined();
  });
  it('keeps a valid canvas scope and drops an unknown one', () => {
    const base = {
      version: 2, id: 'p', name: 'P', config: {}, resources: [], createdAt: 1, updatedAt: 1,
      chapters: [{ id: 'a', title: 'A', markdown: '', createdAt: 1, updatedAt: 1 }],
      activeChapterId: 'a',
    };
    expect(migrateProjectRecord({ ...base, canvasScope: 'book' }, deps)!.canvasScope).toBe('book');
    expect(migrateProjectRecord({ ...base, canvasScope: 'spread' }, deps)!.canvasScope).toBeUndefined();
  });
  it('keeps a well-formed cover picture and drops a malformed one', () => {
    const base = {
      version: 2, id: 'p', name: 'P', config: {}, resources: [], createdAt: 1, updatedAt: 1,
      chapters: [{ id: 'a', title: 'A', markdown: '', createdAt: 1, updatedAt: 1 }],
      activeChapterId: 'a',
    };
    const cover = { fileId: 'blob-cover', mime: 'image/jpeg' };
    expect(migrateProjectRecord({ ...base, thumbnail: cover }, deps)!.thumbnail).toEqual(cover);
    expect(migrateProjectRecord({ ...base, thumbnail: { fileId: '' } }, deps)!.thumbnail).toBeUndefined();
    expect(migrateProjectRecord({ ...base, thumbnail: 'thumbnail.jpg' }, deps)!.thumbnail).toBeUndefined();
  });
  it('rejects garbage', () => {
    expect(migrateProjectRecord(null, deps)).toBeNull();
    expect(migrateProjectRecord({ id: 'p', name: 'P' }, deps)).toBeNull();
    expect(migrateProjectRecord({ id: 'p', name: 'P', chapters: [{ nope: 1 }] }, deps)).toBeNull();
  });
  it('fills an empty chapter list with an untitled chapter', () => {
    const book = normalizeBookContent({ chapters: [] }, deps)!;
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]!.title).toBe('Chapter 1');
  });
});

// Up to postext 1.4, a `headings` object turned the H1 break off unless it
// set `levels[0].breakBefore.enabled`, a partial H1 break took its missing
// field from the no-break default, and a heading style's `breakBefore`
// replaced the level's with the same fill. The Sandbox also stripped an
// H1 `enabled: false`. A configuration saved then is pinned to what it laid
// out, so the page stays as its author saw it.
describe('pinLegacyHeadingBreaks', () => {
  /** The H1 break postext 1.4 laid a configuration out with. */
  const legacyH1 = (config: PostextConfig): Required<HeadingBreakBeforeConfig> => {
    if (!config.headings) return { enabled: true, parity: 'always-odd' };
    const raw = config.headings.levels?.find((l) => l.level === 1)?.breakBefore;
    return { enabled: raw?.enabled ?? false, parity: raw?.parity ?? 'any' };
  };
  const h1Break = (config: PostextConfig) => resolveHeadingsConfig(config.headings).levels[0]!.breakBefore;
  const legacyConfigs: PostextConfig[] = [
    { headings: { fontFamily: 'Georgia' } },
    { headings: {} },
    { headings: { levels: [{ level: 2, fontWeight: 700 }] } },
    // What the old strip left of a switched-off break with a parity.
    { headings: { levels: [{ level: 1, breakBefore: { parity: 'always-odd' } }] } },
    // …and of a break set to any page (the `parity: 'any'` was stripped).
    { headings: { levels: [{ level: 1, breakBefore: { enabled: true } }] } },
    { headings: { levels: [{ level: 1, fontSize: { value: 20, unit: 'pt' } }] } },
    { headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'odd' } }] } },
    { headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] } },
  ];

  it('lays every legacy H1 break out as postext 1.4 did', () => {
    for (const config of legacyConfigs) {
      const pinned = pinLegacyHeadingBreaks(config);
      const want = legacyH1(config);
      expect(h1Break(pinned).enabled).toBe(want.enabled);
      if (want.enabled) expect(h1Break(pinned).parity).toBe(want.parity);
      // A save keeps the pin, so the next load reads the same.
      expect(h1Break(stripConfigDefaults(pinned) as PostextConfig).enabled).toBe(want.enabled);
      if (want.enabled) expect(h1Break(stripConfigDefaults(pinned) as PostextConfig).parity).toBe(want.parity);
    }
  });

  it('writes the pin on H1 only, keeping the other fields', () => {
    expect(pinLegacyHeadingBreaks({ headings: { fontFamily: 'Georgia' } }))
      .toEqual({ headings: { fontFamily: 'Georgia', levels: [{ level: 1, breakBefore: { enabled: false } }] } });
    expect(pinLegacyHeadingBreaks({ headings: { levels: [{ level: 1, fontWeight: 700, breakBefore: { parity: 'odd' } }, { level: 2, fontWeight: 600 }] } }))
      .toEqual({ headings: { levels: [{ level: 1, fontWeight: 700, breakBefore: { enabled: false, parity: 'odd' } }, { level: 2, fontWeight: 600 }] } });
    expect(pinLegacyHeadingBreaks({ headings: { levels: [{ level: 1, breakBefore: { enabled: true } }] } }))
      .toEqual({ headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] } });
  });

  it('leaves a configuration without a headings object, or with a full H1 break, as it is', () => {
    const plain: PostextConfig = { page: { dpi: 96 } };
    expect(pinLegacyHeadingBreaks(plain)).toBe(plain);
    const full: PostextConfig = { headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'even' } }] } };
    expect(pinLegacyHeadingBreaks(full)).toBe(full);
    const off: PostextConfig = { headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] } };
    expect(pinLegacyHeadingBreaks(off)).toBe(off);
  });

  it('pins a heading style’s partial break to the fill it had', () => {
    const config: PostextConfig = {
      headingStyles: [
        { id: 'a', breakBefore: { parity: 'odd' } },
        { id: 'b', breakBefore: { enabled: true } },
        { id: 'c', breakBefore: { enabled: true, parity: 'even' } },
        { id: 'd', fontWeight: 700 },
      ],
    };
    const pinned = pinLegacyHeadingBreaks(config);
    expect(pinned.headingStyles!.map((s) => s.breakBefore)).toEqual([
      { enabled: false, parity: 'odd' },
      { enabled: true, parity: 'any' },
      { enabled: true, parity: 'even' },
      undefined,
    ]);
    // A complete break no longer depends on the level it merges onto.
    expect(pinned.headingStyles![2]).toBe(config.headingStyles![2]);
    expect(pinned.headingStyles![3]).toBe(config.headingStyles![3]);
  });

  it('runs on records saved before version 3, and only on them', () => {
    const base = {
      id: 'p', name: 'P', resources: [], createdAt: 1, updatedAt: 1,
      chapters: [{ id: 'a', title: 'A', markdown: '', createdAt: 1, updatedAt: 1 }],
      activeChapterId: 'a',
      config: { headings: { fontFamily: 'Georgia' } },
    };
    for (const version of [undefined, 1, 2]) {
      const rec = migrateProjectRecord({ ...base, ...(version !== undefined ? { version } : {}) }, deps)!;
      expect(rec.version).toBe(PROJECT_RECORD_VERSION);
      expect(rec.config.headings?.levels).toEqual([{ level: 1, breakBefore: { enabled: false } }]);
    }
    const current = migrateProjectRecord({ ...base, version: PROJECT_RECORD_VERSION }, deps)!;
    expect(current.config).toEqual(base.config);
  });
});
