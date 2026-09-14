import { describe, it, expect } from 'vitest';
import { PDFDocument, type PDFPage } from 'pdf-lib';
import type { VDTDocument } from 'postext';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import {
  drawVectorDrawing,
  parsePathData,
  svgToVectorDrawing,
  type VectorFontResolver,
  type VectorItem,
  type VectorShape,
  type VectorText,
} from '../pdf-backend/svgVector';
import { FontCache } from '../fontCache';
import {
  drawEmbeddedResource,
  inlineSvgFontsForRaster,
  preloadResourceImages,
  sniffBytes,
} from '../pdf-backend/renderResourceBlock';
import { makeScale, type PageCtx } from '../pdf-backend/primitives';

/** The page's content stream operators, before pdf-lib deflates them. */
function pageContent(page: PDFPage): string {
  const stream = (page as unknown as {
    getContentStream(): { getUnencodedContents(): Uint8Array };
  }).getContentStream();
  return new TextDecoder('latin1').decode(stream.getUnencodedContents());
}

const asPath = (item: VectorItem | undefined): VectorShape => {
  if (item?.kind !== 'path') throw new Error('expected a path item');
  return item;
};
const asText = (item: VectorItem | undefined): VectorText => {
  if (item?.kind !== 'text') throw new Error('expected a text item');
  return item;
};

/** A resolver with a fixed 0.5 em advance per character (no PDF font). */
const monoFonts: VectorFontResolver = (families) =>
  families.includes('Mono') ? { widthOf: (t, size) => t.length * size * 0.5, pdfFont: null } : null;

/** Any real TrueType face will do: the tests only need widths and an embed. */
const ROBOTO = new URL('../../../../apps/web/public/fonts/Fraunces-Regular.ttf', import.meta.url);

async function pageCtx(): Promise<{ pdfDoc: PDFDocument; page: PDFPage; ctx: PageCtx }> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const page = pdfDoc.addPage([612, 792]);
  // 72 dpi: 1 px = 1 pt, so the numbers below read directly as points.
  const ctx: PageCtx = { page, pageHeightPt: 792, scale: makeScale(72), colorSpace: 'rgb' };
  return { pdfDoc, page, ctx };
}

describe('parsePathData', () => {
  it('normalises relative, horizontal / vertical and smooth commands to absolute M/L/C/Z', () => {
    const segs = parsePathData('m 10 10 h 20 v 5 l -5,5 c 1 1 2 2 3 3 s 4 4 5 5 z');
    expect(segs).toEqual([
      ['M', 10, 10],
      ['L', 30, 10],
      ['L', 30, 15],
      ['L', 25, 20],
      ['C', 26, 21, 27, 22, 28, 23],
      // Smooth: first control point mirrors the previous second one (27,22) about (28,23).
      ['C', 29, 24, 32, 27, 33, 28],
      ['Z'],
    ]);
  });

  it('converts quadratics and arcs to cubics and accepts compact arc flags', () => {
    const q = parsePathData('M0 0 Q 3 6 6 0');
    expect(q[1]).toEqual(['C', 2, 4, 4, 4, 6, 0]);
    // A half circle of radius 5 from (0,0) to (10,0): two cubic segments.
    const a = parsePathData('M0 0 a5 5 0 01 10 0');
    expect(a).toHaveLength(3);
    expect(a[1]![0]).toBe('C');
    expect(a[2]![0]).toBe('C');
    const end = a[2] as ['C', number, number, number, number, number, number];
    expect(end[5]).toBeCloseTo(10);
    expect(end[6]).toBeCloseTo(0);
  });

  it('rejects garbage', () => {
    expect(() => parsePathData('10 10 L 20 20')).toThrow();
    expect(() => parsePathData('M 10 10 X 5')).toThrow();
  });
});

