import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile } from 'node:fs';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache } from '../../measure/index.js';
import { forgetFontCoverage, registerFontCoverage } from '../../fonts/glyphFallback.js';
import { readUnderline, underlineOf } from '../../fonts/strikeout.js';
import { STRIKE_AT, UNDERLINE_AT, UNDERLINE_STROKE } from '../../marks/strikeGeometry.js';
import { renderToHtml } from '../../html-backend/html-backend.js';
import { documentDisplayList } from '../../paint/displayList/index.js';
import type { PostextConfig, VDTDocument, VDTLine, VDTLineMark } from '../../index.js';

// Underlined text (`++…++`): the layout is the one without the line, and
// each line holding underlined words gets a `VDTLine.marks` line under them,
// where the face puts its underline (`post`), else the fallback.

const readFileSync = readFile as (path: URL) => Uint8Array;
const LORA = new Uint8Array(readFileSync(new URL('../../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url)));

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '16');
    return { width: s.length * size * 0.5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (fontFamily: string): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily, fontSize: pt(20), lineHeight: pt(26), textAlign: 'left' },
  header: { elements: [] },
  footer: { elements: [] },
});
const build = (markdown: string, family = 'Test Serif'): VDTDocument => buildDocument({ markdown }, config(family), createMeasurementCache());
const firstLine = (doc: VDTDocument): VDTLine => doc.blocks.flatMap((b) => b.lines)[0]!;
const rules = (line: VDTLine): VDTLineMark[] => (line.marks ?? []).filter((m) => m.kind === 'line');

afterEach(() => forgetFontCoverage(['Test Serif']));

describe('underline lines', () => {
  it('reads the face’s underline from the post table, as the middle of the line', () => {
    // Lora: top of the line 100 units under the baseline, 50 thick.
    expect(readUnderline(LORA)).toEqual({ position: -0.125, size: 0.05 });
    expect(readUnderline(new Uint8Array([1, 2, 3]))).toBeUndefined();
    registerFontCoverage('Test Serif', 400, 'normal', LORA);
    expect(underlineOf('20px "Test Serif", serif')).toEqual({ position: -0.125, size: 0.05 });
  });

  it('draws one line under the underlined words and the space between them, the layout unchanged', () => {
    const doc = build('Please ++sign here++ and return.');
    const plain = build('Please sign here and return.');
    const line = firstLine(doc);
    expect(line.segments!.map((s) => s.width)).toEqual(firstLine(plain).segments!.map((s) => s.width));
    const marks = rules(line);
    expect(marks).toHaveLength(1);
    const segs = line.segments!;
    const under = segs.filter((s) => s.underline);
    expect(under.map((s) => s.text)).toEqual(['sign', 'here']);
    const before = segs.slice(0, segs.indexOf(under[0]!)).reduce((w, s) => w + s.width, 0);
    const across = segs.slice(segs.indexOf(under[0]!), segs.indexOf(under[1]!) + 1).reduce((w, s) => w + s.width, 0);
    expect(marks[0]!.x).toBeCloseTo(before, 3);
    expect(marks[0]!.length).toBeCloseTo(across, 3);
    // Unknown face: the fallback, under the baseline.
    expect(marks[0]!.y).toBeCloseTo(-UNDERLINE_AT * 20, 5);
    expect(marks[0]!.y).toBeGreaterThan(0);
    expect(marks[0]!.thickness).toBeCloseTo(UNDERLINE_STROKE * 20, 5);
  });

  it('sits where a registered face puts its underline', () => {
    registerFontCoverage('Test Serif', 400, 'normal', LORA);
    const marks = rules(firstLine(build('a ++b++ c')));
    expect(marks[0]!.y).toBeCloseTo(0.125 * 20, 5);
    expect(marks[0]!.thickness).toBeCloseTo(0.05 * 20, 5);
  });

  it('draws both lines on text struck through and underlined, and leaves a full stop out', () => {
    const marks = rules(firstLine(build('a ~~++both++~~ c ++under++.')));
    expect(marks).toHaveLength(3);
    expect(marks.filter((m) => m.y < 0).map((m) => m.y)).toEqual([-STRIKE_AT * 20]);
    const line = firstLine(build('++under++.'));
    const seg = line.segments!.find((s) => s.underline)!;
    expect(seg.underline).toEqual({ id: 0, from: 0, to: 5 });
    expect(rules(line)[0]!.length).toBeCloseTo(5 * 10, 3);
  });

  it('flags whole runs in the display list and wraps the words in <u> in HTML', () => {
    const doc = build('Please ++sign++ here.');
    const runs = documentDisplayList(doc).flatMap((p) => p.items).flatMap((i) => (i.kind === 'text' ? i.lines.flatMap((l) => l.runs) : []));
    expect(runs.filter((r) => r.underline).map((r) => r.text)).toEqual(['sign']);
    expect(renderToHtml(doc)).toContain('<u style="text-decoration:none;">');
  });
});
