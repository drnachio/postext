import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { createMeasurementCache } from '../measure';
import { DEFAULT_FOOTNOTES_CONFIG, resolveFootnotesConfig, stripFootnotesDefaults, stripConfigDefaults } from '../defaults';
import { collectConfigWarnings } from '../configWarnings';
import type { Dimension, PostextConfig } from '../types';
import type { VDTBlock, VDTDocument, VDTLine, VDTLineSegment } from '../vdt';
import { installSizedStub, stubCharWidth } from './vertical/stub';
import { renderPageToCanvas } from '../index';
import { renderToHtml } from '../html-backend';

// CJK characters and full-width forms 1 em, anything else ½ em (stub.ts).
installSizedStub();

const pt = (value: number): Dimension => ({ value, unit: 'pt' });
const EM = 10;
const KANA = 'わたくしはそのひとをつねにせんせいとよんでいたいだからここでもただせんせいとかくだけでほんみょうはうちあけない';
const kana = (n: number): string => KANA.repeat(n);

const base = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(300), dpi: 72, margins: { top: pt(30), right: pt(30), bottom: pt(30), left: pt(30) } },
  bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(18), textAlign: 'justify', firstLineIndent: pt(0) },
  headings: { balancing: { enabled: false } },
  layout: { layoutType: 'single' },
  locale: 'ja',
  ...extra,
});
const vertical = (extra: Partial<PostextConfig> = {}): PostextConfig =>
  base({ layout: { layoutType: 'single', writingMode: 'vertical-rl' }, ...extra });

function build(md: string, config: PostextConfig): VDTDocument {
  return buildDocument({ markdown: md }, config, createMeasurementCache());
}

const textBlocks = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.footnoteNote === undefined);
const notes = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.footnoteNote !== undefined);
const noteOf = (doc: VDTDocument, id: string): VDTBlock => notes(doc).find((b) => b.footnoteNote === id)!;
const lines = (doc: VDTDocument): VDTLine[] => textBlocks(doc).flatMap((b) => b.lines);
const markers = (doc: VDTDocument): VDTLineSegment[] => lines(doc).flatMap((l) => (l.segments ?? []).filter((s) => s.footnoteId !== undefined));
const markerOf = (doc: VDTDocument, id: string): VDTLineSegment => markers(doc).find((s) => s.footnoteId === id)!;
const sizeOf = (font: string): number => Number(/(\d*\.?\d+)px/.exec(font)![1]);

