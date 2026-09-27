import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';

// Tracking the engine measured a line with is painted with the matching
// character spacing (`Tc`): a line's own justification tracking
// (`bodyText.maxJustifyTracking`, EF-65) on top of its block's, and a block
// tracked negative (a runt set short) as well as positive.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

// Every character, the space included, is 7 px wide.
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
const config = (maxJustifyTracking?: number): PostextConfig => ({
  page: { width: pt(112), height: pt(200), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(16), lineHeight: pt(20), firstLineIndent: pt(0), hyphenation: { enabled: false }, ...(maxJustifyTracking !== undefined ? { maxJustifyTracking } : {}) },
});

async function contentOf(doc: VDTDocument): Promise<string> {
  const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider, accessible: false }));
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

const spacings = (content: string): number[] => [...content.matchAll(/(-?[\d.]+) Tc/g)].map((m) => Number(m[1]));

describe('line tracking in the PDF', () => {
  it('paints a tracked line with its character spacing, and resets it', async () => {
    // 72 dpi: 1 px = 1 pt. 50‰ of 16 px is 0.8 px a letter.
    const doc = buildDocument({ markdown: 'aaaaa bbbbb cccccccccc' }, config(50));
    expect(doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!.letterSpacing).toBeCloseTo(0.8, 5);
    expect(spacings(await contentOf(doc))).toEqual([0.8, 0]);
    // Off by default: no character spacing at all.
    expect(spacings(await contentOf(buildDocument({ markdown: 'aaaaa bbbbb cccccccccc' }, config())))).toEqual([]);
  }, 60_000);

  it('paints a heading level\'s letterSpacing, measured into its lines (EF-83)', async () => {
    const doc = buildDocument(
      { markdown: '## Methods\n\nText.' },
      { ...config(), headings: { levels: [{ level: 1, breakBefore: { enabled: false } }, { level: 2, letterSpacing: pt(2) }] } },
    );
    expect(doc.blocks.find((b) => b.type === 'heading')!.letterSpacing).toBeCloseTo(2, 5);
    expect(spacings(await contentOf(doc))).toEqual([2, 0]);
  }, 60_000);

  it('adds a line\'s tracking to its block\'s, and paints a negative block tracking', async () => {
    const doc = buildDocument({ markdown: 'aaaaa bbbbb cccccccccc' }, config(50));
    const block = doc.blocks.find((b) => b.type === 'paragraph')!;
    block.letterSpacing = -0.2;
    const [first, second] = spacings(await contentOf(doc)).filter((v) => v !== 0);
    expect(first).toBeCloseTo(0.6, 5);
    expect(second).toBeCloseTo(-0.2, 5);
  }, 60_000);

  it('paints a table\'s tracked header cells with their spacing and the body without (EF-174)', async () => {
    const table = {
      id: 't', typeId: 'table', kind: 'table' as const, createdAt: 0, updatedAt: 0,
      placement: { position: 'here' as const },
      table: { model: { headerRowCount: 1, rows: [[{ content: 'Dish' }, { content: 'Cost' }], [{ content: 'Soup' }, { content: '4' }]] } },
    };
    const wide: PostextConfig = { ...config(), page: { ...config().page, width: pt(300) } };
    const tracked = buildDocument({ markdown: '::resource{id="t"}\n', resources: [table] }, { ...wide, tableStyle: { headerLetterSpacing: pt(1.5) } });
    // Two header cells: each painted at 1.5 pt, then reset.
    expect(spacings(await contentOf(tracked))).toEqual([1.5, 0, 1.5, 0]);
    const plain = buildDocument({ markdown: '::resource{id="t"}\n', resources: [table] }, wide);
    expect(spacings(await contentOf(plain))).toEqual([]);
  }, 60_000);
});
