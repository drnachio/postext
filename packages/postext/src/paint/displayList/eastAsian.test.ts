// Display list data for page-faithful writers (#1394): East Asian run
// settings, comic panels and lettering, whole reference atoms.
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig, Resource, VDTComicPage } from '../../index.js';
import { documentDisplayList } from './index.js';
import { comicLetteringItems, comicPanelItems } from './comic.js';
import type { DisplayItem, DisplayPage, DisplayRun } from './types.js';

// Deterministic stub: every character is 7 px wide.
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
type TextItem = Extract<DisplayItem, { kind: 'text' }>;
const textItems = (pages: DisplayPage[]): TextItem[] => pages.flatMap((p) => p.items.filter((i): i is TextItem => i.kind === 'text'));
const runsOf = (pages: DisplayPage[]): DisplayRun[] => textItems(pages).flatMap((i) => i.lines.flatMap((l) => l.runs));

describe('display list East Asian runs, comics and atoms (#1394)', () => {
  it('carries ruby, tate-chu-yoko, warichu and kanbun marks on the runs of a vertical page', () => {
    const md = '吾輩は{猫|ねこ}である。:tcy[12]月:warichu[甲乙丙丁]子曰、:kunten[習]{kaeri="レ" okuri="フ"}之。';
    const doc = buildDocument({ markdown: md }, {
      locale: 'ja',
      page: { dpi: 72, width: pt(215), height: pt(240), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single', writingMode: 'vertical-rl' },
      headings: { balancing: { enabled: false } },
      header: { elements: [] },
      footer: { elements: [] },
    } as PostextConfig);
    const runs = runsOf(documentDisplayList(doc));
    const ruby = runs.find((r) => r.ruby)!;
    expect(ruby.text).toBe('猫');
    expect(ruby.ruby).toMatchObject({ text: 'ねこ', position: 'over' });
    expect(ruby.ruby!.raise).toBeGreaterThan(0);
    expect(runs.find((r) => r.tcy)!.text).toBe('12');
    expect(runs.find((r) => r.warichu)!.warichu).toMatchObject({ upper: '甲乙', lower: '丙丁' });
    const kunten = runs.find((r) => r.kunten)!;
    expect(kunten.text).toBe('習');
    expect(kunten.kunten!.runs.map((r) => [r.role, r.text])).toEqual([['kaeri', 'レ'], ['okuri', 'フ']]);
  });

  it('crops mirrored panel art on the side the flip shows and keys balloon text to the comic', () => {
    const comic: VDTComicPage = {
      sourceStart: 0, sourceEnd: 10, frame: { x: 0, y: 0, width: 200, height: 100 }, direction: 'rtl', id: 'cm0', splitters: [],
      panels: [{
        index: 0, sourceStart: 0, sourceEnd: 10, radius: 0, bbox: { x: 10, y: 10, width: 100, height: 80 },
        polygon: [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 90 }, { x: 10, y: 90 }],
        border: { width: 2, color: '#000000', style: 'solid' },
        // The picture runs 50 px past the panel's left side.
        art: { resourceId: 'r', kind: 'bitmap', fileId: 'f', box: { x: -40, y: 10, width: 150, height: 80 }, source: { x: 0, y: 0, width: 1, height: 1 }, mirrored: true, letterbox: false },
      }],
      balloons: [{
        id: 'b0', elementId: 'cm0:p0:b0', panelIndex: 0, order: 0, kind: 'balloon', style: 'speech', sourceStart: 3, sourceEnd: 8, group: 0,
        shape: { d: 'M 20 20 L 60 20 L 60 40 L 20 40 Z', fill: '#ffffff', stroke: '#000000', strokeWidth: 1 },
        bbox: { x: 20, y: 20, width: 40, height: 20 },
        text: [{ kind: 'text', bbox: { x: 22, y: 22, width: 36, height: 16 }, fontString: '10px Test', color: '#000000', lines: [{ text: 'Hi!', xOffset: 0, width: 21, baselineY: 34 }], sourceText: 'Hi!', sourceMap: [5, 6, 7] }],
      }],
    } as unknown as VDTComicPage;
    const panel = comicPanelItems(comic);
    expect(panel.map((i) => i.kind)).toEqual(['image', 'path']);
    const art = panel[0] as Extract<DisplayItem, { kind: 'image' }>;
    expect(art.rect).toEqual({ x: 10, y: 10, width: 100, height: 80 });
    expect(art.flipH).toBe(true);
    // Shown: the stored picture's left two thirds (its right third, cut on
    // the sheet's left, is the flipped picture's left).
    expect(art.crop!.x).toBeCloseTo(0, 6);
    expect(art.crop!.width).toBeCloseTo(100 / 150, 6);
    const lettering = comicLetteringItems(comic, 'cm0');
    expect(lettering.map((i) => i.kind)).toEqual(['path', 'path', 'text']);
    const text = lettering[2] as TextItem;
    expect(text.role).toBe('balloon');
    expect(text.source).toMatchObject({ blockKey: 'cm0:cm0:p0:b0', map: [5, 6, 7] });
    expect(text.source!.generated).toBeUndefined();
  });

  it('paints a strip in the column on the sheet: art, outline, lettering', () => {
    const res: Resource = { id: 'd1', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'file-d1', format: 'png', width: 300, height: 200 } } as Resource;
    const md = 'Before.\n\n:::strip{split="* | * | *"}\n::panel{art=d1}\nana: Morning!\n::panel\n::panel\n:::\n\nAfter.';
    const doc = buildDocument({ markdown: md, resources: [res] }, {
      page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single' }, header: { elements: [] }, footer: { elements: [] },
    } as PostextConfig);
    const page = documentDisplayList(doc)[0]!;
    const art = page.items.findIndex((i) => i.kind === 'image' && i.fileId === 'file-d1');
    const balloon = page.items.findIndex((i) => i.kind === 'text' && i.role === 'balloon');
    expect(art).toBeGreaterThanOrEqual(0);
    expect(balloon).toBeGreaterThan(art);
    const text = page.items[balloon] as TextItem;
    expect(text.lines.map((l) => l.text).join(' ')).toContain('Morning');
    text.source!.map.forEach((off, i) => { if (off >= 0) expect(md[off]).toBe(text.lines.map((l) => l.text).join('')[i]); });
  });

  it('maps every printed character of a reference to its construct, one atom', () => {
    const res: Resource = { id: 'f1', typeId: 'figure', kind: 'bitmap', caption: 'A plate.', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'p', format: 'png', width: 100, height: 60 } } as Resource;
    const md = 'See :ref{id="f1"} for the plate, and the words after it.';
    const doc = buildDocument({ markdown: md, resources: [res] }, {
      page: { dpi: 72, width: pt(300), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single' }, header: { elements: [] }, footer: { elements: [] },
    } as PostextConfig);
    const body = textItems(documentDisplayList(doc)).find((i) => i.role === 'body' && i.source?.atoms?.some((a) => a.kind === 'ref'))!;
    const atom = body.source!.atoms!.find((a) => a.kind === 'ref')!;
    expect(md.slice(atom.start, atom.end)).toBe(':ref{id="f1"}');
    const text = body.lines.map((l) => l.text).join('');
    const end = text.indexOf(' for the plate');
    expect(end - atom.at).toBeGreaterThan(1);
    for (let i = atom.at; i < end; i++) expect(body.source!.map[i]).toBe(atom.start);
    expect(body.source!.map[end]).toBe(md.indexOf(' for the plate'));
  });
});