describe('Japanese footnote defaults (JLReq §4.2)', () => {
  it('sets endnotes with right markers in a vertical book', () => {
    const f = resolveFootnotesConfig(undefined, 'ja', 'vertical-rl');
    expect(f).toMatchObject({
      placement: 'chapterEnd',
      numbering: 'chapter',
      markerPosition: 'right',
      markerSize: { value: 0.7, unit: 'em' },
      markerTemplate: '（{n}）',
      numberGap: 'em',
      hangingIndent: { value: 2, unit: 'em' },
    });
    expect(f.separator.width).toBeCloseTo(1 / 3, 6);
  });

  it('sets page footnotes numbered per page in a horizontal book', () => {
    const f = resolveFootnotesConfig(undefined, 'ja-JP', 'horizontal-tb');
    expect(f).toMatchObject({ placement: 'column', numbering: 'page', markerPosition: 'superscript', hangingIndent: { value: 0, unit: 'em' } });
    expect(f.markerTemplate).toBeUndefined();
    expect(f.numberGap).toBeUndefined();
    expect(f.separator.width).toBeCloseTo(1 / 3, 6);
  });

  it('takes the fields the author sets, the endnote setting going with endnotes', () => {
    const f = resolveFootnotesConfig({ placement: 'column', markerTemplate: '{n}', markerPosition: 'superscript', separator: { width: 0.5 } }, 'ja', 'vertical-rl');
    expect(f).toMatchObject({ placement: 'column', numbering: 'chapter', markerPosition: 'superscript', hangingIndent: { value: 0, unit: 'em' } });
    expect(f.markerTemplate).toBeUndefined();
    expect(f.numberGap).toBeUndefined();
    expect(f.separator.width).toBe(0.5);
    expect(resolveFootnotesConfig({ placement: 'chapterEnd' }, 'ja', 'horizontal-tb')).toMatchObject({ numberGap: 'em', hangingIndent: { value: 2, unit: 'em' } });
    expect(resolveFootnotesConfig({ placement: 'spread' }, 'ja', 'vertical-rl')).toMatchObject({ placement: 'spread', numbering: 'spread', markerPosition: 'right' });
  });

  it('leaves every other document as it was', () => {
    for (const locale of [undefined, 'en', 'zh-Hans', 'zh-Hant', 'ar', 'ko']) {
      for (const mode of [undefined, 'horizontal-tb', 'vertical-rl'] as const) {
        expect(resolveFootnotesConfig(undefined, locale, mode)).toEqual(DEFAULT_FOOTNOTES_CONFIG);
        expect(resolveFootnotesConfig({ numbering: 'page' }, locale, mode)).toEqual({ ...DEFAULT_FOOTNOTES_CONFIG, numbering: 'page' });
      }
    }
    // The cjk region set by hand does not make a document Japanese.
    expect(build('本文。', vertical({ locale: 'zh-Hans', cjk: { region: 'japan' } })).config.footnotes).toEqual(DEFAULT_FOOTNOTES_CONFIG);
  });

  it('sizes side and right markers unless markerSize says otherwise', () => {
    expect(resolveFootnotesConfig({ markerPosition: 'side' }).markerSize).toEqual({ value: 0.6, unit: 'em' });
    expect(resolveFootnotesConfig({ markerPosition: 'right' }).markerSize).toEqual({ value: 0.7, unit: 'em' });
    expect(resolveFootnotesConfig({ markerPosition: 'side', markerSize: pt(5) }).markerSize).toEqual(pt(5));
    expect(resolveFootnotesConfig({ numberGap: 'em' }).numberGap).toBe('em');
    expect(resolveFootnotesConfig({ numberGap: 'en' }).numberGap).toBeUndefined();
  });

  it('strips against the document defaults, so an explicit value reads back', () => {
    expect(stripFootnotesDefaults({ placement: 'chapterEnd', markerTemplate: '（{n}）', markerPosition: 'right', numberGap: 'em' }, 'ja', 'vertical-rl')).toBeUndefined();
    expect(stripFootnotesDefaults({ placement: 'column', markerTemplate: '{n}', numberGap: 'en' }, 'ja', 'vertical-rl'))
      .toEqual({ placement: 'column', markerTemplate: '{n}' });
    expect(stripFootnotesDefaults({ numbering: 'chapter' }, 'ja', 'horizontal-tb')).toEqual({ numbering: 'chapter' });
    expect(stripFootnotesDefaults({ numbering: 'page' }, 'ja', 'horizontal-tb')).toBeUndefined();
    expect(stripFootnotesDefaults({ markerPosition: 'side', markerSize: { value: 0.6, unit: 'em' } })).toEqual({ markerPosition: 'side' });
    expect(stripFootnotesDefaults({ markerPosition: 'side', markerSize: { value: 1, unit: 'em' } })).toEqual({ markerPosition: 'side', markerSize: { value: 1, unit: 'em' } });
    // Not Japanese: as before.
    expect(stripFootnotesDefaults({ placement: 'column', markerTemplate: '{n}' }, 'zh', 'vertical-rl')).toBeUndefined();
    const stripped = stripConfigDefaults({ locale: 'ja', layout: { writingMode: 'vertical-rl' }, footnotes: { placement: 'column' } });
    expect(stripped.footnotes).toEqual({ placement: 'column' });
  });

  it('warns that a horizontal document sets spread notes at the column foot', () => {
    const warnings = collectConfigWarnings({ footnotes: { placement: 'spread' } });
    expect(warnings).toContainEqual({ kind: 'unknownConfigValue', path: 'footnotes.placement', value: 'spread', used: 'column' });
    expect(collectConfigWarnings({ layout: { writingMode: 'vertical-rl' }, footnotes: { placement: 'spread' } })).toEqual([]);
    expect(resolveFootnotesConfig({ placement: 'spread' }, 'en', 'horizontal-tb')).toMatchObject({ placement: 'column', numbering: 'page' });
  });
});

