import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import UPNG from '@pdf-lib/upng';
import { deflateSync } from 'node:zlib';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument, embeddedIccProfile, parseIccProfile } from 'postext';
import type { PostextConfig, PrintConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';

// Pictures read through their own ICC profiles, and greyscale on black.

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

/** A minimal ICC v2 profile: an RGB matrix/TRC one (D50 primaries, as
 *  `rXYZ`/`gXYZ`/`bXYZ`) or a grey one, both with a gamma curve. */
function iccProfile(opts: { space: 'RGB' | 'GRAY'; gamma: number; description: string; primaries?: number[][] }): Uint8Array {
  const tags: [string, Uint8Array][] = [];
  const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  const s15 = (v: number) => be32(Math.round(v * 65536) | 0);
  const xyz = (v: number[]) => new Uint8Array([...ascii('XYZ '), 0, 0, 0, 0, ...s15(v[0]!), ...s15(v[1]!), ...s15(v[2]!)]);
  const curv = new Uint8Array([...ascii('curv'), 0, 0, 0, 0, ...be32(1), (Math.round(opts.gamma * 256) >> 8) & 255, Math.round(opts.gamma * 256) & 255, 0, 0]);
  const desc = new Uint8Array([...ascii('desc'), 0, 0, 0, 0, ...be32(opts.description.length + 1), ...ascii(opts.description), 0, ...new Array(79).fill(0)]);
  tags.push(['desc', desc], ['wtpt', xyz([0.9642, 1, 0.8249])]);
  if (opts.space === 'RGB') {
    const [r, g, b] = opts.primaries!;
    tags.push(['rXYZ', xyz(r!)], ['gXYZ', xyz(g!)], ['bXYZ', xyz(b!)], ['rTRC', curv], ['gTRC', curv], ['bTRC', curv]);
  } else {
    tags.push(['kTRC', curv]);
  }
  const pad = (n: number) => (n + 3) & ~3;
  let at = 128 + 4 + tags.length * 12;
  const table: number[] = [];
  const data: number[] = [];
  for (const [sig, body] of tags) {
    table.push(...ascii(sig), ...be32(at), ...be32(body.length));
    const padded = new Array(pad(body.length)).fill(0);
    padded.splice(0, body.length, ...body);
    data.push(...padded);
    at += pad(body.length);
  }
  const header = new Array(128).fill(0);
  header.splice(0, 4, ...be32(128 + 4 + table.length + data.length));
  header.splice(8, 4, 2, 0x10, 0, 0);
  header.splice(12, 4, ...ascii(opts.space === 'RGB' ? 'mntr' : 'prtr'));
  header.splice(16, 4, ...ascii(opts.space === 'RGB' ? 'RGB ' : 'GRAY'));
  header.splice(20, 4, ...ascii('XYZ '));
  header.splice(36, 4, ...ascii('acsp'));
  return new Uint8Array([...header, ...be32(tags.length), ...table, ...data]);
}

/** Wide-gamut primaries (ProPhoto-like, D50). */
const WIDE = iccProfile({ space: 'RGB', gamma: 1.8, description: 'Wide test RGB', primaries: [[0.7977, 0.2880, 0], [0.1352, 0.7119, 0], [0.0313, 0.0001, 0.8249]] });
/** A grey profile with a heavy gamma: its middle grey is dark. */
const DARK_GRAY = iccProfile({ space: 'GRAY', gamma: 3, description: 'Dark grey' });

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** `png` with an `iCCP` chunk of `icc` after IHDR. */
function withIccp(png: Uint8Array, icc: Uint8Array): Uint8Array {
  const body = new Uint8Array([...'test'].map((c) => c.charCodeAt(0)).concat([0, 0]).concat([...deflateSync(icc)]));
  const typed = new Uint8Array([...'iCCP'].map((c) => c.charCodeAt(0)).concat([...body]));
  const chunk = new Uint8Array(12 + body.length);
  new DataView(chunk.buffer).setUint32(0, body.length);
  chunk.set(typed, 4);
  new DataView(chunk.buffer).setUint32(8 + body.length, crc32(typed));
  const ihdrEnd = 8 + 25;
  return new Uint8Array([...png.subarray(0, ihdrEnd), ...chunk, ...png.subarray(ihdrEnd)]);
}

/** A 2 × 1 PNG: a saturated red and white. */
const RED = new Uint8Array(UPNG.encode([new Uint8Array([200, 30, 30, 255, 255, 255, 255, 255]).buffer], 2, 1, 0));
/** A 3 × 1 greyscale PNG (colour type 0): black, middle grey, white. */
const GRAY = (() => {
  const chunk = (type: string, body: Uint8Array) => {
    const typed = new Uint8Array([...[...type].map((c) => c.charCodeAt(0)), ...body]);
    const out = new Uint8Array(12 + body.length);
    new DataView(out.buffer).setUint32(0, body.length);
    out.set(typed, 4);
    new DataView(out.buffer).setUint32(8 + body.length, crc32(typed));
    return [...out];
  };
  const ihdr = new Uint8Array([0, 0, 0, 3, 0, 0, 0, 1, 8, 0, 0, 0, 0]);
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk('IHDR', ihdr), ...chunk('IDAT', deflateSync(new Uint8Array([0, 0, 128, 255]))), ...chunk('IEND', new Uint8Array())]);
})();

