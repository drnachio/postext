import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, findLooseLines } from '../../index';
import { renderToHtml } from '../../html-backend';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';

// CJK characters 16 px (1 em at 16 px), anything else 8 px.
const adv = (s: string): number => {
  let w = 0;
  for (const ch of s) w += ch.codePointAt(0)! >= 0x2e80 ? 16 : 8;
  return w;
};
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    return { width: adv(s) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** A 2D context that records every `fillText` with the letter spacing it
 *  was painted with. */
function recordingCanvas(): { canvas: HTMLCanvasElement; texts: { text: string; x: number; spacing: number }[] } {
  const texts: { text: string; x: number; spacing: number }[] = [];
  const target: Record<string | symbol, unknown> = { letterSpacing: '0px' };
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key === 'fillText') return (text: string, x: number) => { texts.push({ text, x, spacing: parseFloat(String(t.letterSpacing)) }); };
      if (key === 'measureText') return (s: string) => ({ width: adv(s) });
      if (key in t) return t[key];
      return () => undefined;
    },
    set(t, key, value) { t[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, texts };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
// 72 dpi: 1 pt = 1 px. A 181 px measure: 11 characters and 5 px to spread.
const config: PostextConfig = {
  locale: 'zh-Hans',
  page: { width: pt(221), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(16), lineHeight: pt(24), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  // Every mark a full em, no Han–Latin space: justification alone (the
  // punctuation widths are tested in punctuation.test.ts).
  cjk: { punctuationWidth: 'fullwidth', compressAdjacent: false, trimLineStart: false, latinSpacing: { value: 0, unit: 'em' } },
};
const TEXT = '此开卷第一回也。作者自云：因曾历过一番梦幻之后，故将真事隐去，而借「通灵」之说，撰此《石头记》一书也。故曰「甄士隐」云云。';

const paragraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;

describe('justified CJK lines reach the measure in every renderer', () => {
  const doc = buildDocument({ markdown: TEXT }, config);
  const block = paragraph(doc);
  const right = block.bbox.x + block.bbox.width;

  it('in the VDT: every line but the last is the measure wide', () => {
    expect(block.lines.length).toBeGreaterThan(4);
    for (const line of block.lines.slice(0, -1)) {
      expect(Math.abs(line.bbox.x + line.segments!.reduce((s, seg) => s + seg.width, 0) - right)).toBeLessThan(0.01);
      expect(line.segments!.some((s) => (s.tracking ?? 0) > 0)).toBe(true);
    }
    expect(block.lines[block.lines.length - 1]!.segments!.every((s) => s.tracking === undefined)).toBe(true);
  });

  it('on canvas: the last glyph of each line ends on the measure', () => {
    const { canvas, texts } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    // Walk the calls line by line: a line's calls run from its start to the
    // measure; the ink of a call ends after its last glyph (the spacing
    // after it is advance, not ink).
    let i = 0;
    for (const line of block.lines) {
      let text = '';
      let end = 0;
      while (text.length < line.text.length && i < texts.length) {
        const t = texts[i++]!;
        text += t.text;
        const n = [...t.text].length;
        end = t.x + adv(t.text) + t.spacing * (n - 1);
      }
      expect(text).toBe(line.text);
      if (!line.isLastLine) expect(Math.abs(end - right)).toBeLessThan(0.01);
    }
  });

  it('in HTML: each tracked span carries its letter spacing and the line ends on the measure', () => {
    const html = renderToHtml(doc);
    // `s`: a paragraph's last line ends on the newline a copy takes (#403).
    const lines = [...html.matchAll(/<div class="pt-line"[^>]*style="[^"]*left:([\d.]+)px;[^"]*">(.*?)<\/div>/gs)];
    const bodyLines = lines.filter((m) => block.lines.some((l) => m[2]!.includes(l.text.slice(0, 2))));
    expect(bodyLines.length).toBe(block.lines.length);
    bodyLines.forEach((m, li) => {
      const spans = [...m[2]!.matchAll(/left:([\d.]+)px;top:[^;]*;white-space:pre;(?:letter-spacing:([\d.]+)px;)?[^>]*>([^<]*)</g)];
      const last = spans[spans.length - 1]!;
      const n = [...last[3]!].length;
      const end = Number(m[1]) + Number(last[1]) + adv(last[3]!) + Number(last[2] ?? 0) * (n - 1);
      if (!block.lines[li]!.isLastLine) expect(Math.abs(end - right)).toBeLessThan(0.01);
      for (const s of spans.slice(0, -1)) {
        const seg = block.lines[li]!.segments!.find((x) => x.text === s[3]);
        if (seg?.tracking !== undefined) expect(Number(s[2])).toBeCloseTo(seg.tracking, 3);
      }
    });
  });
});

describe('loose CJK lines', () => {
  it('are found by findLooseLines and warned about', () => {
    // A long Latin word that cannot come up leaves 甲乙丙 alone on a
    // 181 px line: 133 px to spread over two gaps, far past half an em.
    const doc = buildDocument({ markdown: '甲乙丙Pneumonoultramicroscopicsilicovolcanoconiosis丁戊己庚辛壬癸' }, config);
    const block = paragraph(doc);
    expect(block.lines[0]!.text).toBe('甲乙丙');
    expect(block.lines[0]!.cjkLoose).toBe(true);
    const loose = findLooseLines(doc);
    expect(loose.map((l) => l.line.text)).toContain('甲乙丙');
    expect(doc.contentWarnings?.find((w) => w.kind === 'cjkLooseLine')).toMatchObject({ kind: 'cjkLooseLine', text: '甲乙丙', pageIndex: 0 });
  });

  it('a moderately spread line is loose past a quarter em (ratio 3)', () => {
    const doc = buildDocument({ markdown: TEXT }, config);
    // Tracking here is at most a few px: not loose at the default threshold.
    expect(findLooseLines(doc)).toEqual([]);
    expect(findLooseLines(doc, { threshold: 1.01 }).length).toBeGreaterThan(0);
  });
});

describe('column-end hyphen rules leave CJK paragraphs alone', () => {
  it('no Chinese line is hyphenated, so nothing is broken again', () => {
    const long = TEXT.repeat(12);
    const doc = buildDocument({ markdown: long }, { ...config, bodyText: { ...config.bodyText, hyphenateAcrossColumns: false } });
    const lines = doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines);
    expect(doc.pages.length).toBeGreaterThan(1);
    expect(lines.some((l) => l.hyphenated)).toBe(false);
  });
});
