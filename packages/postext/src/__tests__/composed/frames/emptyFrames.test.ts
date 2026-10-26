import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { layoutGroup, type GroupItem } from '../../../composed/groups.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, PostextConfig, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';

// Deterministic text measurement stub (no DOM in the node test env): seven
// px per character, whatever the face.
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
const DPI = 300;
const MM = DPI / 25.4;
const toMm = (v: number): number => v / MM;

const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), dpi: DPI, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
};
/** The content area's foot, in page px. */
const FOOT = (260 - 20) * MM;

const build = (md: string, templates: PageTemplate[]): VDTDocument =>
  buildDocument({ markdown: md }, { ...PAGE, pageTemplates: templates }, createMeasurementCache());
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frame = (doc: VDTDocument, name: string): VDTFrame => composedPage(doc).composed!.frames.find((f) => f.name === name)!;
type Overflow = Extract<ContentWarning, { kind: 'frameOverflow' }>;
const overflows = (doc: VDTDocument): Overflow[] => (doc.contentWarnings ?? []).filter((w): w is Overflow => w.kind === 'frameOverflow');
const words = (n: number, w = 'word'): string => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

/** An answer space: no content, its declared box is what it is for. */
const answer = (name: string, lines: number): FrameConfig => ({ name, optional: true, height: mm(8 * lines), minHeight: mm(8 * lines) });
/** The activity sheet of #911: boxes as tall as their text, answer spaces
 *  between them, in one stack. */
const sheet = (extra: Partial<Record<string, Partial<FrameConfig>>> = {}): PageTemplate => {
  const frames: FrameConfig[] = [
    { name: 'act-1', minHeight: mm(22), placement: { anchor: { to: 'container', edge: 'top-left' } } },
    answer('lineas-1', 3),
    { name: 'act-2', minHeight: mm(22) },
    { name: 'act-3', minHeight: mm(22) },
    answer('lineas-3', 2),
  ];
  return {
    id: 'ficha',
    frames: frames.map((f) => ({ ...f, ...extra[f.name] })),
    groups: [{ name: 'actividades', kind: 'stack', gap: mm(4.5), frames: frames.map((f) => f.name) }],
  };
};
const page = (n: [number, number, number]): string => [
  '::::page{template="ficha"}',
  ':::frame{slot="act-1"}', words(n[0], 'uno'), ':::',
  ':::frame{slot="act-2"}', words(n[1], 'dos'), ':::',
  ':::frame{slot="act-3"}', words(n[2], 'tres'), ':::',
  '::::',
].join('\n\n');

describe('a stack keeps its empty frames on the page (#911)', () => {
  it('the solver: when nothing yields, the frames nearest the foot give way first, never below their minimum', () => {
    const item = (name: string, want: number, extra: Partial<GroupItem> = {}): GroupItem => ({
      name, own: { x: 0, y: 0, width: 100, height: want }, want, min: 0, max: Infinity, minWidth: 0, maxWidth: Infinity,
      grow: 0, shrink: 0, priority: 0, pin: false, fixedHeight: false, ...extra,
    });
    const r = layoutGroup({
      kind: 'stack', box: { x: 0, y: 0, width: 100, height: 0 }, elastic: true, limit: { x: 0, y: 0, width: 100, height: 1000 },
      gap: 10, align: 'start', mmPx: MM, negotiate: true,
      items: [item('a', 300, { min: 100 }), item('b', 800, { min: 100 }), item('lines', 150, { min: 150, fixedHeight: true })],
    });
    // The answer space keeps its 150 at the foot; b is cut down to make room
    // for it (its content then overflows b, and the ladder treats it).
    expect(r.get('lines')).toEqual({ x: 0, y: 850, width: 100, height: 150 });
    expect(r.get('b')!.y + r.get('b')!.height).toBeCloseTo(840, 6);
    expect(r.get('a')!.height).toBe(300);
    // All at their minimum and still too tall: what does not fit is cut at
    // the foot, the last frames first.
    const tight = layoutGroup({
      kind: 'stack', box: { x: 0, y: 0, width: 100, height: 0 }, elastic: true, limit: { x: 0, y: 0, width: 100, height: 300 },
      gap: 0, align: 'start', mmPx: MM, negotiate: true,
      items: [item('a', 200, { min: 200 }), item('lines', 150, { min: 150, fixedHeight: true })],
    });
    expect(tight.get('lines')!.y + tight.get('lines')!.height).toBeLessThanOrEqual(300 + 1e-6);
    expect(tight.get('lines')!.height).toBe(100);
  });

  it('a box that grows makes room for the answer space under it: its text shrinks, the lines stay on the page', () => {
    // Before the fix act-3 shrank to the foot and lineas-3 stood below it.
    const doc = build(page([60, 60, 1100]), [sheet()]);
    const lines = frame(doc, 'lineas-3');
    expect(lines.rect.y + lines.rect.height).toBeLessThanOrEqual(FOOT + 0.5);
    expect(toMm(lines.rect.height)).toBeCloseTo(16, 3);
    expect(lines.overflowPx).toBe(0);
    const act3 = frame(doc, 'act-3');
    expect(act3.rect.y + act3.rect.height).toBeLessThanOrEqual(lines.rect.y + 0.5);
    // The ladder set act-3's text smaller to fit the room the lines leave.
    expect(act3.scale).toBeLessThan(1);
    expect(act3.overflowPx).toBe(0);
    expect(overflows(doc)).toEqual([]);
  });

  it('an answer space the page cannot hold is a frameOverflow, with proposals that do not take room from empty frames', () => {
    // Text that cannot shrink: everything at its minimum still runs past
    // the foot, so the last answer space is short.
    const fixedText = { fit: { shrinkText: false } };
    const doc = build(page([2600, 60, 60]), [sheet({ 'act-1': fixedText, 'act-2': fixedText, 'act-3': fixedText })]);
    const lines = frame(doc, 'lineas-3');
    expect(lines.rect.y).toBeLessThanOrEqual(FOOT + 0.5);
    expect(lines.rect.y + lines.rect.height).toBeLessThanOrEqual(FOOT + 0.5);
    const warned = overflows(doc).map((w) => w.frame);
    expect(warned).toContain('act-1');
    for (const w of overflows(doc)) {
      for (const p of w.proposals) {
        // lineas-1 holds no content: its minimum is its declared size, not
        // room to take.
        if (p.kind === 'lowerMin') expect(p.frame).not.toMatch(/^lineas/);
      }
    }
  });

  it('an empty frame squeezed below its declared height is reported as frameOverflow', () => {
    // act-1 pinned at a fixed tall height leaves the stack no room for the
    // answer spaces under it.
    const doc = build(page([60, 60, 60]), [sheet({ 'act-1': { height: mm(200), minHeight: mm(200), fit: { shrinkText: false } } })]);
    const lines = frame(doc, 'lineas-3');
    expect(lines.rect.y).toBeLessThanOrEqual(FOOT + 0.5);
    const w = overflows(doc).find((x) => x.frame === 'lineas-3');
    expect(w).toBeDefined();
    expect(w!.overflowMm).toBeGreaterThan(0);
    expect(lines.overflowPx).toBeGreaterThan(0);
  });
});
