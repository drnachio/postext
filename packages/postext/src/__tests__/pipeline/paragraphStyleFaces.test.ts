import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { collectConfigWarnings } from '../../configWarnings';
import { resolveBodyTextConfig, resolveParagraphStylesConfig, stripParagraphStylesDefaults } from '../../defaults';
import { renderToHtml } from '../../html-backend';
import type { ParagraphStyleConfig, PostextConfig } from '../../types';
import type { VDTBlock, VDTDocument } from '../../vdt';
import { parseMarkdownWithIssues } from '../../parse';
import { resolveBlockKind, type BlockKindContext } from '../../pipeline/buildBlockKind';
import { resolveBodyStyle } from '../../pipeline/styles';
import { resolveAllConfig } from '../../pipeline/config';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (style: Partial<ParagraphStyleConfig>): PostextConfig => ({
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false } },
  paragraphStyles: [{ id: 'signature', ...style }],
});
const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const byText = (doc: VDTDocument, start: string): VDTBlock =>
  doc.blocks.find((b) => b.type === 'paragraph' && b.lines[0]?.text.toLowerCase().startsWith(start.toLowerCase()))!;

// EF-173 (exam-paper): a signature line in a box.
const BOXED = ':::callout\nThe answer goes here.\n\n:::paragraphs{style="signature"}\nThe examiner, *in person*\n:::\n:::';

describe('paragraph style faces in a box (EF-173, re-verified)', () => {
  it('italic and fontWeight set the paragraph, inside a callout too', () => {
    const doc = build(BOXED, config({ italic: true, fontWeight: 600, textAlign: 'right' }));
    const sig = byText(doc, 'The examiner');
    expect(sig.fontString).toMatch(/^italic 600 /);
    // The italic run inside turns upright.
    expect(sig.italicFontString).toMatch(/^600 /);
    expect(sig.textAlign).toBe('right');
    const plain = build(BOXED, config({}));
    expect(byText(plain, 'The examiner').fontString).toMatch(/^400 /);
  });
});

