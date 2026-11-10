import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream, type PDFObject } from 'pdf-lib';
import { applySingleInkToSvg, buildDocument } from 'postext';
import type { ColorValue, PostextConfig, PrintConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { inkStrength } from '../pdf-backend/vector/svgVector.js';

// Spot colours: an ink of its own, written as a Separation colour space.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fogra39 = new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url)));
const pt = (value: number) => ({ value, unit: 'pt' as const });

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const PANTONE = { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } };
const blue: ColorValue = { hex: '#1f3f99', model: 'spot', spot: { ...PANTONE } };
const blueTint: ColorValue = { hex: '#a5b6dd', model: 'spot', spot: { ...PANTONE, tint: 40 } };
const varnish: ColorValue = { hex: '#f4f4ee', model: 'spot', spot: { name: 'Varnish', cmyk: { c: 0, m: 0, y: 10, k: 0 }, overprint: true } };

function band(id: string, edge: 'top-left' | 'bottom-left', color: ColorValue, height = 40) {
  return { kind: 'box' as const, id, placement: { anchor: { to: 'container' as const, edge }, size: { width: pt(120), height: pt(height) } }, style: { backgroundColor: color } };
}

function config(extra: PostextConfig = {}): PostextConfig {
  return {
    page: { width: pt(300), height: pt(300), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
    colorPalette: [{ id: 'brand', name: 'Brand', value: blue }],
    bodyText: { fontFamily: 'Lora', color: { ...blue, paletteId: 'brand' } },
    headings: { fontFamily: 'Lora' },
    header: { elements: [band('tint', 'top-left', blueTint), band('varnish', 'bottom-left', varnish, 10)] },
    footer: { elements: [] },
    ...extra,
  };
}

function streamText(pdf: PDFDocument, obj: PDFObject | undefined): string {
  const s = obj instanceof PDFStream ? obj : obj ? pdf.context.lookup(obj) : undefined;
  return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
}

async function render(print: PrintConfig | undefined, opts: { colorSpace?: 'cmyk'; extra?: PostextConfig; markdown?: string; resources?: Resource[]; bytes?: (id: string) => Uint8Array | undefined } = {}) {
  const doc = buildDocument({ markdown: opts.markdown ?? 'Blue text on the page.', resources: opts.resources ?? [] }, config(opts.extra));
  const bytes = await renderToPdf(doc, {
    fontProvider: async () => new Uint8Array(fontBytes),
    outputProfile: fogra39,
    accessible: false,
    ...(opts.bytes ? { resourceBytes: opts.bytes } : {}),
    ...(print ? { print } : {}),
    ...(opts.colorSpace ? { colorSpace: opts.colorSpace } : {}),
  });
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const content = refs.map((r) => streamText(pdf, r)).join('\n');
  return { pdf, page, content };
}

/** The Separation colour spaces in a resources dictionary, by resource name. */
function separations(pdf: PDFDocument, resources: PDFDict | undefined): Map<string, { ink: string; alternate: string; c1: number[] }> {
  const out = new Map<string, { ink: string; alternate: string; c1: number[] }>();
  const spaces = resources?.lookup(PDFName.of('ColorSpace'));
  if (!(spaces instanceof PDFDict)) return out;
  for (const [name, ref] of spaces.entries()) {
    const arr = pdf.context.lookup(ref);
    if (!(arr instanceof PDFArray) || arr.lookup(0)?.toString() !== '/Separation') continue;
    const fn = arr.lookup(3) as PDFDict;
    const c1 = (fn.lookup(PDFName.of('C1')) as PDFArray).asArray().map((n) => Number(n.toString()));
    out.set(name.asString().slice(1), { ink: (arr.lookup(1) as PDFName).decodeText(), alternate: arr.lookup(2)!.toString(), c1 });
  }
  return out;
}

describe('spot colours in a print render', () => {
  it('paints spot colours on their own plate, at their tint, through a palette link too', async () => {
    const { pdf, page, content } = await render({ standard: 'pdfx4' });
    const seps = separations(pdf, page.node.Resources());
    const inks = [...seps.values()].map((s) => s.ink).sort();
    expect(inks).toEqual(['PANTONE 286 C', 'Varnish']);
    const [pantoneName, pantone] = [...seps].find(([, s]) => s.ink === 'PANTONE 286 C')!;
    expect(pantone.alternate).toBe('/DeviceCMYK');
    expect(pantone.c1).toEqual([1, 0.66, 0, 0.02]);
    // The full ink for the text, a 40 % tint for the band; one object per
    // ink, whatever its tints.
    expect(content).toContain(`/${pantoneName} cs\n1 scn`);
    expect(content).toContain(`/${pantoneName} cs\n0.4 scn`);
    // No stand-in survives: every CMYK operand is on the 1/10 000 grid.
    for (const m of content.matchAll(/((?:[\d.]+ ){4})[kK]\b/g)) {
      for (const n of m[1]!.trim().split(' ')) expect(Math.abs(Number(n) * 1e4 - Math.round(Number(n) * 1e4))).toBeLessThan(1e-6);
    }
  });

  it('overprints an ink that asks to (a varnish) and knocks the others out', async () => {
    const { pdf, page, content } = await render({ standard: 'pdfx4' });
    const seps = separations(pdf, page.node.Resources());
    const varnishName = [...seps].find(([, s]) => s.ink === 'Varnish')![0];
    const states = page.node.Resources()!.lookup(PDFName.of('ExtGState')) as PDFDict;
    const overprinting = new Set<string>();
    for (const [name, ref] of states.entries()) {
      const d = pdf.context.lookup(ref) as PDFDict;
      if (d.lookup(PDFName.of('op'))?.toString() === 'true') overprinting.add(name.asString().slice(1));
    }
    // The last overprint state set before the varnish is painted is on.
    const at = content.indexOf(`/${varnishName} cs`);
    const fillAt = content.indexOf('\nf', at);
    const before = content.slice(0, fillAt);
    const lastGs = [...before.matchAll(/\/(\S+) gs/g)].pop()![1]!;
    expect(overprinting.has(lastGs)).toBe(true);
  });

  it('writes spot colours in PDF/X-1a and in a plain CMYK render', async () => {
    for (const r of [await render({ standard: 'pdfx1a' }), await render(undefined, { colorSpace: 'cmyk' })]) {
      expect([...separations(r.pdf, r.page.node.Resources()).values()].map((s) => s.ink)).toContain('PANTONE 286 C');
    }
  });

  it('paints the screen colour in an RGB render', async () => {
    const { pdf, page, content } = await render(undefined);
    expect(separations(pdf, page.node.Resources()).size).toBe(0);
    expect(content).not.toMatch(/ scn/);
  });

  it('leaves a book without spot colours as it was: no plate added, its colours set as before', async () => {
    const cmykBlue: ColorValue = { hex: '#1f3f99', model: 'cmyk', cmyk: { c: 100, m: 66, y: 0, k: 2 } };
    const plain: PostextConfig = {
      colorPalette: [{ id: 'brand', name: 'Brand', value: cmykBlue }],
      bodyText: { fontFamily: 'Lora', color: { ...cmykBlue, paletteId: 'brand' } },
      header: { elements: [band('band', 'top-left', { hex: '#a5b6dd', model: 'hex' })] },
    };
    const { pdf, page, content } = await render({ standard: 'pdfx4' }, { extra: plain });
    expect(separations(pdf, page.node.Resources()).size).toBe(0);
    expect(content).not.toMatch(/ scn/);
    expect(content).toContain('1 0.66 0 0.02 k');
  });

  it('prints a single-ink diagram in a spot ink on the ink plate', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="5" fill="#000000"/><rect y="5" width="10" height="5" fill="#808080"/></svg>';
    const resources: Resource[] = [{
      id: 'fig', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
      svg: { fileId: 'fig.svg', width: 10, height: 10 },
      placement: { position: 'here' },
    } as Resource];
    const { pdf } = await render({ standard: 'pdfx4' }, {
      markdown: 'A diagram.\n\n::resource{id="fig"}',
      resources,
      bytes: (id) => (id === 'fig.svg' ? new TextEncoder().encode(svg) : undefined),
      extra: { diagramStyle: { singleInk: true, inkColor: { ...blue, paletteId: 'brand' } } },
    });
    let form: { text: string; seps: ReturnType<typeof separations> } | undefined;
    pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
      if (obj instanceof PDFRawStream && obj.dict.lookup(PDFName.of('Subtype'))?.toString() === '/Form') {
        form = { text: streamText(pdf, obj), seps: separations(pdf, obj.dict.lookup(PDFName.of('Resources')) as PDFDict) };
      }
    });
    expect(form).toBeDefined();
    const [name, sep] = [...form!.seps][0]!;
    expect(sep.ink).toBe('PANTONE 286 C');
    // Black → the full ink; mid grey → about half of it.
    expect(form!.text).toContain(`/${name} cs\n1 scn`);
    const half = [...form!.text.matchAll(new RegExp(`/${name} cs\\n([\\d.]+) scn`, 'g'))].map((m) => Number(m[1]));
    expect(half.some((t) => t > 0.4 && t < 0.6)).toBe(true);
  });
});

