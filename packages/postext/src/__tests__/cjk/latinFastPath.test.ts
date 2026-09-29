import { describe, it, expect, vi, beforeEach } from 'vitest';

// The renderers and the measurer decide once per line (or paragraph)
// whether text needs the CJK features: a Latin page must not pay for them
// word by word. `hasCJK` is counted to hold that.
const calls = vi.hoisted(() => ({ hasCJK: 0 }));
vi.mock('../../measure/cjk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../measure/cjk')>();
  return {
    ...actual,
    hasCJK: (text: string) => {
      calls.hasCJK++;
      return actual.hasCJK(text);
    },
  };
});

import { buildDocument, renderPageToCanvas, columnClipRect } from '../../index';
import { renderToHtml } from '../../html-backend';
import { measureRichBlock } from '../../measure/rich';
import { hasCJK } from '../../measure/cjk';
import type { PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from '../../vdt';

// CJK characters one em, a space a quarter, anything else half.
const adv = (s: string, em = 16): number => {
  let w = 0;
  for (const ch of s) w += ch === ' ' ? em / 4 : ch.codePointAt(0)! >= 0x2e80 ? em : em / 2;
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

/** A canvas whose context records every `fillText` and every state set. */
function recordingCanvas(): { canvas: HTMLCanvasElement; texts: string[]; sets: string[] } {
  const texts: string[] = [];
  const sets: string[] = [];
  const target: Record<string | symbol, unknown> = { letterSpacing: '0px' };
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key === 'fillText') return (text: string) => { texts.push(text); };
      if (key === 'measureText') return (s: string) => ({ width: adv(s) });
      if (key in t) return t[key];
      return () => undefined;
    },
    set(t, key, value) {
      sets.push(String(key));
      t[key] = value;
      return true;
    },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, texts, sets };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), textAlign: 'justify', hyphenation: { enabled: false } },
  ...extra,
});

const QUIJOTE = [
  'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor.',
  'Una olla de algo más **vaca que carnero**, salpicón las más noches, duelos y quebrantos los sábados, lantejas los viernes, algún palomino de añadidura los domingos, consumían las tres partes de su hacienda.',
  'El resto della concluían sayo de velarte, calzas de velludo para las fiestas, con sus pantuflos de lo mesmo, y los días de entresemana se honraba con su *vellorí de lo más fino*.',
].join('\n\n');

/** Every line of the document's pages: flow blocks, floats and the lines
 *  of resource blocks (captions, cells), with the block they belong to. */