describe('paragraphStyles[].textTransform (EF-173)', () => {
  it('defaults to \'none\' and strips the default', () => {
    const body = resolveBodyTextConfig();
    expect(resolveParagraphStylesConfig([{ id: 's' }], body)[0]!.textTransform).toBe('none');
    expect(resolveParagraphStylesConfig([{ id: 's', textTransform: 'uppercase' }], body)[0]!.textTransform).toBe('uppercase');
    expect(stripParagraphStylesDefaults([{ id: 's', textTransform: 'none' }])).toEqual([{ id: 's' }]);
    expect(stripParagraphStylesDefaults([{ id: 's', textTransform: 'uppercase' }])).toEqual([{ id: 's', textTransform: 'uppercase' }]);
  });

  it('\'uppercase\' sets the paragraphs in capitals, in the flow and in a box, and keeps the source map', () => {
    const md = 'Before.\n\n:::paragraphs{style="signature"}\nThe examiner, *in person* straße\n:::\n\n' + BOXED;
    const doc = build(md, config({ textTransform: 'uppercase' }));
    const [flow, boxed] = doc.blocks.filter((b) => b.type === 'paragraph' && /^THE EXAMINER/.test(b.lines[0]!.text));
    expect(flow).toBeDefined();
    expect(boxed).toBeDefined();
    // ß has no one-letter capital: kept as it is, so the length holds.
    expect(flow!.lines.map((l) => l.text).join(' ')).toContain('IN PERSON STRAßE');
    expect(flow!.lines[0]!.segments!.filter((s) => s.italic).map((s) => s.text).join('')).toBe('INPERSON');
    const plain = build(md, config({}));
    const before = byText(plain, 'The examiner');
    expect(flow!.sourceStart).toBe(before.sourceStart);
    expect(flow!.sourceEnd).toBe(before.sourceEnd);
    expect(renderToHtml(doc)).toContain('STRAßE');
    // Body text around the container keeps its case.
    expect(byText(doc, 'Before').lines[0]!.text).toBe('Before.');
  });

  it('sets the words of a chip and the label of a reference in capitals too', () => {
    // The round-6 verifier's probe: before, `:chip[ok]` kept `ok` and the
    // reference printed `Tab. 1` inside `SEE … AND`.
    const table = {
      id: 't', typeId: 'table', kind: 'table' as const, placement: { position: 'top' as const }, createdAt: 0, updatedAt: 0,
      table: { model: { rows: [[{ content: 'a' }]] } },
    };
    const md = ':::paragraphs{style="signature"}\nSee :ref{id="t"} and :chip[ok *now*] here.\n:::\n\nSee :ref{id="t"} and :chip[ok] here.';
    const doc = buildDocument({ markdown: md, resources: [table] }, config({ textTransform: 'uppercase' }), createMeasurementCache());
    const [upper, plain] = doc.blocks.filter((b) => b.type === 'paragraph');
    const segments = upper!.lines.flatMap((l) => l.segments ?? []);
    const ref = segments.find((s) => s.refResourceId === 't')!;
    expect(ref.text).toMatch(/^TAB/);
    const chip = segments.find((s) => s.kind === 'chip')!;
    expect(chip.chip!.runs.map((r) => r.text).join('')).toBe('OK NOW');
    expect(upper!.lines[0]!.text.startsWith('SEE TAB')).toBe(true);
    // The body paragraph after the container keeps its case.
    const plainSegments = plain!.lines.flatMap((l) => l.segments ?? []);
    expect(plainSegments.find((s) => s.refResourceId === 't')!.text).toMatch(/^Tab/);
    expect(plainSegments.find((s) => s.kind === 'chip')!.chip!.runs.map((r) => r.text).join('')).toBe('ok');
  });

  it('leaves maths as written', () => {
    const { blocks } = parseMarkdownWithIssues('Area $x^2$ here');
    const style = { ...resolveBodyStyle(resolveAllConfig()), uppercase: true };
    const kind = resolveBlockKind(blocks[0]!, { paragraphStyleOverride: style } as unknown as BlockKindContext);
    const math = blocks[0]!.spans.find((s) => s.math)!;
    expect(kind.contentBlock.spans.find((s) => s.math)).toBe(math);
    expect(kind.contentBlock.spans.filter((s) => !s.math).map((s) => s.text).join('|')).toBe('AREA | HERE');
  });
});

describe('unknown paragraph style keys (EF-173)', () => {
  it('are reported, with the key they are closest to', () => {
    const cfg = { paragraphStyles: [{ id: 's', italic: true, fontStyle: 'italic', textTransfrom: 'uppercase' }] } as unknown as PostextConfig;
    expect(collectConfigWarnings(cfg).filter((w) => w.kind === 'unknownConfigKey')).toEqual([
      { kind: 'unknownConfigKey', path: 'paragraphStyles[0].fontStyle', value: 'fontStyle', used: '' },
      { kind: 'unknownConfigKey', path: 'paragraphStyles[0].textTransfrom', value: 'textTransfrom', used: '', suggestion: 'textTransform' },
    ]);
    const viewer = { htmlViewer: { overrides: { paragraphStyles: [{ id: 's', weight: 600 }] } } } as unknown as PostextConfig;
    expect(collectConfigWarnings(viewer).map((w) => w.path)).toEqual(['htmlViewer.overrides.paragraphStyles[0].weight']);
  });

  it('every documented key is known', () => {
    const style: Required<ParagraphStyleConfig> = {
      id: 's', name: 'S', fontFamily: 'Inter', fontSize: pt(9), lineHeight: pt(11), color: { hex: '#000000', model: 'hex' },
      textAlign: 'left', boldColor: { hex: '#000000', model: 'hex' }, italicColor: { hex: '#000000', model: 'hex' },
      fontWeight: 400, boldFontWeight: 700, italic: false, smallCaps: false, hyphenation: false, indent: pt(0),
      firstLineIndent: pt(0), hangingIndent: pt(0), spaceBetween: pt(0), marginTop: pt(0), marginBottom: pt(0),
      snapToGrid: true, textTransform: 'none',
    };
    expect(collectConfigWarnings({ paragraphStyles: [style] })).toEqual([]);
  });
});
