import { describe, expect, it } from 'vitest';
import { buildBundle, createBundleLayoutCache } from '../../bundle';
import type { BundleLayoutCache } from '../../bundle';
import type { PostextConfig } from '../../types';
import type { VDTDocument } from '../../vdt';

// #782: a layout cache handed to `buildBundle` build after build lays out
// again only the chapters whose inputs changed, and gives what a build
// without it gives.

// Deterministic text measurement stub (no DOM in the node test env).
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(360), height: pt(480), margins: { top: pt(36), bottom: pt(36), left: pt(36), right: pt(36) } },
  headings: { levels: [{ level: 1, numberingTemplate: 'Chapter {1}', breakBefore: { enabled: true, parity: 'odd' } }, { level: 2, numberingTemplate: '{1}.{2}' }] },
  footer: { elements: [{ kind: 'text', id: 'folio', content: '{pageNumber}', fontSize: pt(8), placement: { anchor: { to: 'container', edge: 'top' } } }] },
} as PostextConfig;
const paragraph = (word: string) => `A paragraph with the word ${word} and enough text around it to fill a few lines of the column. `.repeat(4);
const chapter = (title: string, paragraphs = 6, word = 'plain') => `# ${title}\n\n## A section\n\n${Array.from({ length: paragraphs }, () => paragraph(word)).join('\n\n')}\n`;
const book = (chapters: string[], cfg: PostextConfig = config) => ({ chapters: chapters.map((markdown) => ({ markdown })), config: cfg });

/** What a reader sees of a book: every page's label and every block's
 *  place and lines. */
const pagesOf = (docs: VDTDocument[]) => JSON.stringify(docs.map((doc) => ({
  offset: doc.pageIndexOffset ?? 0,
  pages: doc.pages.map((p) => p.pageLabel),
  blocks: doc.blocks.map((b) => ({ type: b.type, page: b.pageIndex, bbox: b.bbox, lines: b.lines?.map((l) => l.text) })),
})));

/** Build `chapters` with `cache`, check the result against a build
 *  without one, and return which chapters were laid out. */
function rebuild(cache: BundleLayoutCache, chapters: string[], cfg: PostextConfig = config): { docs: VDTDocument[]; laidOut: boolean[] } {
  const docs = buildBundle(book(chapters, cfg), { layoutCache: cache });
  expect(pagesOf(docs)).toBe(pagesOf(buildBundle(book(chapters, cfg))));
  return { docs, laidOut: cache.stats.laidOut };
}

describe('buildBundle with a layout cache (#782)', () => {
  const base = [chapter('One'), chapter('Two'), chapter('Three'), chapter('Four')];

  it('lays out every chapter the first time and none when nothing changed', () => {
    const cache = createBundleLayoutCache();
    const first = rebuild(cache, base);
    expect(first.laidOut).toEqual([true, true, true, true]);
    const again = rebuild(cache, [...base]);
    expect(again.laidOut).toEqual([false, false, false, false]);
    expect(cache.stats.layouts).toBe(0);
    again.docs.forEach((doc, i) => expect(doc).toBe(first.docs[i]));
  });

  it('stops after the edited chapter when the continuation it hands on is the same', () => {
    const cache = createBundleLayoutCache();
    rebuild(cache, base);
    const edited = [base[0]!, chapter('Two', 6, 'edited'), base[2]!, base[3]!];
    expect(rebuild(cache, edited).laidOut).toEqual([false, true, false, false]);
  });

  it('lays out the chapters after an edit that moves the pages until one starts where it did', () => {
    const cache = createBundleLayoutCache();
    const before = rebuild(cache, base);
    const longer = [base[0]!, chapter('Two', 14), base[2]!, base[3]!];
    const after = rebuild(cache, longer);
    // Chapter two takes a page more; chapter three, which opened after a
    // blank page to start on a recto, no longer needs it, so chapter four
    // starts on the page it did and is kept.
    expect(after.docs[1]!.pages.length).toBe(before.docs[1]!.pages.length + 1);
    expect(after.docs[2]!.pages.length).toBe(before.docs[2]!.pages.length - 1);
    expect(after.laidOut).toEqual([false, true, true, false]);
  });

  it('lays out a chapter printing the contents again when a later heading changes', () => {
    const withToc = [`# Contents\n\n:::toc\n:::\n`, ...base];
    const cache = createBundleLayoutCache();
    rebuild(cache, withToc);
    // A word that leaves the outline alone does not touch the contents.
    const word = [...withToc];
    word[3] = chapter('Three', 6, 'other');
    expect(rebuild(cache, word).laidOut).toEqual([false, false, false, true, false]);
    // A heading does, wherever the contents are.
    const heading = [...word];
    heading[3] = heading[3]!.replace('# Three', '# Three renamed');
    const { docs, laidOut } = rebuild(cache, heading);
    expect(laidOut).toEqual([true, false, false, true, false]);
    expect(docs[0]!.blocks.some((b) => b.lines?.some((l) => l.text.includes('renamed')))).toBe(true);
  });

  it('lays out every chapter again when the configuration changes', () => {
    const cache = createBundleLayoutCache();
    rebuild(cache, base);
    const wider: PostextConfig = { ...config, page: { ...config.page!, margins: { ...config.page!.margins!, left: pt(30) } } } as PostextConfig;
    expect(rebuild(cache, base, wider).laidOut).toEqual([true, true, true, true]);
    expect(rebuild(cache, base, wider).laidOut).toEqual([false, false, false, false]);
  });

  it('lays out every chapter again when the book metadata changes', () => {
    const cache = createBundleLayoutCache();
    const titled = [`---\ntitle: A\n---\n\n${base[0]}`, ...base.slice(1)];
    rebuild(cache, titled);
    const retitled = [`---\ntitle: B\n---\n\n${base[0]}`, ...base.slice(1)];
    expect(rebuild(cache, retitled).laidOut).toEqual([true, true, true, true]);
  });
});
