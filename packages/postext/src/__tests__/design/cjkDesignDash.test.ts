import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import { renderToHtml } from '../../html-backend';
import { clearTextWidthCache } from '../../measure/canvas';
import type { Dimension, PostextConfig, Resource } from '../../types';
import type { VDTBlock, VDTDesignTextBlock, VDTDesignTextLine, VDTDesignTextRun, VDTDocument } from '../../vdt';

// #652: a 破折号 (——) in Chinese design text (a running head, a heading
// design, the lettering of a comic balloon) is one unbroken rule over its
// two ems, as in the body: its two runs keep the stretch the composer
// computed with their offsets (`inkScale`), and the renderers paint it.
// The stub is Noto Serif SC's, as in `cjk/dashRule.test.ts`: an em dash
// 0.89 em wide with ink from 0.043 to 0.846 em.

const EM = 20;
const SIZE_RE = /(\d*\.?\d+)px/;
interface Glyph { advance: number; left: number; right: number; top: number; bottom: number }
const GLYPHS: Record<string, Glyph> = {
  '—': { advance: 0.89, left: 0.043, right: 0.846, top: 0.293, bottom: 0.242 },
  '…': { advance: 1, left: 0.111, right: 0.889, top: 0.436, bottom: 0.324 },
};
const HAN: Glyph = { advance: 1, left: 0.098, right: 0.946, top: 0.822, bottom: -0.079 };
const LATIN: Glyph = { advance: 0.5, left: 0.05, right: 0.45, top: 0.7, bottom: 0 };
const glyph = (ch: string): Glyph => GLYPHS[ch] ?? (ch === ' ' ? { ...LATIN, advance: 0.25, right: 0, left: 0 } : ch.codePointAt(0)! >= 0x2e80 ? HAN : LATIN);
class StubCtx {
  font = `${EM}px Test`;
  letterSpacing = '0px';
  measureText(s: string): TextMetrics {
    const em = Number(SIZE_RE.exec(this.font)?.[1] ?? EM);
    let x = 0;
    let left = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    let bottom = Infinity;
    for (const ch of s) {
      const g = glyph(ch);
      if (g.right > g.left) {
        left = Math.min(left, x + g.left);
        right = Math.max(right, x + g.right);
        top = Math.max(top, g.top);
        bottom = Math.min(bottom, g.bottom);
      }
      x += g.advance;
    }
    if (left === Infinity) return { width: x * em, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 } as TextMetrics;
    return {
      width: x * em,
      actualBoundingBoxLeft: -left * em,
      actualBoundingBoxRight: right * em,
      actualBoundingBoxAscent: top * em,
      actualBoundingBoxDescent: -bottom * em,
    } as TextMetrics;
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};
clearTextWidthCache();

/** The scale of a dash in a cell one em long: from the face's side bearing
 *  to the join, and a fiftieth of an em past it. */
const SCALE = (1 - 0.043 + 0.02) / (0.846 - 0.043);

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const picture = (id: string): Resource => ({ id, typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: `file-${id}`, format: 'png', width: 1000, height: 1000 } });

const HEAD = '萝拉——！爷爷……你在哪儿';
const NOTE = '他说话了——不要走他喊——萝拉……';

interface Options { locale?: string; composeDesignText?: boolean; headVertical?: boolean; lettering?: 'vertical'; dash?: string; head?: string }

/** A page whose running head, heading design (a note six ems wide) and
 *  comic balloon each hold a 破折号. */