describe('ink names and the ink table', () => {
  /** The ink names of every Separation in the file, as the bytes of their
   *  PDF name read as UTF-8, and the raw names as written. */
  function inkNames(pdf: PDFDocument): { names: string[]; raw: string[] } {
    const names: string[] = [];
    const raw: string[] = [];
    pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
      if (obj instanceof PDFArray && obj.lookup(0)?.toString() === '/Separation') {
        const n = obj.lookup(1) as PDFName;
        raw.push(n.asString());
        names.push(new TextDecoder().decode(n.asBytes()));
      }
    });
    return { names: names.sort(), raw: raw.sort() };
  }

  it('writes the plate name in UTF-8, so accents, symbols and a # reach the printer as typed', async () => {
    const ink = 'Rojo Médica € #12';
    const { pdf } = await render({ standard: 'pdfx4' }, { extra: { bodyText: { fontFamily: 'Lora', color: { hex: '#c00020', model: 'spot', spot: { name: ink, cmyk: { c: 0, m: 100, y: 80, k: 10 } } } } } });
    const { names, raw } = inkNames(pdf);
    expect(names).toContain(ink);
    expect(raw).toContain('/Rojo#20M#C3#A9dica#20#E2#82#AC#20#2312');
  });

  it('prints two inks that share a screen colour on two plates', async () => {
    const { pdf } = await render({ standard: 'pdfx4' }, {
      extra: { header: { elements: [band('a', 'top-left', blue), band('b', 'bottom-left', { hex: '#1f3f99', model: 'spot', spot: { name: 'Azul corporativo', cmyk: { c: 95, m: 70, y: 0, k: 5 } } })] } },
    });
    expect(inkNames(pdf).names).toEqual(['Azul corporativo', 'PANTONE 286 C']);
  });

  it('renames a plate, merges an alias onto it and sends an ink to process', async () => {
    const { pdf, content } = await render({
      standard: 'pdfx4',
      inks: [
        { name: 'PANTONE 286 C', pdfName: 'Azul Médica' },
        { name: 'Barniz', aliases: ['Varnish'], output: 'process' },
      ],
    });
    expect(inkNames(pdf).names).toEqual(['Azul Médica']);
    // The varnish band is a process colour now: its alternate, 10 % yellow.
    expect(content).toMatch(/\b0 0 0\.1 0 k\b/);
  });

  it('puts an SVG ink named by an alias on the table\'s plate', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><rect width="10" height="10" fill="#e4002b" data-spot="Rojo 185"/></svg>';
    const resources = [{ id: 'fig', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'fig.svg', width: 10, height: 10 }, placement: { position: 'here' } } as Resource];
    const { pdf } = await render({ standard: 'pdfx4', inks: [{ name: 'PANTONE 185 C', aliases: ['Rojo 185'] }] }, {
      markdown: 'A diagram.\n\n::resource{id="fig"}',
      resources,
      bytes: (id) => (id === 'fig.svg' ? new TextEncoder().encode(svg) : undefined),
    });
    expect(inkNames(pdf).names).toContain('PANTONE 185 C');
    expect(inkNames(pdf).names).not.toContain('Rojo 185');
  });
});

