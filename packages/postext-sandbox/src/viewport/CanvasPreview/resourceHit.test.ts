import { describe, expect, it } from 'vitest';
import type { VDTDocument } from 'postext';
import { mapInlineSnippet } from 'postext';
import {
  contentOffsetToPlain,
  plainToContentOffset,
  resolveResourceRun,
  resourceTextAtPixel,
  stampRunPlainRanges,
  xForPlainInResourceLine,
} from './resourceHit';

type VDTBlock = VDTDocument['blocks'][number];
type VDTLine = VDTBlock['lines'][number];
type VDTSegment = NonNullable<VDTLine['segments']>[number];
type ResolvedResourceBlock = NonNullable<VDTBlock['resourceBlock']>;
type Cell = NonNullable<ResolvedResourceBlock['table']>['cells'][number];

const REF = '⁣';
const word = (text: string, width: number, extra: Partial<VDTSegment> = {}): VDTSegment =>
  ({ kind: 'text', text, width, ...extra }) as VDTSegment;
const space = (text = ' ', width = 5, extra: Partial<VDTSegment> = {}): VDTSegment =>
  ({ kind: 'space', text, width, ...extra }) as VDTSegment;
const line = (x: number, y: number, segments: VDTSegment[]): VDTLine =>
  ({
    text: segments.map((s) => s.text).join(''),
    bbox: { x, y, width: segments.reduce((w, s) => w + s.width, 0), height: 20 },
    baseline: y + 16,
    hyphenated: false,
    segments,
    isLastLine: true,
  }) as VDTLine;
const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

// Cell (0,0): `**bold** text`  → plain "bold text"
// Cell (0,1): `see :ref{id="r"} now` → plain "see ⁣ now" (ref renders "Table 1")
// Cell (1,0): `alpha beta` over two lines
// Cell (1,1): empty
const C00 = '**bold** text';
const C01 = 'see :ref{id="r"} now';
const C10 = 'alpha beta';
const CAPTION = 'Caption here';

const cells: Cell[] = [
  { row: 0, col: 0, colSpan: 1, rowSpan: 1, isHeader: false, align: 'left', verticalAlign: 'top',
    rect: rect(10, 10, 100, 20), lines: [line(10, 10, [word('bold', 40, { bold: true }), space(), word('text', 40)])] },
  { row: 0, col: 1, colSpan: 1, rowSpan: 1, isHeader: false, align: 'left', verticalAlign: 'top',
    rect: rect(120, 10, 150, 20),
    lines: [line(120, 10, [word('see', 30), space(), word('Table 1', 70, { refResourceId: 'r' }), space(), word('now', 30)])] },
  { row: 1, col: 0, colSpan: 1, rowSpan: 1, isHeader: false, align: 'left', verticalAlign: 'top',
    rect: rect(10, 40, 100, 40), lines: [line(10, 40, [word('alpha', 50)]), line(10, 60, [word('beta', 40)])] },
  { row: 1, col: 1, colSpan: 1, rowSpan: 1, isHeader: false, align: 'left', verticalAlign: 'top',
    rect: rect(120, 40, 150, 40), lines: [] },
];

const captionLine = line(10, 100, [
  word('Table', 50, { captionLabel: true }), space(' ', 5, { captionLabel: true }),
  word('1.', 15, { captionLabel: true }), space(' ', 5, { captionLabel: true }),
  word('Caption', 70), space(), word('here', 40),
]);

const rb = {
  resource: {
    id: 't', typeId: 'table', kind: 'table', caption: CAPTION, createdAt: 0, updatedAt: 0,
    table: { model: { rows: [[{ content: C00 }, { content: C01 }], [{ content: C10 }, { content: '' }]] } },
  },
  kind: 'table',
  bodyRect: rect(0, 0, 260, 80),
  captionLines: [captionLine],
  noteLines: [],
  table: { cells },
} as unknown as ResolvedResourceBlock;

const block = {
  type: 'resource', pageIndex: 0, bbox: rect(10, 10, 260, 120), lines: [], resourceBlock: rb,
} as unknown as VDTBlock;
const doc = { pages: [{ index: 0, floats: [] }], blocks: [block] } as unknown as VDTDocument;

