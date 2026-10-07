import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTComicBalloon, VDTDesignTextBlock, VDTDocument, VDTPage } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { comicBalloonGroups, comicBalloonText, rotationMatrix } from '../pdf-backend/comic';

// Comic pages in the PDF (#564): panels clipped to their outline with the
// whole picture drawn at its box, mirrored art, borders, balloons painted
// group by group, and the tagged structure in reading order.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

// ------------------------------------------------------------ a tiny PNG encoder

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** An RGB PNG painted by `pixel`. */
function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (width * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]));
}

// A wide landscape: sky over grass, a red sun on the left (so a flip shows).
const landscape = png(300, 150, (x, y) => {
  if ((x - 60) ** 2 + (y - 45) ** 2 < 22 ** 2) return [220, 50, 40];
  return y < 95 ? [120 + (y >> 1), 170 + (y >> 2), 235] : [70, 150 - ((y - 95) >> 1), 60];
});
// A tall figure: a dark stripe down the left third.
const portrait = png(120, 200, (x, y) => (x < 40 ? [40, 40, 70] : [235, 215, 160 + (y >> 2)]));

const files: Record<string, Uint8Array> = { 'land.png': landscape, 'tall.png': portrait };

const picture = (id: string, fileId: string, width: number, height: number, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId, format: 'png', width, height },
  ...extra,
});

const resources: Resource[] = [
  picture('land', 'land.png', 300, 150, { altText: 'A meadow under a red sun' }),
  picture('tall', 'tall.png', 120, 200),
];

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(400), height: pt(560), dpi: 72, margins: { top: pt(30), bottom: pt(30), left: pt(30), right: pt(30) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Lora', fontSize: pt(11), lineHeight: pt(16), hyphenation: { enabled: false } },
  headings: { balancing: { enabled: false } },
  comics: { panel: { borderRadius: pt(0) } },
};

const markdown = `Before the comic.

:::page{split="45 [60 | *] / *" gutter=12pt}
::panel{art=land}
::panel{art=tall mirror alt="A figure in the doorway"}
::panel{art=land bg="#ffeecc" style=sketch}
:::

After the comic.
`;

// ------------------------------------------------------------ synthetic lettering

function textBlock(text: string, x: number, baseline: number, color = '#111111', size = 14): VDTDesignTextBlock {
  const width = text.length * 7;
  return {
    kind: 'text',
    bbox: { x, y: baseline - size, width, height: size * 1.3 },
    fontString: `${size}px Lora`,
    color,
    clip: false,
    lines: [{ text, xOffset: 0, baselineY: baseline, width }],
  };
}

/** An ellipse (px), clockwise on the sheet. */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const k = 0.5523;
  return `M${cx + rx} ${cy}C${cx + rx} ${cy + ry * k} ${cx + rx * k} ${cy + ry} ${cx} ${cy + ry}C${cx - rx * k} ${cy + ry} ${cx - rx} ${cy + ry * k} ${cx - rx} ${cy}C${cx - rx} ${cy - ry * k} ${cx - rx * k} ${cy - ry} ${cx} ${cy - ry}C${cx + rx * k} ${cy - ry} ${cx + rx} ${cy - ry * k} ${cx + rx} ${cy}Z`;
}

/** An ellipse (px) with a wedge tail, as one compound path (both
 *  clockwise, so the nonzero fill covers their overlap). */
function ellipseWithTail(cx: number, cy: number, rx: number, ry: number, tip: { x: number; y: number }): string {
  return `${ellipse(cx, cy, rx, ry)}M${cx + 8} ${cy + ry - 4}L${tip.x} ${tip.y}L${cx - 8} ${cy + ry - 4}Z`;
}