function build(o: Options = {}): VDTDocument {
  const dash = o.dash ?? '——';
  const sub = (s: string): string => s.replaceAll('——', dash);
  const config = {
    locale: o.locale ?? 'zh-Hans',
    page: { sizePreset: 'custom', width: pt(600), height: pt(600), dpi: 72, margins: { top: pt(60), bottom: pt(40), left: pt(40), right: pt(40) } },
    layout: { layoutType: 'single' },
    bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(30), firstLineIndent: pt(0), hyphenation: { enabled: false } },
    ...(o.composeDesignText === false ? { cjk: { composeDesignText: false } } : {}),
    header: {
      elements: [{
        kind: 'text', id: 'head', content: sub(o.head ?? HEAD), fontFamily: 'Test Serif', fontSize: pt(EM),
        placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: pt(40), y: pt(10) } },
        ...(o.headVertical ? { writingMode: 'vertical-rl' } : {}),
      }],
    },
    footer: { elements: [] },
    headings: {
      fontFamily: 'Test Serif',
      levels: [{
        level: 1,
        advancedDesign: {
          enabled: true,
          slot: {
            elements: [{
              kind: 'text', id: 'note', content: '{titleText}', fontFamily: 'Test Serif', fontSize: pt(EM), overflow: 'wrap',
              placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(6 * EM) } },
            }],
          },
        },
      }],
    },
    comics: { lettering: { fontFamily: 'Test Serif', fontSize: pt(EM), ...(o.lettering ? { writingMode: o.lettering } : {}) } },
  } as unknown as PostextConfig;
  const markdown = `# ${sub(NOTE)}

${sub('正文——完。')}

:::page{split="*"}
::panel{art=a}
paco: ${sub('萝拉？萝拉——！')}
:::
`;
  return buildDocument({ markdown, resources: [picture('a')] }, config);
}

/** Every design text block of a document: slots, heading designs, balloons. */
function designBlocks(doc: VDTDocument): VDTDesignTextBlock[] {
  const out: VDTDesignTextBlock[] = [];
  const seen = new Set<unknown>();
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    const b = o as Partial<VDTDesignTextBlock>;
    if (b.kind === 'text' && typeof b.fontString === 'string' && Array.isArray(b.lines) && b.color !== undefined && !('segments' in o)) out.push(b as VDTDesignTextBlock);
    for (const v of Object.values(o)) walk(v);
  };
  walk(doc.pages);
  walk(doc.blocks);
  return out;
}

const blockWith = (doc: VDTDocument, text: string): VDTDesignTextBlock => {
  const b = designBlocks(doc).find((x) => x.lines.map((l) => l.text).join('').includes(text));
  if (!b) throw new Error(`no design text holds ${text}`);
  return b;
};
const runsOf = (line: VDTDesignTextLine): VDTDesignTextRun[] => line.runs ?? [];
const dashRuns = (b: VDTDesignTextBlock, ch = '—'): VDTDesignTextRun[] => b.lines.flatMap(runsOf).filter((r) => r.text === ch);

/** Where a run's ink runs along its line, px from the line's start. */
function inkSpan(line: VDTDesignTextLine, target: VDTDesignTextRun): [number, number] {
  let x = 0;
  for (const r of runsOf(line)) {
    if (r === target) {
      const g = glyph(r.text);
      const scale = r.inkScale ?? 1;
      const origin = x + (r.inkOffset ?? 0);
      return [origin + g.left * EM * scale, origin + g.right * EM * scale];
    }
    x += r.width;
  }
  throw new Error('run not on the line');
}

/** The pair of a line as one rule: where it starts and ends in its two
 *  cells, and how far the strokes overlap. */
function ruleOf(line: VDTDesignTextLine): { lead: number; trail: number; overlap: number } {
  const [a, b] = runsOf(line).filter((r) => r.text === '—');
  let start = 0;
  for (const r of runsOf(line)) {
    if (r === a) break;
    start += r.width;
  }
  const [a0, a1] = inkSpan(line, a!);
  const [b0, b1] = inkSpan(line, b!);
  return { lead: a0 - start, trail: start + a!.width + b!.width - b1, overlap: a1 - b0 };
}

