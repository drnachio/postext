/**
 * The index marks, anchors and headings written in the part of a story that
 * goes on in a page of another chapter (#988) are listed where they stand:
 * the chapter that lays the words reports the page, and the book's outline
 * puts it into the sending chapter's entries.
 */
import { describe, it, expect } from 'vitest';
import { buildBundle } from '../../../bundle/index.js';
import { buildDocument } from '../../../pipeline/build.js';
import { contentOutline, outlineFromDoc, mergeCarriedOutline, carriedPlaces } from '../../../index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { OutlineEntry, PostextConfig, VDTBlock, VDTDocument } from '../../../index.js';
import { page8Fixture } from '../fixtures/page8.js';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const BASE = page8Fixture('es').config;
const RESOURCES = page8Fixture('es').resources;
const top = { anchor: { to: 'container' as const, edge: 'top-left' as const } };
const ARTICULO: PageTemplate = {
  id: 'articulo',
  header: false,
  frames: [{ name: 'cuerpo', style: 'caja-azul', flow: true, width: mm(186), height: mm(90), placement: top, overflow: { continueIn: 'page:{attr.sigue}' }, fit: { shrinkText: false } }],
};
const OTRA: PageTemplate = { id: 'otra', header: false, frames: [{ name: 'texto', flow: true, width: mm(186), placement: top }] };
const SALTO: PageTemplate = {
  id: 'salto',
  header: false,
  frames: [
    { name: 'breve', flow: true, width: mm(186), height: mm(40), placement: top },
    { name: 'resto', style: 'caja-azul', width: mm(186), placement: { anchor: { to: '#breve', edge: 'below' }, offset: { y: mm(10) } } },
  ],
};
const config: PostextConfig = { ...BASE, pageTemplates: [ARTICULO, OTRA, SALTO] };

const para = (word: string, n: number, at: Record<number, string> = {}): string =>
  Array.from({ length: n }, (_, i) => (at[i] ? `${at[i]} ` : '') + `${word}${i}`).join(' ');
const fence = (template: string, body: string, attrs = ''): string => [`::::page{template="${template}"${attrs}}`, body, '::::', ''].join('\n');

/** An article of 900 words with an index mark and an anchor near the start
 *  (laid by the sender) and near the end (laid by the receiver), a heading
 *  in the rest and another one on a page of its own after the story. */
const article = (): string => [
  '::::page{template="articulo" sigue="p-salto"}',
  para('art', 900, { 5: ':index[Temprano]', 880: ':index[Tardío] :anchor{#tardia}' }),
  '',
  '# Tarde {#tarde}',
  '',
  para('fin', 30),
  '::::',
  '',
  '::::page{template="otra"}',
  '# Local',
  '',
  'uno dos tres',
  '::::',
  '',
].join('\n');
const jumpPage = (): string => fence('salto', para('breve', 60), ' id="p-salto"');
const printing = '# Indice\n\n:::index\n\n# Contenido\n\n:::toc\n\nVer :ref{#tardia}.\n';
const chapters = [article(), fence('otra', para('otra', 100)), jumpPage(), printing];
const bundle = (chs: readonly string[] = chapters): VDTDocument[] =>
  buildBundle({ chapters: chs.map((markdown) => ({ markdown })), config, resources: RESOURCES }, { cache: createMeasurementCache() });

const linesOf = (doc: VDTDocument): string[] =>
  [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].flatMap((b: VDTBlock) => b.lines.map((l) => l.text));
const printed = (doc: VDTDocument): string => linesOf(doc).join(' | ');
const entryOf = (entries: readonly OutlineEntry[], title: string): OutlineEntry => entries.find((e) => e.title === title)!;

