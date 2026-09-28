import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import { renderToHtml } from '../../html-backend';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLine } from '../../vdt';
import { installSizedStub, stubCharWidth } from '../vertical/stub';

// The marks, readings and notes of #193–#195 in the canvas and HTML
// backends: drawn where the layout put them.
installSizedStub();

interface Call { op: string; args: unknown[]; font?: string; fill?: string }

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
      return (...args: unknown[]) => { calls.push({ op: String(key), args, font: String(t.font), fill: String(t.fillStyle) }); };
    },
    set(t, key, value) { t[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'zh-Hant-TW',
  page: { width: pt(440), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  ...extra,
});

const MD = '此開卷第一回也。:name[甄士隱]夢幻識通靈，撰此:book[石頭記]一書也。:dots[不可]輕忽，{紅樓|hóng|lóu}夢寶玉:warichu[甲戌側批此是第一首標題詩]{open="〔" close="〕"}道。';

const firstLine = (doc: VDTDocument): VDTLine => doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!;

describe('annotations on the canvas', () => {
  it('draws the dots, the lines, the readings and the note rows the layout placed', () => {
    const doc = buildDocument({ markdown: MD }, config());
    const lines = doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
    const marks = lines.flatMap((l) => (l.marks ?? []).map((m) => ({ ...m, x: m.x + l.bbox.x, y: m.y + l.baseline })));
    expect(marks.filter((m) => m.kind === 'dot')).toHaveLength(2);
    expect(marks.filter((m) => m.kind === 'line')).toHaveLength(1);
    // The title runs over a line break: a wave on each line.
    expect(marks.filter((m) => m.kind === 'wavy')).toHaveLength(2);
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    // One filled arc per dot, centred where the layout put it.
    const arcs = calls.filter((c) => c.op === 'arc');
    expect(arcs.map((c) => [c.args[0], c.args[1]])).toEqual(marks.filter((m) => m.kind === 'dot').map((m) => [m.x, m.y]));
    // The proper-name line as a thin rectangle.
    const name = marks.find((m) => m.kind === 'line')!;
    expect(calls.some((c) => c.op === 'fillRect' && c.args[0] === name.x && c.args[2] === name.length)).toBe(true);
    // The readings, at the ruby size.
    const texts = calls.filter((c) => c.op === 'fillText');
    expect(texts.find((c) => c.args[0] === 'hóng')!.font).toContain('10px');
    expect(texts.find((c) => c.args[0] === 'lóu')).toBeDefined();
    // The note: its two rows at the note size, never its text whole.
    // (It runs over a line break: 11 characters on the first line, 詩 on
    // the next.)
    const rows = texts.filter((c) => / 10px /.test(c.font!) && /[甲戌側批此是第一首標題詩]/.test(String(c.args[0])));
    expect(rows.map((c) => c.args[0]).join('')).toBe('甲戌側批此是第一首標題詩');
    expect(texts.some((c) => String(c.args[0]).includes('甲戌側批此是') && / 20px /.test(c.font!))).toBe(false);
    // The upper row above the lower one.
    expect(Number(rows[0]!.args[2])).toBeLessThan(Number(rows[1]!.args[2]));
  });

  it('paints marks in the annotation colour', () => {
    const doc = buildDocument({ markdown: ':dots[不可]' }, config({ cjk: { annotationColor: { hex: '#c0392b', model: 'hex' } } }));
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const fills = calls.filter((c) => c.op === 'fill');
    expect(fills.length).toBe(2);
    for (const f of fills) expect(f.fill).toBe('#c0392b');
  });
});

describe('zhuyin tone marks on a vertical page', () => {
  it('paints them upright: turned back about their cell, never sideways', () => {
    const doc = buildDocument({ markdown: ':ruby[滿]{rt="ㄇㄢˇ"}紙:ruby[唐]{rt="ㄊㄤˊ"}' }, config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' } }));
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    for (const tone of ['ˇ', 'ˊ']) {
      const at = calls.findIndex((c) => c.op === 'fillText' && c.args[0] === tone);
      expect(at).toBeGreaterThan(0);
      expect(calls[at - 1]).toMatchObject({ op: 'rotate', args: [-Math.PI / 2] });
      expect(calls[at]!.font).toContain('6px');
    }
  });
});

describe('annotations in HTML', () => {
  it('writes the marks, the readings and the note as positioned boxes', () => {
    const doc = buildDocument({ markdown: MD }, config());
    const html = renderToHtml(doc);
    // Dotted text is emphasis; the dots are aria-hidden boxes.
    expect(html).toContain('<em style="font-style:inherit;">不可</em>');
    expect(html.match(/border-radius:50%/g)).toHaveLength(2);
    // The wavy title line is an SVG path.
    expect(html).toMatch(/<svg aria-hidden="true"[^>]*><path d="M/);
    // The reading, hidden from assistive technology.
    expect(html).toMatch(/aria-hidden="true" style="position:absolute;left:[\d.]+px;top:-[\d.]+px;white-space:pre;"><span style="font:[^";]*10px[^";]*;line-height:0;[^"]*">hóng</);
    // The note reads once, in a note box.
    expect(html).toContain('role="note" aria-label="甲戌側批此是第一首標題"');
    expect(html).toContain('role="note" aria-label="詩"');
    // The line keeps the base text only.
    expect(firstLine(doc).text).not.toContain('hóng');
  });
});
