import { describe, expect, it } from 'vitest';
import { DEFAULT_FIND_OPTIONS, MAX_MATCHES } from './compile.js';
import { createFindSession, type FindRequest } from './session.js';

const chapters = [
  { id: 'a', text: 'uno dos uno' },
  { id: 'b', text: 'tres uno' },
  { id: 'c', text: 'nada' },
];

function request(texts: { id: string; text: string }[], query = 'uno', extra: Partial<FindRequest> = {}): FindRequest {
  return { query, options: DEFAULT_FIND_OPTIONS, texts, order: texts.map((t) => t.id), ...extra };
}

/** A clock that counts how often it is read. */
function counter() {
  const c = { reads: 0, now: () => c.reads++ * 0 };
  return c;
}

describe('a find session', () => {
  it('lists the chapters with matches, in book order', () => {
    const out = createFindSession().run(request(chapters));
    expect(out).toEqual({
      results: [
        { chapterId: 'a', matches: [{ from: 0, to: 3 }, { from: 8, to: 11 }] },
        { chapterId: 'b', matches: [{ from: 5, to: 8 }] },
      ],
      stopped: null,
    });
  });

  it('reports an expression that does not compile', () => {
    expect(createFindSession().run(request(chapters, '(', { options: { ...DEFAULT_FIND_OPTIONS, regex: true } }))).toHaveProperty('error');
  });

  it('keeps the texts it was sent and searches again only a chapter that changed', () => {
    const session = createFindSession();
    const first = counter();
    session.run(request(chapters), first.now);
    // Nothing changed: no chapter is searched (the clock is read once, for the deadline).
    const same = counter();
    const again = session.run({ ...request([]), order: ['a', 'b', 'c'] }, same.now);
    expect(same.reads).toBe(1);
    expect(again).toMatchObject({ results: [{ chapterId: 'a' }, { chapterId: 'b' }] });
    // One chapter edited: only it is searched, the others come from the cache.
    const edited = counter();
    const out = session.run({ ...request([{ id: 'b', text: 'tres' }]), order: ['a', 'b', 'c'] }, edited.now);
    expect(edited.reads).toBeGreaterThan(1);
    expect(edited.reads).toBeLessThan(first.reads);
    expect(out).toMatchObject({ results: [{ chapterId: 'a' }] });
    // A chapter left out of the order is forgotten.
    expect(session.run({ ...request([]), order: ['b'] })).toEqual({ results: [], stopped: null });
  });

  it('stops at the match cap over the whole book', () => {
    const big = Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, text: 'x '.repeat(3000) }));
    const out = createFindSession().run(request(big, 'x'));
    if ('error' in out) throw new Error(out.error);
    expect(out.stopped).toBe('count');
    expect(out.results.reduce((n, r) => n + r.matches.length, 0)).toBe(MAX_MATCHES);
  });

  it('stops at its time budget, and does not keep the half result', () => {
    const session = createFindSession();
    let t = 0;
    const out = session.run(request(chapters, 'o', { budgetMs: 3 }), () => t++);
    expect(out).toMatchObject({ stopped: 'time' });
    // Run again with time to spare: the chapter is searched again, whole.
    const full = session.run({ ...request([], 'o'), order: ['a', 'b', 'c'] });
    expect(full).toMatchObject({ stopped: null });
    if ('error' in full) throw new Error(full.error);
    expect(full.results.find((r) => r.chapterId === 'a')!.matches).toHaveLength(3);
  });

  it('searches a large chapter within its budget', () => {
    const paragraph = 'La célula eucariota tiene núcleo. Una célula procariota no lo tiene, y su ADN está en el citoplasma.\n';
    const text = paragraph.repeat(20000); // about 2 MB
    const session = createFindSession();
    const start = performance.now();
    const out = session.run(request([{ id: 'big', text }], 'celula', { options: { ...DEFAULT_FIND_OPTIONS, ignoreAccents: true }, budgetMs: 5000 }));
    const took = performance.now() - start;
    if ('error' in out) throw new Error(out.error);
    expect(out.stopped).toBe('count');
    expect(out.results[0]!.matches).toHaveLength(MAX_MATCHES);
    expect(took).toBeLessThan(5000);
    // A regular expression that would match every character stops at the cap.
    const dots = session.run(request([{ id: 'big', text }], '.', { options: { ...DEFAULT_FIND_OPTIONS, regex: true } }));
    expect(dots).toMatchObject({ stopped: 'count' });
  });
});
