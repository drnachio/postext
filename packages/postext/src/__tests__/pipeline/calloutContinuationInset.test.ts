import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTBlock, VDTDocument } from '../../vdt';
import type { CalloutStyleConfig, PostextConfig } from '../../types';

// EF-114: the continuation of a split box (`keepTogether: false`) draws no
// icon, but its text keeps the inset the icon column gives the head (icon
// box + gap), so the box has one measure on both pages. It lost that inset:
// cut between children, the rest moved left by the icon and the gap; cut
// inside a paragraph, the rest was rewrapped wider than the lines the cut
// had counted, so words printed twice or went missing.

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
const em = (value: number) => ({ value, unit: 'em' as const });
const ICON = '★';

const config = (icon: CalloutStyleConfig['icon'], height = 70): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { width: mm(120), height: mm(height), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  calloutStyles: [{ id: 'kp', keepTogether: false, icon }],
});

const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const childrenOf = (doc: VDTDocument, frame: VDTBlock): VDTBlock[] =>
  doc.blocks.filter((b) => b.containerId === frame.containerId && b.type !== 'callout'
    && b.pageIndex === frame.pageIndex && b.columnIndex === frame.columnIndex);
const iconBlocks = (frame: VDTBlock): number =>
  (frame.designOverlay?.blocks ?? []).filter((b) => b.kind === 'text' && b.lines.some((l) => l.text.includes(ICON))).length;
/** Every line's left edge, from its box's left edge. */
const insets = (doc: VDTDocument, frame: VDTBlock): number[] =>
  childrenOf(doc, frame).flatMap((c) => c.lines.map((l) => l.bbox.x - frame.bbox.x));

const SENTENCE = 'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos. ';
const items = (n: number): string =>
  Array.from({ length: n }, (_, i) => `- Paso número ${i + 1} de la lista.`).join('\n');

describe('a split box keeps its icon inset on the continuation (EF-114)', () => {
  const ICONS: [string, CalloutStyleConfig['icon']][] = [
    ['a glyph icon', { kind: 'glyph', glyph: ICON }],
    ['a wide glyph icon', { kind: 'glyph', glyph: ICON, size: em(2), width: em(3) }],
  ];

  for (const [name, icon] of ICONS) {
    it(`cut between children, with ${name}`, () => {
      let checked = 0;
      for (let n = 1; n <= 6; n++) {
        const doc = build([SENTENCE.repeat(n).trim(), '', ':::callout{type="kp"}', items(12), ':::'].join('\n'), config(icon));
        const parts = frames(doc);
        if (parts.length < 2) continue;
        const [head, rest] = parts;
        if (rest!.callout?.part !== 1) continue;
        expect(iconBlocks(head!)).toBe(1);
        expect(iconBlocks(rest!)).toBe(0);
        const headX = insets(doc, head!);
        const restX = insets(doc, rest!);
        expect(headX.length).toBeGreaterThan(0);
        expect(restX.length).toBeGreaterThan(0);
        for (const x of restX) expect(x).toBeCloseTo(headX[0]!, 5);
        // The bullets too.
        const bullets = (f: VDTBlock) => childrenOf(doc, f).filter((c) => c.bulletOffsetX !== undefined).map((c) => c.bulletOffsetX! - f.bbox.x);
        for (const x of bullets(rest!)) expect(x).toBeCloseTo(bullets(head!)[0]!, 5);
        // The box's inner rect agrees.
        expect(rest!.callout!.innerRect.x).toBeCloseTo(head!.callout!.innerRect.x, 5);
        expect(rest!.callout!.innerRect.width).toBeCloseTo(head!.callout!.innerRect.width, 5);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    }, 30_000);

    it(`cut inside a paragraph, with ${name}: every line once, in order, at the head's measure`, () => {
      const para = SENTENCE.repeat(16).trim();
      // The whole box on a page tall enough: the lines the fragments share.
      const whole = build([':::callout{type="kp"}', para, ':::'].join('\n'), config(icon, 400));
      const wholeLines = childrenOf(whole, frames(whole)[0]!).flatMap((c) => c.lines.map((l) => l.text));
      let checked = 0;
      for (let n = 1; n <= 6; n++) {
        const doc = build([SENTENCE.repeat(n).trim(), '', ':::callout{type="kp"}', para, ':::'].join('\n'), config(icon));
        const parts = frames(doc);
        if (parts.length < 2) continue;
        const kids = parts.map((f) => childrenOf(doc, f));
        // Only cuts inside the paragraph: both fragments hold part of it.
        if (!kids.every((k) => k.length === 1 && k[0]!.type === 'paragraph')) continue;
        const lines = kids.flatMap((k) => k.flatMap((c) => c.lines.map((l) => l.text)));
        expect(lines).toEqual(wholeLines);
        const headX = insets(doc, parts[0]!);
        for (const f of parts.slice(1)) {
          for (const x of insets(doc, f)) expect(x).toBeCloseTo(headX[1] ?? headX[0]!, 5);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    }, 30_000);
  }

  it('a corner badge takes no column: the continuation sets the text at the full inner width, as the head', () => {
    const icon: CalloutStyleConfig['icon'] = { kind: 'glyph', glyph: ICON, position: 'corner' };
    let checked = 0;
    for (let n = 1; n <= 6; n++) {
      const doc = build([SENTENCE.repeat(n).trim(), '', ':::callout{type="kp"}', items(12), ':::'].join('\n'), config(icon));
      const parts = frames(doc);
      if (parts.length < 2) continue;
      const [head, rest] = parts;
      expect(rest!.callout!.innerRect.x).toBeCloseTo(head!.callout!.innerRect.x, 5);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  }, 30_000);
});
