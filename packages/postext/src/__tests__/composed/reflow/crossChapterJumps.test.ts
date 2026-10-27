import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { buildBundle } from '../../../bundle/index.js';
import { hasComposedPage } from '../../../bundle/book.js';
import { resolveJumpMarks } from '../../../index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import type { PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, PostextConfig, VDTBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { page8Fixture } from '../fixtures/page8.js';
import { elementsForSource, sourceAt } from '../../../composed/sourceMap.js';

// A story that jumps from one chapter file into a page fence of a later one
// (#943): a magazine kept as one chapter file per article. The rest of the
// story is laid by the chapter that has the page, exactly as an in-chapter
// jump lays it (#917).

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
  frames: [{ name: 'cuerpo', style: 'caja-azul', flow: true, width: mm(186), height: mm(90), placement: top, overflow: { continueIn: 'page:{attr.sigue}', mark: 'Sigue en la página {page}', fromMark: 'Viene de la página {page}' }, fit: { shrinkText: false } }],
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
const TEMPLATES = [ARTICULO, OTRA, SALTO];
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({ ...BASE, ...extra, pageTemplates: TEMPLATES });

const para = (word: string, n: number): string => Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ');
const fence = (template: string, body: string, attrs = ''): string => [`::::page{template="${template}"${attrs}}`, body, '::::', ''].join('\n');
const article = (sigue: string, words = 900): string => fence('articulo', para('art', words), ` sigue="${sigue}"`);
const other = (): string => fence('otra', para('otra', 200));
const jumpPage = (id = 'p-salto'): string => fence('salto', para('breve', 60), ` id="${id}"`);

const composedPages = (doc: VDTDocument): VDTPage[] => doc.pages.filter((p) => p.composed);
const frameOn = (page: VDTPage, name: string): VDTFrame => page.composed!.frames.find((f) => f.name === name)!;
const blocksOf = (page: VDTPage, f: VDTFrame): VDTBlock[] => f.blockIds.map((id) => page.floats!.find((b) => b.id === id)!);
const textOf = (blocks: readonly VDTBlock[]): string => blocks.filter((b) => b.type !== 'callout').flatMap((b) => b.lines.map((l) => l.text)).join(' ');
const warningsOf = (doc: VDTDocument, ...kinds: string[]): ContentWarning[] => (doc.contentWarnings ?? []).filter((w) => kinds.includes(w.kind));
const count = (s: string, word: string): number => s.split(word).length - 1;
const wordsOf = (s: string): string[] => s.split(/\s+/).filter(Boolean);

/** The chapters of a magazine: the article, an unrelated chapter, the jump page. */
const magazine = (sigue = 'p-salto', words = 900): string[] => [article(sigue, words), other(), jumpPage()];
const bundle = (chapters: readonly string[], extra: Partial<PostextConfig> = {}): VDTDocument[] =>
  buildBundle({ chapters: chapters.map((markdown) => ({ markdown })), config: config(extra), resources: RESOURCES }, { cache: createMeasurementCache() });

