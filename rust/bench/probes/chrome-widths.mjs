// Widths of words measured by Chrome's canvas (#779, Finding 6), with the
// font loaded from its file (FontFace), as the Sandbox does. Run from
// apps/web, where puppeteer-core is installed:
//   node ../../rust/bench/probes/chrome-widths.mjs <font> <px> <words.txt> [lang]
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const [font, size, words, lang = ''] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('about:blank');
const out = await page.evaluate(async (b64, size, list, lang) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const face = new FontFace('ShapeProbe', bytes);
  await face.load();
  document.fonts.add(face);
  const ctx = new OffscreenCanvas(10, 10).getContext('2d');
  ctx.font = `${size}px ShapeProbe`;
  if (lang && 'lang' in ctx) ctx.lang = lang;
  return list.map((w) => ctx.measureText(w).width);
}, readFileSync(font).toString('base64'), Number(size), readFileSync(words, 'utf8').split('\n').filter((l) => l.length > 0), lang);
console.log(out.join('\n'));
await browser.close();
