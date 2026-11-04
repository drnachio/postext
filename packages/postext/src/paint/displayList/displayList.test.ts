import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig, Resource, VDTDocument } from '../../index.js';
import { documentDisplayList, pageDisplayList } from './index.js';
import type { DisplayItem, DisplayLine, DisplayPage } from './types.js';

// Deterministic stub: every character is 7 px wide, bold ones 8 px.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * (/bold|700/.test(this.font) ? 8 : 7) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });
type TextItem = Extract<DisplayItem, { kind: 'text' }>;

const LOREM = 'Typesetting is the composition of text by means of arranging physical type or its digital equivalents. Stored letters and other symbols are retrieved and ordered according to the language orthography for visual display. Characteristically a justified column of text is set with even spaces between words, and long compound words such as internationalization and representativeness get hyphenated at the end of lines.';

function config(over: Partial<PostextConfig> = {}): PostextConfig {
  return {
    page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
    layout: { layoutType: 'single' },
    bodyText: { textAlign: 'justify', firstLineIndent: mm(0), hyphenation: { enabled: true } },
    headings: { balancing: { enabled: false } },
    header: { elements: [] },
    footer: { elements: [] },
    ...over,
  } as PostextConfig;
}

function build(markdown: string, cfg: PostextConfig, resources?: Resource[]): VDTDocument {
  return buildDocument({ markdown, ...(resources ? { resources } : {}) }, cfg);
}

const textItems = (pages: DisplayPage[]): TextItem[] => pages.flatMap((p) => p.items.filter((i): i is TextItem => i.kind === 'text'));
const bodyItems = (pages: DisplayPage[]): TextItem[] => textItems(pages).filter((i) => ['body', 'heading', 'list', 'quote', 'footnote'].includes(i.role));
const runsEnd = (line: DisplayLine): number => Math.max(...line.runs.map((r) => r.x + r.width));
const runsStart = (line: DisplayLine): number => Math.min(...line.runs.map((r) => r.x));

/** Mapped characters of Markdown-sourced items are the source's own
 *  (atoms stand for their constructs and are checked apart). */
function expectMapsMatch(markdown: string, pages: DisplayPage[]): number {
  let checked = 0;
  for (const item of textItems(pages)) {
    if (!item.source || item.source.resource || item.source.generated) continue;
    const atomAt = new Set((item.source.atoms ?? []).map((a) => a.at));
    let base = 0;
    for (const line of item.lines) {
      expect(line.map.length).toBe(line.text.length);
      for (let i = 0; i < line.text.length; i++) {
        const off = line.map[i]!;
        if (off < 0 || atomAt.has(base + i)) continue;
        expect(markdown[off], `${JSON.stringify(line.text)}[${i}]`).toBe(line.text[i]);
        checked++;
      }
      base += line.text.length;
    }
    // The item's map is its lines' maps, in order.
    expect(item.source.map).toEqual(item.lines.flatMap((l) => l.map));
  }
  return checked;
}

/** Every line's runs lie in its measure, and a justified line fills it. */
function expectLinesConsistent(pages: DisplayPage[]): { justified: number } {
  let justified = 0;
  for (const item of bodyItems(pages)) {
    for (const line of item.lines) {
      if (line.runs.length === 0) continue;
      // The runs spell the line.
      expect(line.runs.map((r) => r.text).join('')).toBe(line.text);
      let at = 0;
      for (const r of line.runs) {
        expect(r.textStart).toBe(at);
        at += r.text.length;
      }
      expect(runsStart(line)).toBeGreaterThanOrEqual(line.x - 0.5);
      expect(runsEnd(line)).toBeLessThanOrEqual(line.x + line.width + 0.5);
      if (line.align === 'justify') {
        justified++;
        expect(Math.abs(runsStart(line) - line.x)).toBeLessThan(0.5);
        expect(Math.abs(runsEnd(line) - (line.x + line.width))).toBeLessThan(0.5);
        // Runs abut, each space at the justified width.
        const sorted = [...line.runs].sort((a, b) => a.x - b.x);
        for (let k = 1; k < sorted.length; k++) expect(Math.abs(sorted[k]!.x - (sorted[k - 1]!.x + sorted[k - 1]!.width))).toBeLessThan(0.01);
        for (const r of line.runs) if (r.space) expect(r.width).toBeCloseTo(line.spaceWidth!, 6);
      }
    }
  }
  return { justified };
}

