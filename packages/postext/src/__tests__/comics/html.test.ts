import { describe, it, expect } from 'vitest';
import { buildDocument, renderToHtml, renderToHtmlIndexed, comicPanelSvg, comicBalloonText, comicBalloonKind, comicViewerLeaf, resolvedComics } from '../../index';
import type { Resource, VDTComicBalloon, VDTDesignTextBlock, VDTDocument, VDTPage } from '../../index';

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

const resources: Resource[] = [
  { id: 'pic', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, altText: 'A street at night', bitmap: { fileId: 'pic-file', format: 'png', width: 2000, height: 1000 } },
  { id: 'pop', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'pop-file', format: 'png', width: 2000, height: 1000 } },
];

const MD = [
  ':::page{split="40 / * [50 | *]"}',
  '::panel{art=pic pop=pop #opening}',
  '::panel{art=pic mirror bg="#ff0000" alt="Ana at the door"}',
  '::panel{art=pic border=none}',
  ':::',
].join('\n');

function text(t: string, x: number, y: number): VDTDesignTextBlock {
  return { kind: 'text', bbox: { x, y, width: 80, height: 20 }, fontString: '400 12px "Comic Neue"', color: '#111111', clip: false, lines: [{ text: t, xOffset: 0, baselineY: y + 14, width: 70 }] };
}

/** Balloons as the lettering sets them: a join group of two (the first
 *  with the outline), a caption, and a sound effect, in reading order. */
function letter(doc: VDTDocument): VDTDocument {
  const page = doc.pages.find((p) => p.comic)!;
  const c = page.comic!;
  const [a, b] = [c.panels[0]!, c.panels[1]!];
  const balloons: VDTComicBalloon[] = [
    { id: 'b1', panelIndex: 0, order: 0, kind: 'balloon', style: 'speech', speaker: 'ana', sourceStart: 1, sourceEnd: 2, group: 0,
      shape: { d: `M${a.bbox.x + 10} ${a.bbox.y + 10}h80v30h-80Z M${a.bbox.x + 90} ${a.bbox.y + 10}h80v30h-80Z`, fill: '#ffffff', stroke: '#111111', strokeWidth: 1.5 },
      text: [text('Did you hear', a.bbox.x + 10, a.bbox.y + 10)], bbox: { x: a.bbox.x + 10, y: a.bbox.y + 10, width: 80, height: 30 } },
    { id: 'b2', panelIndex: 0, order: 1, kind: 'balloon', style: 'speech', speaker: 'ana', sourceStart: 3, sourceEnd: 4, group: 0,
      text: [text('that?', a.bbox.x + 90, a.bbox.y + 10)], bbox: { x: a.bbox.x + 90, y: a.bbox.y + 10, width: 80, height: 30 } },
    { id: 'c1', panelIndex: 1, order: 0, kind: 'caption', style: 'caption', sourceStart: 5, sourceEnd: 6, group: 1,
      shape: { d: `M${b.bbox.x} ${b.bbox.y}h100v20h-100Z`, fill: '#fff3c4', stroke: '#111111', strokeWidth: 1, dash: [3, 2] },
      text: [text('Lyon, 1943.', b.bbox.x, b.bbox.y)], bbox: { x: b.bbox.x, y: b.bbox.y, width: 100, height: 20 } },
    { id: 's1', panelIndex: 1, order: 1, kind: 'sfx', style: 'sfx', sourceStart: 7, sourceEnd: 8, group: 2, rotate: -8, halo: { width: 2, color: '#ffffff' },
      text: [text('KRAK', b.bbox.x + 40, b.bbox.y + 50)], bbox: { x: b.bbox.x + 40, y: b.bbox.y + 50, width: 60, height: 30 } },
  ];
  c.balloons = balloons;
  return doc;
}

const url = (fileId: string) => `https://img.test/${fileId}.png`;