function everyLine(doc: VDTDocument): { line: VDTLine; block: VDTBlock }[] {
  const out: { line: VDTLine; block: VDTBlock }[] = [];
  const visit = (value: unknown, block: VDTBlock | undefined): void => {
    if (Array.isArray(value)) {
      for (const v of value) visit(v, block);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const o = value as Record<string, unknown>;
    const owner = typeof o.type === 'string' && Array.isArray(o.lines) && 'bbox' in o ? (o as unknown as VDTBlock) : block;
    if (Array.isArray(o.lines)) {
      for (const l of o.lines as unknown[]) {
        const line = l as VDTLine;
        if (line && typeof line.text === 'string' && line.bbox && owner) out.push({ line, block: owner });
      }
    }
    for (const [key, v] of Object.entries(o)) if (key !== 'lines' && key !== 'config') visit(v, owner);
  };
  visit(doc.pages, undefined);
  return out;
}

const COMPOSER_FIELDS = ['tracking', 'inkOffset', 'inkScale', 'hangs', 'autospace', 'ruby', 'warichu'] as const;
const painted = (s: VDTLineSegment): boolean => s.kind !== 'space' && s.kind !== 'math' && s.kind !== 'swatch' && !s.chip;

describe('a Latin page and the CJK features', () => {
  beforeEach(() => {
    calls.hasCJK = 0;
  });

  it('paints on the canvas with one CJK test per line, not one per word', () => {
    const doc = buildDocument({ markdown: QUIJOTE }, config());
    const lines = everyLine(doc);
    const words = lines.reduce((n, { line }) => n + (line.segments ?? []).filter(painted).length, 0);
    expect(words).toBeGreaterThan(3 * lines.length);
    calls.hasCJK = 0;
    const { canvas, texts, sets } = recordingCanvas();
    for (const page of doc.pages) renderPageToCanvas(page, doc, canvas);
    expect(calls.hasCJK).toBeLessThanOrEqual(lines.length);
    // Every word one `fillText`, and the tracking never touched.
    expect(texts.length).toBeGreaterThanOrEqual(words - lines.length);
    expect(sets).not.toContain('letterSpacing');
  });

  it('renders HTML with one CJK test per line, not one per word', () => {
    const doc = buildDocument({ markdown: QUIJOTE }, config());
    const lines = everyLine(doc);
    calls.hasCJK = 0;
    const html = renderToHtml(doc);
    expect(calls.hasCJK).toBeLessThanOrEqual(lines.length);
    expect(html).not.toContain('text-spacing-trim');
  });

  it('measures a Latin paragraph with one CJK test, not one per word', () => {
    const spans = [
      { text: 'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, ', bold: false, italic: false },
      { text: 'no ha mucho tiempo', bold: true, italic: false },
      { text: ' que vivía un hidalgo de los de lanza en astillero, adarga antigua, rocín flaco y galgo corredor.', bold: false, italic: false },
    ];
    const measure = () => measureRichBlock(spans, '16px Test', 'bold 16px Test', 'italic 16px Test', 'bold italic 16px Test', 200, 20, { textAlign: 'justify', optimal: true });
    // The words' widths cached first: a width measured for the first time
    // is looked at for CJK marks that meet (`measureTextWidth`).
    measure();
    calls.hasCJK = 0;
    expect(measure().lines.length).toBeGreaterThan(3);
    expect(calls.hasCJK).toBeLessThanOrEqual(2);
  });

  it('leaves a line set word by word without the fields only the CJK composer sets', () => {
    const markdown = [
      '# Capítulo',
      '',
      ':::toc',
      '',
      '## Uno',
      '',
      'Una línea latina cita 紅樓夢 y “end.”“Yes” con marcas que se tocan, :tcy[12] y :dots[punto].',
      '',
      '賈寶玉{紅樓|hóng|lóu}夢，一個latin詞。說：「此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去。」',
      '',
      '此開卷第一回也。作者自云：因曾歷過一番夢幻之後，故將真事隱去，而借「通靈」之說，撰此《石頭記》一書也。',
      '',
      QUIJOTE,
    ].join('\n');
    const doc = buildDocument({ markdown }, config({
      locale: 'es',
      cjk: { hangingPunctuation: 'force' },
      toc: { leader: { enabled: true, char: '・' } },
    } as Partial<PostextConfig>));
    const lines = everyLine(doc);
    expect(lines.some(({ line }) => line.cjkComposed)).toBe(true);
    expect(lines.some(({ line }) => !line.cjkComposed && hasCJK(line.text))).toBe(true);
    for (const { line, block } of lines) {
      if (line.cjkComposed) continue;
      for (const seg of line.segments ?? []) {
        for (const field of COMPOSER_FIELDS) expect(seg[field], `${field} on "${line.text}"`).toBeUndefined();
        // The line's text holds the text of every painted segment, but for
        // the leader of a contents entry: a segment with CJK text sits on a
        // line whose text holds CJK text.
        if (painted(seg) && hasCJK(seg.text) && block.tocEntry === undefined) {
          expect(hasCJK(line.text), `"${seg.text}" on "${line.text}"`).toBe(true);
        }
      }
    }
  });

  it('hangs no mark when the document does not hang them, so the clip needs no look at the lines', () => {
    // Ten characters and a comma, again and again: at some measure a
    // comma meets the end of a line.
    const markdown = '一二三四五六七八九十，'.repeat(24);
    const hungAt = (hangingPunctuation: 'none' | 'force', width: number) => {
      const doc = buildDocument({ markdown }, config({
        locale: 'zh-Hans',
        page: { width: pt(width), height: pt(420), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
        cjk: { hangingPunctuation },
      } as Partial<PostextConfig>));
      return { doc, hung: everyLine(doc).filter(({ line }) => line.segments?.some((s) => s.hangs)).length };
    };
    const widths = [183, 193, 203, 213, 223, 233, 243];
    expect(widths.some((w) => hungAt('force', w).hung > 0)).toBe(true);
    for (const w of widths) {
      const { doc, hung } = hungAt('none', w);
      expect(hung).toBe(0);
      for (const col of doc.pages[0]!.columns) expect(columnClipRect(col, 72, false)).toEqual(columnClipRect(col, 72));
    }
  });
});
