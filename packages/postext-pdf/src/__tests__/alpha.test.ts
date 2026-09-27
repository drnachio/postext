import { describe, it, expect } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { colorAlpha, hexToRgb, parseCssColor } from '../colors';
import { parseFontString } from '../fontString';

// EF-30: colour values with an alpha channel (`#rgba`, `#rrggbbaa`,
// `rgb()` / `rgba()`, `transparent`) paint translucent in the PDF, as they
// do on canvas and in HTML — through an ExtGState constant alpha — instead
// of opaque (or black, for the functional forms).

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    return { width: (face.layout(s).advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

describe('parseCssColor', () => {
  it('reads hex with and without alpha', () => {
    expect(parseCssColor('#f00')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseCssColor('#f008')).toEqual({ r: 1, g: 0, b: 0, a: 0x88 / 255 });
    expect(parseCssColor('#00ff00')).toEqual({ r: 0, g: 1, b: 0, a: 1 });
    expect(parseCssColor('#0000ff80')).toEqual({ r: 0, g: 0, b: 1, a: 0x80 / 255 });
  });

  it('reads rgb() / rgba() in both the comma and the space syntax', () => {
    expect(parseCssColor('rgb(255, 0, 0)')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseCssColor('rgba(0, 0, 255, 0.25)')).toEqual({ r: 0, g: 0, b: 1, a: 0.25 });
    expect(parseCssColor('rgb(0 255 0 / 50%)')).toEqual({ r: 0, g: 1, b: 0, a: 0.5 });
    expect(parseCssColor('RGBA(100%, 0%, 0%, 1)')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it('reads transparent as fully clear, and rejects anything else', () => {
    expect(parseCssColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseCssColor('red')).toBeNull();
    expect(parseCssColor('#12')).toBeNull();
    expect(parseCssColor('rgb(1, 2)')).toBeNull();
  });

  it('keeps hexToRgb and exposes the alpha separately', () => {
    expect(hexToRgb('rgba(255, 0, 0, 0.5)')).toEqual({ r: 1, g: 0, b: 0 });
    expect(hexToRgb('none')).toEqual({ r: 0, g: 0, b: 0 });
    expect(colorAlpha('#000000')).toBe(1);
    expect(colorAlpha('#00000040')).toBeCloseTo(0x40 / 255, 6);
    expect(colorAlpha('garbage')).toBe(1);
  });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

async function render(config: PostextConfig, markdown: string, resources: Resource[] = []): Promise<PDFDocument> {
  const doc = buildDocument({ markdown, resources }, {
    page: { width: pt(300), height: pt(300), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
    bodyText: { fontFamily: 'Lora' },
    headings: { fontFamily: 'Lora', levels: [{ level: 1, breakBefore: { enabled: false } }] },
    ...config,
  });
  const bytes = await renderToPdf(doc, { fontProvider: async () => new Uint8Array(fontBytes), accessible: false });
  return PDFDocument.load(bytes);
}

function pageContent(pdf: PDFDocument, index = 0): string {
  const contents = pdf.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

/** Fill (`ca`) and stroke (`CA`) alpha of each ExtGState on the page, by name. */
function alphaStates(pdf: PDFDocument, index = 0): Map<string, { ca?: number; CA?: number }> {
  const out = new Map<string, { ca?: number; CA?: number }>();
  const resources = pdf.getPage(index).node.Resources();
  const states = resources?.lookup(PDFName.of('ExtGState'));
  if (!(states instanceof PDFDict)) return out;
  for (const [name, ref] of states.entries()) {
    const dict = pdf.context.lookup(ref);
    if (!(dict instanceof PDFDict)) continue;
    const num = (key: string) => {
      const v = dict.lookup(PDFName.of(key));
      return v instanceof PDFNumber ? v.asNumber() : undefined;
    };
    out.set(name.asString().slice(1), { ca: num('ca'), CA: num('CA') });
  }
  return out;
}

/** The ExtGState names set right before `marker` appears in `content`. */
function stateBefore(content: string, marker: RegExp): string | undefined {
  const at = content.search(marker);
  if (at < 0) return undefined;
  const before = content.slice(0, at);
  const m = [...before.matchAll(/\/(\S+) gs/g)].pop();
  return m?.[1];
}

describe('renderToPdf — translucent colours (EF-30)', () => {
  it('paints body text in an #rrggbbaa colour through a constant fill alpha', async () => {
    const pdf = await render({ bodyText: { fontFamily: 'Lora', color: hex('#ff000080') } }, 'Translucent text.');
    const content = pageContent(pdf);
    const name = stateBefore(content, /1 0 0 rg\s*\n?\/Lora/);
    expect(name).toBeDefined();
    expect(alphaStates(pdf).get(name!)?.ca).toBeCloseTo(0x80 / 255, 3);
  });

  it('keeps opaque colours free of any graphics state', async () => {
    const pdf = await render({ bodyText: { fontFamily: 'Lora', color: hex('#ff0000') } }, 'Opaque text.');
    expect(pageContent(pdf)).not.toMatch(/ gs\b/);
  });

  it('fills design boxes and table cells with an rgba() colour, translucent and in its hue', async () => {
    const resources: Resource[] = [{
      id: 't',
      typeId: 'table',
      kind: 'table',
      createdAt: 0,
      updatedAt: 0,
      table: { model: { rows: [[{ content: 'A', background: hex('rgba(0, 0, 255, 0.25)') }]] } },
      placement: { position: 'here' },
    }];
    const pdf = await render({
      header: {
        elements: [{
          kind: 'box',
          id: 'band',
          placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(100), height: pt(10) } },
          style: { backgroundColor: hex('#00ff0033') },
        }],
      },
    }, 'Body.\n\n::resource{id="t"}', resources);
    const content = pageContent(pdf);
    const states = [...alphaStates(pdf).values()].map((s) => s.ca).filter((v): v is number => v !== undefined);
    expect(states.some((a) => Math.abs(a - 0.25) < 1e-3)).toBe(true);
    expect(states.some((a) => Math.abs(a - 0x33 / 255) < 1e-3)).toBe(true);
    // The rgba() fill keeps its blue (it used to fall back to black).
    expect(content).toMatch(/0 0 1 rg/);
  });

  it('draws nothing visible for transparent', async () => {
    const pdf = await render({
      bodyText: { fontFamily: 'Lora', color: hex('#333333') },
      header: {
        elements: [{
          kind: 'box',
          id: 'clear',
          placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(100), height: pt(10) } },
          style: { backgroundColor: hex('transparent') },
        }],
      },
    }, 'Body.');
    // `transparent` used to parse as black: the box is filled at zero alpha
    // now, never opaque.
    const content = pageContent(pdf);
    expect(content).toMatch(/0 0 0 rg/);
    const name = stateBefore(content, /0 0 0 rg/);
    expect(name).toBeDefined();
    expect(alphaStates(pdf).get(name!)?.ca).toBe(0);
  });
});
