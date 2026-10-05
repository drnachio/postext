import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import { renderToHtml } from '../../html-backend';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLine } from '../../vdt';
import { installSizedStub, stubCharWidth } from '../vertical/stub';

// Kanbun marks (#430) in the canvas and HTML backends: the runs and the
// 竪点 where the layout placed them; in HTML the 送り仮名 read and copy
// after their character, the 返り点 do not.
installSizedStub();

interface Call { op: string; args: unknown[]; fill?: string }

function recordingCanvas(): { canvas: HTMLCanvasElement; calls: Call[] } {
  const calls: Call[] = [];
  const target: Record<string | symbol, unknown> = { letterSpacing: '0px', font: '10px Test', fillStyle: '#000', textAlign: 'left', textBaseline: 'alphabetic' };
  const stack: Record<string | symbol, unknown>[] = [];
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key === 'save') return () => { stack.push({ ...t }); };
      if (key === 'restore') return () => { Object.assign(t, stack.pop() ?? {}); };
      if (key === 'measureText') {
        return (s: string) => {
          const em = Number(/(\d*\.?\d+)px/.exec(String(t.font))?.[1] ?? 10);
          let w = 0;
          for (const ch of s) w += stubCharWidth(ch, em);
          return { width: w };
        };
      }
      if (key in t) return t[key];
      return (...args: unknown[]) => { calls.push({ op: String(key), args, fill: String(t.fillStyle) }); };
    },
    set(t, key, value) { t[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'ja',
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(40), textAlign: 'left', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  cjk: { kunten: { color: { hex: '#c00000', model: 'hex' } } },
  ...extra,
});
const vertical = () => config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' } });
const firstLine = (doc: VDTDocument): VDTLine => doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!;

const MD = '子曰、:kunten[學]{okuri="ビテ"}而:kunten[敬]{tate kaeri="二"}祭';

describe('kanbun marks on the canvas', () => {
  it('horizontal: the runs in the marks\' colour at their place, the 竪点 a rectangle', () => {
    const doc = buildDocument({ markdown: MD }, config());
    const line = firstLine(doc);
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const texts = calls.filter((c) => c.op === 'fillText');
    const okuri = texts.find((c) => c.args[0] === 'ビテ')!;
    const gaku = line.segments!.findIndex((s) => s.text === '學');
    const x0 = line.bbox.x + line.segments!.slice(0, gaku).reduce((w, s) => w + s.width, 0);
    const run = line.segments![gaku]!.kunten!.runs[0]!;
    expect(okuri.args.slice(1, 3)).toEqual([x0 + run.dx, line.baseline + run.dy]);
    expect(okuri.fill).toBe('#c00000');
    expect(texts.some((c) => c.args[0] === '二' && c.fill === '#c00000')).toBe(true);
    const tate = line.segments!.find((s) => s.text === '敬')!.kunten!.tate!;
    const rect = calls.find((c) => c.op === 'fillRect' && c.args[2] === tate.length && c.args[3] === tate.thickness);
    expect(rect).toBeDefined();
    expect(Number(rect!.args[1])).toBeCloseTo(line.baseline + tate.dy - tate.thickness / 2, 9);
  });

  it('vertical: every mark is painted, cell by cell', () => {
    const doc = buildDocument({ markdown: MD }, vertical());
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const painted = calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0])).join('');
    for (const ch of 'ビテ二') expect(painted).toContain(ch);
    expect(calls.some((c) => c.op === 'fillRect' && c.fill === '#c00000')).toBe(true);
  });
});

describe('kanbun marks in HTML', () => {
  it('horizontal: the marks aria-hidden, the 送り仮名 again as transparent text right after their character', () => {
    const html = renderToHtml(buildDocument({ markdown: MD }, config()), { mode: 'single' });
    expect(html).toMatch(/<span aria-hidden="true" style="position:absolute;[^"]*"><span style="font:[^"]*10px[^"]*;line-height:0;color:#c00000;">ビテ<\/span><\/span>/);
    expect(html).toMatch(/aria-hidden="true"[^>]*><span[^>]*>二<\/span>/);
    const base = html.indexOf('學');
    const read = html.indexOf('opacity:0;white-space:pre;">ビテ</span>');
    expect(base).toBeGreaterThanOrEqual(0);
    expect(read).toBeGreaterThan(base);
    // Nothing after 學 but the marks before the transparent reading.
    expect(html.slice(base, read)).not.toContain('而');
    // The 返り点 are not read: no transparent 二.
    expect(html).not.toContain('opacity:0;white-space:pre;">二');
    // The 竪点: a rule in the marks' colour.
    expect(html).toMatch(/height:1\.200px;background:#c00000;/);
  });

  it('vertical: the runs beside the column, the 送り仮名 read after their character', () => {
    const html = renderToHtml(buildDocument({ markdown: MD }, vertical()), { mode: 'single' });
    expect(html).toContain('color:#c00000;');
    expect(html).toMatch(/opacity:0;[^"]*">ビテ<\/span>/);
    expect(html.indexOf('學')).toBeLessThan(html.search(/opacity:0;[^"]*">ビテ/));
  });
});
