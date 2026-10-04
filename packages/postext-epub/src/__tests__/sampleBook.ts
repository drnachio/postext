// A real two-chapter book laid out in node for the integration tests and
// the EPUBCheck samples: a figure with alternative text, headings at two
// levels, a cross-reference into the other chapter and a page footer.

import fs from 'node:fs';
import { buildBundle } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';

// Text measured with a fixed advance (half an em per character): stable
// line breaks without a font file or a DOM.
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
    return {
      width: [...s].length * size * 0.5,
      actualBoundingBoxAscent: size * 0.7,
      actualBoundingBoxDescent: size * 0.2,
      fontBoundingBoxAscent: size * 0.8,
      fontBoundingBoxDescent: size * 0.2,
    };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

export const LORA = new Uint8Array(fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url)));
// 1×1 PNG.
export const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));

const pt = (value: number) => ({ value, unit: 'pt' as const });

const config: PostextConfig = {
  page: { width: pt(360), height: pt(480), margins: { top: pt(24), bottom: pt(24), left: pt(24), right: pt(24) } },
  locale: 'en-us',
  footer: {
    elements: [{
      kind: 'text', id: 'pn', content: '{pageNumber}', fontSize: pt(8), overflow: 'ellipsis-end',
      placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
    }],
  },
};

const resources: Resource[] = [{
  id: 'f1',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A square.',
  altText: 'A red square on white',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'f1.png', format: 'png', width: 400, height: 300 },
}];

const para = 'Body text that runs on for a while so the page fills and the paragraph wraps over several lines. ';
export const SAMPLE_CHAPTERS = [
  ['---', 'title: Sample book', 'author: Ada Lovelace', '---', '', '# Opening chapter {#opening}', '', `See :ref{id=f1} and the [closing words](#closing). ${para.repeat(3)}`, '', '::resource{id=f1}', '', '## A section', '', para.repeat(12)].join('\n'),
  ['# Second chapter', '', `Back to the [opening](#opening). ${para.repeat(6)}`, '', '## Closing words {#closing}', '', para.repeat(4)].join('\n'),
];

export function sampleBook(): VDTDocument[] {
  return buildBundle({ chapters: SAMPLE_CHAPTERS.map((markdown) => ({ markdown })), config, resources });
}

/** Lay out chapters as a book with the sample page and a config of the
 *  caller's on top. */
export function layOutBook(chapters: string[], overrides: PostextConfig = {}): VDTDocument[] {
  return buildBundle({ chapters: chapters.map((markdown) => ({ markdown })), config: { ...config, ...overrides } });
}