describe('a story that jumps to a page of a later chapter (#943)', () => {
  const docs = bundle(magazine());
  const [a, b, c] = docs as [VDTDocument, VDTDocument, VDTDocument];
  const from = composedPages(a)[0]!;
  const sent = frameOn(from, 'cuerpo');
  const target = composedPages(c).find((p) => p.composed!.template === 'salto')!;
  const got = frameOn(target, 'resto');

  it('does not warn and adds no page after the sending page', () => {
    for (const d of docs) expect(warningsOf(d, 'continueTargetMissing', 'frameOverflow')).toEqual([]);
    expect(composedPages(a)).toHaveLength(1);
    expect(composedPages(b)).toHaveLength(1);
  });

  it('hands the jump back on the sending document', () => {
    expect(a.pendingJumps).toHaveLength(1);
    expect(a.pendingJumps![0]).toMatchObject({ target: 'p-salto', frame: 'cuerpo' });
    expect(b.pendingJumps).toBeUndefined();
    expect(c.pendingJumps).toBeUndefined();
  });

  it('goes on in the frame the page leaves empty', () => {
    expect(got.continuedFrom).toBe(sent.id);
    expect(got.continuedFromChapter).toBe(0);
    expect(sent.continuesToChapter).toBe(2);
    expect(textOf(blocksOf(target, frameOn(target, 'breve')))).toMatch(/^breve0 /);
  });

  it('sets every word of the article once, in order, across the two chapters', () => {
    const all = wordsOf(`${textOf(blocksOf(from, sent))} ${textOf(blocksOf(target, got))}`);
    expect(all).toEqual(Array.from({ length: 900 }, (_, i) => `art${i}`));
  });

  it('lays the rest as the same jump inside one chapter does', () => {
    const one = buildDocument({ markdown: [article('p-salto'), other(), jumpPage()].join('\n'), resources: RESOURCES }, config(), createMeasurementCache());
    const pages = composedPages(one);
    const inChapter = frameOn(pages[2]!, 'resto');
    expect(inChapter.rect).toEqual(got.rect);
    expect(textOf(blocksOf(pages[2]!, inChapter))).toBe(textOf(blocksOf(target, got)));
    expect(textOf(blocksOf(pages[0]!, frameOn(pages[0]!, 'cuerpo')))).toBe(textOf(blocksOf(from, sent)));
  });

  const overlayOf = (box: VDTBlock | undefined): string[] =>
    (box?.designOverlay?.blocks ?? []).flatMap((d) => (d.kind === 'text' ? [d.lines.map((l) => l.text).join(' ')] : []));

  it('marks name the page of the other chapter with the number its chapter gave it', () => {
    // One page a chapter: the jump page is the third of the book.
    expect(target.pageLabel).toBe('3');
    expect(overlayOf(blocksOf(from, sent)[0])).toContain('Sigue en la página 3');
    expect(overlayOf(blocksOf(target, got)[0])).toContain('Viene de la página 1');
    // The frames and the log know the way.
    expect(sent.continuesTo).toBe(got.id);
    expect(from.composed!.log).toContainEqual({ frame: 'cuerpo', kind: 'continued', toChapter: 2, toPage: target.index, toFrame: got.id });
  });

  it('marks follow the page numbers when the chapters between grow', () => {
    const longer = bundle([article('p-salto'), `${other()}\n${other()}\n${other()}`, jumpPage()]);
    const first = composedPages(longer[0]!)[0]!;
    const last = composedPages(longer[2]!).find((p) => p.composed!.template === 'salto')!;
    expect(last.pageLabel).toBe('5');
    expect(overlayOf(blocksOf(first, frameOn(first, 'cuerpo'))[0])).toContain('Sigue en la página 5');
    // Resolving again changes nothing.
    resolveJumpMarks(longer);
    expect(overlayOf(blocksOf(first, frameOn(first, 'cuerpo'))[0])).toContain('Sigue en la página 5');
  });

  it('leaves the chapter between untouched', () => {
    const alone = bundle([article('nada'), other(), jumpPage()])[1]!;
    expect(textOf(composedPages(b).flatMap((p) => blocksOf(p, frameOn(p, 'texto'))))).toBe(textOf(composedPages(alone).flatMap((p) => blocksOf(p, frameOn(p, 'texto')))));
  });

  it('what the frame there cannot hold goes on on a page added after it', () => {
    const small: PageTemplate = { ...SALTO, frames: SALTO.frames!.map((f) => (f.name === 'resto' ? { ...f, height: mm(60) } : f)) };
    const long = buildBundle({ chapters: magazine('p-salto', 2400).map((markdown) => ({ markdown })), config: { ...config(), pageTemplates: [ARTICULO, OTRA, small] }, resources: RESOURCES }, { cache: createMeasurementCache() });
    const pages = composedPages(long[2]!);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(frameOn(pages[1]!, 'resto').id).toBe(`${frameOn(pages[0]!, 'resto').id}~1`);
    const text = `${textOf(blocksOf(composedPages(long[0]!)[0]!, frameOn(composedPages(long[0]!)[0]!, 'cuerpo')))} ${pages.flatMap((p) => p.composed!.frames.filter((f) => f.name === 'resto').map((f) => textOf(blocksOf(p, f)))).join(' ')}`;
    for (const w of ['art0 ', 'art1200 ', 'art2399']) expect(count(`${text} `, w)).toBe(1);
  });

  it('a page id no later chapter has: the rest goes on on the next page, and a warning says so', () => {
    const lost = bundle(magazine('nada'));
    const ws = warningsOf(lost[0]!, 'continueTargetMissing');
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ target: 'nada' });
    expect(composedPages(lost[0]!).length).toBeGreaterThan(1);
    expect(lost[0]!.pendingJumps).toBeUndefined();
  });

  it('a chapter laid on its own (no later chapters known) warns the same', () => {
    const solo = buildDocument({ markdown: article('p-salto'), resources: RESOURCES }, config(), createMeasurementCache());
    expect(warningsOf(solo, 'continueTargetMissing')).toHaveLength(1);
    expect(solo.pendingJumps).toBeUndefined();
  });
});

