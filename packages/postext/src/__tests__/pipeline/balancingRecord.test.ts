import { describe, it, expect } from 'vitest';
import { buildDocument, buildDocumentPass } from '../../pipeline/build';
import { balanceKey } from '../../pipeline/columnBalancing';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { PostextConfig, Resource } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env).
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

const LONG = 30_000;
const EPS = 0.01;
const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

const SENTENCE =
  'La composición tipográfica editorial exige columnas alineadas, rejilla base estable y márgenes consistentes en cada página del documento. ';
const paragraph = (sentences: number): string => SENTENCE.repeat(sentences).trim();

const blocksWith = (doc: VDTDocument): VDTBlock[] => doc.pages.flatMap((p) => [
  ...p.columns.flatMap((c) => c.blocks),
  ...(p.floats ?? []),
]).filter((b) => b.balancing !== undefined);

const LEVERS = new Set(['heading', 'listEnd', 'afterDisplay', 'afterFloat', 'trailingCallout', 'looseParagraph']);

describe('the VDT records which balancing lever fired (EF-32)', () => {
  /** Sections of headings and paragraphs over several two-column pages. */
  const sections = (): string => {
    const parts: string[] = ['# Documento de prueba', '', paragraph(6), ''];
    for (let i = 1; i <= 8; i++) {
      parts.push(`## Sección ${i}`, '', paragraph(5), '', paragraph(4), '');
      parts.push(`### Detalle ${i}`, '', paragraph(5), '', paragraph(3), '');
    }
    return parts.join('\n');
  };

  it('stamps the headings that took extra grid lines, and nothing when balancing is off', () => {
    const md = sections();
    const on = buildDocument({ markdown: md }, {}, createMeasurementCache());
    const off = buildDocument({ markdown: md }, { headings: { balancing: { enabled: false } } }, createMeasurementCache());
    expect(blocksWith(off)).toEqual([]);
    const stamped = blocksWith(on);
    expect(stamped.length).toBeGreaterThan(0);
    for (const b of stamped) for (const l of b.balancing!.levers) expect(LEVERS.has(l)).toBe(true);
    const headings = stamped.filter((b) => b.balancing!.levers.includes('heading'));
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) {
      expect(h.type).toBe('heading');
      // Whole grid lines, within the per-heading cap (4 by default).
      const lines = h.balancing!.spaceAbove / on.baselineGrid;
      expect(Math.abs(lines - Math.round(lines))).toBeLessThan(EPS);
      expect(lines).toBeGreaterThanOrEqual(1);
      expect(lines).toBeLessThanOrEqual(4 + EPS);
    }
  }, LONG);

  it('stamps a paragraph run a line long with the lines it gained and its tracking', () => {
    const parts: string[] = [];
    for (let i = 0; i < 30; i++) parts.push(paragraph(i % 5 === 0 ? 7 : 2), '');
    const doc = buildDocument(
      { markdown: parts.join('\n') },
      { headings: { balancing: { stretchAfterLists: false } } },
      createMeasurementCache(),
    );
    const loose = blocksWith(doc).filter((b) => b.balancing!.levers.includes('looseParagraph'));
    expect(loose.length).toBeGreaterThan(0);
    for (const b of loose) {
      expect(b.type).toBe('paragraph');
      expect(b.balancing!.extraLines).toBe(1);
      // Only the loose lever fired here: no room was added above.
      if (b.balancing!.levers.length === 1) expect(b.balancing!.spaceAbove).toBe(0);
      expect(b.balancing!.tracking).toBeGreaterThanOrEqual(0);
      // Tracking in the record ↔ letter spacing on the block.
      expect((b.letterSpacing ?? 0) > 0).toBe(b.balancing!.tracking! > 0);
    }
  }, LONG);

  it('stamps a box closing its column with the exact room it was pushed down by', () => {
    const SENT = 'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
    const filler = (n: number): string => SENT.repeat(n).trim();
    const md = [filler(16), '', ':::callout{title="Nota"}', filler(2), ':::', '', '## Sección', '', filler(9), '', filler(30)].join('\n');
    const page = (enabled: boolean): PostextConfig => ({
      headings: { balancing: { enabled } },
      page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
      layout: { layoutType: 'double' },
    });
    const plain = buildDocument({ markdown: md }, page(false), createMeasurementCache());
    const balanced = buildDocument({ markdown: md }, page(true), createMeasurementCache());
    const frame = (doc: VDTDocument) => doc.blocks.find((b) => b.type === 'callout')!;
    const rec = frame(balanced).balancing!;
    expect(rec.levers).toEqual(['trailingCallout']);
    expect(rec.spaceAbove).toBeCloseTo(frame(balanced).bbox.y - frame(plain).bbox.y, 2);
  }, LONG);

  describe('each spacing lever names where the room went (placement pass)', () => {
    /** A single-column page with balancing off: one pass, hints given. */
    const cfg: PostextConfig = {
      headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
      page: { width: mm(120), height: mm(200), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
      layout: { layoutType: 'single' },
      bodyText: { fontSize: pt(10), lineHeight: pt(14) },
    };
    const pass = (markdown: string, extra: Map<number, number>, config: PostextConfig = cfg, resources: Resource[] = []): VDTDocument =>
      buildDocumentPass({ markdown, resources }, config, createMeasurementCache(), undefined, { balanceExtraPx: extra }).doc;
    const blockOf = (doc: VDTDocument, text: string): VDTBlock =>
      doc.blocks.find((b) => b.lines.some((l) => (l.segments ?? []).map((s) => s.text).join('').includes(text)))!;

    it('heading', () => {
      const md = 'Opening words.\n\n## A heading\n\nText under it.';
      const plain = pass(md, new Map());
      const h = plain.blocks.find((b) => b.type === 'heading')!;
      const doc = pass(md, new Map([[h.contentIndex!, 2 * plain.baselineGrid]]));
      const rec = doc.blocks.find((b) => b.type === 'heading')!.balancing;
      expect(rec).toEqual({ levers: ['heading'], spaceAbove: 2 * plain.baselineGrid });
    });

    it('list end', () => {
      const md = 'Opening words.\n\n- one\n- two\n\nAfter the list.';
      const plain = pass(md, new Map());
      const after = blockOf(plain, 'After the list');
      const doc = pass(md, new Map([[after.contentIndex!, plain.baselineGrid]]));
      expect(blockOf(doc, 'After the list').balancing).toEqual({ levers: ['listEnd'], spaceAbove: plain.baselineGrid });
    });

    it('after a box', () => {
      const md = 'Opening words.\n\n:::callout{title="Note"}\nInside the box.\n:::\n\nAfter the box.';
      const plain = pass(md, new Map());
      const after = blockOf(plain, 'After the box');
      const doc = pass(md, new Map([[after.contentIndex!, plain.baselineGrid]]));
      expect(blockOf(doc, 'After the box').balancing).toEqual({ levers: ['afterDisplay'], spaceAbove: plain.baselineGrid });
    });

    it('under a float band at the head of a column', () => {
      const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
      const md = `Intro :ref{id="f1"} text.\n\n${Array.from({ length: 20 }, (_, i) => para(i)).join('\n\n')}`;
      const two: PostextConfig = {
        page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
        headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
      };
      const fig: Resource = {
        id: 'f1', typeId: 'figure', kind: 'bitmap', caption: 'Figure.', createdAt: 0, updatedAt: 0,
        bitmap: { fileId: 'f1.png', format: 'png', width: 400, height: 200 },
        placement: { position: 'top' },
      };
      const plain = pass(md, new Map(), two, [fig]);
      const head = plain.pages[0]!.columns[1]!.blocks[0]!;
      const part = /-cont-(\d+)$/.exec(head.id);
      const key = balanceKey(head.contentIndex!, part ? Number(part[1]) : 0);
      const doc = pass(md, new Map([[key, plain.baselineGrid]]), two, [fig]);
      const moved = doc.pages[0]!.columns[1]!.blocks[0]!;
      expect(moved.contentIndex).toBe(head.contentIndex);
      expect(moved.balancing).toEqual({ levers: ['afterFloat'], spaceAbove: plain.baselineGrid });
    });

    it('a heading too tall for any column, placed anyway at the head of a column under a float band', () => {
      // The design is taller than the page: the heading fits no column and
      // is placed as it is at the head of the second one, under the figure.
      const md = 'Intro :ref{id="f1"} text.\n\n## Tall\n\nAfter the heading.';
      const two: PostextConfig = {
        page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
        headings: {
          balancing: { enabled: false },
          levels: [
            { level: 1, breakBefore: { enabled: false } },
            { level: 2, advancedDesign: { enabled: true, minHeight: pt(1000), slot: { elements: [] } } },
          ],
        },
      };
      const fig: Resource = {
        id: 'f1', typeId: 'figure', kind: 'bitmap', caption: 'Figure.', createdAt: 0, updatedAt: 0,
        bitmap: { fileId: 'f1.png', format: 'png', width: 400, height: 200 },
        placement: { position: 'top' },
      };
      const plain = pass(md, new Map(), two, [fig]);
      const heading = plain.blocks.find((b) => b.type === 'heading')!;
      expect([heading.pageIndex, heading.columnIndex]).toEqual([0, 1]);
      expect(plain.pages[0]!.floats?.some((f) => f.columnIndex === 1)).toBe(true);
      const doc = pass(md, new Map([[balanceKey(heading.contentIndex!, 0), plain.baselineGrid]]), two, [fig]);
      const placed = doc.blocks.find((b) => b.type === 'heading')!;
      expect([placed.pageIndex, placed.columnIndex]).toEqual([0, 1]);
      expect(placed.balancing).toEqual({ levers: ['heading'], spaceAbove: plain.baselineGrid });
    });
  });
});