describe('pageDisplayList (#1388)', () => {
  it('sets a single justified column with hyphenated lines', () => {
    const md = `# A heading\n\n${LOREM}\n\n${LOREM}`;
    const doc = build(md, config());
    const pages = documentDisplayList(doc);
    expect(pages).toHaveLength(doc.pages.length);
    expect(pages[0]!.width).toBe(doc.pages[0]!.width);
    const { justified } = expectLinesConsistent(pages);
    expect(justified).toBeGreaterThan(5);
    expect(expectMapsMatch(md, pages)).toBeGreaterThan(500);
    const lines = bodyItems(pages).flatMap((i) => i.lines);
    // A break inside a word: the added hyphen is painted and maps nowhere.
    const hyphenated = lines.filter((l) => l.addedHyphen);
    expect(hyphenated.length).toBeGreaterThan(0);
    for (const l of hyphenated) {
      expect(l.text.endsWith('-')).toBe(true);
      expect(l.map[l.map.length - 1]).toBe(-1);
    }
    // The last line of a paragraph is ragged.
    for (const l of lines.filter((x) => x.last)) expect(l.align).toBe('left');
    const heading = bodyItems(pages).find((i) => i.role === 'heading')!;
    expect(heading.level).toBe(1);
    expect(heading.source!.blockKey).toMatch(/^b\d+$/);
  });

  it('places runs at the measured segment widths when no measurer is given', () => {
    const md = LOREM;
    const doc = build(md, config({ bodyText: { textAlign: 'left', firstLineIndent: mm(0), hyphenation: { enabled: false } } } as Partial<PostextConfig>));
    const page = pageDisplayList(doc, 0);
    const block = doc.pages[0]!.columns[0]!.blocks[0]!;
    const item = bodyItems([page])[0]!;
    block.lines.forEach((vline, i) => {
      const line = item.lines[i]!;
      let x = vline.bbox.x;
      vline.segments!.forEach((seg, k) => {
        expect(line.runs[k]!.x).toBeCloseTo(x, 6);
        expect(line.runs[k]!.width).toBeCloseTo(seg.width, 6);
        x += seg.width;
      });
    });
  });

  it('joins word pieces through a measurer and keeps the justify rule', () => {
    const md = `${LOREM.replace('physical', '**phys**ical')}`;
    const doc = build(md, config());
    const measure = (text: string, font: string) => text.length * (/bold|700/.test(font) ? 8 : 7);
    const pages = documentDisplayList(doc, { measure });
    expectLinesConsistent(pages);
    expectMapsMatch(md, pages);
  });

  it('sets two columns, each line inside its own column', () => {
    const md = Array.from({ length: 6 }, () => LOREM).join('\n\n');
    const doc = build(md, config({ layout: { layoutType: 'double' } } as Partial<PostextConfig>));
    const pages = documentDisplayList(doc);
    expectLinesConsistent(pages);
    expect(expectMapsMatch(md, pages)).toBeGreaterThan(1000);
    const page = doc.pages[0]!;
    expect(page.columns.length).toBe(2);
    const items = bodyItems([pages[0]!]);
    const xs = new Set(items.map((i) => Math.round(i.bbox.x)));
    expect(xs.size).toBeGreaterThanOrEqual(2);
    // Each item is clipped to its column.
    for (const item of items) {
      expect(item.clip).toBeDefined();
      for (const line of item.lines) {
        expect(runsStart(line)).toBeGreaterThanOrEqual(item.clip!.x - 0.5);
        expect(runsEnd(line)).toBeLessThanOrEqual(item.clip!.x + item.clip!.width + 0.5);
      }
    }
  });

  it('sets a column-and-a-half page', () => {
    const md = Array.from({ length: 4 }, () => LOREM).join('\n\n');
    const doc = build(md, config({ layout: { layoutType: 'oneAndHalf' } } as Partial<PostextConfig>));
    const pages = documentDisplayList(doc);
    expectLinesConsistent(pages);
    expect(expectMapsMatch(md, pages)).toBeGreaterThan(500);
  });

  it('centres lines without their trailing tracking', () => {
    const md = 'A short centred line.\n\nAnother one, a little longer than the first.';
    const doc = build(md, config({ bodyText: { textAlign: 'center', firstLineIndent: mm(0) } } as Partial<PostextConfig>));
    const pages = documentDisplayList(doc);
    expectLinesConsistent(pages);
    for (const line of bodyItems(pages).flatMap((i) => i.lines)) {
      expect(line.align).toBe('center');
      const left = runsStart(line) - line.x;
      const right = line.x + line.width - runsEnd(line);
      expect(Math.abs(left - right)).toBeLessThan(0.5);
    }
    expectMapsMatch(md, pages);
  });

  it('mirrors a right-to-left page onto the sheet', () => {
    const md = 'هذا نص عربي قصير لتجربة الصفحة من اليمين إلى اليسار في المحرك مع كلمات كثيرة تملأ عدة أسطر من العمود الواحد.\n\nفقرة ثانية قصيرة.';
    const doc = build(md, config({ locale: 'ar', direction: 'rtl', bodyText: { textAlign: 'justify', firstLineIndent: mm(0) } } as Partial<PostextConfig>));
    const page = doc.pages[0]!;
    expect(page.flow?.writingMode).toBe('horizontal-tb');
    const dl = pageDisplayList(doc, 0);
    expect(dl.rtl).toBe(true);
    expectLinesConsistent([dl]);
    expectMapsMatch(md, [dl]);
    const block = page.columns[0]!.blocks[0]!;
    const item = bodyItems([dl])[0]!;
    // The block's box lands mirrored: flow x → page.width − x − width.
    expect(item.bbox.x).toBeCloseTo(page.width - block.bbox.x - block.bbox.width, 6);
    // The first line opens at the sheet's right: its first word stands
    // right of its last.
    const first = item.lines[0]!;
    const words = first.runs.filter((r) => !r.space && r.text.trim() !== '');
    expect(words[0]!.x).toBeGreaterThan(words[words.length - 1]!.x);
    expect(first.rtl).toBe(true);
  });

  it('gives footnote markers atoms and notes their own items', () => {
    const md = `Text with a note[^a] in the middle of it.\n\n${LOREM}\n\n[^a]: The note says something.\n`;
    const doc = build(md, config());
    const pages = documentDisplayList(doc);
    expectMapsMatch(md, pages);
    const items = textItems(pages);
    const body = items.find((i) => i.role === 'body' && i.source?.atoms?.some((a) => a.kind === 'footnote'))!;
    const atom = body.source!.atoms!.find((a) => a.kind === 'footnote')!;
    expect(md.slice(atom.start, atom.end)).toBe('[^a]');
    const run = body.lines.flatMap((l) => l.runs).find((r) => r.footnoteId === 'a')!;
    expect(run.script ?? (run.baselineShift ?? 0) > 0).toBeTruthy();
    const note = items.find((i) => i.role === 'footnote')!;
    expect(note.source!.blockKey).toBe('fna');
    const noteText = note.lines.map((l) => l.text).join('');
    expect(noteText).toContain('The note says');
    // The rule above the notes.
    expect(pages[0]!.items.some((i) => i.kind === 'rule')).toBe(true);
  });

  it('places a figure with its caption mapped into the resource', () => {
    const md = `See the plate :ref{id="f1"} below.\n\n${LOREM}`;
    const res: Resource = {
      id: 'f1', typeId: 'figure', kind: 'bitmap', caption: 'A *small* plate of type.', altText: 'Type', createdAt: 0, updatedAt: 0,
      bitmap: { fileId: 'f1.jpg', format: 'jpeg', width: 300, height: 200 },
    } as Resource;
    const doc = build(md, config(), [res]);
    const pages = documentDisplayList(doc);
    expectMapsMatch(md, pages);
    const all = pages.flatMap((p) => p.items);
    const image = all.find((i): i is Extract<DisplayItem, { kind: 'image' }> => i.kind === 'image')!;
    expect(image.fileId).toBe('f1.jpg');
    expect(image.alt).toBe('Type');
    const caption = textItems(pages).find((i) => i.role === 'caption')!;
    expect(caption.source!.resource).toEqual({ resourceId: 'f1', field: 'caption' });
    const text = caption.lines.map((l) => l.text).join('');
    expect(text).toMatch(/^Figure\s1/);
    // The label maps nowhere, the caption's words into the resource's text.
    expect(caption.source!.map[0]).toBe(-1);
    let mapped = 0;
    caption.source!.map.forEach((off, i) => {
      if (off < 0) return;
      expect(res.caption![off]).toBe(text[i]);
      mapped++;
    });
    expect(mapped).toBeGreaterThan(10);
    // The reference is an atom covering its directive.
    const ref = textItems(pages).flatMap((i) => i.source?.atoms ?? []).find((a) => a.kind === 'ref')!;
    expect(md.slice(ref.start, ref.end)).toBe(':ref{id="f1"}');
    // The caption sits under the picture.
    expect(caption.bbox.y).toBeGreaterThanOrEqual(image.rect.y + image.rect.height - 0.5);
  });
});
