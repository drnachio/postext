// A real two-chapter book laid out in node for the integration tests and
// the EPUBCheck samples: a figure with alternative text, headings at two
// levels, a cross-reference into the other chapter and a page footer.

import fs from 'node:fs';
import { buildBundle } from 'postext';
import type { PostextConfig, Resource, VDTComicBalloon, VDTComicPage, VDTDesignTextBlock, VDTDocument } from 'postext';

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
  {
    id: 'reel', typeId: 'video', kind: 'video', caption: 'The reel, streamed.', altText: 'A reel of the lighthouse',
    createdAt: 0, updatedAt: 0,
    video: { source: 'file', url: 'https://media.example.org/reel/master.m3u8', poster: { fileId: 'f1.png', format: 'png', width: 400, height: 300 } },
  },
];

/** A chapter with four videos (#454): a self-hosted file the book carries,
 *  one that plays from its production address, a YouTube one and an HLS
 *  stream (#476). */
export function videoSampleBook(overrides: PostextConfig = {}): VDTDocument[] {
  const markdown = ['# Videos', '', `The lamp in :ref{id=clip}, the keeper in :ref{id=remote}, a talk in :ref{id=talk} and the reel in :ref{id=reel}. ${para.repeat(2)}`, '', para.repeat(6)].join('\n');
  return buildBundle({ chapters: [{ markdown }], config: { ...config, ...overrides }, resources: videoResources });
}

/** A vertical Japanese book (#428), right-bound: furigana (mono, group),
 *  sesame 傍点, side lines, numbers set upright, a !? pair, an author's
 *  tate-chū-yoko, a warichu note, a book title, the space after ？, and
 *  notes. Measured with the stub (no Japanese face is embedded). */
export const JAPANESE_CHAPTERS = [
  [
    '# 第一章　先生と私',
    '',
    `私はその人を常に{先生|せん|せい}と呼んでいた。:ruby[鎌倉]{rt="かまくら" group}の海岸で、*知り合い*になったのは${'明治の末、十二月の頃である。'.repeat(2)}`,
    '',
    `なぜ？それは:sideline[誰にも分からない]。なに!?と言って、:book[こころ]を第:tcy[100]号の雑誌で読んだのは12月のことだった[^1]。`,
    '',
    `私は:warichu[注記]{open="（" close="）"}先生の家を訪ねた。${'先生は静かに笑っていた。'.repeat(8)}`,
    '',
    '[^1]: 注の本文、2026年。',
  ].join('\n'),
  ['# 第二章　両親と私', '', '家に帰ると、父は病床にあった。'.repeat(12)].join('\n'),
];

export function japaneseSampleBook(): VDTDocument[] {
  return buildBundle({
    chapters: JAPANESE_CHAPTERS.map((markdown) => ({ markdown })),
    config: {
      ...config,
      locale: 'ja',
      layout: { writingMode: 'vertical-rl' },
      page: { ...config.page, binding: 'right' },
    },
  });
}

/** A comic page (#565) between two paragraphs: three panels of the sample
 *  picture (one slanted, one mirrored), lettered as the lettering engine
 *  letters them — a join group of two balloons, a caption and a sound
 *  effect — and the cast's names. `direction: 'rtl'` reads the page right
 *  to left (a manga). */
export function comicSampleBook(direction: 'ltr' | 'rtl' = 'ltr'): VDTDocument[] {
  const chapter = [
    '# A comic',
    '',
    `Before the page. ${para}`,
    '',
    ':::page{split="40 [55~45 | *] / *" #street}',
    '::panel{art=f1 #first}',
    '::panel{art=f1 mirror alt="Ana at the door"}',
    '::panel{art=f1 border=none}',
    ':::',
    '',
    `After the page. ${para}`,
  ].join('\n');
  const docs = buildBundle({
    chapters: [{ markdown: chapter }],
    config: { ...config, comics: { readingDirection: direction, cast: [{ id: 'ana', name: 'Ana' }] } },
    resources,
  });
  for (const doc of docs) {
    for (const page of doc.pages) {
      if (page.comic) page.comic.balloons = sampleBalloons(page.comic);
    }
  }
  return docs;
}