describe('resourceTextAtPixel', () => {
  it('skips the `**` markers of a bold cell', () => {
    // 1px into "text": x = 10 + 40 + 5 + 1.
    const hit = resourceTextAtPixel(doc, 0, 56, 20);
    expect(hit).toEqual({ resourceId: 't', target: { kind: 'cell', row: 0, col: 0 }, offset: C00.indexOf('text') });
  });

  it('counts an inline :ref as one plain char', () => {
    // 1px into "now": x = 120 + 30 + 5 + 70 + 5 + 1.
    const hit = resourceTextAtPixel(doc, 0, 231, 20);
    expect(hit?.offset).toBe(C01.indexOf('now'));
    // Inside the ref label → the ref's `:`.
    expect(resourceTextAtPixel(doc, 0, 160, 20)?.offset).toBe(C01.indexOf(':ref'));
  });

  it('maps the caption prefix to offset 0 and the description to its chars', () => {
    expect(resourceTextAtPixel(doc, 0, 15, 110)).toEqual({ resourceId: 't', target: { kind: 'caption' }, offset: 0 });
    // 1px into "here": x = 10 + 50 + 5 + 15 + 5 + 70 + 5 + 1.
    expect(resourceTextAtPixel(doc, 0, 161, 110)?.offset).toBe(CAPTION.indexOf('here'));
  });

  it('finds the right line of a multi-line cell', () => {
    expect(resourceTextAtPixel(doc, 0, 11, 70)).toEqual({ resourceId: 't', target: { kind: 'cell', row: 1, col: 0 }, offset: C10.indexOf('beta') });
    expect(resourceTextAtPixel(doc, 0, 11, 50)?.offset).toBe(0);
  });

  it('returns offset 0 for an empty cell', () => {
    expect(resourceTextAtPixel(doc, 0, 150, 60)).toEqual({ resourceId: 't', target: { kind: 'cell', row: 1, col: 1 }, offset: 0 });
  });

  it('returns null outside every resource block', () => {
    expect(resourceTextAtPixel(doc, 0, 500, 500)).toBeNull();
  });
});

describe('reverse mapping (highlight x for a snippet offset)', () => {
  it('places the caption description after the label', () => {
    const run = resolveResourceRun(rb, { kind: 'caption' })!;
    const plain = contentOffsetToPlain(run.sourceMap, CAPTION.indexOf('here'));
    expect(xForPlainInResourceLine(run.lines[0]!, run.stamped[0]!, plain)).toBe(160);
    expect(xForPlainInResourceLine(run.lines[0]!, run.stamped[0]!, 0)).toBe(85);
  });

  it('round-trips a bold cell through plain ↔ content offsets', () => {
    const run = resolveResourceRun(rb, { kind: 'cell', row: 0, col: 0 })!;
    expect(run.plainText).toBe('bold text');
    const plain = contentOffsetToPlain(run.sourceMap, C00.indexOf('text'));
    expect(plain).toBe(5);
    expect(plainToContentOffset(run.sourceMap, C00.length, plain)).toBe(C00.indexOf('text'));
    expect(plainToContentOffset(run.sourceMap, C00.length, 99)).toBe(C00.length);
    expect(xForPlainInResourceLine(run.lines[0]!, run.stamped[0]!, plain)).toBe(55);
  });
});

describe('stampRunPlainRanges', () => {
  it('reconstructs per-line plain ranges across a line break', () => {
    const { text } = mapInlineSnippet(C10);
    const stamped = stampRunPlainRanges(cells[2]!.lines, text);
    expect(stamped).toEqual([
      { plainStart: 0, plainEnd: 5, segPlainLens: [5] },
      { plainStart: 6, plainEnd: 10, segPlainLens: [4] },
    ]);
  });

  it('gives caption-label segments no plain length', () => {
    const { text } = mapInlineSnippet(CAPTION);
    const [st] = stampRunPlainRanges([captionLine], text);
    expect(st).toEqual({ plainStart: 0, plainEnd: CAPTION.length, segPlainLens: [0, 0, 0, 0, 7, 1, 4] });
  });

  it('keeps a `\\n\\n` space token one-to-one', () => {
    const content = 'a\n\nb';
    const { text } = mapInlineSnippet(content);
    const l = line(0, 0, [word('a', 10), space('\n\n', 5), word('b', 10)]);
    expect(stampRunPlainRanges([l], text)).toEqual([{ plainStart: 0, plainEnd: 4, segPlainLens: [1, 2, 1] }]);
    expect(text.indexOf(REF)).toBe(-1);
  });
});