describe('a 破折号 in Chinese design text is one rule (#652)', () => {
  it('stretches the pair of a running head as the body stretches it', () => {
    const doc = build();
    const head = blockWith(doc, '爷爷……');
    const dashes = dashRuns(head);
    expect(dashes).toHaveLength(2);
    for (const d of dashes) {
      expect(d.width).toBeCloseTo(EM);
      expect(d.inkScale).toBeCloseTo(SCALE);
      // Raised to the centre of the characters, as in the body.
      expect(d.baselineShift).toBeCloseTo(-0.1035 * EM);
    }
    // One rule: from the face's side bearing inside the first cell to the
    // same inside the second, the strokes overlapping at the join.
    const rule = ruleOf(head.lines[0]!);
    expect(rule.lead).toBeCloseTo(0.043 * EM);
    expect(rule.trail).toBeCloseTo(0.043 * EM);
    expect(rule.overlap).toBeCloseTo(0.04 * EM);
    // The body's own pair, set with the same composer.
    const seg = doc.blocks.filter((b: VDTBlock) => b.type === 'paragraph').flatMap((b) => b.lines).flatMap((l) => l.segments ?? []).find((s) => s.text === '—')!;
    expect(dashes[0]!.inkScale).toBeCloseTo(seg.inkScale!);
    expect(dashes[0]!.inkOffset).toBeCloseTo(seg.inkOffset!);
  });

  it('leaves the ellipsis pair as the font sets it', () => {
    const head = blockWith(build(), '爷爷……');
    const runs = head.lines.flatMap(runsOf).filter((r) => r.text.includes('…'));
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) expect(r.inkScale).toBeUndefined();
    // Six dots over two ems, whatever runs carry them.
    expect(runs.reduce((w, r) => w + r.width, 0)).toBeCloseTo(2 * EM);
  });

  it('keeps each pair whole and stretched where it opens or ends a wrapped line', () => {
    const note = blockWith(build(), '他喊');
    expect(note.lines.length).toBeGreaterThan(1);
    expect(note.lines.map((l) => l.text).join('')).toBe(NOTE);
    let pairs = 0;
    let opens = false;
    let ends = false;
    for (const line of note.lines) {
      const dashes = runsOf(line).filter((r) => r.text === '—');
      // Never one dash of a pair on a line.
      expect(dashes.length % 2, line.text).toBe(0);
      if (dashes.length === 0) continue;
      pairs += dashes.length / 2;
      if (line.text.startsWith('——')) opens = true;
      if (line.text.endsWith('——')) ends = true;
      for (const d of dashes) expect(d.inkScale).toBeCloseTo(SCALE);
      const rule = ruleOf(line);
      expect(rule.overlap).toBeGreaterThan(0);
      expect(rule.lead).toBeCloseTo(0.043 * EM);
      expect(rule.trail).toBeCloseTo(0.043 * EM);
    }
    expect(pairs).toBe(2);
    expect(opens).toBe(true);
    expect(ends).toBe(true);
  });

  it('stretches the pair in the lettering of a comic balloon', () => {
    const balloon = blockWith(build(), '萝拉？');
    const line = balloon.lines.find((l) => l.text.includes('——'))!;
    const dashes = runsOf(line).filter((r) => r.text === '—');
    expect(dashes).toHaveLength(2);
    for (const d of dashes) expect(d.inkScale).toBeCloseTo(SCALE);
    const rule = ruleOf(line);
    expect(rule.overlap).toBeCloseTo(0.04 * EM);
    // The blank between the rule and the ！ after it is the rule's side
    // bearing: nothing of the cell is left empty.
    expect(rule.trail).toBeCloseTo(0.043 * EM);
  });

  it('sets the pair as one rule down a vertical running head and a vertical balloon', () => {
    const doc = build({ headVertical: true, lettering: 'vertical' });
    for (const text of ['爷爷……', '萝拉？']) {
      const block = blockWith(doc, text);
      expect(block.vertical, text).toBeDefined();
      const line = block.lines.find((l) => l.text.includes('——'))!;
      const dashes = runsOf(line).filter((r) => r.text === '—');
      expect(dashes, text).toHaveLength(2);
      for (const d of dashes) {
        expect(d.width).toBeCloseTo(EM);
        expect(d.inkScale).toBeCloseTo(SCALE);
        expect(d.baselineShift).toBeCloseTo(-0.1035 * EM);
      }
      const rule = ruleOf(line);
      expect(rule.lead).toBeCloseTo(0.043 * EM);
      expect(rule.trail).toBeCloseTo(0.043 * EM);
      expect(rule.overlap).toBeCloseTo(0.04 * EM);
    }
  });

  it('leaves the marks beside the pair in their own boxes', () => {
    // An opening bracket at the line start gives up the half em before its
    // glyph (painted that far before its box), a comma the half em after.
    const head = blockWith(build({ head: '（注）萝拉——，爷爷' }), '爷爷');
    const runs = head.lines.flatMap(runsOf);
    const open = runs.find((r) => r.text === '（')!;
    expect(open.width).toBeCloseTo(EM / 2);
    expect(open.inkOffset).toBeCloseTo(-EM / 2);
    expect(open.inkScale).toBeUndefined();
    const comma = runs.find((r) => r.text === '，')!;
    expect(comma.width).toBeCloseTo(EM / 2);
    expect(comma.inkOffset).toBe(0);
    expect(dashRuns(head)).toHaveLength(2);
  });

  it('stretches a pair of horizontal bars (――) the same way', () => {
    const head = blockWith(build({ dash: '――' }), '爷爷……');
    const bars = dashRuns(head, '―');
    expect(bars).toHaveLength(2);
    for (const b of bars) expect(b.inkScale).toBeGreaterThan(1);
  });

  it('gives no run a stretch in Japanese text, in the plain wrapper, or without a 破折号', () => {
    const stretched = (doc: VDTDocument): boolean => designBlocks(doc).some((b) => b.lines.some((l) => runsOf(l).some((r) => r.inkScale !== undefined)));
    // Japanese keeps the font's own ―― and ——.
    expect(stretched(build({ locale: 'ja', dash: '――' }))).toBe(false);
    expect(stretched(build({ locale: 'ja' }))).toBe(false);
    // The wrapper of 1.24 (`cjk.composeDesignText: false`): the pair as one
    // string at the font's advances.
    const legacy = build({ composeDesignText: false });
    expect(stretched(legacy)).toBe(false);
    expect(blockWith(legacy, '爷爷……').lines[0]!.runs).toBeUndefined();
    // A single dash is a connector, not a 破折号.
    expect(stretched(build({ dash: '—' }))).toBe(false);
  });
});