function letter(page: VDTPage): VDTComicBalloon[] {
  const [p0, p1, p2] = page.comic!.panels;
  const c0 = { x: p0!.bbox.x + p0!.bbox.width * 0.62, y: p0!.bbox.y + 34 };
  const c1 = { x: p1!.bbox.x + p1!.bbox.width / 2, y: p1!.bbox.y + 40 };
  const c2 = { x: p2!.bbox.x + p2!.bbox.width * 0.7, y: p2!.bbox.y + p2!.bbox.height * 0.55 };
  const speech: VDTComicBalloon = {
    id: 'b1', panelIndex: 0, order: 0, kind: 'balloon', style: 'speech', speaker: 'ana', sourceStart: 0, sourceEnd: 0, group: 0,
    // The body of the joined balloon below it is a subpath of the same
    // outline: one stroke, one fill, so the two merge.
    shape: { d: ellipseWithTail(c0.x, c0.y, 62, 22, { x: c0.x - 75, y: c0.y + 30 }) + ellipse(c0.x - 5, c0.y + 36, 48, 15), fill: '#ffffff', stroke: '#111111', strokeWidth: 1.2 },
    text: [textBlock('DID YOU HEAR?', c0.x - 45, c0.y + 5)],
    bbox: { x: c0.x - 62, y: c0.y - 22, width: 124, height: 44 },
    tailTip: { x: c0.x - 75, y: c0.y + 30 },
  };
  // Joined to the first: its outline is carried by the group's first balloon.
  const joined: VDTComicBalloon = {
    id: 'b2', panelIndex: 0, order: 1, kind: 'balloon', style: 'speech', speaker: 'ana', sourceStart: 0, sourceEnd: 0, group: 0,
    text: [textBlock('SOMETHING!', c0.x - 35, c0.y + 40)],
    bbox: { x: c0.x - 40, y: c0.y + 28, width: 80, height: 20 },
  };
  const whisper: VDTComicBalloon = {
    id: 'b3', panelIndex: 1, order: 2, kind: 'balloon', style: 'whisper', speaker: 'ben', sourceStart: 0, sourceEnd: 0, group: 1,
    shape: { d: ellipseWithTail(c1.x, c1.y, 50, 20, { x: c1.x + 10, y: c1.y + 60 }), fill: '#ffffff', stroke: '#111111', strokeWidth: 1, dash: [3, 2], double: { gap: 2 } },
    text: [textBlock('SHH…', c1.x - 15, c1.y + 5)],
    bbox: { x: c1.x - 50, y: c1.y - 20, width: 100, height: 40 },
  };
  const sfx: VDTComicBalloon = {
    id: 'b4', panelIndex: 2, order: 3, kind: 'sfx', style: 'sfx', sourceStart: 0, sourceEnd: 0, group: 2,
    text: [textBlock('KRAK', c2.x - 28, c2.y + 10, '#d02020', 28)],
    bbox: { x: c2.x - 30, y: c2.y - 20, width: 60, height: 40 },
    rotate: -10,
    halo: { width: 2.5, color: '#ffffff' },
  };
  return [speech, joined, whisper, sfx];
}

// ------------------------------------------------------------ PDF readers

