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

/** Amiri (OFL), the subset the PDF backend's Arabic tests embed. */
export const AMIRI = new Uint8Array(fs.readFileSync(new URL('../../../postext-pdf/src/__tests__/fixtures/arabic/amiri-subset.ttf', import.meta.url)));

/** A right-to-left book (#402): Arabic chapters, right-bound, with Latin
 *  and digit runs, an English isolate naming its language, «(١)» notes,
 *  justified text stretched with kashidas, a `:::verse` poem and an
 *  English block. */
export const ARABIC_CHAPTERS = [
  [
    '# الفصل الأول',
    '',
    `قال الراوي إن الملك AAA كان يحكم سنة ١٤٤٥ هـ (2024 م)[^a]. ${'قال الراوي إن الملك شهريار كان يحكم بلاد الهند والصين، وكان له أخ اسمه شاه زمان. '.repeat(4)}`,
    '',
    'وقال الشيخ :ltr[the old man]{lang=en} ثم سكت وكتب جمـيل.',
    '',
    ':::verse{ornament="٭"}',
    'يا حرقة الدهر كفي || إن لم تكفي فعفي',
    'فلا بحظي أعطي || ولا بصنعة كفي',
    ':::',
    '',
    ':::paragraphs{dir=ltr}',
    'An English paragraph with the word كتاب in it.',
    ':::',
    '',
    '[^a]: حاشية NOTE-A.',
  ].join('\n'),
  ['# الفصل الثاني', '', 'قال الراوي إن الملك شهريار كان يحكم بلاد الهند والصين. '.repeat(10)].join('\n'),
];

export function arabicSampleBook(): VDTDocument[] {
  return buildBundle({
    chapters: ARABIC_CHAPTERS.map((markdown) => ({ markdown })),
    config: {
      ...config,
      locale: 'ar',
      bodyText: { fontFamily: 'Amiri', textAlign: 'justify' },
      headings: { fontFamily: 'Amiri' },
      footnotes: { markerTemplate: '({n})', numbering: 'page' },
    },
  });
}

/** A minimal MP4: just its `ftyp` box (`isom`), enough to be typed. */
export const MP4 = Uint8Array.from([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0,
  0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31,
]);

const videoResources: Resource[] = [
  {
    id: 'clip', typeId: 'video', kind: 'video', caption: 'The lamp turning.', altText: 'The lighthouse lamp turning at dusk',
    createdAt: 0, updatedAt: 0,
    video: { source: 'file', fileId: 'clip.mp4', format: 'mp4', poster: { fileId: 'f1.png', format: 'png', width: 400, height: 300 } },
  },
  {
    id: 'remote', typeId: 'video', kind: 'video', caption: 'The keeper speaks.', altText: 'An interview with the keeper',
    createdAt: 0, updatedAt: 0,
    video: { source: 'file', url: 'https://cdn.example.org/keeper.mp4', poster: { fileId: 'f1.png', format: 'png', width: 400, height: 300 } },
  },
  {
    id: 'talk', typeId: 'video', kind: 'video', caption: 'A talk on lamps.', altText: 'A talk on lighthouse lamps',
    createdAt: 0, updatedAt: 0,
    video: { source: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', poster: { fileId: 'f1.png', format: 'png', width: 400, height: 300 } },
  },
];

/** A chapter with three videos (#454): a self-hosted file the book carries,
 *  one that plays from its production address, and a YouTube one. */
export function videoSampleBook(overrides: PostextConfig = {}): VDTDocument[] {
  const markdown = ['# Videos', '', `The lamp in :ref{id=clip}, the keeper in :ref{id=remote} and a talk in :ref{id=talk}. ${para.repeat(2)}`, '', para.repeat(6)].join('\n');
  return buildBundle({ chapters: [{ markdown }], config: { ...config, ...overrides }, resources: videoResources });
}