/** A canvas context that records where text is painted. */
function recordingCanvas(): { canvas: HTMLCanvasElement; calls: string[] } {
  const calls: string[] = [];
  const target: Record<string | symbol, unknown> = { letterSpacing: '0px', font: `${EM}px Test`, textAlign: 'left', textBaseline: 'alphabetic' };
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key === 'fillText') return (text: string, x: number, y: number) => { calls.push(`fillText ${text} ${x} ${y}`); };
      if (key === 'translate') return (x: number, y: number) => { calls.push(`translate ${x.toFixed(3)} ${y.toFixed(3)}`); };
      if (key === 'scale') return (x: number, y: number) => { calls.push(`scale ${x.toFixed(4)} ${y}`); };
      if (key === 'measureText') return (s: string) => new StubCtx().measureText(s);
      if (key in t) return t[key];
      return () => undefined;
    },
    set(t, key, value) { t[key] = value; return true; },
  });
  return { canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, calls };
}

describe('renderers paint the stretched dash of a design text (#652)', () => {
  it('canvas scales each dash from its ink offset, in a running head and in a balloon', () => {
    const doc = build();
    for (const page of doc.pages) {
      const { canvas, calls } = recordingCanvas();
      renderPageToCanvas(page, doc, canvas);
      let checked = 0;
      for (const block of designBlocks({ ...doc, pages: [page], blocks: [] } as VDTDocument)) {
        for (const line of block.lines) {
          let x = block.bbox.x + line.xOffset;
          for (const run of runsOf(line)) {
            if (run.inkScale !== undefined) {
              const i = calls.indexOf(`translate ${(x + run.inkOffset!).toFixed(3)} ${(line.baselineY + run.baselineShift!).toFixed(3)}`);
              expect(i, `${line.text} at ${x}`).toBeGreaterThanOrEqual(0);
              expect(calls[i + 1]).toBe(`scale ${run.inkScale.toFixed(4)} 1`);
              expect(calls[i + 2]).toBe('fillText — 0 0');
              checked++;
            }
            x += run.width;
          }
        }
      }
      // The running head on every page; the balloon on the comic page.
      expect(checked).toBeGreaterThanOrEqual(2);
      // No dash is painted unstretched.
      expect(calls.filter((c) => c.startsWith('fillText —')).every((c) => c === 'fillText — 0 0')).toBe(true);
    }
  });

  it('canvas paints the dash turned with the column in a vertical block', () => {
    const doc = build({ headVertical: true, lettering: 'vertical' });
    const page = doc.pages[0]!;
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(page, doc, canvas);
    const head = blockWith({ ...doc, pages: [page], blocks: [] } as VDTDocument, '爷爷……');
    const line = head.lines[0]!;
    // In the block's own turned frame: lines advance from 0.
    let x = line.xOffset;
    let checked = 0;
    for (const run of runsOf(line)) {
      if (run.inkScale !== undefined) {
        const i = calls.indexOf(`translate ${(x + run.inkOffset!).toFixed(3)} ${(line.baselineY + run.baselineShift!).toFixed(3)}`);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(calls[i + 1]).toBe(`scale ${run.inkScale.toFixed(4)} 1`);
        // Painted as it is in the turned frame (no cell turned upright).
        expect(calls[i + 2]).toBe('fillText — 0 0');
        checked++;
      }
      x += run.width;
    }
    expect(checked).toBe(2);
  });

  it('HTML stretches each dash in a box of its own, with the face’s own form off', () => {
    const doc = build();
    const html = renderToHtml(doc);
    const dashes = designBlocks(doc).reduce((n, b) => n + dashRuns(b).length, 0);
    expect(dashes).toBeGreaterThanOrEqual(8);
    const boxes = html.match(/<span style="display:inline-block;text-indent:0;transform:scaleX\([\d.]+\);transform-origin:0 0;font-feature-settings:[^"]*'locl' 0;">—<\/span>/g) ?? [];
    expect(boxes).toHaveLength(dashes);
    expect(boxes[0]).toContain(`scaleX(${SCALE.toFixed(4)})`);
    // Inside the run's own box, which carries the cell and the offset.
    expect(html).toMatch(/display:inline-block;width:20\.000px;text-indent:-?[\d.]+px;"><span style="display:inline-block;text-indent:0;transform:scaleX/);
  });

  it('HTML turns and stretches the dash down a vertical design text', () => {
    const doc = build({ headVertical: true, lettering: 'vertical' });
    const html = renderToHtml(doc);
    const vertical = designBlocks(doc).filter((b) => b.vertical).reduce((n, b) => n + dashRuns(b).length, 0);
    expect(vertical).toBeGreaterThanOrEqual(4);
    expect(html.match(/transform:scaleY\(/g)).toHaveLength(vertical);
    expect(html.match(/<span style="text-orientation:sideways;">—<\/span>/g)).toHaveLength(vertical);
  });

  it('changes nothing in the output of a design text with no 破折号', () => {
    const html = renderToHtml(build({ dash: '，' }));
    expect(html).not.toContain('transform:scaleX(');
    expect(html).not.toContain("'locl' 0");
  });
});