describe('HTML output of comic pages', () => {
  const doc = letter(buildDocument({ markdown: MD, resources }, { page: { sizePreset: '17x24' } }));
  const page = doc.pages.find((p) => p.comic)!;
  const html = renderToHtmlIndexed(doc, { resourceImageUrl: url }).pages[page.index]!.innerHtml;

  it('sets a container with a figure per panel in reading order, each picture named by its text alternative', () => {
    expect(html).toContain('class="pt-comic"');
    const figures = [...html.matchAll(/<figure class="pt-comic-panel"[^>]*data-panel="(\d+)"/g)].map((m) => Number(m[1]));
    expect(figures).toEqual([0, 1, 2]);
    expect(html).toContain('id="pt-a-opening"');
    expect(html).toMatch(/role="img" aria-label="A street at night"/);
    expect(html).toMatch(/role="img" aria-label="Ana at the door"/);
  });

  it('clips the picture to the panel outline and draws the whole picture at its box, flipped when mirrored', () => {
    const p0 = page.comic!.panels[0]!;
    expect(html).toContain(`<clipPath id="pt-p-${page.index}-panel-0">`);
    expect(html).toContain(`<g clip-path="url(#pt-p-${page.index}-panel-0)">`);
    const box = p0.art!.box;
    expect(html).toContain(`x="${Math.round(box.x * 1000) / 1000}" y="${Math.round(box.y * 1000) / 1000}"`);
    const p1 = page.comic!.panels[1]!;
    const b1 = p1.art!.box;
    expect(html).toContain(`transform="translate(${Math.round((2 * b1.x + b1.width) * 1000) / 1000} 0) scale(-1 1)"`);
    // The background under the picture, inside the clip.
    expect(html).toMatch(/<g clip-path="url\(#pt-p-\d+-panel-1\)"><rect[^>]*fill="#ff0000"/);
    // The border: stroked on panels 0 and 1, not on panel 2 (border=none).
    const strokes = [...html.matchAll(/<figure[\s\S]*?<\/figure>/g)].map((m) => /fill="none" stroke=/.test(m[0]));
    expect(strokes).toEqual([true, true, false]);
    // The pop-out after the border, unclipped.
    const fig0 = /<figure[\s\S]*?<\/figure>/.exec(html)![0];
    expect(fig0.indexOf('pop-file')).toBeGreaterThan(fig0.indexOf('fill="none" stroke='));
  });

  it('puts each panel\'s lettering right after it, as paragraphs, the speaker named for assistive technology', () => {
    const order = [...html.matchAll(/data-panel="(\d)"|data-balloon="(\w+)"/g)].map((m) => m[1] ?? m[2]);
    expect(order).toEqual(['0', 'b1', 'b2', '1', 'c1', 's1', '2']);
    expect(html).toMatch(/<p class="pt-comic-balloon" data-balloon="b1"[^>]*><span class="pt-comic-speaker"[^>]*>ana: <\/span>/);
    expect(html).toMatch(/<p class="pt-comic-caption" data-balloon="c1"/);
    // No <div> inside a paragraph.
    for (const p of html.matchAll(/<p [\s\S]*?<\/p>/g)) expect(p[0]).not.toContain('<div');
  });

  it('strokes a group at twice its width, then fills it, before its text', () => {
    const shape = /<svg class="pt-comic-shape"[\s\S]*?<\/svg>/.exec(html)![0];
    const stroke = shape.indexOf('stroke-width="3"');
    const fill = shape.indexOf('fill="#ffffff"/>');
    expect(stroke).toBeGreaterThan(-1);
    expect(fill).toBeGreaterThan(stroke);
    // One outline for the group: the second balloon has none of its own.
    expect([...html.matchAll(/class="pt-comic-shape"/g)].length).toBe(2);
    expect(html.indexOf('pt-comic-shape')).toBeLessThan(html.indexOf('data-balloon="b1"'));
    // A dashed caption: its dashes doubled with the stroke.
    expect(html).toContain('stroke-dasharray="6 4"');
  });

  it('names a sound effect, turns it and draws its halo, over every balloon', () => {
    expect(html).toMatch(/<p class="pt-comic-sfx" data-balloon="s1"[^>]*role="img" aria-label="KRAK"/);
    const sfx = /<p class="pt-comic-sfx"[^>]*>/.exec(html)![0];
    expect(sfx).toContain('transform:rotate(-8deg)');
    expect(sfx).toContain('-webkit-text-stroke:4px #ffffff');
    expect(sfx).toContain('z-index:3');
  });

  it('reports a picture with no URL once and draws a placeholder', () => {
    const warnings: unknown[] = [];
    const out = renderToHtml(doc, { onWarning: (w) => warnings.push(w) });
    expect(out).toContain('fill-opacity="0.15"');
    expect(warnings).toEqual([
      { kind: 'missingImage', fileId: 'pic-file', resourceId: 'pic', pageIndex: page.index },
      { kind: 'missingImage', fileId: 'pop-file', resourceId: 'pop', pageIndex: page.index },
    ]);
  });

  it('leaves pages without comics as they were', () => {
    const plain = buildDocument({ markdown: '# Title\n\nSome text.' }, { page: { sizePreset: '17x24' } });
    expect(renderToHtml(plain)).not.toContain('pt-comic');
  });

  it('reads balloons as text', () => {
    const c = page.comic!;
    expect(c.balloons.map(comicBalloonKind)).toEqual(['speech', 'speech', 'caption', 'sfx']);
    expect(comicBalloonText(c.balloons[0]!)).toBe('Did you hear');
    expect(comicBalloonText({ text: [{ ...text('今日は', 0, 0), lines: [{ text: '今日は', xOffset: 0, baselineY: 0, width: 1 }, { text: 'いい天気', xOffset: 0, baselineY: 0, width: 1 }] }] })).toBe('今日はいい天気');
  });
});

