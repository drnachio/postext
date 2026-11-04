import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig, Resource, VDTDocument } from '../../index.js';
import type { VDTChip } from '../../vdt/segments.js';
import { documentDisplayList } from './index.js';
import { chipRuns, swatchPaint } from './inline.js';
import { qrModulesItem } from './overlays.js';
import { slotItems, type SlotContext } from './design.js';
import { IDENTITY } from './frame.js';
import type { VDTDesignSlot, VDTDesignTextBlock } from '../../vdt/design.js';
import type { DisplayItem, DisplayPage, DisplayRun } from './types.js';

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
const pt = (value: number) => ({ value, unit: 'pt' as const });
type TextItem = Extract<DisplayItem, { kind: 'text' }>;

function config(over: Partial<PostextConfig> = {}): PostextConfig {
  return {
    page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
    layout: { layoutType: 'single' },
    headings: { balancing: { enabled: false } },
    header: { elements: [] },
    footer: { elements: [] },
    ...over,
  } as PostextConfig;
}

const build = (markdown: string, cfg: PostextConfig, resources?: Resource[]): VDTDocument => buildDocument({ markdown, ...(resources ? { resources } : {}) }, cfg);
const allRuns = (pages: DisplayPage[]): DisplayRun[] => pages.flatMap((p) => p.items.filter((i): i is TextItem => i.kind === 'text').flatMap((i) => i.lines.flatMap((l) => l.runs)));

const CHIP: VDTChip = {
  styleId: 'code', marginLeft: 1, marginRight: 1, boxWidth: 40, ascent: 9, descent: 3, paddingX: 2, borderWidth: 1, borderRadius: 2,
  background: '#eeeeee', borderColor: '#999999', color: '#aa0000',
  runs: [{ text: 'ab', fontString: '400 10px "Mono"', width: 14 }, { text: 'cd', fontString: '700 10px "Mono"', width: 16, bold: true }],
};