describe('spot inks in an SVG', () => {
  // The paints of a diagram drawn in a design program: an ink named by the
  // file, a tint of a palette ink, an ink named by `data-spot`, and plain
  // process colours.
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" width="100" height="40">'
    + '<rect x="0" y="0" width="20" height="40" fill="#e4002b icc-named-color(PANTONE, &quot;PANTONE 185 C&quot;)"/>'
    + '<rect x="20" y="0" width="20" height="40" fill="#a5b6dd"/>'
    + '<rect x="40" y="0" width="20" height="40" fill="#00a3e0" data-spot="PANTONE 299 C" data-spot-tint="60"/>'
    + '<rect x="60" y="0" width="20" height="40" fill="#1f3f99"/>'
    + '<rect x="80" y="0" width="20" height="40" fill="#33aa33"/>'
    + '</svg>';
  const resources = [{
    id: 'fig', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
    svg: { fileId: 'fig.svg', width: 100, height: 40 },
    placement: { position: 'here' },
  } as Resource];

  async function form(print: PrintConfig | undefined) {
    const { pdf } = await render(print, {
      markdown: 'A diagram.\n\n::resource{id="fig"}',
      resources,
      bytes: (id) => (id === 'fig.svg' ? new TextEncoder().encode(svg) : undefined),
    });
    let out: { text: string; seps: ReturnType<typeof separations> } | undefined;
    pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
      if (obj instanceof PDFRawStream && obj.dict.lookup(PDFName.of('Subtype'))?.toString() === '/Form') {
        out = { text: streamText(pdf, obj), seps: separations(pdf, obj.dict.lookup(PDFName.of('Resources')) as PDFDict) };
      }
    });
    return out!;
  }

  it('prints each ink on its own plate, at its tint, and the rest in process', async () => {
    const f = await form({ standard: 'pdfx4' });
    expect(f).toBeDefined();
    const byInk = new Map([...f.seps].map(([name, sep]) => [sep.ink, name]));
    expect([...byInk.keys()].sort()).toEqual(['PANTONE 185 C', 'PANTONE 286 C', 'PANTONE 299 C']);
    const tints = (ink: string) => [...f.text.matchAll(new RegExp(`/${byInk.get(ink)} cs\\n([\\d.]+) scn`, 'g'))].map((m) => Number(m[1]));
    expect(tints('PANTONE 185 C')).toEqual([1]);
    // #a5b6dd is a 40 % tint of the palette's PANTONE 286 C, #1f3f99 the full ink.
    expect(tints('PANTONE 286 C').map((t) => Math.round(t * 100)).sort((a, b) => a - b)).toEqual([40, 100]);
    expect(tints('PANTONE 299 C')).toEqual([0.6]);
    // The green is no ink: it stays a process colour.
    expect(f.text).toMatch(/[\d.]+ [\d.]+ [\d.]+ [\d.]+ k/);
  });

  it('leaves the paints alone in a screen PDF', async () => {
    const f = await form(undefined);
    expect(f.seps.size).toBe(0);
  });
});

describe('inkStrength', () => {
  it('reads how strong a tint of the ink a recoloured colour is', () => {
    const ink = '#1f3f99';
    const recolour = (hex: string) => /fill="([^"]+)"/.exec(applySingleInkToSvg(`<svg><rect fill="${hex}"/></svg>`, ink))![1]!;
    expect(inkStrength(recolour('#000000'), ink)).toBe(1);
    expect(inkStrength(recolour('#ffffff'), ink)).toBe(0);
    expect(inkStrength(recolour('#808080'), ink)).toBeCloseTo(0.5, 1);
    // Off the ink's line: left to process.
    expect(inkStrength('#000000', ink)).toBeUndefined();
    expect(inkStrength('#ff0000', ink)).toBeUndefined();
  });
});