function contentOps(pdf: PDFDocument, pageIndex: number): string {
  const contents = pdf.getPage(pageIndex).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

interface Elem {
  type: string;
  alt?: string;
  actualText?: string;
  bbox?: number[];
  kids: Elem[];
  mcids: number;
}

function readElem(pdf: PDFDocument, ref: PDFRef): Elem {
  const dict = pdf.context.lookup(ref, PDFDict);
  const text = (v: unknown) => (v instanceof PDFHexString || v instanceof PDFString ? v.decodeText() : undefined);
  const elem: Elem = { type: (dict.get(PDFName.of('S')) as PDFName).decodeText(), kids: [], mcids: 0 };
  const alt = text(dict.get(PDFName.of('Alt')));
  if (alt !== undefined) elem.alt = alt;
  const actual = text(dict.get(PDFName.of('ActualText')));
  if (actual !== undefined) elem.actualText = actual;
  const a = dict.get(PDFName.of('A'));
  const attr = a instanceof PDFRef ? pdf.context.lookup(a) : a;
  if (attr instanceof PDFDict) {
    const bbox = attr.get(PDFName.of('BBox'));
    const arr = bbox instanceof PDFRef ? pdf.context.lookup(bbox) : bbox;
    if (arr instanceof PDFArray) elem.bbox = arr.asArray().map((n) => Number(n.toString()));
  }
  const k = dict.get(PDFName.of('K'));
  for (const kid of k instanceof PDFArray ? k.asArray() : k ? [k] : []) {
    if (kid instanceof PDFRef) elem.kids.push(readElem(pdf, kid));
    else if (kid instanceof PDFDict) elem.mcids++;
  }
  return elem;
}

function structRoot(pdf: PDFDocument): Elem {
  const root = pdf.catalog.lookup(PDFName.of('StructTreeRoot'), PDFDict);
  return readElem(pdf, (root.get(PDFName.of('K')) as PDFArray).get(0) as PDFRef);
}

// ------------------------------------------------------------ the document

let doc: VDTDocument;
let comicIndex: number;
let bytes: Uint8Array;
let pdf: PDFDocument;
const missing: string[] = [];

beforeAll(async () => {
  doc = buildDocument(
    { markdown, resources },
    { ...config, comics: { ...config.comics, panelStyles: [{ id: 'sketch', borderStyle: 'rough' }] } },
  );
  comicIndex = doc.pages.findIndex((p) => p.comic);
  const page = doc.pages[comicIndex]!;
  page.comic!.balloons = letter(page);
  bytes = await renderToPdf(doc, {
    fontProvider,
    resourceBytes: (id) => files[id],
    onWarning: (w) => {
      if (w.kind === 'missingImage') missing.push(w.fileId);
    },
  });
  if (process.env.COMIC_PDF_OUT) fs.writeFileSync(process.env.COMIC_PDF_OUT, bytes);
  pdf = await PDFDocument.load(bytes);
}, 60_000);

const n = (v: number) => +v.toFixed(2);

describe('comic pages in the PDF', () => {
  it('lays the comic page out with three panels of art', () => {
    expect(comicIndex).toBeGreaterThan(0);
    const comic = doc.pages[comicIndex]!.comic!;
    expect(comic.panels.map((p) => p.art?.resourceId)).toEqual(['land', 'tall', 'land']);
    expect(comic.panels[1]!.art!.mirrored).toBe(true);
    expect(comic.panels[2]!.border.style).toBe('rough');
    expect(missing).toEqual([]);
  });

  it('clips each picture to its panel and draws it whole at its box', () => {
    const ops = contentOps(pdf, comicIndex);
    const H = doc.pages[comicIndex]!.height;
    for (const panel of doc.pages[comicIndex]!.comic!.panels) {
      const [first] = panel.polygon;
      // The clip path starts at the polygon's first corner and ends W n.
      const clip = new RegExp(`q\\s+${n(first!.x)} ${n(H - first!.y)} m[^q]*?h\\s+W\\s+n`);
      expect(ops).toMatch(clip);
      const box = panel.art!.box;
      // The image's matrix is the uncropped box: larger than the panel on
      // the axis the crop cuts.
      expect(ops).toContain(`${n(box.width)} 0 0 ${n(box.height)} `);
      expect(box.width * box.height).toBeGreaterThan(panel.bbox.width * panel.bbox.height - 1);
    }
  });

  it('flips mirrored art inside its box', () => {
    const ops = contentOps(pdf, comicIndex);
    const box = doc.pages[comicIndex]!.comic!.panels[1]!.art!.box;
    expect(ops).toContain(`-1 0 0 1 ${n(2 * box.x + box.width)} 0 cm`);
  });

  it('strokes the borders, a rough one as a wobbling polyline', () => {
    const ops = contentOps(pdf, comicIndex);
    // Two straight borders (four corners each) and a rough one with many points.
    const strokes = ops.split(/\n/).reduce<string[][]>((acc, line) => {
      if (/ m$/.test(line.trim())) acc.push([]);
      acc[acc.length - 1]?.push(line.trim());
      return acc;
    }, []).filter((path) => path.includes('S'));
    const lengths = strokes.map((p) => p.filter((l) => / l$/.test(l)).length);
    expect(lengths.some((l) => l > 20)).toBe(true);
  });

  it('paints a group by stroking at twice the width, filling, then lettering', () => {
    const ops = contentOps(pdf, comicIndex);
    const speech = doc.pages[comicIndex]!.comic!.balloons[0]!;
    // The outline: round joins, 2 × 1.2 pt wide, then the white fill.
    const strokeAt = ops.indexOf('2.4 w\n1 j');
    expect(strokeAt).toBeGreaterThan(-1);
    const fillAt = ops.indexOf('1 1 1 rg', strokeAt);
    expect(fillAt).toBeGreaterThan(strokeAt);
    const textAt = ops.indexOf('BT', fillAt);
    expect(textAt).toBeGreaterThan(fillAt);
    // Both balloons of the group are lettered before the next group's outline.
    const nextStroke = ops.indexOf('[6 4] 0 d', textAt);
    expect(nextStroke).toBeGreaterThan(ops.indexOf('BT', textAt + 2));
    expect(comicBalloonText(speech)).toBe('DID YOU HEAR?');
  });

  it('draws a dashed whisper over a double outline', () => {
    const ops = contentOps(pdf, comicIndex);
    // Double: 2 × (2·1 + 2) = 8 in ink, 2 × (1 + 2) = 6 in the fill colour,
    // then the dashed 2 pt outline (dashes doubled with the stroke).
    const wide = ops.indexOf('8 w');
    const inner = ops.indexOf('6 w', wide);
    const dashed = ops.indexOf('[6 4] 0 d', inner);
    expect(wide).toBeGreaterThan(-1);
    expect(inner).toBeGreaterThan(wide);
    expect(dashed).toBeGreaterThan(inner);
  });

  it('turns a sound effect about its centre and puts a halo under its letters', () => {
    const ops = contentOps(pdf, comicIndex);
    const sfx = doc.pages[comicIndex]!.comic!.balloons[3]!;
    const m = rotationMatrix(-10, sfx.bbox.x + sfx.bbox.width / 2, sfx.bbox.y + sfx.bbox.height / 2, 1, doc.pages[comicIndex]!.height);
    const turned = ops.split('\n').filter((l) => / cm$/.test(l)).map((l) => l.split(' ').slice(0, 6).map(Number))
      .find((c) => c.every((v, i) => Math.abs(v - m[i]!) < 1e-6));
    expect(turned).toBeDefined();
    expect(m[1]).toBeGreaterThan(0);
    // The halo: hollow glyphs (render mode 1) 5 pt wide, then the red fill.
    const halo = ops.indexOf('1 Tr');
    expect(halo).toBeGreaterThan(-1);
    expect(ops.lastIndexOf('5 w', halo)).toBeGreaterThan(ops.lastIndexOf('cm', halo) - 1);
    expect(ops.slice(halo)).toMatch(/ET[\s\S]*?0\.8156\d* 0\.1254\d* 0\.1254\d* rg[\s\S]*?TJ/);
    // Sound effects come last.
    expect(comicBalloonGroups(doc.pages[comicIndex]!.comic!.balloons).map((g) => g.map((b) => b.id))).toEqual([['b1', 'b2'], ['b3'], ['b4']]);
  });

  it('tags the page as a Div of panel figures, each followed by its lettering', () => {
    const root = structRoot(pdf);
    const divs = root.kids.filter((k) => k.type === 'Div');
    expect(divs).toHaveLength(1);
    const div = divs[0]!;
    expect(div.kids.map((k) => k.type)).toEqual(['Figure', 'P', 'P', 'Figure', 'P', 'Figure', 'P']);
    const [f0, , , f1, , f2, sfx] = div.kids;
    expect(f0!.alt).toBe('A meadow under a red sun');
    expect(f1!.alt).toBe('A figure in the doorway');
    expect(f2!.alt).toBe('A meadow under a red sun');
    // Every figure carries its panel's box and owns the picture painted.
    const page = doc.pages[comicIndex]!;
    const panel = page.comic!.panels[0]!;
    expect(f0!.bbox!.map(n)).toEqual([panel.bbox.x, page.height - panel.bbox.y - panel.bbox.height, panel.bbox.x + panel.bbox.width, page.height - panel.bbox.y].map(n));
    for (const f of [f0, f1, f2]) expect(f!.mcids).toBeGreaterThan(0);
    // The sound effect: a Span with its text as ActualText.
    expect(sfx!.kids[0]!.type).toBe('Span');
    expect(sfx!.kids[0]!.actualText).toBe('KRAK');
    // Reading order around the page: the text before, the Div, the text after.
    const at = root.kids.indexOf(div);
    expect(root.kids[at - 1]!.type).toBe('P');
    expect(root.kids[at + 1]!.type).toBe('P');
  });

  it('leaves no painting outside marked content', () => {
    const ops = contentOps(pdf, comicIndex);
    const painting = /^(?:Tj|TJ|f|f\*|B|B\*|b|b\*|S|s|Do|sh|EI)$/;
    let depth = 0;
    const loose: string[] = [];
    for (const line of ops.split('\n')) {
      const op = line.trim().split(' ').pop() ?? '';
      if (op === 'BDC' || op === 'BMC') depth++;
      else if (op === 'EMC') depth--;
      else if (painting.test(op) && depth === 0) loose.push(line.trim());
    }
    expect(loose).toEqual([]);
  });

  it('embeds the pictures of comic panels at their full size', async () => {
    // Untagged output paints the same page.
    const plain = await PDFDocument.load(await renderToPdf(doc, { fontProvider, resourceBytes: (id) => files[id], accessible: false }));
    expect(plain.catalog.has(PDFName.of('StructTreeRoot'))).toBe(false);
    expect(contentOps(plain, comicIndex)).toContain('Do');
  });
});