describe('a panel as a picture of its own', () => {
  it('is an SVG whose view box is the panel, the picture cropped by it', () => {
    const doc = buildDocument({ markdown: MD, resources }, {});
    const panel = doc.pages.find((p) => p.comic)!.comic!.panels[0]!;
    const svg = comicPanelSvg(panel, { href: () => '../images/pic.png', clipId: 'c0', label: 'A street', standalone: { width: 600 } });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"')).toBe(true);
    const r = (v: number) => Math.round(v * 1000) / 1000;
    expect(svg).toContain(`viewBox="${r(panel.bbox.x)} ${r(panel.bbox.y)} ${r(panel.bbox.width)} ${r(panel.bbox.height)}"`);
    expect(svg).toContain('width="600"');
    expect(svg).toContain('xlink:href="../images/pic.png"');
    expect(svg).toContain('role="img" aria-label="A street"');
  });
});

describe('comic pages on a screen (comics.viewerLeaf)', () => {
  it('lays the comic out on the print leaf scaled to the width given, centred at the top of the page', () => {
    const page = { width: { value: 1200, unit: 'px' as const }, height: { value: 200000, unit: 'px' as const }, margins: { top: { value: 0, unit: 'px' as const }, bottom: { value: 0, unit: 'px' as const }, left: { value: 0, unit: 'px' as const }, right: { value: 0, unit: 'px' as const } } };
    const leaf = { width: { value: 170, unit: 'mm' as const }, height: { value: 240, unit: 'mm' as const }, margins: { top: { value: 15, unit: 'mm' as const }, bottom: { value: 15, unit: 'mm' as const }, left: { value: 10, unit: 'mm' as const }, right: { value: 10, unit: 'mm' as const } } };
    const doc = buildDocument({ markdown: MD, resources }, { page, comics: { viewerLeaf: { ...leaf, fitWidth: 600 } } });
    const comic = doc.pages.find((p) => p.comic)!.comic!;
    expect(comic.leaf!.width).toBeCloseTo(600, 3);
    expect(comic.leaf!.height).toBeCloseTo(600 * 240 / 170, 3);
    expect(comic.leaf!.x).toBeCloseTo(300, 3);
    expect(comic.leaf!.y).toBe(0);
    // The frame: the leaf's margins at the leaf's scale.
    expect(comic.frame.x).toBeCloseTo(300 + 600 * 10 / 170, 3);
    expect(comic.frame.width).toBeCloseTo(600 * 150 / 170, 3);
    // The same page as on paper, scaled.
    const print = buildDocument({ markdown: MD, resources }, { page: { width: leaf.width, height: leaf.height, margins: leaf.margins } });
    const pc = print.pages.find((p) => p.comic)!.comic!;
    const k = 600 / print.pages[0]!.width;
    comic.panels.forEach((p, i) => {
      const q = pc.panels[i]!;
      expect(p.bbox.width).toBeCloseTo(q.bbox.width * k, 2);
      expect(p.bbox.y - comic.leaf!.y).toBeCloseTo(q.bbox.y * k, 2);
      expect(p.border.width).toBeCloseTo(q.border.width * k, 3);
    });
  });

  it('sets each half of a spread on a leaf of its own', () => {
    const px = (value: number) => ({ value, unit: 'px' as const });
    const page = { width: px(1000), height: px(200000), margins: { top: px(0), bottom: px(0), left: px(0), right: px(0) } };
    const md = ':::page{spread split="* | * | *"}\n::panel{art=pic}\n::panel{art=pic}\n::panel{art=pic}\n:::';
    const doc = buildDocument({ markdown: md, resources }, { page, comics: { viewerLeaf: { width: { value: 170, unit: 'mm' }, height: { value: 240, unit: 'mm' }, margins: { top: { value: 15, unit: 'mm' }, bottom: { value: 15, unit: 'mm' }, left: { value: 15, unit: 'mm' }, right: { value: 15, unit: 'mm' } }, fitWidth: 600 } } });
    const [l, r] = doc.pages.filter((p) => p.comic).map((p) => p.comic!);
    expect(l!.leaf!.width).toBeCloseTo(600, 3);
    expect(r!.leaf!.width).toBeCloseTo(600, 3);
    // Every panel within its leaf (the spine: the left leaf's right edge).
    for (const c of [l!, r!]) for (const p of c.panels) expect(p.bbox.y + p.bbox.height).toBeLessThanOrEqual(c.leaf!.y + c.leaf!.height);
    expect(l!.frame.x + l!.frame.width).toBeCloseTo(l!.leaf!.x + 600, 3);
  });

  it('keeps to a height when given one', () => {
    const doc = buildDocument({ markdown: MD, resources }, { page: { sizePreset: '17x24' }, comics: { viewerLeaf: { width: { value: 100, unit: 'mm' }, height: { value: 200, unit: 'mm' }, fitWidth: 600, fitHeight: 400 } } });
    const leaf = comicViewerLeaf(resolvedComics(doc.config), doc.config, { x: 0, y: 0, width: 800, height: 900 })!;
    expect(leaf.box.height).toBeCloseTo(400, 3);
    expect(leaf.box.width).toBeCloseTo(200, 3);
    expect(leaf.box.x).toBeCloseTo(300, 3);
  });
});