describe('svgToVectorDrawing', () => {
  it('flattens shapes, transforms, use and clipPath into root-space paths', () => {
    const svg = `<?xml version="1.0"?>
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
           width="100pt" height="50pt" viewBox="0 0 200 100">
        <defs>
          <clipPath id="c"><rect x="0" y="0" width="100" height="100"/></clipPath>
          <circle id="dot" cx="0" cy="0" r="10" fill="#ff0000"/>
        </defs>
        <g transform="translate(10 20)" clip-path="url(#c)" opacity="0.5">
          <rect x="0" y="0" width="30" height="10" style="fill:rgb(0,0,255);stroke:black;stroke-width:2"/>
          <use xlink:href="#dot" x="50" y="5"/>
          <path d="M0 0 L10 0 L10 10 Z" fill="none"/>
          <text x="0" y="0" display="none">hidden</text>
        </g>
      </svg>`;
    const d = svgToVectorDrawing(svg);
    expect(d).not.toBeNull();
    expect(d!.viewBox).toEqual([0, 0, 200, 100]);
    expect(d!.aspect).toEqual({ xAlign: 0.5, yAlign: 0.5, slice: false });
    // The unpainted path (fill none, no stroke) is dropped.
    expect(d!.shapes).toHaveLength(2);
    const rect = asPath(d!.shapes[0]);
    const dot = asPath(d!.shapes[1]);
    expect(rect.segs[0]).toEqual(['M', 10, 20]);
    expect(rect.fill).toEqual({ hex: '#0000ff', alpha: 0.5 });
    expect(rect.stroke).toMatchObject({ hex: '#000000', alpha: 0.5, width: 2 });
    expect(rect.clips).toHaveLength(1);
    expect(rect.clips[0]!.segs[0]).toEqual(['M', 10, 20]);
    // use: translate(10,20) then x/y offset → circle centred at (60, 25).
    expect(dot.segs[0]).toEqual(['M', 70, 25]);
    expect(dot.fill).toEqual({ hex: '#ff0000', alpha: 0.5 });
  });

  it('honours named colours, currentColor, fill-rule, dashes and visibility', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" color="teal">
        <polygon points="0,0 10,0 5,10" fill="currentColor" fill-rule="evenodd"
                 stroke="rebeccapurple" stroke-dasharray="1 2" stroke-linecap="round"/>
        <line x1="0" y1="0" x2="1" y2="1" stroke="red" visibility="hidden"/>
      </svg>`;
    const d = svgToVectorDrawing(svg)!;
    expect(d.shapes).toHaveLength(1);
    const poly = asPath(d.shapes[0]);
    expect(poly.fill).toEqual({ hex: '#008080', alpha: 1 });
    expect(poly.evenOdd).toBe(true);
    expect(poly.stroke).toMatchObject({ hex: '#663399', dash: [1, 2], cap: 1 });
  });

  it('falls back to null for anything outside the subset', () => {
    const base = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`;
    expect(svgToVectorDrawing(base('<text x="1" y="1">t</text>'))).toBeNull();
    expect(svgToVectorDrawing(base('<image href="a.png" width="1" height="1"/>'))).toBeNull();
    expect(svgToVectorDrawing(base('<defs><linearGradient id="g"/></defs><rect width="1" height="1" fill="url(#g)"/>'))).toBeNull();
    expect(svgToVectorDrawing(base('<style>.a{fill:red}</style><rect class="a" width="1" height="1"/>'))).toBeNull();
    expect(svgToVectorDrawing(base('<rect width="1" height="1" mask="url(#m)"/>'))).toBeNull();
    expect(svgToVectorDrawing(base('<rect width="1" height="1" filter="url(#f)"/>'))).toBeNull();
    expect(svgToVectorDrawing(base('<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'))).toBeNull();
    expect(svgToVectorDrawing('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1">')).toBeNull();
    expect(svgToVectorDrawing('not svg at all')).toBeNull();
  });

  it('lays out text and tspans on a pen, honouring anchors, dx/dy and inherited fonts', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" font-family="Mono" font-size="10">
        <text x="10" y="20" fill="#112233">ab <tspan font-weight="bold">cd</tspan></text>
        <text x="50" y="40" text-anchor="middle">abcd</text>
        <text x="50" y="60" text-anchor="end">ab<tspan dx="2" dy="-1">cd</tspan></text>
        <g transform="translate(5 5)"><text x="0" y="0" style="font-style:italic">e</text></g>
        <text x="0" y="90" fill="none">invisible</text>
      </svg>`;
    const d = svgToVectorDrawing(svg, { fonts: monoFonts });
    expect(d).not.toBeNull();
    const [t1, t2, t3, t4] = d!.shapes.map(asText);
    // "ab " then "cd": the trailing space is kept as a separator, advance 5/char.
    expect(t1!.runs.map((r) => [r.text, r.x, r.y])).toEqual([['ab', 10, 20], [' cd', 20, 20]]);
    expect(t1!.runs[0]!.fill).toEqual({ hex: '#112233', alpha: 1 });
    // middle: width 20 → start at 40.
    expect(t2!.runs[0]).toMatchObject({ text: 'abcd', x: 40, y: 40 });
    // end: chunk width = (10 + 2 + 10) → start at 50 - 22 = 28; dy shifts the tspan.
    expect(t3!.runs.map((r) => [r.text, r.x, r.y])).toEqual([['ab', 28, 60], ['cd', 40, 59]]);
    expect(t4!.runs[0]!.matrix).toEqual([1, 0, 0, 1, 5, 5]);
    expect(d!.shapes).toHaveLength(4);
  });

  it('bails out on text without a resolver, unknown fonts, or glyph-level positioning', () => {
    const base = (body: string, attrs = '') =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" font-family="Mono" ${attrs}>${body}</svg>`;
    expect(svgToVectorDrawing(base('<text x="1" y="1">t</text>'))).toBeNull();
    expect(svgToVectorDrawing(base('<text x="1" y="1" font-family="Nope">t</text>'), { fonts: monoFonts })).toBeNull();
    expect(svgToVectorDrawing(base('<text x="1 2" y="1">t</text>'), { fonts: monoFonts })).toBeNull();
    expect(svgToVectorDrawing(base('<text x="1" y="1" letter-spacing="2">t</text>'), { fonts: monoFonts })).toBeNull();
    expect(svgToVectorDrawing(base('<text x="1" y="1"><textPath href="#p">t</textPath></text>'), { fonts: monoFonts })).toBeNull();
    expect(svgToVectorDrawing(base('<text x="1" y="1" font-size="2em">t</text>'), { fonts: monoFonts })).toBeNull();
    // Generic-only family lists resolve to nothing → raster fallback.
    expect(svgToVectorDrawing(base('<text x="1" y="1" font-family="sans-serif">t</text>'), { fonts: monoFonts })).toBeNull();
  });

  it('skips foreign-namespace and non-rendering elements', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
        xmlns:sodipodi="x" viewBox="0 0 10 10">
        <title>t</title><desc>d</desc><metadata><rdf:RDF xmlns:rdf="r"/></metadata>
        <sodipodi:namedview id="nv"/>
        <g inkscape:label="Layer 1" inkscape:groupmode="layer"><rect width="1" height="1"/></g>
      </svg>`;
    const d = svgToVectorDrawing(svg)!;
    expect(d.shapes).toHaveLength(1);
  });
});

describe('drawVectorDrawing', () => {
  it('maps the viewBox into the target box, y flipped, and paints with path operators', async () => {
    const { page, ctx } = await pageCtx();
    const drawing = svgToVectorDrawing(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
         <rect x="10" y="10" width="20" height="10" fill="#336699" fill-opacity="0.5" fill-rule="evenodd"/>
         <circle cx="50" cy="25" r="5" fill="none" stroke="#000" stroke-width="2"/>
       </svg>`,
    )!;
    // Place at (72, 144) px, 200 × 100 px → uniform scale 2.
    drawVectorDrawing(ctx, drawing, 72, 144, 200, 100);
    const content = pageContent(page);
    // Viewport clip, then the user-space matrix: scale 2, flip y, origin at
    // the box's top-left (72, 792 - 144 = 648).
    expect(content).toContain('72 548 200 100 re');
    expect(content).toContain('2 0 0 -2 72 648 cm');
    // Rect path in SVG units, painted even-odd through an alpha state.
    expect(content).toMatch(/10 10 m\n30 10 l\n30 20 l\n10 20 l\nh\nf\*/);
    expect(content).toMatch(/\/GSa[^\s]* gs/);
    // Stroked circle: line width in user units, cubic segments, stroke op.
    expect(content).toContain('2 w');
    expect(content).toMatch(/55 25 m\n55 [\d.]+ [\d.]+ 30 50 30 c/);
    expect(content).toMatch(/c\nh\nS/);
    // Alpha state registered on the page resources.
    expect(page.node.Resources()?.toString()).toContain('/GSa');
  });
});

