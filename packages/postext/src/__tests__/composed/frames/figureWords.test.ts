import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { parseMarkdown } from '../../../parse/index.js';
import { renderToHtmlIndexed } from '../../../html-backend/html-backend.js';
import type { PostextConfig, Resource, VDTBlock, VDTDocument } from '../../../index.js';

// #935: a figure says its alt, caption and note in the words of its own
// edition; the resource keeps the picture and the anchors.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const em = m ? Number(m[1]) : 10;
    return { width: [...s].length * em * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
};
const RELIEF: Resource = {
  id: 'relief', typeId: 'figure', kind: 'bitmap', altText: 'Relief map of Varenia', caption: 'Relief of Varenia', note: 'Source: survey',
  createdAt: 0, updatedAt: 0, bitmap: { fileId: 'relief.png', format: 'png', width: 400, height: 300 },
  anchors: [{ id: 'mar', x: 0.2, y: 0.5 }],
};
const build = (markdown: string, resources: Resource[] = [RELIEF]): VDTDocument =>
  buildDocument({ markdown, resources }, PAGE, createMeasurementCache());
const figureOf = (doc: VDTDocument, id = 'relief'): VDTBlock => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock?.resource.id === id)!;
const captionText = (doc: VDTDocument, id = 'relief'): string => figureOf(doc, id).resourceBlock!.captionLines.map((l) => l.text).join(' ');

describe('a figure’s own words, parsed (#935)', () => {
  it('reads alt, caption and note from the fence’s attributes, with their source ranges', () => {
    const md = ':::figure{resource="relief" alt="Mapa de relieve" caption="Relieve de Varenia"}\n:::\n';
    const block = parseMarkdown(md).find((b) => b.figure)!;
    expect(block.figure!.words).toMatchObject({ alt: { text: 'Mapa de relieve' }, caption: { text: 'Relieve de Varenia' } });
    const alt = block.figure!.words!.alt!;
    expect(md.slice(alt.sourceStart, alt.sourceEnd)).toBe('Mapa de relieve');
    expect(block.figure!.words!.note).toBeUndefined();
  });

  it('reads ::alt, ::caption and ::note lines beside the labels, and lets a line win over an attribute', () => {
    const md = [':::figure{resource="relief" caption="from the fence"}', '::caption[Relieve de **Varenia**]', '::label[Mar]{at="mar"}', '::note[Fuente: *levantamiento*]', '::alt[Mapa de relieve]', ':::', ''].join('\n');
    const block = parseMarkdown(md).find((b) => b.figure)!;
    const words = block.figure!.words!;
    expect(words.caption!.text).toBe('Relieve de **Varenia**');
    expect(words.note!.text).toBe('Fuente: *levantamiento*');
    expect(words.alt!.text).toBe('Mapa de relieve');
    expect(md.slice(words.caption!.sourceStart, words.caption!.sourceEnd)).toBe('Relieve de **Varenia**');
    expect(block.figure!.labels).toHaveLength(1);
  });

  it('keeps nested brackets and a forced break in a caption line, and ends the figure at a line it does not know', () => {
    const md = [':::figure{resource="relief"}', '::caption[Map [1] \\\\ north up]', 'stray', ':::', ''].join('\n');
    const blocks = parseMarkdown(md);
    expect(blocks.find((b) => b.figure)!.figure!.words!.caption!.text).toBe('Map [1] \\\\ north up');
  });
});

