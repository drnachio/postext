import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { PDFName, PDFOperator } from 'pdf-lib';
import type { ColorValue, Resource } from 'postext';
import { buildDocument } from 'postext';
import { inkLayerReplay } from '../print/inkLayers.js';
import { band, inkConfig, pt, renderInk, separationOf } from './inkFixture.js';

// #1579 / #1580: an opaque white goes down first on press and a varnish
// last, so nothing painted after them in the PDF may cut their plates: a
// picture over a white box keeps the white under its whole box, and a box
// laid over a varnish keeps the varnish over it.

const white: ColorValue = { hex: '#fdfdfd', model: 'spot', spot: { name: 'Opaque white', cmyk: { c: 0, m: 0, y: 0, k: 0 }, finish: { kind: 'white' } } };
const varnish: ColorValue = { hex: '#f4f4ee', model: 'spot', spot: { name: 'Varnish', cmyk: { c: 0, m: 0, y: 10, k: 0 }, finish: { kind: 'varnish', sheen: 'gloss' } } };
const red: ColorValue = { hex: '#c8102e', model: 'cmyk', cmyk: { c: 0, m: 100, y: 80, k: 5 } } as ColorValue;

/** A small opaque RGB PNG in one colour. */
function png(w: number, h: number, rgb: [number, number, number]): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rows.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]));
}

const PHOTO = png(8, 8, [180, 120, 60]);
const resources: Resource[] = [{
  id: 'photo', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'photo.png', format: 'png', width: 8, height: 8 },
}];

/** A white box under a picture of the same size; a varnish box under a
 *  red one of the same size. */
function layered(whiteOverprint?: boolean) {
  const w: ColorValue = whiteOverprint === undefined ? white : { ...white, spot: { ...white.spot!, overprint: whiteOverprint } };
  const config = inkConfig([], {
    header: {
      elements: [
        band('under', 'top-left', w, 60),
        { kind: 'image', id: 'pic', resourceId: 'photo', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(120), height: pt(60) } } },
        band('gloss', 'top-right', varnish, 60),
        band('over', 'top-right', red, 60),
      ],
    } as never,
  });
  return buildDocument({ markdown: 'Some text on the page.', resources }, config);
}

const render = (doc: ReturnType<typeof layered>) => renderInk(doc, { standard: 'pdfx4' }, { resourceBytes: (id: string) => (id === 'photo.png' ? PHOTO : undefined) } as never);

/** The fills painted in `space` after the last `Do` / knocking-out paint:
 *  the second drawing of the white and varnish, overprinting. */
function laterFills(content: string, space: string): number {
  const replay = content.lastIndexOf('/Artifact BMC');
  if (replay < 0) return 0;
  return content.slice(replay).split(`/${space} cs`).length - 1;
}

describe('white and varnish as the press lays them', () => {
  it('draws the white again after the picture over it, and the varnish after the box over it', async () => {
    const { pdf, content } = await render(layered());
    const w = separationOf(pdf, 'Opaque white')!;
    const v = separationOf(pdf, 'Varnish')!;
    expect(content).toMatch(/\/\S+ Do/);
    expect(laterFills(content, w)).toBe(1);
    expect(laterFills(content, v)).toBe(1);
    // No picture, no other colour is painted a second time.
    const replay = content.slice(content.lastIndexOf('/Artifact BMC'));
    expect(replay).not.toMatch(/ Do\b/);
  });

  it('leaves a stream without a white or a varnish as it was', async () => {
    const plain = await renderInk(buildDocument({ markdown: 'Text.', resources: [] }, inkConfig([red])), { standard: 'pdfx4' });
    expect(plain.content).not.toContain('/Artifact BMC');
  });

  it.skipIf(spawnSync('gs', ['--version']).status !== 0)('keeps the White plate under the whole picture and the Varnish plate over the box (tiffsep)', async () => {
    for (const over of [undefined, false] as const) {
      const { bytes } = await render(layered(over));
      if (process.env.INK_LAYERS_DUMP) fs.writeFileSync(`${process.env.INK_LAYERS_DUMP}-${over ?? 'default'}.pdf`, bytes);
      const plates = tiffsep(bytes);
      // Under every pixel of the picture (the left half's yellow) lies
      // white; over every pixel of the red box (the right half's magenta)
      // lies varnish.
      expect(covered(plates.get('Yellow')!, plates.get('Opaque white')!, 'left')).toBeGreaterThan(0.99);
      expect(covered(plates.get('Magenta')!, plates.get('Varnish')!, 'right')).toBeGreaterThan(0.99);
    }
  });

  it.skipIf(spawnSync('gs', ['--version']).status !== 0)('still knocks the colour out under a white set overprint: false over it (tiffsep)', async () => {
    const off: ColorValue = { ...white, spot: { ...white.spot!, overprint: false } };
    const config = inkConfig([], { header: { elements: [band('red', 'top-left', red, 60), band('ink', 'top-left', off, 60)] } as never });
    const { bytes } = await renderInk(buildDocument({ markdown: 'Text.', resources: [] }, config), { standard: 'pdfx4' });
    const plates = tiffsep(bytes);
    const magenta = plates.get('Magenta')!;
    const whitePlate = plates.get('Opaque white')!;
    const cyan = plates.get('Cyan')!;
    const half = Math.floor(magenta.w / 2);
    let whiteInk = 0;
    let magentaInk = 0;
    for (let y = 0; y < magenta.h; y++) for (let x = 0; x < half; x++) {
      // Inside the white, past the crop marks (on every plate, cyan too).
      if (whitePlate.data[y * magenta.w + x]! >= 128 || cyan.data[y * magenta.w + x]! < 128) continue;
      whiteInk++;
      if (magenta.data[y * magenta.w + x]! < 128) magentaInk++;
    }
    expect(whiteInk).toBeGreaterThan(100);
    expect(magentaInk).toBe(0);
  });
});

