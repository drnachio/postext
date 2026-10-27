import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import { stripBodyTextDefaults } from '../../../defaults/index.js';
import { CONFIG_VERSION, migrateConfig, pinLegacyBoxParagraphStyles } from '../../../bundle/index.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';
import type { PostextConfig } from '../../../types.js';

// #1119: a paragraph style inside a box takes the box's body for the type
// fields it leaves unset; a configuration stored before rules 17 keeps the
// document's.

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
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const CONFIG: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { dpi: 72 },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Serif', fontSize: pt(10), lineHeight: pt(14) },
  paragraphStyles: [
    { id: 'centred', textAlign: 'center' },
    { id: 'display', textAlign: 'center', fontFamily: 'Display', fontSize: pt(16) },
  ],
  calloutStyles: [
    { id: 'sans', body: { fontFamily: 'Sans', fontSize: pt(8), lineHeight: pt(11), color: hex('#224466'), fontWeight: 300 } },
    { id: 'serif', body: { fontFamily: 'Book' } },
  ],
};
const MD = [
  ':::callout{type="sans"}', ':::paragraphs{style="centred"}', 'Sans centred.', ':::', '', ':::paragraphs{style="display"}', 'Sans display.', ':::', ':::',
  '', ':::callout{type="serif"}', ':::paragraphs{style="centred"}', 'Serif centred.', ':::', ':::',
  '', ':::paragraphs{style="centred"}', 'Running centred.', ':::',
].join('\n');

const build = (cfg: PostextConfig): VDTDocument => buildDocument({ markdown: MD }, cfg, createMeasurementCache());
const block = (doc: VDTDocument, text: string): VDTBlock => doc.blocks.find((b) => b.lines[0]?.text.includes(text))!;
/** `[weight, size in pt, family]` of a block (72 dpi: a px is a point). */
const face = (b: VDTBlock): [string, number, string] => {
  const m = /^(?:italic )?(\d+) (\d*\.?\d+)px (.+)$/.exec(b.fontString)!;
  return [m[1]!, Number(m[2]), m[3]!];
};

describe('paragraph styles inside a box (#1119)', () => {
  it('records the type fields a style leaves to the body', () => {
    const [centred, display] = resolveAllConfig(CONFIG).paragraphStyles;
    expect(centred!.inheritsBody).toEqual(['fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'boldFontWeight', 'color']);
    expect(display!.inheritsBody).toEqual(['lineHeight', 'fontWeight', 'boldFontWeight', 'color']);
    expect(resolveAllConfig({}).bodyText.paragraphStylesInBoxes).toBe('box');
    expect(stripBodyTextDefaults({ paragraphStylesInBoxes: 'box' })).toBeUndefined();
    expect(stripBodyTextDefaults({ paragraphStylesInBoxes: 'document' })).toEqual({ paragraphStylesInBoxes: 'document' });
  });

  it('sets an align-only style in each box\'s face, the running text in the document\'s', () => {
    const doc = build(CONFIG);
    const sans = block(doc, 'Sans centred.');
    expect(face(sans)).toEqual(['300', 8, 'Sans']);
    expect(sans.color).toBe('#224466');
    expect(face(block(doc, 'Serif centred.'))).toEqual(['400', 10, 'Book']);
    expect(face(block(doc, 'Running centred.'))).toEqual(['400', 10, 'Serif']);
    // The style's own alignment is kept.
    expect(sans.lines[0]!.bbox.x).toBeGreaterThan(block(doc, 'Running centred.').bbox.x);
  });

  it('keeps the fields a style sets', () => {
    expect(face(block(build(CONFIG), 'Sans display.'))).toEqual(['300', 16, 'Display']);
  });

  it('keeps the document body for a configuration that pins it', () => {
    const doc = build({ ...CONFIG, bodyText: { ...CONFIG.bodyText, paragraphStylesInBoxes: 'document' } });
    expect(face(block(doc, 'Sans centred.'))).toEqual(['400', 10, 'Serif']);
    expect(face(block(doc, 'Serif centred.'))).toEqual(['400', 10, 'Serif']);
  });
});

describe('rules 17: pinLegacyBoxParagraphStyles (#1119)', () => {
  it('comes before the current rule set', () => {
    expect(CONFIG_VERSION).toBe(21);
  });

  it('pins a configuration stored under 16 that declares paragraph styles', () => {
    const migrated = migrateConfig(CONFIG, 16);
    expect(migrated.bodyText?.paragraphStylesInBoxes).toBe('document');
    expect(migrated.bodyText?.fontFamily).toBe('Serif');
    // A current one, one without styles, and one that names the setting
    // are left as they are.
    expect(migrateConfig(CONFIG, 17).bodyText?.paragraphStylesInBoxes).toBeUndefined();
    expect(migrateConfig(CONFIG, 20)).toBe(CONFIG);
    const plain: PostextConfig = { bodyText: { fontSize: pt(10) } };
    expect(pinLegacyBoxParagraphStyles(plain)).toBe(plain);
    const named: PostextConfig = { ...CONFIG, bodyText: { paragraphStylesInBoxes: 'box' } };
    expect(pinLegacyBoxParagraphStyles(named)).toBe(named);
    const viewer = { htmlViewer: { overrides: { paragraphStyles: [{ id: 'x' }] } } } as PostextConfig;
    expect(pinLegacyBoxParagraphStyles(viewer).bodyText?.paragraphStylesInBoxes).toBe('document');
  });

  it('lays a migrated configuration out as before', () => {
    const before = build({ ...CONFIG, bodyText: { ...CONFIG.bodyText, paragraphStylesInBoxes: 'document' } });
    const migrated = build(migrateConfig(CONFIG, 16));
    expect(migrated.blocks.map((b) => [b.fontString, b.bbox.y, b.lines.map((l) => l.text)])).toEqual(
      before.blocks.map((b) => [b.fontString, b.bbox.y, b.lines.map((l) => l.text)]),
    );
    expect(face(block(migrated, 'Sans centred.'))).toEqual(['400', 10, 'Serif']);
  });
});
