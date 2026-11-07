import { describe, it, expect } from 'vitest';
import type { DisplayItem, DisplayLine, DisplayPage } from '../../paint/displayList/types.js';
import { createDocxPackage } from '../ooxml/package.js';
import { xmlProblems } from '../ooxml/wellFormed.js';
import { WORDML_NAMESPACES } from '../ooxml/constants.js';
import { MetricsCache } from './metrics.js';
import { pageParts } from './page.js';
import { cropFillRect } from './pictures.js';
import type { WriterContext } from './types.js';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

function context(): WriterContext {
  return {
    pkg: createDocxPackage(), dpi: 72, plan: undefined, lang: 'en', metrics: new MetricsCache(undefined), chapters: [{ id: 'a', markdown: '' }],
    docIndex: 0, fragments: [], nextFragment: 0, parts: new Map(), referenced: new Set(), z: 0,
    warn: () => undefined, resourceBytes: () => PNG, rasterizeSvg: undefined, media: new Map(),
  };
}

function text(words: string, x: number, baseline: number): DisplayItem {
  const line: DisplayLine = {
    text: words, x, width: 200, baseline, lineHeight: 14, align: 'left',
    runs: [{ text: words, x, width: words.length * 6, fontString: '10px "Lora"', color: '#000', textStart: 0 }],
    map: [...words].map(() => -1),
  };
  return { kind: 'text', role: 'body', bbox: { x, y: baseline - 11, width: 200, height: 14 }, lines: [line], source: { blockKey: 'b', map: line.map, generated: true } };
}

/** The anchors of a page by the colour or name they carry. */
function anchors(runs: string[]): { xml: string; behind: boolean; z: number }[] {
  return runs.flatMap((r) => [...r.matchAll(/<wp:anchor [^>]*relativeHeight="(\d+)" behindDoc="(\d)"[^]*?<\/wp:anchor>/g)].map((m) => ({ xml: m[0], behind: m[2] === '1', z: Number(m[1]) })));
}

describe('formatted Word paint order (#1444)', () => {
  it('puts every drawing without text behind the text, in paint order, unless it covers inked text', async () => {
    const page: DisplayPage = {
      index: 0, width: 400, height: 600, dpi: 72,
      items: [
        { kind: 'image', rect: { x: 0, y: 0, width: 400, height: 300 }, fileId: 'art', crop: { x: 0.25, y: 0, width: 0.5, height: 1 } },
        // A balloon's fill on the art: behind, over the art.
        { kind: 'rect', rect: { x: 20, y: 20, width: 120, height: 60 }, fill: '#111111' },
        text('Lettering', 30, 50),
        // Brushes the lettering's box (above its x-height band): behind.
        { kind: 'rect', rect: { x: 30, y: 37, width: 40, height: 3 }, fill: '#222222' },
        // Lies on the lettering's ink (a mark struck over it): in front.
        { kind: 'rect', rect: { x: 30, y: 44, width: 40, height: 3 }, fill: '#333333' },
        // A picture away from any text: behind.
        { kind: 'image', rect: { x: 0, y: 400, width: 100, height: 100 }, fileId: 'far' },
      ],
    };
    const { runs } = await pageParts(context(), page);
    const all = anchors(runs);
    const by = (s: string) => all.find((a) => a.xml.includes(s))!;
    const art = all.find((a) => a.xml.includes('ptx picture') && a.xml.includes('<a:blipFill'))!;
    expect(art.behind).toBe(true);
    // Art a shape lies on is a shape filled with the picture, its crop a
    // fill rectangle (LibreOffice paints pictures over shapes behind the
    // text otherwise); the far picture stays a picture.
    expect(art.xml).toContain('<a:fillRect l="-50000" t="0" r="-50000" b="0"/>');
    expect(art.xml).not.toContain('<pic:pic>');
    expect(all.filter((a) => a.xml.includes('<pic:pic>'))).toHaveLength(1);
    expect(all.find((a) => a.xml.includes('<pic:pic>'))!.behind).toBe(true);
    expect(by('111111').behind).toBe(true);
    expect(by('111111').z).toBeGreaterThan(art.z);
    expect(by('txBox="1"').behind).toBe(false);
    expect(by('222222').behind).toBe(true);
    expect(by('333333').behind).toBe(false);
    expect(xmlProblems(`<w:document ${WORDML_NAMESPACES}><w:body><w:p>${runs.join('')}</w:p></w:body></w:document>`)).toEqual([]);
  });

  it('writes a crop as the picture rectangle past the shape', () => {
    expect(cropFillRect(undefined)).toBe('');
    expect(cropFillRect({ x: 0, y: 0, width: 1, height: 1 })).toBe('');
    expect(cropFillRect({ x: 0.1, y: 0.2, width: 0.8, height: 0.4 })).toBe('<a:fillRect l="-12500" t="-50000" r="-12500" b="-100000"/>');
  });
});