describe('side markers (合印 in the line gap)', () => {
  const md = `${kana(1)}先生[^a]と呼んでいた。${kana(1)}\n\n[^a]: 注の本文。`;
  const plain = `${kana(1)}先生と呼んでいた。${kana(1)}`;

  for (const mode of ['horizontal-tb', 'vertical-rl'] as const) {
    it(`takes no room in the line (${mode})`, () => {
      const cfg = base({ layout: { layoutType: 'single', writingMode: mode }, footnotes: { placement: 'column', markerPosition: 'side', markerTemplate: '{n}' } });
      const doc = build(md, cfg);
      const ref = build(plain, cfg);
      const a = markerOf(doc, 'a');
      expect(a.text).toBe('1');
      expect(a.sideMarker).toBeDefined();
      const run = a.sideMarker!.runs[0]!;
      expect(sizeOf(run.fontString)).toBeCloseTo(EM * 0.6, 3);
      // It ends where the character it marks ends, over the text.
      expect(run.dx).toBeCloseTo(-EM * 0.6 * (mode === 'vertical-rl' ? 1 : 0.5), 3);
      expect(run.dy).toBeLessThan(-EM * 0.88);
      // The text around it is set as without it.
      const withMarker = lines(doc).map((l) => l.segments!.reduce((w, s) => w + s.width, 0));
      expect(withMarker).toEqual(lines(ref).map((l) => l.segments!.reduce((w, s) => w + s.width, 0)));
      expect(lines(doc).map((l) => l.text.replace('1', ''))).toEqual(lines(ref).map((l) => l.text));
    });
  }

  it('is an opt-in for Latin text too, set by Knuth–Plass and the first-fit breaker alike', () => {
    const latin = 'The lantern must stay lit all night long, the keepers trimming its wick twice.[^w] Then the dawn came over the bay and the light went out.\n\n[^w]: At dusk and at midnight.';
    for (const textAlign of ['justify', 'left'] as const) {
      const doc = build(latin, base({ locale: 'en', bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(18), textAlign, firstLineIndent: pt(0) }, footnotes: { markerPosition: 'side' } }));
      const w = markerOf(doc, 'w');
      expect(w.width).toBe(0);
      expect(w.sideMarker!.runs[0]!.text).toBe('1');
    }
  });

  it('stays against the character it marks in a justified CJK line', () => {
    const doc = build(md, vertical({ footnotes: { placement: 'column', markerPosition: 'side' } }));
    const line = lines(doc).find((l) => l.segments!.some((s) => s.sideMarker))!;
    const segs = line.segments!;
    const i = segs.findIndex((s) => s.sideMarker);
    // The gap a justified line spreads after 生 follows the marker.
    expect(segs[i - 1]!.text.endsWith('生')).toBe(true);
    expect(segs[i - 1]!.tracking ?? 0).toBe(0);
    expect(segs[i]!.width).toBeGreaterThanOrEqual(0);
  });

  it('reports a line gap too narrow for it, as for ruby', () => {
    const doc = build(md, base({ bodyText: { fontFamily: 'Test Serif', fontSize: pt(EM), lineHeight: pt(12), textAlign: 'justify', firstLineIndent: pt(0) }, footnotes: { placement: 'column', markerPosition: 'side' } }));
    expect(doc.contentWarnings?.some((w) => w.kind === 'rubyExceedsLeading')).toBe(true);
    const wide = build(md, vertical({ footnotes: { placement: 'column', markerPosition: 'side' } }));
    expect(wide.contentWarnings?.some((w) => w.kind === 'rubyExceedsLeading') ?? false).toBe(false);
  });
});

describe('right markers (行右小書き)', () => {
  const md = `${kana(1)}先生[^a]と呼んでいた。\n\n[^a]: 注の本文。`;

  it('sets a reduced marker flush with the right side of a vertical line', () => {
    const doc = build(md, vertical({ footnotes: { placement: 'column', markerPosition: 'right', markerTemplate: '（{n}）' } }));
    const a = markerOf(doc, 'a');
    expect(a.text).toBe('（1）');
    const size = sizeOf(a.fontString!);
    expect(size).toBeCloseTo(EM * 0.7, 3);
    // Its em box ends at the line's right: moved across by the difference
    // of the two half-ems from the central axis.
    expect(a.baselineShift).toBeCloseTo(-(EM - size) * 0.88, 3);
    expect(a.width).toBeCloseTo(size * 3, 3);
    expect(a.sideMarker).toBeUndefined();
  });

  it('is a superscript in horizontal text', () => {
    const doc = build(md, base({ footnotes: { placement: 'column', markerPosition: 'right' } }));
    expect(markerOf(doc, 'a')).toMatchObject({ text: '1', script: 'sup' });
  });
});

