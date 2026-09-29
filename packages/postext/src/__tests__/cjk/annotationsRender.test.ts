import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index';
import { renderToHtml } from '../../html-backend';
import type { PostextConfig } from '../../types';
import type { VDTDocument, VDTLine } from '../../vdt';
import { installSizedStub, stubCharWidth } from '../vertical/stub';
import { verticalSpans } from '../vertical/verticalSpans';

// The marks, readings and notes of #193–#195 in the canvas and HTML
// backends: drawn where the layout put them.
installSizedStub();

interface Call { op: string; args: unknown[]; font?: string; fill?: string; spacing?: string }

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
      return (...args: unknown[]) => { calls.push({ op: String(key), args, font: String(t.font), fill: String(t.fillStyle), spacing: String(t.letterSpacing) }); };
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

describe('annotations on a vertical page in HTML (#191 with #193–#195)', () => {
  const vertical = () => config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' } });
  /** The upright box of the first line and the line's own box. */
  const lineHtml = (html: string): { box: string; upright: string } => {
    const start = html.indexOf('class="pt-line"');
    const box = html.slice(start, html.indexOf('class="pt-line"', start + 1) >>> 0 || undefined);
    const upright = box.slice(box.indexOf('writing-mode:vertical-rl'), box.indexOf('</div>'));
    return { box, upright };
  };

  it('sets readings and note rows down the column beside the text, the tone mark upright', () => {
    const doc = buildDocument({ markdown: '輕忽{紅樓|hóng|lóu}:ruby[滿]{rt="ㄇㄢˇ"}寶玉:warichu[甲戌側批此是]道' }, vertical());
    const line = firstLine(doc);
    const { upright } = lineHtml(renderToHtml(doc, { mode: 'single' }));
    // Every reading and row is a run of the upright box, at its place
    // along the line (top) and centred across it on its axis (right), with
    // the line height in effect after its own `font` (which resets it).
    const runs = verticalSpans(upright).filter((r) => r.size !== undefined && r.size < 20);
    const segs = line.segments!;
    let x = 0;
    const at = new Map<string, number>();
    for (const s of segs) {
      at.set(s.text, x);
      x += s.width;
    }
    const axisOf = (dy: number, size: number) => line.baseline - line.bbox.y + dy - 0.38 * size;
    const hong = segs.find((s) => s.ruby?.text === 'hóng')!;
    const hongRun = runs.find((r) => r.text === 'hóng')!;
    expect(hongRun.top).toBeCloseTo(at.get(hong.text)! + hong.ruby!.runs[0]!.dx, 3);
    expect(hongRun.axis).toBeCloseTo(axisOf(hong.ruby!.runs[0]!.dy, 10), 3);
    // Over the text in the flow: right of the column on the sheet.
    expect(hongRun.axis).toBeLessThan(axisOf(0, 20));
    // Zhuyin: the tone mark stands upright.
    expect(upright).toContain('<span style="text-orientation:upright;">ˇ</span>');
    // The note: two rows, the upper one right of the lower one, read once.
    expect(upright).toContain('role="note" aria-label="甲戌側批此是"');
    const rows = runs.filter((r) => r.size === 10 && /[甲戌側批此是]/.test(r.text));
    expect(rows.map((r) => r.text).join('')).toBe('甲戌側批此是');
    expect(rows[0]!.axis).toBeLessThan(rows[1]!.axis);
    // Each row centred on its own axis, as the canvas and the PDF set it.
    const note = segs.find((s) => s.warichu)!.warichu!;
    note.runs.forEach((run, i) => expect(rows[i]!.axis).toBeCloseTo(axisOf(run.dy, 10), 3));
    // The base text is set once, the note never at the text size.
    expect(verticalSpans(upright).some((r) => r.size === undefined && r.text.includes('甲戌'))).toBe(false);
  });

  it('draws the marks in the line box of the turned flow, dotted text as emphasis', () => {
    const doc = buildDocument({ markdown: '此:dots[不可]輕忽:name[甄士隱]撰:book[石頭記]' }, config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' }, cjk: { bookTitleMark: 'wavy' } }));
    const line = firstLine(doc);
    const { box, upright } = lineHtml(renderToHtml(doc, { mode: 'single' }));
    expect(upright).toContain('<em style="font-style:inherit;">不可</em>');
    // The marks sit outside the upright box, in the line's own (turned)
    // box, from its baseline: as the canvas draws them.
    const marks = box.slice(box.indexOf('</div>'));
    expect(marks).toContain(`top:${(line.baseline - line.bbox.y).toFixed(3)}px;width:0;height:0;`);
    const dots = [...marks.matchAll(/left:([\d.]+)px;top:(-?[\d.]+)px;width:([\d.]+)px;height:[\d.]+px;box-sizing:border-box;border-radius:50%/g)];
    const want = line.marks!.filter((m) => m.kind === 'dot');
    expect(dots.map((d) => +d[1]! + +d[3]! / 2)).toEqual(want.map((m) => +m.x.toFixed(3)));
    // Right of the column (over, in the flow): above the baseline.
    for (const d of dots) expect(+d[2]!).toBeLessThan(0);
    expect(marks).toMatch(/<svg aria-hidden="true"[^>]*><path d="M/);
  });
});

describe('a ruby base of several characters on a justified line (#194)', () => {
  // A measure of 216 px (10.8 characters): 此開卷紅樓夢第一回 is spread by
  // 6 px between each two of its 9 characters. Full-width marks, no Han–Latin
  // space, so every gap is the same.
  const spread = (extra: Partial<PostextConfig> = {}): PostextConfig => config({
    locale: 'zh-Hans',
    page: { width: pt(256), height: pt(600), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    cjk: { punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false, latinSpacing: { value: 0, unit: 'em' } },
    ...extra,
  });
  const MD_GROUP = '此開卷:ruby[紅樓夢]{rt="hóng lóu mèng" group}第一回作，者自云因曾歷過一番夢幻之後';

  it('keeps the base at its natural spacing: the gap follows the box once, as a space of its own', () => {
    const line = firstLine(buildDocument({ markdown: MD_GROUP }, spread()));
    expect(line.text).toBe('此開卷紅樓夢第一回');
    const segs = line.segments!;
    const at = segs.findIndex((s) => s.ruby);
    const base = segs[at]!;
    expect(base.text).toBe('紅樓夢');
    // The box is the three characters (the reading, 13 letters of 5 px at
    // 10 px less its spaces, is no wider); no tracking after each of them.
    expect(base.width).toBe(60);
    expect(base.tracking).toBeUndefined();
    expect(segs[at + 1]).toEqual({ kind: 'space', text: '', width: 6, autospace: true });
    // The neighbours keep theirs.
    expect(segs[at - 1]!.tracking).toBe(6);
    expect(line.bbox.width).toBeCloseTo(216, 9);
  });

  it('on the canvas the base ends before the next character and stays centred under its reading', () => {
    const doc = buildDocument({ markdown: MD_GROUP }, spread());
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const texts = calls.filter((c) => c.op === 'fillText');
    const base = texts.find((c) => c.args[0] === '紅樓夢')!;
    const next = texts.find((c) => c.args[0] === '第一')!;
    const reading = texts.find((c) => c.args[0] === 'hóng lóu mèng')!;
    expect(base.spacing).toBe('0px');
    const x = Number(base.args[1]);
    // 20 px margin + 此開卷 (3 × 26 px) = 98; the base inks 60 px, then the gap.
    expect(x).toBe(98);
    expect(Number(next.args[1])).toBe(x + 60 + 6);
    let rt = 0;
    for (const ch of 'hóng lóu mèng') rt += stubCharWidth(ch, 10);
    expect(Number(reading.args[1]) + rt / 2).toBeCloseTo(x + 30, 9);
  });

  it('in HTML the base span has no letter spacing and the next span starts past the gap', () => {
    const html = renderToHtml(buildDocument({ markdown: MD_GROUP }, spread()));
    const span = /<span style="position:absolute;left:([\d.]+)px;top:0;white-space:pre;([^"]*)">紅樓夢<\/span>/.exec(html)!;
    expect(span).not.toBeNull();
    expect(span[2]).not.toContain('letter-spacing');
    const next = /<span style="position:absolute;left:([\d.]+)px;top:0;white-space:pre;[^"]*">第一<\/span>/.exec(html)!;
    expect(+next[1]! - +span[1]!).toBeCloseTo(66, 3);
  });

  it('down a vertical line, and in a reader with word-level pinyin, no base of several characters takes tracking', () => {
    const reader = '{小朋友|xiǎopéngyǒu}们{今天|jīntiān}去{动物园|dòngwùyuán}看{大熊猫|dàxióngmāo}，{大熊猫|dàxióngmāo}在{吃竹子|chīzhúzi}。{老师|lǎoshī}说：“{熊猫|xióngmāo}很{可爱|kě\'ài}。”';
    const square = { page: { width: pt(340), height: pt(340), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } } };
    for (const layout of [{ layoutType: 'single' as const }, { layoutType: 'single' as const, writingMode: 'vertical-rl' as const }]) {
      const doc = buildDocument({ markdown: reader }, config({ locale: 'zh-Hans', ...square, layout }));
      const lines = doc.blocks.find((b) => b.type === 'paragraph')!.lines;
      let gaps = 0;
      for (const l of lines) {
        const segs = l.segments!;
        segs.forEach((s, i) => {
          if (!s.ruby) return;
          if ([...s.text].length > 1) expect(s.tracking).toBeUndefined();
          const after = segs[i + 1];
          if (after?.kind === 'space' && after.autospace && after.text === '') {
            gaps++;
            // The gap is the line's: what the characters around it take.
            const plain = segs.find((t) => t.kind === 'text' && !t.ruby && t.tracking !== undefined);
            if (plain) expect(after.width).toBeCloseTo(plain.tracking!, 9);
          }
        });
      }
      expect(gaps).toBeGreaterThan(0);
    }
  });
});