describe('the rest keeps the numbers and the shape its chapter gave it (#943)', () => {
  const numbered: Partial<PostextConfig> = {
    headings: { levels: [{ level: 1, numberingTemplate: '{1}', numberSeparator: '. ', breakBefore: { enabled: false, parity: 'any' } }, { level: 2, numberingTemplate: '{1}.{2}', numberSeparator: ' ' }] },
  } as unknown as Partial<PostextConfig>;
  const story = (): string => ['# Una historia', '', para('uno', 700), '', '## Un apartado', '', para('dos', 100), '', '## Otro apartado', '', para('cuatro', 150), '', '1. primero', '2. segundo', '', para('tres', 300)].join('\n');
  const chapters = (): string[] => [fence('articulo', story(), ' sigue="p-salto"'), '# Otro capítulo\n\ntexto\n\n## Un subapartado\n\nmás texto\n', jumpPage()];
  const heads = (doc: VDTDocument): string[] => doc.blocks.filter((b) => b.type === 'heading').map((b) => b.lines.map((l) => l.text).join(' '));

  it('headings in the rest are numbered by the chapter they were written in', () => {
    const docs = bundle(chapters(), numbered);
    expect(heads(docs[0]!)).toEqual(['1. Una historia']);
    expect(heads(docs[2]!)).toEqual(['1.1 Un apartado', '1.2 Otro apartado']);
    expect(heads(docs[1]!)).toEqual(['2. Otro capítulo', '2.1 Un subapartado']);
  });

  it('the pieces on the target page are laid exactly as the same jump inside one chapter lays them', () => {
    const docs = bundle(chapters());
    const one = buildDocument({ markdown: chapters().join('\n'), resources: RESOURCES }, config(), createMeasurementCache());
    const here = composedPages(docs[2]!).find((p) => p.composed!.template === 'salto')!;
    const there = composedPages(one).find((p) => p.composed!.template === 'salto')!;
    const shape = (page: VDTPage): unknown[] =>
      (page.floats ?? []).map((b) => [b.type, b.bbox, b.lines.map((l) => [l.text, l.bbox, l.baseline]), b.callout?.part, b.callout?.continued]);
    expect(shape(here)).toEqual(shape(there));
  });

  it('two articles jumping to one page take its free frames in the order they were sent', () => {
    const two: PageTemplate = {
      ...SALTO,
      frames: [...SALTO.frames!.map((f) => (f.name === 'resto' ? { ...f, height: mm(50) } : f)), { name: 'otro', style: 'caja-azul', width: mm(186), height: mm(50), placement: { anchor: { to: '#resto', edge: 'below' }, offset: { y: mm(10) } } }],
    };
    const chapters2 = [article('p-salto', 900), fence('articulo', para('bis', 900), ' sigue="p-salto"'), jumpPage()];
    const docs = buildBundle({ chapters: chapters2.map((markdown) => ({ markdown })), config: { ...config(), pageTemplates: [ARTICULO, OTRA, two] }, resources: RESOURCES }, { cache: createMeasurementCache() });
    const page = composedPages(docs[2]!).find((p) => p.composed!.template === 'salto')!;
    expect(textOf(blocksOf(page, frameOn(page, 'resto')))).toMatch(/^art\d+ /);
    expect(textOf(blocksOf(page, frameOn(page, 'otro')))).toMatch(/^bis\d+ /);
    expect(frameOn(page, 'resto').continuedFromChapter).toBe(0);
    expect(frameOn(page, 'otro').continuedFromChapter).toBe(1);
  });

  it('a picture, a list and a box in the rest are set in the frame as the sending chapter would', () => {
    const rich = [para('uno', 700), '', '::resource{id="foto-gasto"}', '', '- a', '- b', '- c', '', ':::callout{type="act"}', 'dentro de la caja', ':::', '', para('fin', 50)].join('\n');
    const docs = bundle([fence('articulo', rich, ' sigue="p-salto"'), other(), jumpPage()]);
    const page = composedPages(docs[2]!).find((p) => p.composed!.template === 'salto')!;
    const types = blocksOf(page, frameOn(page, 'resto')).map((b) => b.type);
    expect(types).toContain('resource');
    expect(types.some((t) => t.startsWith('list'))).toBe(true);
    expect(textOf(blocksOf(page, frameOn(page, 'resto')))).toContain('fin49');
    expect(warningsOf(docs[2]!, 'frameOverflow')).toEqual([]);
  });

  it('notes in the rest keep the numbers and the words of their chapter, not those of notes of the same id here', () => {
    const noted = fence('articulo', `primera nota[^a] ${para('uno', 700)} segunda nota[^b] y ${para('tres', 50)}`, ' sigue="p-salto"') + '\n[^a]: Texto de la nota A.\n[^b]: Texto de la nota B.\n';
    const between = '# Otro capítulo\n\ntexto[^a]\n\n[^a]: Otra nota con el mismo id.\n';
    const docs = bundle([noted, between, jumpPage()]);
    const notesOf = (doc: VDTDocument): string[] => doc.blocks.filter((b) => b.footnoteNote !== undefined).map((b) => b.lines.map((l) => l.text).join(' ').replace(/\s+/g, ' '));
    expect(notesOf(docs[0]!)).toEqual(['1 Texto de la nota A.']);
    expect(notesOf(docs[1]!)).toEqual(['1 Otra nota con el mismo id.']);
    // The second note of the article, numbered 2 by its chapter.
    expect(notesOf(docs[2]!)).toEqual(['2 Texto de la nota B.']);
    const page = composedPages(docs[2]!).find((p) => p.composed!.template === 'salto')!;
    expect(textOf(blocksOf(page, frameOn(page, 'resto')))).toMatch(/segunda nota\s?2/);
  });
});

