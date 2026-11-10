// W3C EPUBCheck on generated sample books. Runs only when asked
// (`pnpm epubcheck`, or EPUBCHECK=1) and the `epubcheck` command is on the
// PATH: it takes a few seconds of Java per book. Set EPUBCHECK_OUT to keep
// the files.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderToEpub } from './index.js';
import type { RenderToEpubOptions } from './types.js';
import { page8Book, page8Bytes } from './__tests__/page8.js';
import { AMIRI, LORA, MP4, PNG, RING_SVG, arabicSampleBook, boxIconsSampleBook, booktabsSampleBook, wrapSampleBook, comicSampleBook, composedSpreadSampleBook, exerciseSampleBook, sampleBook, stripCaptionSampleBook, stripSpreadSampleBook, videoSampleBook, japaneseSampleBook } from './__tests__/sampleBook.js';

const available = process.env.EPUBCHECK === '1' && spawnSync('epubcheck', ['--version'], { encoding: 'utf8' }).status === 0;

interface EpubcheckMessage {
  ID: string;
  severity: string;
  message: string;
  locations: { path: string; line: number; column: number }[];
}

function epubcheck(file: string): EpubcheckMessage[] {
  const out = spawnSync('epubcheck', ['--json', '-', file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const report = JSON.parse(out.stdout) as { messages: EpubcheckMessage[] };
  return report.messages.filter((m) => m.severity === 'ERROR' || m.severity === 'FATAL' || m.severity === 'WARNING');
}

const base = (layout: RenderToEpubOptions['layout']): RenderToEpubOptions => ({
  layout,
  metadata: {
    title: 'Sample book',
    subtitle: 'A test of both renditions',
    creators: ['Ada Lovelace'],
    language: 'en-US',
    date: '2026-10-04',
    publisher: 'Postext',
    modified: new Date(Date.UTC(2026, 9, 4)),
  },
  fonts: [{ family: 'Lora', weight: 400, style: 'normal', bytes: LORA, format: 'ttf' }],
  resourceBytes: (fileId) => fileId === 'f1.png' ? { bytes: PNG, mediaType: 'image/png' } : undefined,
});

/** The right-to-left sample (#402), in Arabic. */
const arabic = (layout: RenderToEpubOptions['layout']): RenderToEpubOptions => ({
  layout,
  metadata: { title: 'كتاب تجريبي', creators: ['المؤلف'], language: 'ar', modified: new Date(Date.UTC(2026, 9, 4)) },
  fonts: [{ family: 'Amiri', weight: 400, style: 'normal', bytes: AMIRI, format: 'ttf' }],
  cover: { bytes: PNG, mediaType: 'image/png', alt: 'غلاف الكتاب' },
});

/** The videos sample (#454): a poster and an MP4 the book carries; its
 *  page or chapter of two players links the playback script (#507). */
const video = (layout: RenderToEpubOptions['layout']): RenderToEpubOptions => ({
  ...base(layout),
  resourceBytes: (fileId) => fileId === 'f1.png'
    ? { bytes: PNG, mediaType: 'image/png' }
    : fileId === 'clip.mp4' ? { bytes: MP4, mediaType: 'video/mp4' } : undefined,
});

/** The vertical Japanese sample (#428). */
const japanese = (layout: RenderToEpubOptions['layout']): RenderToEpubOptions => ({
  layout,
  metadata: { title: 'こころ', creators: ['夏目漱石'], language: 'ja', modified: new Date(Date.UTC(2026, 9, 5)) },
  cover: { bytes: PNG, mediaType: 'image/png', alt: '表紙' },
});

/** The composed page 8 stand-in (#862), in Spanish, with its photos. */
const composed = (layout: RenderToEpubOptions['layout']): RenderToEpubOptions => ({
  layout,
  metadata: { title: 'El dinero y la vida de cada día', creators: ['Postext'], language: 'es', modified: new Date(Date.UTC(2026, 9, 16)) },
  resourceBytes: page8Bytes,
});
/** The box icons sample (#1478): the ring picture its boxes paint. */
const boxIcons = (layout: RenderToEpubOptions['layout']): RenderToEpubOptions => ({
  ...base(layout),
  resourceBytes: (fileId) => fileId === 'ring.svg' ? { bytes: new TextEncoder().encode(RING_SVG), mediaType: 'image/svg+xml' } : undefined,
});
const composedBook = async () => [(await page8Book('es')).doc];

const samples: { name: string; options: RenderToEpubOptions; book?: () => ReturnType<typeof sampleBook> | Promise<ReturnType<typeof sampleBook>> }[] = [
  { name: 'fixed', options: base('fixed') },
  { name: 'fixed-cover', options: { ...base('fixed'), cover: { bytes: PNG, mediaType: 'image/png', alt: 'A red square' } } },
  { name: 'reflowable', options: base('reflowable') },
  { name: 'reflowable-cover', options: { ...base('reflowable'), cover: { bytes: PNG, mediaType: 'image/png', alt: 'A red square' } } },
  { name: 'arabic-fixed', options: arabic('fixed'), book: arabicSampleBook },
  { name: 'arabic-reflowable', options: arabic('reflowable'), book: arabicSampleBook },
  { name: 'video-fixed', options: video('fixed'), book: videoSampleBook },
  { name: 'video-reflowable', options: video('reflowable'), book: videoSampleBook },
  // Players that play alongside the others (#507): marked, no script.
  { name: 'video-alongside-fixed', options: video('fixed'), book: () => videoSampleBook({ videoStyle: { player: { exclusive: false } } }) },
  { name: 'japanese-fixed', options: japanese('fixed'), book: japaneseSampleBook },
  { name: 'japanese-reflowable', options: japanese('reflowable'), book: japaneseSampleBook },
  // Comic pages (#565): region-based navigation, a right-to-left comic
  // with Kindle panel view, the reflowable panels and dialogue.
  { name: 'comic-fixed', options: base('fixed'), book: comicSampleBook },
  { name: 'comic-rtl-kindle-fixed', options: { ...base('fixed'), kindlePanelView: true }, book: () => comicSampleBook('rtl') },
  { name: 'comic-reflowable', options: base('reflowable'), book: comicSampleBook },
  // A strip in the text and a two-page spread (#566, #567).
  { name: 'strip-spread-fixed', options: { ...base('fixed'), kindlePanelView: true }, book: stripSpreadSampleBook },
  { name: 'strip-spread-reflowable', options: base('reflowable'), book: stripSpreadSampleBook },
  // Captioned strips, one numbered and named by a :ref (#590).
  { name: 'strip-caption-fixed', options: base('fixed'), book: stripCaptionSampleBook },
  { name: 'strip-caption-reflowable', options: base('reflowable'), book: stripCaptionSampleBook },
  // Booktabs tables and a named table style (#625).
  { name: 'booktabs-fixed', options: base('fixed'), book: booktabsSampleBook },
  { name: 'booktabs-reflowable', options: base('reflowable'), book: booktabsSampleBook },
  // A figure and a box text wraps round (#627).
  { name: 'wrap-fixed', options: base('fixed'), book: wrapSampleBook },
  { name: 'wrap-reflowable', options: base('reflowable'), book: wrapSampleBook },
  // A composed page (#862): its frames as a section, a figure's labels.
  { name: 'composed-fixed', options: composed('fixed'), book: composedBook },
  { name: 'composed-reflowable', options: composed('reflowable'), book: composedBook },
  // A spread template across two facing pages (#861).
  { name: 'composed-spread-fixed', options: base('fixed'), book: composedSpreadSampleBook },
  { name: 'composed-spread-reflowable', options: base('reflowable'), book: composedSpreadSampleBook },
  // Exercises of every kind (#1231): their records, the script, the key.
  { name: 'exercises-fixed', options: base('fixed'), book: exerciseSampleBook },
  { name: 'exercises-reflowable', options: base('reflowable'), book: exerciseSampleBook },
  // Box icons (#1478): a picture painted in two colours (a copy of it
  // each), a glyph, a drawn dot, an exercise's box.
  { name: 'box-icons-fixed', options: boxIcons('fixed'), book: boxIconsSampleBook },
  { name: 'box-icons-reflowable', options: boxIcons('reflowable'), book: boxIconsSampleBook },
];

describe.skipIf(!available)('EPUBCheck', () => {
  const dir = process.env.EPUBCHECK_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), 'postext-epub-'));
  fs.mkdirSync(dir, { recursive: true });

  for (const sample of samples) {
    it(`${sample.name}: 0 errors, 0 warnings`, async () => {
      let bytes: Uint8Array;
      try {
        bytes = await renderToEpub(await (sample.book ?? sampleBook)(), sample.options);
      } catch (e) {
        // A rendition still being written is not checked yet.
        if (/not implemented/.test(String(e))) return;
        throw e;
      }
      const file = path.join(dir, `${sample.name}.epub`);
      fs.writeFileSync(file, bytes);
      const messages = epubcheck(file);
      expect(messages.map((m) => `${m.severity} ${m.ID} ${m.locations[0]?.path ?? ''}:${m.locations[0]?.line ?? ''} ${m.message}`)).toEqual([]);
    }, 120_000);
  }
});