describe('inline chips and swatches in the display list (#1406)', () => {
  it('cuts a chip into its runs, each in its own face, filling the segment', () => {
    const run: DisplayRun = { text: 'abcd', x: 100, width: 42, fontString: '400 12px "Serif"', color: '#000000', textStart: 3 };
    const out = chipRuns(run, CHIP);
    expect(out.map((r) => r.text)).toEqual(['ab', 'cd']);
    expect(out.map((r) => r.fontString)).toEqual(['400 10px "Mono"', '700 10px "Mono"']);
    expect(out.map((r) => r.color)).toEqual(['#aa0000', '#aa0000']);
    expect(out.map((r) => r.textStart)).toEqual([3, 5]);
    // A bold face is the run's face, not emphasis to read back.
    expect(out[1]!.bold).toBeUndefined();
    expect(chipRuns({ ...run, bold: true }, CHIP).every((r) => r.bold)).toBe(true);
    // Gap, border and padding before the first run's words, the rest after
    // the last one's, told apart for writers that set the words.
    expect(out[0]!.width).toBe(1 + 1 + 2 + 14);
    expect(out[0]!.padStart).toBe(4);
    expect(out[0]!.padEnd).toBeUndefined();
    expect(out[1]!.padStart).toBeUndefined();
    expect(out[1]!.padEnd).toBe(142 - 118 - 16);
    expect(out[1]!.x).toBe(118);
    expect(out[1]!.x + out[1]!.width).toBe(142);
    expect(out[0]!.inline?.box).toEqual({ dx: 1, width: 40, ascent: 9, descent: 3, fill: '#eeeeee', stroke: '#999999', strokeWidthPx: 1, radius: 2 });
    expect(out[1]!.inline).toBeUndefined();
  });

  it('keeps one run when the chip runs do not spell its text', () => {
    const run: DisplayRun = { text: '⁠', x: 0, width: 20, fontString: '400 12px "Serif"', color: '#000000', textStart: 0 };
    const out = chipRuns(run, { ...CHIP, runs: [] });
    expect(out).toHaveLength(1);
    expect(out[0]!.inline?.kind).toBe('chip');
  });

  it('carries a swatch’s colour, ink and shape', () => {
    expect(swatchPaint({ color: '#ff0000' }, '#111111')).toEqual({ color: '#ff0000', ink: '#111111' });
    expect(swatchPaint({ color: '#ff0000', borderColor: '#00ff00', side: 6, radius: 3, borderWidth: 1 }, '#111111')).toEqual({ color: '#ff0000', ink: '#00ff00', side: 6, radius: 3, borderWidth: 1 });
  });

  it('sets inline code in the code face with its box, and a swatch with its colours', () => {
    const cfg = config({ chipStyles: [{ id: 'k', fontFamily: 'Test Mono', paddingX: pt(2) }] } as Partial<PostextConfig>);
    const pages = documentDisplayList(build('Press :chip[Enter]{style=k} and see :swatch{color="#ff0000"} red.', cfg));
    const runs = allRuns(pages);
    const chip = runs.find((r) => r.inline?.kind === 'chip')!;
    expect(chip).toBeDefined();
    expect(chip.text).toBe('Enter');
    expect(chip.fontString).toContain('Test Mono');
    expect(chip.inline!.box!.fill).toMatch(/^#/);
    expect(chip.inline!.box!.width).toBeGreaterThan(5 * 7);
    const swatch = runs.find((r) => r.inline?.kind === 'swatch')!;
    expect(swatch.inline!.swatch).toMatchObject({ color: '#ff0000' });
    expect(swatch.inline!.swatch!.ink).toBeTruthy();
  });
});

describe('chip runs on the sheet (#1406)', () => {
  const hex = (h: string) => ({ hex: h, model: 'hex' });
  const chipStyle = { id: 'k', fontFamily: 'Test Mono', paddingX: pt(2), background: hex('#eeeeee'), gap: pt(6) };

  it('colours each chip run by its own emphasis, as the painters do', () => {
    const cfg = config({ bodyText: { color: hex('#000000'), boldColor: hex('#cc0000'), fontSize: pt(10), lineHeight: pt(14) }, chipStyles: [chipStyle] } as unknown as Partial<PostextConfig>);
    const runs = allRuns(documentDisplayList(build('Press :chip[a **bold** c]{style=k} now.', cfg)));
    const first = runs.findIndex((r) => r.inline?.kind === 'chip');
    const parts = runs.slice(first, first + 3);
    expect(parts.map((r) => r.text)).toEqual(['a ', 'bold', ' c']);
    expect(parts.map((r) => r.color)).toEqual(['#000000', '#cc0000', '#000000']);
  });

  it('lays a mirrored chip’s box over its whole segment', () => {
    const cfg = config({ locale: 'ar', direction: 'rtl', bodyText: { firstLineIndent: mm(0) }, chipStyles: [chipStyle] } as unknown as Partial<PostextConfig>);
    for (const md of [':chip[abc]{style=k} نص عربي هنا.', 'نص :chip[abc]{style=k} عربي هنا.', 'نص :chip[a **b** c]{style=k} عربي.']) {
      const doc = build(md, cfg);
      const seg = doc.pages[0]!.columns[0]!.blocks[0]!.lines[0]!.segments!.find((s) => s.chip)!;
      const c = seg.chip!;
      const item = documentDisplayList(doc)[0]!.items.find((i): i is TextItem => i.kind === 'text' && i.role === 'body')!;
      const runs = item.lines[0]!.runs;
      const first = runs.findIndex((r) => r.inline?.kind === 'chip');
      const parts = runs.slice(first, first + c.runs.filter((r) => r.text).length);
      const right = Math.max(...parts.map((p) => p.x + p.width));
      const box = parts[0]!.inline!.box!;
      // The PDF mirrors the box with the page: its right edge sits the
      // gap margin in from the segment's sheet-right edge.
      expect(parts[0]!.x + box.dx + box.width, md).toBeCloseTo(right - c.marginLeft, 6);
    }
  });

  it('leaves an unmirrored chip’s box at its segment’s left plus its margin', () => {
    const cfg = config({ chipStyles: [chipStyle] } as unknown as Partial<PostextConfig>);
    const doc = build('Press :chip[a **b** c]{style=k} now.', cfg);
    const c = doc.blocks[0]!.lines[0]!.segments!.find((s) => s.chip)!.chip!;
    const chip = allRuns(documentDisplayList(doc)).find((r) => r.inline?.kind === 'chip')!;
    expect(chip.inline!.box!.dx).toBeCloseTo(c.marginLeft, 6);
  });
});

describe('QR codes and video overlays in the display list (#1406)', () => {
  it('draws a code’s dark modules as one path scaled to its box', () => {
    const item = qrModulesItem({ rows: ['10', '01'], moduleSize: 2, quietZone: 1 }, { x: 10, y: 20, width: 16, height: 16 }, '#000000')!;
    expect(item.kind).toBe('path');
    expect(item.fill).toBe('#000000');
    expect(item.subpaths).toHaveLength(2);
    // Side 8 px drawn at 16: modules at the quiet zone, doubled.
    expect(item.subpaths[0]![0]).toEqual({ op: 'M', x: 14, y: 24 });
    expect(item.subpaths[1]![0]).toEqual({ op: 'M', x: 18, y: 28 });
    expect(qrModulesItem({ rows: ['00'], moduleSize: 1, quietZone: 0 }, { x: 0, y: 0, width: 2, height: 2 }, '#000')).toBeNull();
  });

  it('emits a link note’s QR code after the note', () => {
    const cfg = config({ links: { print: 'notes', show: 'both', qr: { size: mm(15) } } } as Partial<PostextConfig>);
    const doc = build('You can reach [the official page](https://example.com/docs/start) for more.', cfg);
    const note = doc.blocks.find((b) => b.footnoteNote !== undefined)!;
    const qr = note.lines[0]!.qr!;
    const pages = documentDisplayList(doc);
    const paths = pages.flatMap((p) => p.items).filter((i): i is Extract<DisplayItem, { kind: 'path' }> => i.kind === 'path');
    expect(paths).toHaveLength(1);
    const box = paths[0]!.bbox;
    expect(box.x).toBeCloseTo(note.lines[0]!.bbox.x + qr.dx, 6);
    expect(box.width).toBeCloseTo(qr.side, 6);
    expect(paths[0]!.subpaths.length).toBeGreaterThan(10);
  });

  it('draws a video without a poster as a dark frame with its play mark and code', () => {
    const video: Resource = {
      id: 'talk', typeId: 'video', kind: 'video', caption: 'The talk.', createdAt: 0, updatedAt: 0,
      video: { source: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      placement: { position: 'here' },
    } as Resource;
    const pages = documentDisplayList(build('Intro.\n\n::resource{id="talk"}\n', config(), [video]));
    const items = pages.flatMap((p) => p.items);
    const frame = items.find((i) => i.kind === 'rect' && i.fill === '#1f1f1f');
    expect(frame).toBeDefined();
    const rb = items.indexOf(frame!);
    const after = items.slice(rb + 1);
    // The play disc and its triangle, the code's plate and modules.
    expect(after.filter((i) => i.kind === 'path').length).toBeGreaterThanOrEqual(2);
    expect(after.some((i) => i.kind === 'rect' && i.fill === '#ffffff')).toBe(true);
    expect(items.some((i) => i.kind === 'image')).toBe(false);
  });

  it('turns a video’s play mark and code with a turned body', () => {
    const turned = (rotate: 'ccw' | 'cw'): void => {
      const video = {
        id: 'talk', typeId: 'video', kind: 'video', caption: 'The talk.', createdAt: 0, updatedAt: 0,
        video: { source: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        placement: { rotate },
      } as Resource;
      const pages = documentDisplayList(build('See the talk :ref{id="talk"}.\n\nMore text.\n', config(), [video]));
      const items = pages.flatMap((p) => p.items);
      const frame = items.find((i): i is Extract<DisplayItem, { kind: 'rect' }> => i.kind === 'rect' && i.fill === '#1f1f1f')!;
      expect(frame, rotate).toBeDefined();
      const f = frame.rect;
      // Turned: taller than wide on the sheet.
      expect(f.height).toBeGreaterThan(f.width);
      const after = items.slice(items.indexOf(frame) + 1, items.indexOf(frame) + 5);
      const boxOf = (i: DisplayItem) => (i.kind === 'rect' ? i.rect : i.kind === 'path' ? i.bbox : undefined);
      const plate = after.find((i) => i.kind === 'rect' && i.fill === '#ffffff')!;
      const disc = after.find((i) => i.kind === 'path')!;
      for (const it of [plate, disc]) {
        const b = boxOf(it)!;
        expect(b.x).toBeGreaterThanOrEqual(f.x - 0.01);
        expect(b.y).toBeGreaterThanOrEqual(f.y - 0.01);
        expect(b.x + b.width).toBeLessThanOrEqual(f.x + f.width + 0.01);
        expect(b.y + b.height).toBeLessThanOrEqual(f.y + f.height + 0.01);
      }
      // The play mark at the frame's centre.
      const d = boxOf(disc)!;
      expect(d.y + d.height / 2).toBeCloseTo(f.y + f.height / 2, 0);
      expect(d.x + d.width / 2).toBeCloseTo(f.x + f.width / 2, 0);
    };
    turned('ccw');
    turned('cw');
  });
});

describe('design text in a vertical flow (#1406)', () => {
  const block: VDTDesignTextBlock = {
    kind: 'text', bbox: { x: 10, y: 20, width: 200, height: 30 }, fontString: '400 24px "Mincho"', color: '#000000', clip: false,
    lines: [{ text: 'こころ', xOffset: 0, baselineY: 44, width: 72 }],
  } as VDTDesignTextBlock;
  const slot: VDTDesignSlot = { bbox: { x: 0, y: 0, width: 300, height: 300 }, blocks: [block] };
  const ctx = (vertical: boolean): SlotContext => ({ frame: vertical ? [0, 1, -1, 0, 400, 0] : IDENTITY, uprightPictures: vertical, role: 'opener', generated: true, blockKey: 'k' });

  it('sets a horizontal block down the column of a vertical page', () => {
    const [item] = slotItems(slot, ctx(true)) as TextItem[];
    expect(item!.lines.every((l) => l.vertical)).toBe(true);
    // The flow's quarter turn is the line's, not a turned horizontal box.
    expect(item!.rotate).toBe(90);
  });

  it('leaves it horizontal on a horizontal page', () => {
    const [item] = slotItems(slot, ctx(false)) as TextItem[];
    expect(item!.lines.some((l) => l.vertical)).toBe(false);
  });
});