describe('jumps that go on, and jumps that are lost (#943)', () => {
  it('a story can go from one chapter to a page that sends it on to a third', () => {
    const hop: PageTemplate = {
      ...SALTO,
      frames: SALTO.frames!.map((f) => (f.name === 'resto' ? { ...f, height: mm(60), overflow: { continueIn: 'page:{attr.sigue}', mark: 'Sigue en la página {page}' } } : f)),
    };
    const chapters = [article('p-salto', 2400), fence('salto', para('breve', 60), ' id="p-salto" sigue="p-final"'), fence('salto', para('final', 30), ' id="p-final"')];
    const docs = buildBundle({ chapters: chapters.map((markdown) => ({ markdown })), config: { ...config(), pageTemplates: [ARTICULO, OTRA, hop] }, resources: RESOURCES }, { cache: createMeasurementCache() });
    expect(docs.flatMap((d) => warningsOf(d, 'continueTargetMissing', 'frameOverflow'))).toEqual([]);
    const text = (doc: VDTDocument): string => composedPages(doc).flatMap((p) => p.composed!.frames.filter((f) => f.name === 'cuerpo' || f.name === 'resto').map((f) => textOf(blocksOf(p, f)))).join(' ');
    const all = wordsOf([text(docs[0]!), text(docs[1]!), text(docs[2]!)].join(' '));
    expect(all).toEqual(Array.from({ length: 2400 }, (_, i) => `art${i}`));
    // The last piece says which chapter's page it comes from.
    const last = composedPages(docs[2]!)[0]!;
    expect(frameOn(last, 'resto').continuedFromChapter).toBe(1);
    expect(docs[1]!.pendingJumps).toHaveLength(1);
    expect(docs[1]!.pendingJumps![0]!.chapter).toBe(0);
    expect(blocksOf(last, frameOn(last, 'resto'))[0]!.sourceChapter).toBe(0);
  });

  it('a chapter handed a story for a page it does not have says so and sets no page for it', () => {
    const sender = bundle(magazine());
    const jump = { ...sender[0]!.pendingJumps![0]!, chapter: 0, fromChapter: 0 };
    const receiver = buildDocument({ markdown: other(), resources: RESOURCES, continuation: { jumps: [jump] } }, config(), createMeasurementCache());
    const ws = warningsOf(receiver, 'continueTargetMissing');
    expect(ws).toHaveLength(1);
    expect(ws[0]).toMatchObject({ target: 'p-salto', fromChapter: 0, frame: 'cuerpo' });
    expect(composedPages(receiver)).toHaveLength(1);
  });
});

