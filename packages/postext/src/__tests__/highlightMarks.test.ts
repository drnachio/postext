import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline/index.js';
import { parseInlineFormatting, stripInlineFormatting } from '../parse/inlineFormatting.js';
import { renderToHtml } from '../html-backend/html-backend.js';
import { computeSourceMap } from '../parse/sourceMapping.js';
import { resolveMarkStylesConfig, stripMarkStylesDefaults } from '../defaults/text/markStyles.js';
import type { PostextConfig } from '../types.js';
import type { VDTBlock, VDTDocument, VDTLine } from '../vdt.js';

// #888: an inline highlight mark, `:mark[text]{style="…"}`: ordinary text
// with a band behind it that follows each piece of the phrase on its line.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (more: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: pt(60), height: pt(400), margins: { top: pt(6), bottom: pt(6), left: pt(6), right: pt(6) } },
  layout: { layoutType: 'single' },
  bodyText: { textAlign: 'left', hyphenation: { enabled: false } },
  // Rounded ends, to tell the phrase's true ends from its cuts (the
  // default is square since #1149).
  markStyles: [{ id: 'mark', borderRadius: { value: 0.2, unit: 'em' } }],
  ...more,
});

const paragraph = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'paragraph')!;
const marked = (line: VDTLine) => (line.segments ?? []).filter((s) => s.mark).map((s) => s.text);

