// Comic pages in both renditions (#565): the fixed layout's region-based
// navigation, page progression and Kindle panel view; the reflowable
// book's cropped panels and dialogue.

import { describe, it, expect, beforeAll } from 'vitest';
import type { VDTDocument } from 'postext';
import { renderToEpub, readEpub } from './index';
import type { ReadEpubResult, RenderToEpubOptions } from './types';
import { buildOpf } from './package/pack';
import { buildFixedPublication } from './fixed/index';
import { percentRect } from './fixed/regions';
import { PNG, comicSampleBook, sampleBook } from './__tests__/sampleBook';

const options = (layout: RenderToEpubOptions['layout'], extra: Partial<RenderToEpubOptions> = {}): RenderToEpubOptions => ({
  layout,
  metadata: { title: 'A comic', language: 'en', modified: new Date(Date.UTC(2026, 9, 7)) },
  resourceBytes: (fileId) => (fileId === 'f1.png' ? { bytes: PNG, mediaType: 'image/png' } : undefined),
  ...extra,
});

const text = (book: ReadEpubResult, path: string): string => new TextDecoder().decode(book.files.get(path)!);

describe('fixed layout of comic pages', () => {
  let docs: VDTDocument[];
  let book: ReadEpubResult;
  let opf: string;
  beforeAll(async () => {
    docs = comicSampleBook();
    book = readEpub(await renderToEpub(docs, options('fixed')));
    opf = text(book, 'OEBPS/content.opf');
  });

  it('declares one data navigation document, out of the spine', () => {
    expect(opf).toMatch(/<item id="regions" href="regions.xhtml" media-type="application\/xhtml\+xml" properties="data-nav"\/>/);
    expect(book.spine.some((s) => s.path.endsWith('regions.xhtml'))).toBe(false);
  });

  it('lists the panels in reading order with their balloons nested, as rectangles in percent of the page', () => {
    const nav = text(book, 'OEBPS/regions.xhtml');
    expect(nav).toContain('<nav epub:type="region-based" id="regions">');
    const page = docs[0]!.pages.find((p) => p.comic)!;
    const file = book.spine[page.index]!.path.replace('OEBPS/', '');
    const panels = [...nav.matchAll(/<li epub:type="panel"><a href="([^"]+)"><\/a>/g)];
    expect(panels).toHaveLength(3);
    for (const m of panels) expect(m[1]).toMatch(new RegExp(`^${file}#xywh=percent:[0-9.]+,[0-9.]+,[0-9.]+,[0-9.]+$`));
    // Panel 1: its bounding box on the 360 × 480 pt page (480 × 640 px).
    const p0 = page.comic!.panels[0]!.bbox;
    const r = percentRect(p0, { width: 480, height: 640, scale: 480 / page.width, offset: 0 })!;
    expect(panels[0]![1]).toBe(`${file}#xywh=percent:${Math.round(r.x * 100) / 100},${Math.round(r.y * 100) / 100},${Math.round(r.w * 100) / 100},${Math.round(r.h * 100) / 100}`);
    // Balloons in the panel's region, in reading order, by kind.
    const first = /<li epub:type="panel">[\s\S]*?<\/li>\n<\/ol>\n<\/li>/.exec(nav)![0];
    expect([...first.matchAll(/<li epub:type="([\w-]+)">/g)].map((m) => m[1])).toEqual(['panel', 'balloon', 'balloon']);
    const b1 = page.comic!.balloons[0]!.bbox;
    const rb = percentRect(b1, { width: 480, height: 640, scale: 480 / page.width, offset: 0 })!;
    expect(first).toContain(`#xywh=percent:${Math.round(rb.x * 100) / 100},${Math.round(rb.y * 100) / 100},`);
    expect(nav).toContain('<li epub:type="text-area"><a');
    expect(nav).toContain('<li epub:type="sound-area"><a');
  });

  it('sets the comic in the page document as XHTML, panels as figures with their lettering after them', () => {
    const page = docs[0]!.pages.find((p) => p.comic)!;
    const xhtml = text(book, book.spine[page.index]!.path);
    expect(xhtml).toContain('<div class="pt-comic"');
    expect(xhtml).toMatch(/<svg xmlns="http:\/\/www.w3.org\/2000\/svg" class="pt-comic-art"/);
    expect(xhtml).toContain('href="../images/f1.png"');
    expect(xhtml).toMatch(/<p class="pt-comic-balloon" data-balloon="b1"/);
    expect(xhtml).not.toContain('app-amzn-magnify');
    // The book turns its pages left to right.
    expect(book.pageProgression).toBe('ltr');
  });

  it('turns the pages of a right-to-left comic right to left, and says so to Kindle', async () => {
    const rtl = comicSampleBook('rtl');
    const pub = await buildFixedPublication(rtl, options('fixed'));
    expect(pub.pageProgression).toBe('rtl');
    expect(pub.writingMode).toBe('horizontal-rl');
    const out = buildOpf(pub);
    expect(out).toContain('page-progression-direction="rtl"');
    expect(out).toContain('<meta name="primary-writing-mode" content="horizontal-rl"/>');
    // The panels read from the right: the second one sits left of the first.
    const c = rtl[0]!.pages.find((p) => p.comic)!.comic!;
    expect(c.panels[1]!.bbox.x).toBeLessThan(c.panels[0]!.bbox.x);
  });

  it('adds Kindle panel view on request: a tap target and a hidden magnified copy per panel', async () => {
    const pub = await buildFixedPublication(docs, options('fixed', { kindlePanelView: true }));
    const page = docs[0]!.pages.find((p) => p.comic)!;
    const item = pub.items.find((i) => i.href === `pages/page-${String(page.index + 1).padStart(4, '0')}.xhtml`)!;
    const xhtml = item.data as string;
    const taps = [...xhtml.matchAll(/data-app-amzn-magnify="([^"]+)"/g)].map((m) => JSON.parse(m[1]!.replace(/&quot;/g, '"')));
    expect(taps).toEqual([
      { targetId: `mag-${page.index}-0-target`, ordinal: 1 },
      { targetId: `mag-${page.index}-1-target`, ordinal: 2 },
      { targetId: `mag-${page.index}-2-target`, ordinal: 3 },
    ]);
    expect(xhtml).toContain(`id="mag-${page.index}-0-target" class="target-mag-parent" aria-hidden="true"`);
    // Copies keep their ids apart.
    const ids = [...xhtml.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const out = buildOpf(pub);
    expect(out).toContain('<meta name="book-type" content="comic"/>');
    expect(out).toContain('<meta name="RegionMagnification" content="true"/>');
    expect(out).toMatch(/<meta name="original-resolution" content="\d+x\d+"\/>/);
    const css = pub.items.find((i) => i.href === 'styles/fixed.css')!.data as string;
    expect(css).toContain('.target-mag-parent { display: none; }');
  });

  it('leaves a book without comics as it was', async () => {
    const pub = await buildFixedPublication(sampleBook(), options('fixed', { kindlePanelView: true }));
    expect(pub.items.some((i) => i.id === 'regions')).toBe(false);
    expect(pub.kindle).toBeUndefined();
    expect(pub.writingMode).toBeUndefined();
  });
});

describe('reflowable comic pages', () => {
  let chapter: string;
  beforeAll(async () => {
    const book = readEpub(await renderToEpub(comicSampleBook(), options('reflowable')));
    const path = book.spine.find((s) => s.path.includes('chapter'))!.path;
    chapter = text(book, path);
  });

  it('sets each panel as its picture cropped to the panel, then its lettering as text', () => {
    const section = /<section class="pt-comic">[\s\S]*?<\/section>/.exec(chapter)![0];
    const order = [...section.matchAll(/<figure class="pt-comic-panel"|<p class="(pt-comic-[a-z]+)">([\s\S]*?)<\/p>/g)]
      .map((m) => (m[1] ? `${m[1]}: ${m[2]}` : 'figure'));
    expect(order).toEqual([
      'figure',
      'pt-comic-line: <b>Ana</b>: Did you hear',
      'pt-comic-line: <b>Ana</b>: that?',
      'figure',
      'pt-comic-caption: Lyon, 1943.',
      'pt-comic-sfx: <i>KRAK</i>',
      'figure',
    ]);
    // The picture: an SVG of the panel (its view box), the whole picture
    // drawn at its box and clipped, named by its text alternative.
    expect(section).toMatch(/<svg xmlns="http:\/\/www.w3.org\/2000\/svg" xmlns:xlink="http:\/\/www.w3.org\/1999\/xlink" width="[0-9.]+" height="[0-9.]+" viewBox="[0-9. ]+" role="img" aria-label="Ana at the door">/);
    expect(section).toContain('xlink:href="../images/f1.png"');
    expect(section).toContain('<clipPath id="comic-clip-1">');
    expect(section).toContain('scale(-1 1)');
    // Text before and after the page keeps its place.
    expect(chapter.indexOf('Before the page.')).toBeLessThan(chapter.indexOf('pt-comic'));
    expect(chapter.indexOf('After the page.')).toBeGreaterThan(chapter.indexOf('</section>\n<p'));
  });

  it('links a panel anchor', () => {
    expect(chapter).toContain('<figure class="pt-comic-panel" id="a-first">');
  });
});
