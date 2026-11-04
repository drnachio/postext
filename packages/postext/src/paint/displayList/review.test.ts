import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { leaderRuleGeometry } from '../../vdt/flowFrames.js';
import type { PostextConfig, Resource, TableCell, VDTBlock, VDTDocument } from '../../index.js';
import { documentDisplayList, pageDisplayList } from './index.js';
import { blockItems } from './blocks.js';
import { IDENTITY } from './frame.js';
import type { DisplayItem, DisplayPage } from './types.js';

// Deterministic stub: every character is 7 px wide.
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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
type TextItem = Extract<DisplayItem, { kind: 'text' }>;
type TableItem = Extract<DisplayItem, { kind: 'table' }>;
const textItems = (pages: DisplayPage[]): TextItem[] => pages.flatMap((p) => p.items.filter((i): i is TextItem => i.kind === 'text'));
const textOf = (item: TextItem): string => item.lines.map((l) => l.text).join('');

const LOREM = 'Typesetting is the composition of text by means of arranging physical type or its digital equivalents, and long words get hyphenated at the end of lines.';

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

const picture = (id: string, caption: string): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', caption, createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.jpg`, format: 'jpeg', width: 300, height: 100 },
}) as Resource;

describe('display list review fixes (#1388)', () => {
  it('maps a footnote\'s first character, the number and gap to nothing', () => {
    const md = `Plain note[^a] and marked note[^b] here.\n\n${LOREM}\n\n[^a]: The plain note.\n\n[^b]: *Emphatic* note.\n`;
    const pages = documentDisplayList(buildDocument({ markdown: md }, config()));
    const notes = textItems(pages).filter((i) => i.role === 'footnote');
    expect(notes).toHaveLength(2);
    for (const [note, word] of [[notes[0]!, 'The plain'], [notes[1]!, 'Emphatic']] as const) {
      const text = textOf(note);
      const at = text.indexOf(word[0]!);
      // Number and gap are generated; the text's first letter is its own.
      expect(at).toBeGreaterThan(0);
      for (let i = 0; i < at; i++) expect(note.source!.map[i]).toBe(-1);
      expect(note.source!.map[at]).toBe(md.indexOf(word));
      note.source!.map.forEach((off, i) => { if (off >= 0) expect(md[off]).toBe(text[i]); });
    }
  });

  it('sets a turned table on a vertical page across, as the PDF does', () => {
    const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });
    const res = {
      id: 't1', typeId: 'table', kind: 'table', caption: 'サービスと便益。', createdAt: 0, updatedAt: 0,
      table: { model: { headerRowCount: 1, rows: [[cell('項目', { isHeader: true }), cell('等級', { isHeader: true })], ...Array.from({ length: 3 }, (_, i) => [cell(`項目${i}`), cell('有')])] } },
      placement: { rotate: 'ccw' },
    } as unknown as Resource;
    const md = `あいうえおかきくけこ :ref{id="t1"} さしすせそたちつてと。\n\n${'なにぬねのはひふへほまみむめも。'.repeat(20)}`;
    const doc = buildDocument({ markdown: md, resources: [res] }, {
      locale: 'ja',
      page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single', writingMode: 'vertical-rl' },
      headings: { balancing: { enabled: false } },
      header: { elements: [] },
      footer: { elements: [] },
    } as PostextConfig);
    const at = doc.pages.findIndex((p) => [...(p.floats ?? []), ...p.columns.flatMap((c) => c.blocks)].some((b) => b.resourceBlock?.rotation));
    expect(at).toBeGreaterThanOrEqual(0);
    const dl = pageDisplayList(doc, at);
    expect(dl.vertical).toBe(true);
    const table = dl.items.find((i): i is TableItem => i.kind === 'table')!;
    const lines = table.cells.flatMap((c) => c.item?.lines ?? []);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.vertical).toBeUndefined();
    const caption = textItems([dl]).find((i) => i.role === 'caption')!;
    for (const l of caption.lines) expect(l.vertical).toBeUndefined();
  });

  it('maps a reference in a caption as an atom, never into the directive\'s letters', () => {
    const caption = 'Compare with :ref{id="figure-with-a-long-identifier-one"}, the first one.';
    const res = [picture('figure-with-a-long-identifier-one', 'First plate.'), picture('f2', caption)];
    const md = `See :ref{id="figure-with-a-long-identifier-one"} and :ref{id="f2"} here.\n\n${LOREM}`;
    const pages = documentDisplayList(buildDocument({ markdown: md, resources: res }, config()));
    const item = textItems(pages).find((i) => i.role === 'caption' && i.source?.resource?.resourceId === 'f2')!;
    const text = textOf(item);
    const atom = item.source!.atoms!.find((a) => a.kind === 'ref')!;
    expect(caption.slice(atom.start, atom.end)).toBe(':ref{id="figure-with-a-long-identifier-one"}');
    expect(item.source!.map[atom.at]).toBe(atom.start);
    // The placeholder's other letters map to nothing, the words after it
    // into the caption past the directive.
    const after = text.indexOf(', the first one.');
    for (let i = atom.at + 1; i < after; i++) expect(item.source!.map[i]).toBe(-1);
    for (let i = after; i < text.length; i++) {
      const off = item.source!.map[i]!;
      expect(off).toBeGreaterThanOrEqual(atom.end);
      expect(caption[off]).toBe(text[i]);
    }
  });

  it('paints the highlight bands of a caption under it', () => {
    const res = [picture('f1', 'A :mark[marked] caption.')];
    const md = `See :ref{id="f1"} here.\n\n${LOREM}`;
    const pages = documentDisplayList(buildDocument({ markdown: md, resources: res }, config()));
    const page = pages.find((p) => p.items.some((i) => i.kind === 'text' && i.role === 'caption'))!;
    const capAt = page.items.findIndex((i) => i.kind === 'text' && i.role === 'caption');
    const caption = page.items[capAt] as TextItem;
    const band = page.items.slice(0, capAt).find((i): i is Extract<DisplayItem, { kind: 'rect' }> => i.kind === 'rect' && i.fill !== undefined && i.rect.y >= caption.bbox.y - 1);
    expect(band).toBeDefined();
    const run = caption.lines.flatMap((l) => l.runs).find((r) => r.text.includes('marked'))!;
    expect(band!.rect.x).toBeLessThanOrEqual(run.x + 0.5);
    expect(band!.rect.x + band!.rect.width).toBeGreaterThanOrEqual(run.x + run.width - 0.5);
  });

  it('places a body highlight band under its words', () => {
    const md = 'Some words with a :mark[marked phrase] in the line.';
    // Ragged: the band is where the PDF fills it, from the line's start.
    const dl = pageDisplayList(buildDocument({ markdown: md }, config({ bodyText: { textAlign: 'left', firstLineIndent: mm(0) } } as Partial<PostextConfig>)), 0);
    const band = dl.items.find((i): i is Extract<DisplayItem, { kind: 'rect' }> => i.kind === 'rect')!;
    const line = textItems([dl])[0]!.lines[0]!;
    const words = line.runs.filter((r) => r.text === 'marked' || r.text === 'phrase');
    expect(words).toHaveLength(2);
    // The band pads the phrase a little either side.
    expect(band.rect.x).toBeLessThanOrEqual(words[0]!.x);
    expect(band.rect.x).toBeGreaterThan(words[0]!.x - 3);
    expect(band.rect.x + band.rect.width).toBeGreaterThanOrEqual(words[1]!.x + words[1]!.width);
    expect(band.rect.x + band.rect.width).toBeLessThan(words[1]!.x + words[1]!.width + 3);
    expect(band.rect.y).toBeLessThan(line.baseline);
    expect(band.rect.y + band.rect.height).toBeGreaterThan(line.baseline);
  });

  it('draws a rule leader at the block\'s size and colour', () => {
    const cfg = config({ bodyText: { textAlign: 'left', firstLineIndent: mm(0), color: { hex: '#336699' }, tabStops: [{ position: 'end', leader: 'rule', leaderGap: pt(7) }] } } as Partial<PostextConfig>);
    const doc: VDTDocument = buildDocument({ markdown: 'Name: :tab' }, cfg);
    const block = doc.pages[0]!.columns[0]!.blocks[0]!;
    const seg = block.lines[0]!.segments!.find((s) => s.leader === 'rule')!;
    const dl = pageDisplayList(doc, 0);
    const rule = dl.items.find((i): i is Extract<DisplayItem, { kind: 'rule' }> => i.kind === 'rule')!;
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(block.fontString)![1]);
    const { dy, thickness } = leaderRuleGeometry(size);
    expect(rule.color).toBe(block.color);
    expect(rule.widthPx).toBeCloseTo(thickness, 6);
    expect(rule.y1).toBeCloseTo(block.lines[0]!.baseline + dy, 6);
    expect(rule.x2 - rule.x1).toBeCloseTo(seg.width, 6);
  });

  it('tells a ragged right-to-left line\'s alignment as it stands on the sheet', () => {
    const md = 'هذا نص عربي فيه كلمات English words here ثم يعود النص العربي إلى مجراه مع كلمات كثيرة تملأ عدة أسطر من العمود الواحد وتستمر.\n\n1. البند الأول\n';
    const doc = buildDocument({ markdown: md }, config({ locale: 'ar', direction: 'rtl' } as Partial<PostextConfig>));
    const dl = pageDisplayList(doc, 0);
    const body = textItems([dl]).find((i) => i.role === 'body')!;
    const last = body.lines[body.lines.length - 1]!;
    expect(last.align).toBe('right');
    // It ends at the sheet's right edge of its measure.
    expect(Math.max(...last.runs.map((r) => r.x + r.width))).toBeCloseTo(last.x + last.width, 3);
    expect(body.lines[0]!.align).toBe('justify');
    const marker = textItems([dl]).find((i) => i.role === 'marker')!;
    expect(marker.lines[0]!.align).toBe('right');
  });

  it('gives reference runs their target', () => {
    const md = `See :ref{id="f1"} here.\n\n${LOREM}`;
    const pages = documentDisplayList(buildDocument({ markdown: md, resources: [picture('f1', 'A plate.')] }, config()));
    const run = textItems(pages).flatMap((i) => i.lines.flatMap((l) => l.runs)).find((r) => r.refTarget)!;
    expect(run.refTarget).toEqual({ id: 'f1' });
  });

  it('centres a list separator of its own size on the marker\'s mid line', () => {
    const block = {
      id: 'x', type: 'listItem', bbox: { x: 40, y: 0, width: 200, height: 20 }, fontString: '16px Serif', color: '#000000',
      lines: [{ text: 'Item', baseline: 16, bbox: { x: 40, y: 0, width: 28, height: 20 } }],
      bulletText: '1', bulletFontString: '16px Serif', bulletOffsetX: 20, bulletY: 11,
      separatorText: ')', separatorX: 29, separatorFontString: '10px Serif',
    } as unknown as VDTBlock;
    const doc = { config: { page: { dpi: 72 } } } as unknown as VDTDocument;
    const marker = blockItems(block, { doc, frame: IDENTITY, vertical: false, options: undefined }).find((i): i is TextItem => i.kind === 'text' && i.role === 'marker')!;
    const [num, sep] = marker.lines[0]!.runs;
    expect(marker.lines[0]!.baseline).toBeCloseTo(11 + 16 * 0.3, 6);
    expect(num!.baselineShift).toBeUndefined();
    // Its baseline sits at midY + 0.3 × its own size: higher than the number's.
    expect(marker.lines[0]!.baseline - sep!.baselineShift!).toBeCloseTo(11 + 10 * 0.3, 6);
  });
});