describe('a figure’s own words, laid out (#935)', () => {
  it('replaces the resource’s caption, note and alt for this edition, the resource untouched', () => {
    const doc = build([':::figure{resource="relief"}', '::caption[Relieve de Varenia]', '::note[Fuente: levantamiento]', '::alt[Mapa de relieve]', ':::', ''].join('\n'));
    expect(captionText(doc)).toContain('Relieve de Varenia');
    expect(captionText(doc)).not.toContain('Relief of');
    const rb = figureOf(doc).resourceBlock!;
    expect(rb.resource.altText).toBe('Mapa de relieve');
    expect(rb.noteLines.map((l) => l.text).join(' ')).toContain('Fuente');
    expect(RELIEF.caption).toBe('Relief of Varenia');
    expect(RELIEF.altText).toBe('Relief map of Varenia');
  });

  it('keeps what a figure does not say: the alt and note of the resource', () => {
    const doc = build([':::figure{resource="relief" caption="Relieve"}', ':::', ''].join('\n'));
    expect(captionText(doc)).toContain('Relieve');
    const rb = figureOf(doc).resourceBlock!;
    expect(rb.resource.altText).toBe('Relief map of Varenia');
    expect(rb.noteLines.map((l) => l.text).join(' ')).toContain('Source: survey');
  });

  it('says no caption, no note or a decorative picture with empty words', () => {
    const doc = build([':::figure{resource="relief" caption="" note="" alt=""}', ':::', ''].join('\n'));
    const rb = figureOf(doc).resourceBlock!;
    expect(rb.captionLines.map((l) => l.text).join('').replace(/[^a-z]/gi, '')).not.toContain('Relief');
    expect(rb.noteLines).toHaveLength(0);
    expect(rb.resource.altText).toBe('');
  });

  it('reaches the HTML alt text, one resource and three editions', () => {
    const editions = { es: 'Mapa de relieve de Varenia', en: 'Relief map of Varenia, in English', ar: 'خريطة التضاريس' };
    for (const [, alt] of Object.entries(editions)) {
      const doc = build(`:::figure{resource="relief"}\n::alt[${alt}]\n:::\n`);
      const html = renderToHtmlIndexed(doc, { resourceImageUrl: (id) => `https://example.org/${id}` }).pages[0]!.innerHtml;
      expect(html).toContain(`alt="${alt}"`);
    }
  });

  it('takes the words of the first figure of a resource set twice', () => {
    const doc = build([':::figure{resource="relief" caption="First"}', ':::', '', ':::figure{resource="relief" caption="Second"}', ':::', ''].join('\n'));
    expect(captionText(doc)).toContain('First');
  });
});

describe('two figures of one resource that say different words (#986)', () => {
  const warningsOf = (md: string, resources: Resource[] = [RELIEF]) =>
    (build(md, resources).contentWarnings ?? []).filter((w) => w.kind === 'figureWordsShared');

  it('warns on the later figure, naming the words it gives that the pages do not show', () => {
    const md = [':::figure{resource="relief" caption="First"}', ':::', '', ':::figure{resource="relief" caption="Second" note="Another note"}', ':::', ''].join('\n');
    const found = warningsOf(md);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kind: 'figureWordsShared', resourceId: 'relief', words: ['caption', 'note'] });
    const at = found[0]!;
    expect(md.slice(at.sourceStart, at.sourceEnd)).toContain('Second');
    expect(captionText(build(md))).toContain('First');
  });

  it('stays quiet when the second figure says the same words, none, or a second resource', () => {
    const twice = (second: string, resources?: Resource[]) => warningsOf([':::figure{resource="relief" caption="First"}', ':::', '', second, ':::', ''].join('\n'), resources);
    expect(twice(':::figure{resource="relief" caption="First"}')).toEqual([]);
    expect(twice(':::figure{resource="relief"}')).toEqual([]);
    const other: Resource = { ...RELIEF, id: 'relief-small' };
    expect(twice(':::figure{resource="relief-small" caption="Second"}', [RELIEF, other])).toEqual([]);
  });

  it('counts words the first figure left unsaid as lost too, and reads ::caption lines', () => {
    const md = [':::figure{resource="relief"}', '::alt[Mapa]', ':::', '', ':::figure{resource="relief"}', '::caption[Segundo]', ':::', ''].join('\n');
    const found = warningsOf(md);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ resourceId: 'relief', words: ['caption'] });
  });
});

describe('a figure’s own words on a composed page (#935)', () => {
  it('sets the edition’s caption in the frame that holds the figure, and keeps its labels', () => {
    const md = ['::::page{template="t"}', ':::figure{resource="relief" slot="map"}', '::caption[Relieve de Varenia]', '::label[Mar]{at="mar"}', ':::', '::::', ''].join('\n');
    const cfgDoc = buildDocument({ markdown: md, resources: [RELIEF] }, { ...PAGE, pageTemplates: [{ id: 't', frames: [{ name: 'map', x: mm(30), y: mm(40), width: mm(120), height: mm(120) } as never] }] }, createMeasurementCache());
    const block = figureOf(cfgDoc);
    expect(captionText(cfgDoc)).toContain('Relieve de Varenia');
    expect(block.resourceBlock!.labels).toHaveLength(1);
  });
});