describe('the marker and the text it marks', () => {
  it('never opens a line, and keeps a sentence-final 。 after it', () => {
    for (const markerPosition of ['side', 'right', 'superscript'] as const) {
      for (let k = 0; k < 24; k++) {
        const md = `${kana(1).slice(0, k)}先生[^a]。${kana(2)}\n\n[^a]: 注。`;
        const doc = build(md, vertical({ footnotes: { placement: 'column', markerPosition } }));
        for (const line of lines(doc)) {
          const first = line.segments!.find((s) => s.kind !== 'space')!;
          expect(first.footnoteId).toBeUndefined();
          expect(first.text.startsWith('。')).toBe(false);
        }
        expect(lines(doc).map((l) => l.text).join('')).toContain(`生${markerOf(doc, 'a').text}。`);
      }
    }
  });
});

describe('endnotes of a Japanese vertical book', () => {
  const md = `# 第一章\n\n${kana(2)}先生[^a]と呼んでいた。${kana(1)}二度目[^b]。\n\n[^a]: ${kana(2)}\n\n[^b]: 短い注。`;

  it('sets （1） markers and the notes after the chapter, a full em after the number, hung 2 note-ems', () => {
    const doc = build(md, vertical());
    expect(doc.config.footnotes.placement).toBe('chapterEnd');
    expect(markerOf(doc, 'a').text).toBe('（1）');
    expect(markerOf(doc, 'b').text).toBe('（2）');
    const note = noteOf(doc, 'a');
    expect(note.lines[0]!.text.startsWith('（1）　')).toBe(true);
    expect(note.lines.length).toBeGreaterThan(1);
    const noteEm = sizeOf(note.fontString);
    expect(note.lines[1]!.bbox.x - note.lines[0]!.bbox.x).toBeCloseTo(2 * noteEm, 3);
    // The note's number is on the line at the note's size.
    expect(note.lines[0]!.segments![0]!.script).toBeUndefined();
  });
});

/** Book text with notes cited on several pages: `per` paragraphs per
 *  page, each citing one note. */
function spreadBook(pages: number, per: number, noteText = '短い注。', textLength = 20): string {
  const out: string[] = [];
  let k = 0;
  for (let p = 0; p < pages; p++) {
    for (let i = 0; i < per; i++) {
      k++;
      out.push(`${kana(1).slice(0, textLength)}注${k}[^n${k}]。${kana(1).slice(0, textLength)}`);
    }
    out.push(':::pagebreak\n:::');
  }
  for (let i = 1; i <= k; i++) out.push(`[^n${i}]: ${noteText}`);
  return out.join('\n\n');
}

describe('sidenotes on the spread (傍注, placement: spread)', () => {
  const cfg = vertical({ footnotes: { placement: 'spread' } });

  it('sets the notes of both pages of a spread on its odd page, numbered per spread', () => {
    const doc = build(spreadBook(5, 2), cfg);
    const pageOfNote = new Map(notes(doc).map((b) => [b.footnoteNote!, b.pageIndex]));
    const pageOfMarker = new Map<string, number>();
    for (const b of textBlocks(doc)) for (const l of b.lines) for (const s of l.segments ?? []) if (s.footnoteId) pageOfMarker.set(s.footnoteId, b.pageIndex);
    for (const [id, cited] of pageOfMarker) {
      const book = cited + 1;
      // Page index 0 is book page 1, an odd page alone; 2-3, 4-5… spreads.
      expect(pageOfNote.get(id)).toBe(book % 2 === 0 ? cited + 1 : cited);
    }
    // Numbered per spread, in citation order.
    const bySpread = new Map<number, string[]>();
    for (const [id, cited] of [...pageOfMarker].sort((x, y) => x[1] - y[1])) {
      const spread = Math.floor((cited + 1) / 2);
      bySpread.set(spread, [...(bySpread.get(spread) ?? []), markerOf(doc, id).text]);
    }
    for (const nums of bySpread.values()) expect(nums).toEqual(nums.map((_, i) => `（${i + 1}）`));
    // A rule over them, ⅓ of the line length.
    const area = doc.pages[2]!.footnoteAreas![0]!;
    expect(area.rule!.width).toBeCloseTo(doc.pages[2]!.columns[0]!.bbox.width / 3, 3);
    expect(area.noteIds.length).toBe(4);
    expect(doc.pages[1]!.footnoteAreas ?? []).toEqual([]);
  });

  it('keeps a note on the even page when the odd one has no room left for it', () => {
    const long = kana(5);
    const doc = build(spreadBook(3, 3, long, 4), cfg);
    const evenNotes = notes(doc).filter((b) => (b.pageIndex + 1) % 2 === 0);
    expect(evenNotes.length).toBeGreaterThan(0);
    for (const page of doc.pages) {
      for (const col of page.columns) {
        // Notes never run past the foot of the column.
        const bottom = col.bbox.y + col.bbox.height;
        for (const area of page.footnoteAreas ?? []) if (area.columnIndex === col.index) expect(area.bbox.y).toBeGreaterThanOrEqual(bottom - 0.5);
      }
    }
  });

  it('keeps on the last even page the notes of a chapter ending there', () => {
    const md = `${kana(3)}\n\n:::pagebreak\n:::\n\n短い本文[^z]。\n\n[^z]: 最後の注。`;
    const doc = build(md, cfg);
    const note = noteOf(doc, 'z');
    expect(note).toBeDefined();
    const cited = textBlocks(doc).find((b) => b.lines.some((l) => l.segments?.some((s) => s.footnoteId === 'z')))!;
    expect(note.pageIndex).toBe(cited.pageIndex);
    expect((cited.pageIndex + 1) % 2).toBe(0);
  });
});