describe('inkLayerReplay', () => {
  const op = (name: string, ...args: string[]) => PDFOperator.of(name as never, args);
  const names = (ops: PDFOperator[]) => ops.map((o) => o.toString().trim());

  it('keeps white paints, ends other paths unpainted, hides other text and drops pictures', () => {
    const layer = (args: unknown[]) => (String(args[3]) === '0.5' ? [op('cs', '/W'), op('scn', '1')] : undefined);
    const out = inkLayerReplay([
      op('BDC', '/P', '<</MCID 0>>'), op('k', '0', '0', '0', '0.5'), op('re', '0', '0', '1', '1'), op('B'), op('EMC'),
      op('k', '0', '1', '0', '0'), op('re', '0', '0', '1', '1'), op('f'), op('Do', '/Im0'),
      op('BT'), op('Tj', '(x)'), op('ET'),
    ], layer, PDFName.of('GSo'));
    expect(names(out)).toEqual([
      '/Artifact BMC',
      '/W cs', '1 scn', '0 0 1 1 re', '/GSo gs', 'f',
      '0 1 0 0 k', '0 0 1 1 re', 'n',
      'BT', '3 Tr', '(x) Tj', '0 Tr', 'ET',
      'EMC',
    ]);
  });
});

/** The separations of a one-page PDF, rasterised by Ghostscript at 18 dpi:
 *  each plate's bytes (0 = full ink in tiffsep's inverted greys) and
 *  size. */
function tiffsep(bytes: Uint8Array): Map<string, Plate> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inklayers-'));
  try {
    fs.writeFileSync(path.join(dir, 'in.pdf'), bytes);
    const run = spawnSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=tiffsep', '-r36', '-dOverprint=/simulate', '-sCompression=none', `-sOutputFile=${path.join(dir, 'out.tif')}`, path.join(dir, 'in.pdf')]);
    if (run.status !== 0) throw new Error(String(run.stderr));
    const out = new Map<string, Plate>();
    for (const f of fs.readdirSync(dir)) {
      const m = /^out\((.+)\)\.tif$/.exec(f);
      if (!m) continue;
      out.set(m[1]!, readTiffGrey(fs.readFileSync(path.join(dir, f))));
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** An uncompressed 8-bit grey TIFF (what tiffsep writes for a plate). */
function readTiffGrey(buf: Buffer): { w: number; h: number; data: Buffer } {
  const le = buf.toString('latin1', 0, 2) === 'II';
  const u16 = (o: number) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o: number) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifd = u32(4);
  const tags = new Map<number, number[]>();
  for (let i = 0; i < u16(ifd); i++) {
    const e = ifd + 2 + i * 12;
    const type = u16(e + 2);
    const count = u32(e + 4);
    const size = type === 3 ? 2 : 4;
    const at = count * size <= 4 ? e + 8 : u32(e + 8);
    tags.set(u16(e), Array.from({ length: count }, (_, k) => (type === 3 ? u16(at + k * 2) : u32(at + k * 4))));
  }
  const w = tags.get(256)![0]!;
  const h = tags.get(257)![0]!;
  if ((tags.get(259)?.[0] ?? 1) !== 1) throw new Error('compressed TIFF');
  const offsets = tags.get(273)!;
  const counts = tags.get(279)!;
  const data = Buffer.concat(offsets.map((o, i) => buf.subarray(o, o + counts[i]!)));
  return { w, h, data };
}

type Plate = { w: number; h: number; data: Buffer };

/** The share of `paint`'s inked pixels on one half of the page that
 *  `layer` covers too (tiffsep: 0 is full ink). */
function covered(paint: Plate, layer: Plate, side: 'left' | 'right'): number {
  let inked = 0;
  let under = 0;
  const half = Math.floor(paint.w / 2);
  for (let y = 0; y < paint.h; y++) for (let x = side === 'left' ? 0 : half; x < (side === 'left' ? half : paint.w); x++) {
    const i = y * paint.w + x;
    if (paint.data[i]! >= 128) continue;
    inked++;
    if (layer.data[i]! < 128) under++;
  }
  if (inked < 20) throw new Error('nothing painted on that side');
  return under / inked;
}