describe('HTML of strips and spreads', () => {
  const pics: Resource[] = [
    { id: 'd1', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, altText: 'A kitchen', bitmap: { fileId: 'd1-file', format: 'png', width: 1000, height: 1000 } },
    { id: 'vista', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, altText: 'The valley', bitmap: { fileId: 'vista-file', format: 'png', width: 4000, height: 1500 } },
  ];
  const STRIP = 'Before the strip.\n\n:::strip{split="* | * | *"}\n::panel{art=d1}\n::panel{art=d1}\n::panel\n:::\n\nAfter the strip.';
  const SPREAD = ':::page{spread split="40 / * [* | * | *]"}\n::panel{art=vista}\n::panel\n::panel{art=d1}\n::panel\n:::\n\nAfter the spread.';

  it('sets a strip in its block, between the paragraphs around it, on the sheet', () => {
    const doc = buildDocument({ markdown: STRIP, resources: pics }, { page: { sizePreset: '17x24' } });
    const page = doc.pages.find((p) => p.columns.some((c) => c.blocks.some((b) => b.comic)))!;
    const block = page.columns.flatMap((c) => c.blocks).find((b) => b.comic)!;
    const html = renderToHtmlIndexed(doc, { resourceImageUrl: url }).pages[page.index]!.innerHtml;
    const at = html.indexOf(`data-block-id="${block.id}"`);
    const comic = html.indexOf('class="pt-comic"');
    expect(comic).toBeGreaterThan(at);
    const blocks = page.columns.flatMap((c) => c.blocks);
    const next = blocks[blocks.indexOf(block) + 1]!;
    const prev = blocks[blocks.indexOf(block) - 1]!;
    expect(html.indexOf(`data-block-id="${next.id}"`)).toBeGreaterThan(comic);
    expect(html.indexOf(`data-block-id="${prev.id}"`)).toBeLessThan(at);
    // The panels on the sheet: the strip's box moved to the block's place.
    const first = /<figure class="pt-comic-panel"[^>]*style="position:absolute;left:([0-9.]+)px;top:([0-9.]+)px/.exec(html)!;
    expect(Number(first[1])).toBeCloseTo(block.bbox.x + block.comic!.panels[0]!.bbox.x, 2);
    expect(Number(first[2])).toBeCloseTo(block.bbox.y + block.comic!.panels[0]!.bbox.y, 2);
    expect(html).toContain('aria-label="A kitchen"');
    // Its clip ids do not clash with a comic page's.
    expect(html).toContain(`clipPath id="pt-p-${page.index}-panel-0"`);
  });

  it('lays a strip of a vertical page over the sheet, outside the turned flow', () => {
    const doc = buildDocument({ markdown: STRIP, resources: pics }, { page: { sizePreset: '17x24' }, layout: { writingMode: 'vertical-rl' } });
    const page = doc.pages.find((p) => p.columns.some((c) => c.blocks.some((b) => b.comic)))!;
    const html = renderToHtmlIndexed(doc, { resourceImageUrl: url }).pages[page.index]!.innerHtml;
    const flowEnd = html.lastIndexOf('</div>', html.indexOf('class="pt-comic"'));
    expect(html.indexOf('class="pt-flow"')).toBeLessThan(flowEnd);
    expect(html.indexOf('class="pt-comic"')).toBeGreaterThan(html.indexOf('class="pt-flow"'));
    // Not inside the flow box: its markup comes after the flow box closes.
    const flowBox = html.slice(html.indexOf('class="pt-flow"'));
    let depth = 0;
    let end = 0;
    for (const m of flowBox.matchAll(/<(\/?)div\b/g)) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) { end = m.index!; break; }
    }
    expect(flowBox.indexOf('class="pt-comic"')).toBeGreaterThan(end);
  });

  it('paints each half of a spread on its page, a panel across the spine read once', () => {
    const doc = buildDocument({ markdown: SPREAD, resources: pics }, { page: { sizePreset: '17x24' } });
    const [left, right] = doc.pages.filter((p) => p.comic) as [VDTPage, VDTPage];
    const out = renderToHtmlIndexed(doc, { resourceImageUrl: url });
    const l = out.pages[left.index]!.innerHtml;
    const r = out.pages[right.index]!.innerHtml;
    expect(l).toContain('data-spread="left"');
    expect(r).toContain('data-spread="right"');
    const figs = (h: string) => [...h.matchAll(/<figure class="pt-comic-panel"[^>]*data-panel="(\d)"([^>]*)>/g)].map((m) => `${m[1]}${m[2].includes('data-continued') ? '*' : ''}`);
    expect(figs(l)).toEqual(['0', '1', '2']);
    // The right page's halves of panels 0 and 2 continue the left page's.
    expect(figs(r)).toEqual(['0*', '2*', '3']);
    expect(l).toContain('aria-label="The valley"');
    expect(r).not.toContain('aria-label="The valley"');
    // Its picture is drawn on both pages all the same.
    expect(r).toContain('vista-file');
  });
});