interface Call { op: string; args: unknown[]; font: string }

function recordingCanvas(): { canvas: HTMLCanvasElement; calls: Call[] } {
  const calls: Call[] = [];
  const target: Record<string | symbol, unknown> = { letterSpacing: '0px', font: '10px Test', fillStyle: '#000', textAlign: 'left', textBaseline: 'alphabetic' };
  const stack: Record<string | symbol, unknown>[] = [];
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key === 'save') return () => { stack.push({ ...t }); };
      if (key === 'restore') return () => { Object.assign(t, stack.pop() ?? {}); };
      if (key === 'measureText') {
        return (str: string) => {
          const em = Number(/(\d*\.?\d+)px/.exec(String(t.font))?.[1] ?? 10);
          let w = 0;
          for (const ch of str) w += stubCharWidth(ch, em);
          return { width: w };
        };
      }
      if (key in t) return t[key];
      return (...args: unknown[]) => { calls.push({ op: String(key), args, font: String(t.font) }); };
    },
    set(t, key, value) { t[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

describe('markers in the renderers', () => {
  const md = `先生[^a]と呼んでいた。\n\n[^a]: 注の本文。`;
  const bare = { header: { elements: [] }, footer: { elements: [] } };

  it('paints a side marker in the line gap on the canvas, never on the line', () => {
    const doc = build(md, base({ ...bare, footnotes: { placement: 'column', markerPosition: 'side', markerTemplate: '{n}' } }));
    const line = lines(doc)[0]!;
    const segs = line.segments!;
    const i = segs.findIndex((s) => s.sideMarker);
    const x = line.bbox.x + segs.slice(0, i).reduce((w, s) => w + s.width, 0);
    const run = segs[i]!.sideMarker!.runs[0]!;
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const ones = calls.filter((c) => c.op === 'fillText' && c.args[0] === '1');
    expect(ones).toHaveLength(1);
    expect(ones[0]!.font).toContain('6px');
    expect(ones[0]!.args[1]).toBeCloseTo(x + run.dx, 3);
    expect(ones[0]!.args[2]).toBeCloseTo(line.baseline + run.dy, 3);
  });

  it('paints the marker down a vertical page too', () => {
    const doc = build(md, vertical({ ...bare, footnotes: { placement: 'column', markerPosition: 'side', markerTemplate: '{n}' } }));
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    // The marker at its size; the only other 1 is the note's own number.
    const painted = calls.filter((c) => c.op === 'fillText' && c.args[0] === '1');
    expect(painted.map((c) => /(\d*\.?\d+)px/.exec(c.font)![1]).sort()).toEqual(['6', '8']);
  });

  it('sets the marker as read text inside its link in HTML, horizontal and vertical', () => {
    for (const cfg of [base(), vertical()]) {
      const doc = build(md, { ...cfg, footnotes: { placement: 'column', markerPosition: 'side', markerTemplate: '{n}' } });
      const html = renderToHtml(doc);
      const link = /<a [^>]*href="#[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(html.slice(html.indexOf('pt-line')));
      expect(link).not.toBeNull();
      expect(link![1]).toContain('>1<');
      expect(link![1]).not.toMatch(/aria-hidden="true"[^>]*><span[^>]*>1</);
    }
  });
});