describe('the source of the carried text is its own chapter (#943)', () => {
  const chapters = magazine();
  const docs = bundle(chapters);
  const target = composedPages(docs[2]!).find((p) => p.composed!.template === 'salto')!;
  const got = frameOn(target, 'resto');
  const firstBlock = blocksOf(target, got).find((b) => b.type !== 'callout')!;
  const words = wordsOf(textOf([firstBlock]));

  it('stamps the chapter on the blocks and the frame, with offsets of that chapter\'s file', () => {
    expect(got.sourceChapter).toBe(0);
    expect(frameOn(target, 'breve').sourceChapter).toBeUndefined();
    for (const b of blocksOf(target, got)) expect(b.sourceChapter).toBe(0);
    expect(chapters[0]!.slice(firstBlock.sourceStart!, firstBlock.sourceStart! + words[0]!.length)).toBe(words[0]);
    expect(chapters[2]!.slice(firstBlock.sourceStart!, firstBlock.sourceStart! + words[0]!.length)).not.toBe(words[0]);
    // The page's own text is this chapter's.
    for (const b of blocksOf(target, frameOn(target, 'breve'))) expect(b.sourceChapter).toBeUndefined();
  });

  it('sourceAt on the carried words answers with the chapter and its file', () => {
    const line = firstBlock.lines[0]!;
    const frame = got;
    const x = firstBlock.bbox.x + 3;
    const y = line.bbox.y + line.bbox.height / 2;
    const chain = sourceAt(docs[2]!, target.index, x, y, { file: 'c.md', chapterFile: (c) => `chapter-${c}.md` });
    const text = chain.find((e) => e.level === 'text')!;
    expect(text.source).toMatchObject({ kind: 'markdown', chapter: 0, file: 'chapter-0.md' });
    if (text.source.kind === 'markdown') expect(chapters[0]!.slice(text.source.start, text.source.end)).toBe(words[0]!.slice(0, text.source.end - text.source.start));
    expect(chain.find((e) => e.level === 'frame')).toMatchObject({ chapter: 0 });
    // The page and its template are this chapter's.
    expect(chain.find((e) => e.level === 'template')!.chapter).toBeUndefined();
    expect(frame.sourceChapter).toBe(0);
  });

  it('elementsForSource finds the carried words by the sending chapter\'s offsets only when asked for that chapter', () => {
    const start = firstBlock.sourceStart!;
    const end = start + words[0]!.length;
    const lines = (m: ReturnType<typeof elementsForSource>): number => m.filter((x) => x.element.level === 'line').length;
    expect(lines(elementsForSource(docs[2]!, start, end))).toBe(0);
    expect(lines(elementsForSource(docs[2]!, start, end, { chapter: 0, ownChapter: 2 }))).toBeGreaterThan(0);
    expect(lines(elementsForSource(docs[2]!, start, end, { chapter: 1, ownChapter: 2 }))).toBe(0);
    // And the page's own words by its own chapter.
    const own = blocksOf(target, frameOn(target, 'breve'))[0]!;
    expect(lines(elementsForSource(docs[2]!, own.sourceStart!, own.sourceStart! + 3, { chapter: 2, ownChapter: 2 }))).toBeGreaterThan(0);
    expect(lines(elementsForSource(docs[2]!, own.sourceStart!, own.sourceStart! + 3, { chapter: 0, ownChapter: 2 }))).toBe(0);
  });

  it('references to anchors of the book in the rest are resolved by the chapter that sets it', () => {
    const body = [para('uno', 800), '', 'Ver [el ancla]{#anc} y :ref{id="anc"} más.'].join('\n');
    const docs = bundle([fence('articulo', body, ' sigue="p-salto"'), '# Otro capítulo\n\ntexto\n', jumpPage()]);
    const page = composedPages(docs[2]!).find((p) => p.composed!.template === 'salto')!;
    const text = textOf(blocksOf(page, frameOn(page, 'resto')));
    expect(text).toContain('Ver el ancla y');
    expect(text).not.toContain('?');
  });
  it('a chapter made of a long run of colons does not hide the page fences', () => {
    const docs = bundle([fence('articulo', para('uno', 400), ' sigue="p-salto"'), ':'.repeat(5_000) + 'pagex', jumpPage()]);
    expect(composedPages(docs[2]!).some((p) => p.composed!.template === 'salto')).toBe(true);
  });

  it('finds a page fence in linear time, whatever runs of colons come before it', () => {
    expect(hasComposedPage('::::page{template="a"}')).toBe(true);
    expect(hasComposedPage(':::page')).toBe(true);
    expect(hasComposedPage('::page')).toBe(false);
    expect(hasComposedPage('::::pages')).toBe(false);
    expect(hasComposedPage('text ::::page_x')).toBe(false);
    // A quadratic pattern takes minutes on this; the scan, milliseconds.
    const start = performance.now();
    expect(hasComposedPage(':'.repeat(400_000) + 'pagex')).toBe(false);
    expect(performance.now() - start).toBeLessThan(2_000);
  });
});
