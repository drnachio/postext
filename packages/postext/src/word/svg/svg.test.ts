import { describe, it, expect } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync as exists, readFileSync as readFile } from 'node:fs';
import type { WordFontPlan } from '../fonts/types.js';
import { svgWithWordFonts } from '../formatted/pictures.js';
import { readOutlineFace } from './glyphs.js';
import { hasStyleRules, svgTextAsPaths } from './text.js';

const existsSync = exists as (path: URL) => boolean;
const readFileSync = readFile as (path: URL) => Uint8Array;
const loraPath = new URL('../../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url);

describe.runIf(existsSync(loraPath))('SVG text drawn as outlines for Word (#1444)', () => {
  const bytes = new Uint8Array(readFileSync(loraPath));
  const plan: WordFontPlan = {
    faces: [{ family: 'Lora PTX', slot: 'regular', bytes }],
    map: new Map([['Lora|400|normal', { family: 'Lora PTX', bold: false, italic: false }]]),
    warnings: [],
    altNames: new Map(),
  };

  it('reads the face: its em, advances and closed quadratic outlines', () => {
    const face = readOutlineFace(bytes)!;
    expect(face.unitsPerEm).toBe(1000);
    const o = face.glyph('O'.codePointAt(0)!)!;
    expect(face.advance(o)).toBeGreaterThan(500);
    // An O is two contours (its outside and its counter).
    expect(face.contours(o).length).toBe(2);
    expect(face.glyph(0x2318)).toBeUndefined();
  });

  it('replaces a text the embedded face draws by its outlines, keeping its paint', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><text x="200" y="80" font-family="Lora, serif" font-size="80" text-anchor="middle" fill="none" stroke="#fff" stroke-width="4" class="big">1863</text></svg>';
    const out = svgTextAsPaths(svg, plan);
    expect(out).not.toContain('<text');
    expect(out).toMatch(/<g fill="none" stroke="#fff" stroke-width="4" class="big"><title>1863<\/title><path d="M[^"]+Z"\/><\/g>/);
    // Centred on x = 200: the outline spreads either side of it.
    const xs = [...out.matchAll(/[MLQ](-?[\d.]+) /g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeLessThan(200);
    expect(Math.max(...xs)).toBeGreaterThan(200);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(400, -1.5);
  });

  it('inherits the font from enclosing groups and decodes entities', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g font-family="Lora" font-size="12"><text x="0" y="10">A &amp; B</text></g></svg>';
    const out = svgTextAsPaths(svg, plan);
    expect(out).toContain('<title>A &amp; B</title>');
    expect(out).not.toContain('<text');
  });

  it('leaves text live where the face cannot draw it (missing glyphs, tspans, other faces)', () => {
    const han = '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10" font-family="Lora" font-size="12">红楼梦</text></svg>';
    expect(svgTextAsPaths(han, plan)).toBe(han);
    const tspan = '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10" font-family="Lora" font-size="12">a<tspan>b</tspan></text></svg>';
    expect(svgTextAsPaths(tspan, plan)).toBe(tspan);
    const other = '<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10" font-family="Georgia" font-size="12">abc</text></svg>';
    expect(svgTextAsPaths(other, plan)).toBe(other);
    // Live text still names the embedded family for Word.
    expect(svgWithWordFonts(svgTextAsPaths(han, plan), plan)).toContain('Lora PTX');
  });

  it('leaves text live when a style sheet may size or paint it, not for @font-face alone', () => {
    const text = '<text class="big" x="0" y="40" font-family="Lora">abc</text>';
    const ruled = `<svg xmlns="http://www.w3.org/2000/svg"><style>.big{font-size:40px}</style>${text}</svg>`;
    expect(svgTextAsPaths(ruled, plan)).toBe(ruled);
    const element = `<svg xmlns="http://www.w3.org/2000/svg"><style><![CDATA[ text { fill: #c00 } ]]></style>${text}</svg>`;
    expect(svgTextAsPaths(element, plan)).toBe(element);
    const fonts = `<svg xmlns="http://www.w3.org/2000/svg"><style>/* face */ @font-face { font-family: Lora; src: url(data:font/ttf;base64,AA) }</style>${text}</svg>`;
    expect(hasStyleRules(fonts)).toBe(false);
    expect(svgTextAsPaths(fonts, plan)).not.toContain('<text');
  });
});