const resources = (format = 'png', width = 2, printColor?: Resource['printColor']): Resource[] => [{
  id: 'pic', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, ...(printColor ? { printColor } : {}),
  bitmap: { fileId: 'pic.png', format, width, height: 1 },
  placement: { position: 'here' },
}];

const config: PostextConfig = {
  page: { width: pt(300), height: pt(300), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
  bodyText: { fontFamily: 'Lora' },
  headings: { fontFamily: 'Lora' },
  header: { elements: [] },
  footer: { elements: [] },
};

/** The picture written for `bytes`: its colour space and decoded samples. */
async function picture(bytes: Uint8Array, print: PrintConfig, extra: Record<string, Uint8Array> = {}, printColor?: Resource['printColor']): Promise<{ space: string; samples: Uint8Array; spaceObj: unknown }> {
  const doc = buildDocument({ markdown: 'A picture.\n\n::resource{id="pic"}', resources: resources('png', GRAY === bytes ? 3 : 2, printColor) }, config);
  const pdfBytes = await renderToPdf(doc, {
    fontProvider: async () => new Uint8Array(fontBytes),
    outputProfile: fogra39,
    accessible: false,
    resourceBytes: (id) => (id === 'pic.png' ? bytes : extra[id]),
    print,
  });
  const pdf = await PDFDocument.load(pdfBytes);
  let found: { space: string; samples: Uint8Array; spaceObj: unknown } | undefined;
  pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (found || !(obj instanceof PDFStream) || obj.dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Image') return;
    if (obj.dict.lookup(PDFName.of('SMask')) === undefined && obj.dict.lookup(PDFName.of('Width'))?.toString() === '1') return;
    const cs = obj.dict.lookup(PDFName.of('ColorSpace'));
    const space = cs instanceof PDFArray ? cs.lookup(0)!.toString() : String(cs);
    const samples = obj instanceof PDFRawStream ? decodePDFRawStream(obj).decode() : new Uint8Array();
    found = { space, samples, spaceObj: cs };
  });
  return found!;
}