describe(':mark[…] (#888)', () => {
  it('parses into a mark range over the spans, the text unchanged', () => {
    const spans = parseInlineFormatting('A :mark[key **words** here]{style="hl"} and :mark[more].');
    expect(spans.map((s) => s.text).join('')).toBe('A key words here and more.');
    const ranges = spans.flatMap((s) => (s.links ?? []).map((l) => [s.text.slice(l.start, l.end), l.mark?.style, l.mark?.id, l.href]));
    expect(ranges).toEqual([['key ', 'hl', 0, ''], ['words', 'hl', 0, ''], [' here', 'hl', 0, ''], ['more', '', 1, '']]);
    // An empty or unclosed mark stays text; plain extraction drops the syntax.
    expect(parseInlineFormatting('no :mark[] x')[0]!.text).toBe('no :mark[] x');
    expect(stripInlineFormatting('A :mark[b [c](https://x.org)]{style="z"} d')).toBe('A b c d');
  });

  it('maps each character back to the source, past the markup', () => {
    const md = 'A :mark[mark **me**]{style="key"} also.';
    const plain = 'A mark me also.';
    const map = computeSourceMap(md, 0, md.length, plain);
    const src = (i: number) => md[map[i]!];
    expect(plain.split('').map((_, i) => src(i)).join('')).toBe(plain);
    expect(map[2]).toBe(md.indexOf('mark **'));
    expect(map[plain.indexOf('also')]).toBe(md.indexOf('also'));
  });

  it('keeps the layout of the text without the mark', () => {
    const text = 'The water cycle moves water between the sea, the air and the land.';
    const plain = buildDocument({ markdown: text }, config());
    const withMark = buildDocument({ markdown: 'The water cycle moves :mark[water between the sea, the air and the land]{style="key"}.' }, config());
    expect(paragraph(withMark).lines.map((l) => l.text)).toEqual(paragraph(plain).lines.map((l) => l.text));
    expect(paragraph(withMark).lines.map((l) => l.bbox)).toEqual(paragraph(plain).lines.map((l) => l.bbox));
  });

  it('breaks across lines: a band per piece, caps at the true start and end only', () => {
    const doc = buildDocument({ markdown: 'The water cycle moves :mark[water between the sea, the air and the land]. Then rain.' }, config());
    const lines = paragraph(doc).lines;
    const withBands = lines.filter((l) => l.highlights && l.highlights.length > 0);
    expect(withBands.length).toBeGreaterThan(1);
    const first = withBands[0]!.highlights![0]!;
    const last = withBands.at(-1)!.highlights![0]!;
    expect(first.radiusLeft).toBeGreaterThan(0);
    expect(first.radiusRight).toBe(0);
    expect(last.radiusLeft).toBe(0);
    expect(last.radiusRight).toBeGreaterThan(0);
    for (const l of withBands.slice(1, -1)) expect([l.highlights![0]!.radiusLeft, l.highlights![0]!.radiusRight]).toEqual([0, 0]);
    // The default style's colour; the band sits around the baseline.
    expect(first.color).toBe('#fff0a0');
    expect(first.y).toBeLessThan(0);
    expect(first.y + first.height).toBeGreaterThan(0);
    // The full stop glued to the phrase is not marked: the band ends at the
    // last letter plus the padding.
    const lastLine = withBands.at(-1)!;
    const seg = lastLine.segments!.find((s) => s.mark?.end)!;
    expect(seg.text).toBe('land.');
    expect(seg.mark).toMatchObject({ from: 0, to: 4 });
    // Words of the first piece, the band from the first marked word on.
    expect(marked(withBands[0]!)[0]).toBe('water');
  });

  it("decorationBreak 'clone' gives each line piece a whole band, the layout unchanged (#1101)", () => {
    const md = 'The water cycle moves :mark[water between the sea, the air and the land]{style="band"}. Then rain.';
    const styles = (decorationBreak?: 'slice' | 'clone') => config({ markStyles: [{ id: 'band', paddingX: pt(2), borderRadius: pt(3), ...(decorationBreak ? { decorationBreak } : {}) }] });
    const sliced = paragraph(buildDocument({ markdown: md }, styles()));
    const cloned = paragraph(buildDocument({ markdown: md }, styles('clone')));
    expect(cloned.lines.map((l) => l.bbox)).toEqual(sliced.lines.map((l) => l.bbox));
    const bands = (b: VDTBlock) => b.lines.flatMap((l) => l.highlights ?? []);
    const s = bands(sliced);
    const c = bands(cloned);
    expect(c.length).toBe(s.length);
    expect(c.length).toBeGreaterThan(1);
    // 2 pt and 3 pt at the default 300 dpi.
    const padX = (2 * 300) / 72;
    for (const [i, band] of c.entries()) {
      expect([band.radiusLeft, band.radiusRight]).toEqual([12.5, 12.5]);
      const cut = s[i]!;
      const grownLeft = cut.radiusLeft > 0 ? 0 : padX;
      const grownRight = cut.radiusRight > 0 ? 0 : padX;
      expect(band.x).toBeCloseTo(cut.x - grownLeft, 6);
      expect(band.width).toBeCloseTo(cut.width + grownLeft + grownRight, 6);
      expect([band.y, band.height]).toEqual([cut.y, cut.height]);
    }
    // One band per line piece in the HTML, each with both ends rounded.
    const html = renderToHtml(buildDocument({ markdown: md }, styles('clone')));
    const radii = [...html.matchAll(/background:#fff0a0;border-radius:([^;]+);/g)].map((m) => m[1]!.split(" "));
    expect(radii.length).toBe(c.length);
    for (const r of radii) expect(new Set(r).size).toBe(1);
  });

  it('takes its style from markStyles: colour, text colour, padding', () => {
    const doc = buildDocument({ markdown: 'A :mark[word]{style="pink"} here.' }, config({
      markStyles: [{ id: 'mark' }, { id: 'pink', background: { hex: '#ffc0cb', model: 'hex' }, color: { hex: '#330000', model: 'hex' }, paddingX: pt(0), borderRadius: pt(0) }],
    }));
    const line = paragraph(doc).lines[0]!;
    const band = line.highlights![0]!;
    expect(band.color).toBe('#ffc0cb');
    expect([band.radiusLeft, band.radiusRight]).toEqual([0, 0]);
    const seg = line.segments!.find((s) => s.text === 'word')!;
    expect(seg.color).toBe('#330000');
    // No padding: the band is the word's width (7 px a character).
    expect(band.width).toBeCloseTo(seg.width, 3);
    // An unknown style falls back to the first.
    const other = buildDocument({ markdown: 'A :mark[word]{style="nope"} here.' }, config());
    expect(paragraph(other).lines[0]!.highlights![0]!.color).toBe('#fff0a0');
  });

  it('is painted under the text in HTML', () => {
    const doc = buildDocument({ markdown: 'A :mark[word] here.' }, config());
    const html = renderToHtml(doc);
    const at = html.indexOf('background:#fff0a0');
    expect(at).toBeGreaterThan(0);
    expect(html.indexOf('word', at)).toBeGreaterThan(at);
  });

  it('marks text in table cells and captions', () => {
    const doc = buildDocument({
      markdown: '::resource{id="t"}',
      resources: [{ id: 't', typeId: 'table', kind: 'table', placement: { position: 'here' }, caption: 'The :mark[key] figures', table: { model: { rows: [[{ content: 'A :mark[cell]' }]] } }, createdAt: 0, updatedAt: 0 } as never],
    }, config());
    const rb = doc.blocks.find((b) => b.resourceBlock)!.resourceBlock!;
    expect(rb.captionLines.some((l) => l.highlights?.length)).toBe(true);
    expect(rb.table!.cells[0]!.lines.some((l) => l.highlights?.length)).toBe(true);
  });

  it('marks headings, list items and footnotes', () => {
    const doc = buildDocument({ markdown: '## A :mark[key] idea\n\n- an :mark[item]\n\nText.[^n]\n\n[^n]: A :mark[note].' }, config());
    const bands = (b: VDTBlock) => b.lines.some((l) => l.highlights?.length);
    expect(doc.blocks.filter((b) => b.type === 'heading').some(bands)).toBe(true);
    expect(doc.blocks.filter((b) => b.type === 'listItem').some(bands)).toBe(true);
    expect(doc.blocks.filter((b) => b.footnoteNote !== undefined).some(bands)).toBe(true);
  });

  it('follows right-to-left text: the true start is on the right', () => {
    const doc = buildDocument({ markdown: 'نص :mark[كلمة مهمة جدا في هذا السطر الطويل من النص العربي] بعد.' }, config({ locale: 'ar' }));
    const lines = paragraph(doc).lines.filter((l) => l.highlights?.length);
    expect(lines.length).toBeGreaterThan(1);
    // The first line's band starts (rounded) on its right end on the
    // sheet: the left of the flow frame of a mirrored page.
    const flow = doc.pages[0]!.flow as { mirror?: unknown } | undefined;
    const mirrored = flow?.mirror !== undefined;
    const ends = (h: { radiusLeft: number; radiusRight: number }) => (mirrored ? [h.radiusRight, h.radiusLeft] : [h.radiusLeft, h.radiusRight]);
    const [firstLeft, firstRight] = ends(lines[0]!.highlights![0]!);
    expect(firstRight).toBeGreaterThan(0);
    expect(firstLeft).toBe(0);
    const [lastLeft, lastRight] = ends(lines.at(-1)!.highlights![0]!);
    expect(lastLeft).toBeGreaterThan(0);
    expect(lastRight).toBe(0);
  });

  it('follows a right-to-left paragraph of a left-to-right book', () => {
    const doc = buildDocument({ markdown: ':::paragraphs{dir="rtl"}\nنص :mark[كلمة مهمة جدا في هذا السطر الطويل من النص العربي] بعد.\n:::' }, config());
    const lines = doc.blocks.filter((b) => b.type === 'paragraph').flatMap((b) => b.lines).filter((l) => l.highlights?.length);
    expect(lines.length).toBeGreaterThan(1);
    const first = lines[0]!.highlights![0]!;
    const last = lines.at(-1)!.highlights![0]!;
    expect([first.radiusLeft === 0, first.radiusRight > 0]).toEqual([true, true]);
    expect([last.radiusLeft > 0, last.radiusRight === 0]).toEqual([true, true]);
  });

  it('marks Chinese text, its own characters only', () => {
    const doc = buildDocument({ markdown: '水循环把:mark[水在海洋、空气和陆地之间]移动。' }, config({ locale: 'zh-Hans' }));
    const line = paragraph(doc).lines.find((l) => l.highlights?.length)!;
    expect(line).toBeDefined();
    const markedText = line.segments!.filter((s) => s.mark).map((s) => s.text).join('');
    expect(markedText).toContain('水在海洋');
    expect(markedText).not.toContain('移动');
  });

  it('warns of a style no markStyles entry declares, pointing at the mark', () => {
    const md = 'A :mark[word]{style="nope"} and :mark[two words]{style="mark"}.';
    const doc = buildDocument({ markdown: md }, config());
    const warned = (doc.contentWarnings ?? []).filter((w) => w.kind === 'unknownMarkStyle');
    expect(warned).toHaveLength(1);
    const w = warned[0]! as { style: string; sourceStart?: number; sourceEnd?: number };
    expect(w.style).toBe('nope');
    expect(md.slice(w.sourceStart, w.sourceEnd)).toBe(':mark[word]{style="nope"}');
  });

  it('resolves and strips its styles', () => {
    expect(resolveMarkStylesConfig(undefined)).toEqual([{ id: 'mark', name: 'Mark', background: { hex: '#fff0a0', model: 'hex' }, borderRadius: { value: 0, unit: 'em' }, paddingX: { value: 0.15, unit: 'em' }, paddingY: { value: 0.05, unit: 'em' }, decorationBreak: 'slice' }]);
    expect(stripMarkStylesDefaults([{ id: 'mark', name: 'Mark' }])).toBeUndefined();
    expect(stripMarkStylesDefaults([{ id: 'mark', decorationBreak: 'slice' }])).toBeUndefined();
    expect(stripMarkStylesDefaults([{ id: 'k', decorationBreak: 'clone' }])).toEqual([{ id: 'k', decorationBreak: 'clone' }]);
    expect(stripMarkStylesDefaults([{ id: 'k', background: { hex: '#fff0a0', model: 'hex' }, paddingTop: pt(1) }])).toEqual([{ id: 'k', paddingTop: pt(1) }]);
    expect(stripMarkStylesDefaults([])).toEqual([]);
  });
});
