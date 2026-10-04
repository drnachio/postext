/**
 * Cost of shaping Arabic words for the PDF (#380): HarfBuzz through
 * `drawShapedTextPx` against the fontkit path every word took before
 * (`showTextShaped`), 20 000 words of a vocalised text, each painted once.
 * Skipped by `pnpm test`; run with `pnpm bench` (BENCH=1).
 */
import { describe, it } from 'vitest';
import fs from 'node:fs';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadComplexShaper } from '../complexShaping';
import { drawShapedTextPx } from '../pdf-backend/shapedText';
import { showTextShaped, type PageCtx } from '../pdf-backend/primitives';

const AMIRI = new Uint8Array(fs.readFileSync(new URL('../__tests__/fixtures/arabic/amiri-subset.ttf', import.meta.url)));
const WORDS = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ السلام عليكم ورحمة الله وبركاته لا إله إلا كتـــاب عام سنة كلمة قوس'.split(' ');
const MARKS = ['', 'َ', 'ِ', 'ُ', 'ّ', 'ْ', 'ًّ'];
const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined>; stdout: { write(s: string): void } } }).process;

/** 20 000 words, most of them different (as in a book, where the cache
 *  helps less than in a list of repeats): a vocabulary word's head, a mark,
 *  another word's tail. */
function words(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 20_000; i++) {
    const a = WORDS[i % WORDS.length]!;
    const b = WORDS[Math.floor(i / WORDS.length) % WORDS.length]!;
    const mark = MARKS[Math.floor(i / (WORDS.length * WORDS.length)) % MARKS.length]!;
    out.push(a.slice(0, 1 + (i % 3)) + mark + b.slice(Math.floor(i / 7) % Math.max(1, b.length - 1)));
  }
  return out;
}

describe.skipIf(!nodeProcess?.env?.BENCH)('Arabic shaping bench', () => {
  it('shapes 20k words with HarfBuzz and with fontkit', { timeout: 600_000 }, async () => {
    await loadComplexShaper();
    const list = words();
    nodeProcess?.stdout.write(`${new Set(list).size} distinct words\n`);
    for (const pass of ['harfbuzz', 'fontkit'] as const) {
      const doc = await PDFDocument.create();
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(AMIRI, { subset: true });
      const page = doc.addPage();
      const ctx: PageCtx = { page, pageHeightPt: 800, scale: 1, colorSpace: 'rgb' };
      const t = performance.now();
      for (const w of list) {
        if (pass === 'harfbuzz') drawShapedTextPx(ctx, w, 10, 10, font, 12, rgb(0, 0, 0), { direction: 'rtl' });
        else showTextShaped(font, w);
      }
      nodeProcess?.stdout.write(`${pass}: ${(performance.now() - t).toFixed(0)} ms\n`);
    }
  });
});
