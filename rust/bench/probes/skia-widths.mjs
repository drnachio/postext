// Widths of words measured by Skia (@napi-rs/canvas), one per line, as the
// CLI measures them (#779, Finding 6). Copy into packages/postext-cli, where
// the canvas is installed, and run:
//   DISABLE_SYSTEM_FONTS_LOAD=1 bun skia-widths.mjs <font> <px> <words.txt>
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { readFileSync } from 'node:fs';
const [font, size, words] = process.argv.slice(2);
GlobalFonts.registerFromPath(font, 'ShapeProbe');
const ctx = createCanvas(10, 10).getContext('2d');
ctx.font = `${size}px ShapeProbe`;
const out = readFileSync(words, 'utf8').split('\n').filter((l) => l.length > 0).map((w) => ctx.measureText(w).width);
console.log(out.join('\n'));