describe('what is written in the rest of a story that went to another chapter (#988)', () => {
  const docs = bundle();
  const [sender, , receiver, last] = docs as [VDTDocument, VDTDocument, VDTDocument, VDTDocument];

  it('the story goes on in the third chapter, on the fourth page of the book', () => {
    expect(sender.pages.length).toBe(2);
    expect(receiver.pendingJumps).toBeUndefined();
    expect(sender.pendingJumps).toHaveLength(1);
    expect(receiver.pages[0]!.pageLabel).toBe('4');
  });

  it('the receiving chapter reports where it laid them', () => {
    const entries = receiver.carriedOutline!;
    expect(entries.map((e) => [e.chapter, e.kind, e.pageIndex]).sort()).toEqual([
      [0, 'anchor', 0],
      [0, 'heading', 0],
      [0, 'indexMark', 0],
    ]);
    // The sender reports nothing of the rest, and the others carried nothing.
    expect(sender.carriedOutline).toBeUndefined();
    expect(last.carriedOutline).toBeUndefined();
  });

  it('the index lists a mark of the rest on the page of the words, a mark before the cut on the sender\'s', () => {
    const text = printed(last);
    expect(text).toMatch(/Temprano, 1/);
    expect(text).toMatch(/Tardío, 4/);
  });

  it('the contents list a heading of the rest on the page it is on, and the sender\'s later heading keeps its own', () => {
    const text = printed(last);
    expect(text).toMatch(/Tarde 4/);
    expect(text).toMatch(/Local 2/);
  });

  it('a reference to an anchor of the rest prints the page of the words', () => {
    expect(printed(last)).toMatch(/Ver pág\.\s4/);
  });

  it('merging puts the pages into the sender\'s entries only', () => {
    const outline = (i: number): OutlineEntry[] => outlineFromDoc(docs[i]!, contentOutline({ markdown: chapters[i]! }, config).outline);
    const own = outline(0);
    // Alone, the sender has the mark at the page its story starts on and no
    // page for the heading of the rest; the later heading is its own.
    expect(entryOf(own, 'Tardío').pageLabel).toBe('2');
    expect(entryOf(own, 'Tarde').pageLabel).toBeUndefined();
    expect(entryOf(own, 'Local').pageLabel).toBe('2');
    const merged = mergeCarriedOutline([own, outline(1), outline(2), outline(3)], docs.map((d) => carriedPlaces(d)));
    expect(entryOf(merged[0] as OutlineEntry[], 'Tardío').pageLabel).toBe('4');
    expect(entryOf(merged[0] as OutlineEntry[], 'Tarde').pageLabel).toBe('4');
    expect(entryOf(merged[0] as OutlineEntry[], 'Tarde').pageIndex).toBe(3);
    expect(entryOf(merged[0] as OutlineEntry[], 'Temprano').pageLabel).toBe('1');
    expect(entryOf(merged[0] as OutlineEntry[], 'Local').pageLabel).toBe('2');
    // The input and the chapters nothing was carried from are not touched.
    expect(entryOf(own, 'Tardío').pageLabel).toBe('2');
    const untouched = outline(1);
    expect(mergeCarriedOutline([untouched], [])[0]).toBe(untouched);
  });

  it('the marks of the receiving chapter are its own: the carried lines are not read as its offsets', () => {
    const withOwn = bundle([article(), fence('otra', para('otra', 100)), fence('salto', `${para('breve', 60, { 3: ':index[Propio]' })}`, ' id="p-salto"'), printing]);
    expect(withOwn[2]!.indexMarks).toHaveLength(1);
    expect(printed(withOwn[3]!)).toMatch(/Propio, 4/);
    expect(printed(withOwn[3]!)).toMatch(/Tardío, 4/);
  });
});

describe('anchors written in the rest are destinations on the page of the words (#988)', () => {
  const docs = bundle();
  const [sender, , receiver] = docs as [VDTDocument, VDTDocument, VDTDocument];

  it('the receiving chapter has them, the sending chapter does not', () => {
    expect(sender.anchors?.some((a) => a.id === 'tardia')).toBeFalsy();
    const here = receiver.anchors!.find((a) => a.id === 'tardia')!;
    expect(here).toMatchObject({ kind: 'anchor', pageIndex: 0, chapter: 0 });
    expect(here.y).toBeGreaterThan(0);
    // The heading written in the rest has its destination here too.
    expect(receiver.anchors!.find((a) => a.id === 'tarde')).toMatchObject({ kind: 'heading', pageIndex: 0 });
  });

  it('the receiving chapter\'s own outline does not take them for its entries', () => {
    const own = outlineFromDoc(receiver, contentOutline({ markdown: chapters[2]! }, config).outline);
    expect(own.filter((e) => e.kind === 'anchor').map((e) => e.anchorId)).toEqual([undefined, 'p-salto'].filter(Boolean));
  });
});

describe('a chapter laid alone keeps what it had (#988)', () => {
  it('without a book, the marks of the rest are on the page the story starts on', () => {
    const solo = buildDocument({ markdown: article(), resources: RESOURCES }, config, createMeasurementCache());
    // No later chapter has the page: the rest goes on after the sending
    // page, in this chapter, and everything is located here.
    expect(solo.pendingJumps).toBeUndefined();
    expect(solo.carriedOutline).toBeUndefined();
    expect(solo.indexMarks).toHaveLength(2);
  });
});