function sampleText(t: string, x: number, y: number): VDTDesignTextBlock {
  return { kind: 'text', bbox: { x, y, width: 60, height: 14 }, fontString: '400 10px "Lora"', color: '#111111', clip: false, lines: [{ text: t, xOffset: 0, baselineY: y + 10, width: 50 }] };
}

function sampleBalloons(comic: VDTComicPage): VDTComicBalloon[] {
  const [a, b] = [comic.panels[0]!.bbox, comic.panels[1]!.bbox];
  return [
    { id: 'b1', panelIndex: 0, order: 0, kind: 'balloon', style: 'speech', speaker: 'ana', sourceStart: 0, sourceEnd: 1, group: 0,
      shape: { d: `M${a.x + 8} ${a.y + 8}h60v20h-60Z M${a.x + 70} ${a.y + 8}h60v20h-60Z`, fill: '#ffffff', stroke: '#111111', strokeWidth: 1 },
      text: [sampleText('Did you hear', a.x + 8, a.y + 10)], bbox: { x: a.x + 8, y: a.y + 8, width: 60, height: 20 } },
    { id: 'b2', panelIndex: 0, order: 1, kind: 'balloon', style: 'speech', speaker: 'ana', sourceStart: 2, sourceEnd: 3, group: 0,
      text: [sampleText('that?', a.x + 70, a.y + 10)], bbox: { x: a.x + 70, y: a.y + 8, width: 60, height: 20 } },
    { id: 'c1', panelIndex: 1, order: 0, kind: 'caption', style: 'caption', sourceStart: 4, sourceEnd: 5, group: 1,
      shape: { d: `M${b.x} ${b.y}h70v16h-70Z`, fill: '#fff3c4', stroke: '#111111', strokeWidth: 1 },
      text: [sampleText('Lyon, 1943.', b.x + 2, b.y + 2)], bbox: { x: b.x, y: b.y, width: 70, height: 16 } },
    { id: 's1', panelIndex: 1, order: 1, kind: 'sfx', style: 'sfx', sourceStart: 6, sourceEnd: 7, group: 2, rotate: -8, halo: { width: 1.5, color: '#ffffff' },
      text: [sampleText('KRAK', b.x + 20, b.y + 40)], bbox: { x: b.x + 20, y: b.y + 40, width: 40, height: 16 } },
  ];
}

/** A strip in the text and a two-page spread (#566, #567): the strip
 *  between two paragraphs, the spread's middle panel across the spine. */
export function stripSpreadSampleBook(): VDTDocument[] {
  const chapter = [
    '# Strips and spreads',
    '',
    `Before the strip. ${para}`,
    '',
    ':::strip{split="* | *" aspect=3}',
    '::panel{art=f1}',
    '::panel{art=f1 alt="The second panel of the strip"}',
    ':::',
    '',
    `After the strip. ${para}`,
    '',
    ':::page{spread split="40 / * [* | * | *]"}',
    '::panel{art=f1}',
    '::panel',
    '::panel{art=f1 alt="Across the spine"}',
    '::panel',
    ':::',
    '',
    'After the spread.',
  ].join('\n');
  const docs = buildBundle({ chapters: [{ markdown: chapter }], config: { ...config, comics: {} }, resources });
  for (const doc of docs) {
    for (const page of doc.pages) {
      const c = page.comic;
      if (!c?.spread) continue;
      // A balloon in panel 2 on each page: read in panel order.
      const p = c.panels.find((q) => q.index === 2);
      if (!p) continue;
      const x = c.spread === 'left' ? p.bbox.x + 4 : p.bbox.x + p.bbox.width - 64;
      c.balloons = [{ id: `s-${c.spread}`, panelIndex: 2, order: c.spread === 'left' ? 0 : 1, kind: 'caption', style: 'caption', sourceStart: 0, sourceEnd: 1, group: c.spread === 'left' ? 0 : 1,
        text: [sampleText(c.spread === 'left' ? 'Meanwhile,' : 'far away.', x, p.bbox.y + 4)], bbox: { x, y: p.bbox.y + 4, width: 60, height: 14 } }];
    }
  }
  return docs;
}
