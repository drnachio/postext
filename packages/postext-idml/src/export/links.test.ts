// Linked pictures: every file in Links/ ends in the extension of its format
// (#1536), so it opens once the package is unzipped.

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { Resource } from 'postext';
import { build, config } from '../testing/kit.test-helper.js';
import { idmlDocument } from './index.js';
import { linkExtension, withExtension } from './images.js';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
const SVG = new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10"/></svg>');
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Page /MediaBox [0 0 20 10] >> endobj\n%%EOF');

const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('linked picture names', () => {
  it('read the format from the bytes', () => {
    expect(linkExtension(PNG)).toBe('png');
    expect(linkExtension(JPEG)).toBe('jpg');
    expect(linkExtension(SVG)).toBe('svg');
    expect(linkExtension(PDF)).toBe('pdf');
    expect(linkExtension(ascii('GIF89a…'))).toBe('gif');
    expect(linkExtension(ascii('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(linkExtension(Uint8Array.from([0x49, 0x49, 0x2a, 0]))).toBe('tif');
    expect(linkExtension(ascii('8BPS'))).toBe('psd');
    expect(linkExtension(ascii('%!PS-Adobe-3.0 EPSF-3.0'))).toBe('eps');
    expect(linkExtension(ascii('plain words'))).toBeUndefined();
  });

  it('keep a name that already ends in its extension, in any of its spellings', () => {
    expect(withExtension('f-pic', 'png')).toBe('f-pic.png');
    expect(withExtension('harbour.png', 'png')).toBe('harbour.png');
    expect(withExtension('harbour.JPEG', 'jpg')).toBe('harbour.JPEG');
    expect(withExtension('scan.tiff', 'tif')).toBe('scan.tiff');
    expect(withExtension('map.v2', 'svg')).toBe('map.v2.svg');
    expect(withExtension('photo.png', 'jpg')).toBe('photo.png.jpg');
    expect(withExtension('unknown', undefined)).toBe('unknown');
  });

  it('give every file in Links/ the extension of its format, the document linking the same name', () => {
    const resources = [
      { id: 'pic', typeId: 'figure', kind: 'bitmap', bitmap: { fileId: 'f-pic', format: 'png', width: 1, height: 1 }, createdAt: 0, updatedAt: 0 },
      { id: 'photo', typeId: 'figure', kind: 'bitmap', bitmap: { fileId: 'f-photo', format: 'jpeg', width: 1, height: 1 }, createdAt: 0, updatedAt: 0 },
      { id: 'map', typeId: 'figure', kind: 'svg', svg: { fileId: 'f-map', width: 20, height: 10 }, createdAt: 0, updatedAt: 0 },
      { id: 'plan', typeId: 'figure', kind: 'svg', svg: { fileId: 'f-plan', pdfFileId: 'f-plan-master', width: 20, height: 10 }, createdAt: 0, updatedAt: 0 },
    ] as unknown as Resource[];
    const bytes: Record<string, Uint8Array> = { 'f-pic': PNG, 'f-photo': JPEG, 'f-map': SVG, 'f-plan': SVG, 'f-plan-master': PDF };
    const doc = build('# Pictures\n\n::resource{id="pic"}\n\n::resource{id="photo"}\n\n::resource{id="map"}\n\n::resource{id="plan"}\n\nText.', config(), resources);
    const result = idmlDocument({ docs: [doc], resourceBytes: (id) => bytes[id], images: 'link' });
    const paths = result.links.map((l) => l.path).sort();
    expect(paths).toEqual(['Links/f-map.svg', 'Links/f-photo.jpg', 'Links/f-pic.png', 'Links/f-plan-master.pdf']);
    const spreads = Object.entries(unzipSync(result.bytes)).filter(([p]) => p.startsWith('Spreads/')).map(([, b]) => strFromU8(b)).join('');
    const uris = [...spreads.matchAll(/LinkResourceURI="file:([^"]+)"/g)].map((m) => m[1]).sort();
    expect(uris).toEqual(paths);
  });
});