describe('a picture\'s own profile', () => {
  it('is read out of a PNG and a JPEG (whose profile may run over several segments)', () => {
    expect(embeddedIccProfile(withIccp(RED, WIDE))).toEqual(WIDE);
    expect(embeddedIccProfile(RED)).toBeUndefined();
    const half = WIDE.length >> 1;
    const seg = (seq: number, data: Uint8Array) => {
      const body = [...'ICC_PROFILE'].map((c) => c.charCodeAt(0)).concat([0, seq, 2], [...data]);
      return [0xff, 0xe2, ((body.length + 2) >> 8) & 255, (body.length + 2) & 255, ...body];
    };
    // Segments out of order: they are put back by their number.
    const jpeg = new Uint8Array([0xff, 0xd8, ...seg(2, WIDE.subarray(half)), ...seg(1, WIDE.subarray(0, half)), 0xff, 0xda, 0, 2]);
    expect(embeddedIccProfile(jpeg)).toEqual(WIDE);
    expect(parseIccProfile(WIDE).matrixTrc).toBeDefined();
  });

  it('separates an RGB picture from the profile it embeds, unless told to ignore it', async () => {
    const plain = await picture(RED, { standard: 'pdfx4' });
    const tagged = await picture(withIccp(RED, WIDE), { standard: 'pdfx4', imageColor: { embeddedProfile: 'use' } });
    const ignored = await picture(withIccp(RED, WIDE), { standard: 'pdfx4', imageColor: { embeddedProfile: 'ignore' } });
    expect(plain.space).toBe('/DeviceCMYK');
    expect(tagged.space).toBe('/DeviceCMYK');
    // The wide-gamut red is a different (redder, more saturated) ink mix.
    expect([...tagged.samples.subarray(0, 4)]).not.toEqual([...plain.samples.subarray(0, 4)]);
    expect([...ignored.samples]).toEqual([...plain.samples]);
  });

  it('follows a picture\'s own settings over the book\'s', async () => {
    const plain = await picture(RED, { standard: 'pdfx4' });
    const ignored = await picture(withIccp(RED, WIDE), { standard: 'pdfx4', imageColor: { embeddedProfile: 'use' } }, {}, { embeddedProfile: 'ignore' });
    expect([...ignored.samples]).toEqual([...plain.samples]);
    const tagged = await picture(withIccp(RED, WIDE), { standard: 'pdfx4', imageColor: { embeddedProfile: 'ignore' } });
    const own = await picture(RED, { standard: 'pdfx4', imageColor: { embeddedProfile: 'ignore' } }, { 'wide.icc': WIDE }, { assignedRgbProfile: { name: 'Wide', fileId: 'wide.icc' } });
    expect([...own.samples]).not.toEqual([...tagged.samples]);
  });

  it('reads every RGB picture through an assigned profile', async () => {
    const tagged = await picture(withIccp(RED, WIDE), { standard: 'pdfx4', imageColor: { embeddedProfile: 'use' } });
    const assigned = await picture(RED, { standard: 'pdfx4', imageColor: { assignedRgbProfile: { name: 'Wide', fileId: 'wide.icc' } } }, { 'wide.icc': WIDE });
    expect([...assigned.samples]).toEqual([...tagged.samples]);
  });

  it('keeps a tagged RGB picture in PDF/X-4 as ICCBased with its profile when pictures are not converted', async () => {
    const kept = await picture(withIccp(RED, WIDE), { standard: 'pdfx4', convertImages: false, imageColor: { embeddedProfile: 'use' } });
    expect(kept.space).toBe('/ICCBased');
    expect([...kept.samples.subarray(0, 3)]).toEqual([200, 30, 30]);
  });
});

describe('greyscale pictures', () => {
  it('print on black alone, white as paper and black as solid', async () => {
    const { space, samples } = await picture(GRAY, { standard: 'pdfx4', imageColor: { grayDotGain: 'profile' } });
    expect(space).toBe('/DeviceGray');
    expect(samples.length).toBe(3);
    expect(samples[0]).toBe(0);
    expect(samples[2]).toBe(255);
  });

  it('compensate a heavier dot gain with less ink in the middle tones', async () => {
    const light = (await picture(GRAY, { standard: 'pdfx4', imageColor: { grayDotGain: 10 } })).samples[1]!;
    const heavy = (await picture(GRAY, { standard: 'pdfx4', imageColor: { grayDotGain: 30 } })).samples[1]!;
    // DeviceGray 255 is paper: less ink is a higher value.
    expect(heavy).toBeGreaterThan(light);
  });

  it('follow their own grey profile', async () => {
    const both = { standard: 'pdfx4' as const, imageColor: { embeddedProfile: 'use' as const, grayDotGain: 'profile' as const } };
    const plain = (await picture(GRAY, both)).samples[1]!;
    const dark = (await picture(withIccp(GRAY, DARK_GRAY), both)).samples[1]!;
    expect(dark).toBeLessThan(plain);
  });

  it('keep the old separation with grayDotGain none', async () => {
    const { space } = await picture(GRAY, { standard: 'pdfx4', imageColor: { grayDotGain: 'none' } });
    expect(space).toBe('/DeviceCMYK');
  });
});

describe('the defaults', () => {
  it('print pictures as before: a profile ignored, greyscale separated, CMYK kept', async () => {
    const plain = await picture(RED, { standard: 'pdfx4' });
    const tagged = await picture(withIccp(RED, WIDE), { standard: 'pdfx4' });
    expect([...tagged.samples]).toEqual([...plain.samples]);
    const gray = await picture(GRAY, { standard: 'pdfx4' });
    const old = await picture(GRAY, { standard: 'pdfx4', imageColor: { embeddedProfile: 'ignore', grayDotGain: 'none', cmykProfile: 'keep' } });
    expect(gray.space).toBe('/DeviceCMYK');
    expect([...gray.samples]).toEqual([...old.samples]);
    const kept = await picture(withIccp(RED, WIDE), { standard: 'pdfx4', convertImages: false });
    expect(kept.space).not.toBe('/ICCBased');
  });
});