describe('drawVectorDrawing (text)', () => {
  it('sets text runs as real text with an embedded font and an upright text matrix', async () => {
    const { pdfDoc, page, ctx } = await pageCtx();
    const fontCache = new FontCache(pdfDoc, async () => new Uint8Array(fs.readFileSync(ROBOTO)));
    await fontCache.preloadFontStrings(['400 16px Roboto Condensed']);
    const font = fontCache.get('400 16px Roboto Condensed')!;
    const resolver: VectorFontResolver = (families) =>
      families.includes('Roboto Condensed') ? { pdfFont: font, widthOf: (t, s) => font.widthOfTextAtSize(t, s) } : null;
    const drawing = svgToVectorDrawing(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50">
         <text x="10" y="30" font-family="Roboto Condensed" font-size="8" fill="#1d1d1b">Salud</text>
       </svg>`,
      { fonts: resolver },
    )!;
    expect(asText(drawing.shapes[0]).runs[0]!.text).toBe('Salud');
    drawVectorDrawing(ctx, drawing, 72, 144, 200, 100);
    const content = pageContent(page);
    // Root matrix flips y; the text matrix flips it back at the pen (10, 30).
    expect(content).toContain('2 0 0 -2 72 648 cm');
    expect(content).toMatch(/BT\n\/[^\s]+ 8 Tf\n1 0 0 -1 10 30 Tm\n<[0-9A-Fa-f]+> Tj\nET/);
    expect(page.node.Resources()?.toString()).toContain('/Font');
  });
});

describe('inlineSvgFontsForRaster', () => {
  it('embeds the provider faces as @font-face data URIs after the root tag', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text font-family="Roboto Condensed">a</text></svg>';
    const out = await inlineSvgFontsForRaster(svg, ['italic 700 16px Roboto Condensed', '400 16px Nope'], async (family) => {
      if (family !== 'Roboto Condensed') throw new Error('unknown');
      return new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00]);
    });
    expect(out).toContain('<style type="text/css"><![CDATA[@font-face{font-family:"Roboto Condensed";font-weight:700;font-style:italic;src:url(data:font/ttf;base64,AAEAAAA=)}]]></style><text');
    expect(out).not.toContain('Nope');
    expect(await inlineSvgFontsForRaster(svg, [], async () => new Uint8Array())).toBe(svg);
  });
});

describe('sniffBytes', () => {
  it('recognises PDF, SVG (with BOM / declaration / comment) and bitmaps', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffBytes(enc('%PDF-1.6\n'))).toBe('pdf');
    expect(sniffBytes(enc('<svg xmlns="x"/>'))).toBe('svg');
    expect(sniffBytes(enc('﻿  <?xml version="1.0"?><svg/>'))).toBe('svg');
    expect(sniffBytes(enc('<!-- c --><svg/>'))).toBe('svg');
    expect(sniffBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe('png');
    expect(sniffBytes(new Uint8Array([0xff, 0xd8, 0xff]))).toBe('jpeg');
    expect(sniffBytes(enc('GIF89a'))).toBe('gif');
    expect(sniffBytes(enc('RIFF....WEBPVP8 '))).toBe('webp');
    expect(sniffBytes(enc('<html></html>'))).toBe('unknown');
    expect(sniffBytes(new Uint8Array())).toBe('unknown');
  });
});

describe('preloadResourceImages', () => {
  function doc(fileId: string, singleInk = false): VDTDocument {
    return {
      config: { page: { dpi: 72 }, diagramStyle: { singleInk, inkColor: { hex: '#295aa3' } } },
      blocks: [{
        bbox: { x: 0, y: 0, width: 100, height: 80 },
        resourceBlock: { kind: 'svg', fileId, bodyRect: { x: 0, y: 0, width: 100, height: 50 } },
      }],
      pages: [],
    } as unknown as VDTDocument;
  }

  it('embeds a PDF print master as a page and draws it as a form XObject', async () => {
    const master = await PDFDocument.create();
    master.addPage([240, 120]).drawRectangle({ x: 0, y: 0, width: 240, height: 120 });
    const masterBytes = await master.save();

    const { pdfDoc, page, ctx } = await pageCtx();
    const images = await preloadResourceImages(pdfDoc, doc('fig'), (id) => (id === 'fig' ? masterBytes : undefined));
    const embedded = images.get('fig');
    expect(embedded?.kind).toBe('page');
    if (embedded?.kind !== 'page') return;
    expect(embedded.page.width).toBe(240);
    expect(embedded.page.height).toBe(120);

    drawEmbeddedResource(ctx, embedded, 72, 144, 200, 100);
    const content = pageContent(page);
    // drawPage: translate to the box's bottom-left, scale to fit, paint the XObject.
    expect(content).toContain('1 0 0 1 72 548 cm');
    expect(content).toMatch(/\/EmbeddedPdfPage[^\s]* Do/);
  });

  it('emits supported SVG as a vector drawing and recolours it in single-ink mode', async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000000"/></svg>',
    );
    const { pdfDoc } = await pageCtx();
    const plain = await preloadResourceImages(pdfDoc, doc('a'), () => svg);
    expect(plain.get('a')).toMatchObject({ kind: 'vector' });
    if (plain.get('a')?.kind === 'vector') {
      expect((plain.get('a') as { drawing: { shapes: { fill: { hex: string } }[] } }).drawing.shapes[0]!.fill.hex).toBe('#000000');
    }
    const inked = await preloadResourceImages(pdfDoc, doc('a', true), () => svg);
    const shape = (inked.get('a') as { drawing: { shapes: { fill: { hex: string } }[] } }).drawing.shapes[0]!;
    expect(shape.fill.hex).toBe('#295aa3');
  });

  it('inlines the text fonts into the raster fallback even when the SVG bails out before its text', async () => {
    // A filter (unsupported) sits before the text, as in cairo-made SVGs.
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><filter id="f"/></defs>'
      + '<g filter="url(#f)"><rect width="1" height="1"/></g>'
      + '<text x="1" y="5" font-family="Roboto Condensed" font-size="4">hi</text></svg>',
    );
    const { pdfDoc } = await pageCtx();
    const requested: string[] = [];
    const provider = async (family: string) => {
      requested.push(family);
      return new Uint8Array(fs.readFileSync(ROBOTO));
    };
    const fontCache = new FontCache(pdfDoc, provider);
    const images = await preloadResourceImages(pdfDoc, doc('t'), () => svg, fontCache, provider);
    // No canvas in node: the raster cannot be produced, but the font was
    // requested for the vector attempt and again for the inline pass.
    expect(images.has('t')).toBe(false);
    expect(requested).toEqual(['Roboto Condensed', 'Roboto Condensed']);
  });

  it('embeds SVG text as vector text when the font cache can provide the family', async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="5" font-family="Roboto Condensed, sans-serif" font-size="4">hi</text></svg>',
    );
    const { pdfDoc } = await pageCtx();
    const requested: string[] = [];
    const fontCache = new FontCache(pdfDoc, async (family) => {
      requested.push(family);
      if (family !== 'Roboto Condensed') throw new Error('unknown family');
      return new Uint8Array(fs.readFileSync(ROBOTO));
    });
    const images = await preloadResourceImages(pdfDoc, doc('t'), () => svg, fontCache);
    expect(images.get('t')).toMatchObject({ kind: 'vector' });
    expect(asText((images.get('t') as { drawing: { shapes: VectorItem[] } }).drawing.shapes[0]).runs[0]!.text).toBe('hi');
    // Only the named family is requested; generic families are never fetched.
    expect(requested).toEqual(['Roboto Condensed']);
  });

  it('leaves unsupported SVG absent outside the browser (no raster fallback available)', async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="5">hi</text></svg>',
    );
    const { pdfDoc } = await pageCtx();
    const images = await preloadResourceImages(pdfDoc, doc('t'), () => svg);
    expect(images.has('t')).toBe(false);
  });
});
