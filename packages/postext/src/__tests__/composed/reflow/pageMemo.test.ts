import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { clearComposedPageMemo, composedPageMemoStats, setComposedPageMemo } from '../../../composed/pageMemo.js';
import type { PostextConfig, VDTDocument } from '../../../index.js';
import { page8Fixture } from '../fixtures/page8.js';

// Seven px per character, whatever the face (no DOM in node).
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

const { markdown: PAGE8, config, resources } = page8Fixture('es');
/** A chapter of `n` p. 8 pages, the k-th page's theme `Tema k`. */
const chapter = (n: number): string =>
  Array.from({ length: n }, (_, k) => PAGE8.replace('tema="Retos del planeta"', `tema="Tema ${k + 1}"`)).join('\n');
/** Change the `k`-th (0-based) page of `md` with `edit`. */
const onPage = (md: string, k: number, edit: (page: string) => string): string => {
  const pages = md.split(/(?=::::page\{)/);
  pages[k] = edit(pages[k]!);
  return pages.join('');
};

const build = (md: string, cfg: PostextConfig = config): VDTDocument => buildDocument({ markdown: md, resources }, cfg, createMeasurementCache());
/** What a reader of the document sees: pages, blocks and warnings. */
const shape = (doc: VDTDocument): string =>
  JSON.stringify({ pages: doc.pages, blocks: doc.blocks, warnings: doc.contentWarnings ?? [] }, (k, v: unknown) => (k === 'layoutKey' ? undefined : v));
/** The document laid out with every composed page set afresh. */
const fresh = (md: string, cfg?: PostextConfig): string => {
  setComposedPageMemo(false);
  try {
    return shape(build(md, cfg));
  } finally {
    setComposedPageMemo(true);
  }
};
const delta = (before: ReturnType<typeof composedPageMemoStats>) => {
  const now = composedPageMemoStats();
  return { hits: now.hits - before.hits, misses: now.misses - before.misses, skipped: now.skipped - before.skipped };
};

describe('composed pages laid out once, reused where they did not change (#857)', () => {
  beforeEach(() => clearComposedPageMemo());
  afterAll(() => clearComposedPageMemo());

  it('a reused page is the page laid out afresh, wherever the page now stands', () => {
    const md = chapter(4);
    const expected = fresh(md);
    const variants = [
      md,
      // Two pages of text before the pages (each page keeps its side):
      // every offset and content index moves.
      `Una línea antes.\n\n:::pagebreak\n\nOtra línea.\n\n${md}`,
      // Front matter: the body moves in the file.
      `---\ntitle: Tema\n---\n${md}`,
      // A box on the first page: the container ids of the pages after it move.
      onPage(md, 0, (p) => p.replace('::resource{id="foto-dinero" slot="dinero-fotos"}', '::resource{id="foto-dinero" slot="dinero-fotos"}\n\n:::callout\nNota.\n:::')),
    ];
    for (const v of variants) {
      clearComposedPageMemo();
      build(v);
      const before = composedPageMemoStats();
      const doc = build(md);
      expect(delta(before).hits).toBeGreaterThan(0);
      expect(shape(doc)).toBe(expected);
    }
  });

  it('an edit inside one page sets that page alone', () => {
    const md = chapter(20);
    build(md);
    const before = composedPageMemoStats();
    const edited = onPage(md, 7, (p) => p.replace('El dinero nos deja', 'El dinero, que tanto cuesta ganar, nos deja'));
    const doc = build(edited);
    const d = delta(before);
    expect(d.misses).toBe(1);
    expect(d.skipped).toBe(0);
    expect(d.hits).toBeGreaterThanOrEqual(19);
    expect(shape(doc)).toBe(fresh(edited));
  });

  it('a property of one page (its fence’s attribute) sets that page alone', () => {
    const md = chapter(20);
    build(md);
    const before = composedPageMemoStats();
    const edited = onPage(md, 12, (p) => p.replace(/tema="Tema \d+"/, 'tema="Otro tema"'));
    const doc = build(edited);
    expect(delta(before).misses).toBe(1);
    expect(shape(doc)).toBe(fresh(edited));
  });

  it('a change of the template every page uses sets every page', () => {
    const md = chapter(5);
    build(md);
    const before = composedPageMemoStats();
    const cfg: PostextConfig = JSON.parse(JSON.stringify(config));
    (cfg.pageTemplates![0]!.frames![2]! as { padding?: unknown }).padding = { right: { value: 50, unit: 'mm' } };
    const doc = build(md, cfg);
    expect(delta(before).misses).toBe(5);
    expect(shape(doc)).toBe(fresh(md, cfg));
  });

  it('a page whose layout reads what its key does not hold is always laid out afresh', () => {
    const md = onPage(chapter(3), 1, (p) => p.replace('El dinero nos deja', 'El dinero[^n] nos deja').replace('::::\n', '::::\n\n[^n]: Una nota.\n'));
    build(md);
    const before = composedPageMemoStats();
    const doc = build(md);
    const d = delta(before);
    expect(d.skipped).toBeGreaterThan(0);
    expect(d.hits).toBeGreaterThan(0);
    expect(shape(doc)).toBe(fresh(md));
  });

  it('the same frames carry the same layout key; a changed page another', () => {
    const md = chapter(3);
    const a = build(md);
    const b = build(onPage(md, 1, (p) => p.replace('El dinero nos deja', 'El dinero hoy nos deja')));
    const keys = (d: VDTDocument) => d.pages.filter((p) => p.composed).map((p) => p.composed!.layoutKey);
    expect(keys(a).every((k) => typeof k === 'string')).toBe(true);
    expect(keys(b)[0]).toBe(keys(a)[0]);
    expect(keys(b)[1]).not.toBe(keys(a)[1]);
    expect(keys(b)[2]).toBe(keys(a)[2]);
  });

  it('pages of another locale are not taken for these', () => {
    const en = page8Fixture('en');
    build(chapter(2));
    const before = composedPageMemoStats();
    buildDocument({ markdown: en.markdown, resources: en.resources }, en.config, createMeasurementCache());
    expect(delta(before).hits).toBe(0);
  });
});
