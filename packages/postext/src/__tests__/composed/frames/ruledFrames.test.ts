import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import { renderToHtml } from '../../../html-backend/html-backend.js';
import type { FrameConfig, PageTemplate } from '../../../composed/types.js';
import type { PostextConfig, VDTBlock, VDTDesignRuleBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const DPI = 300;
const MM = DPI / 25.4;

const PAGE: PostextConfig = {
  page: { width: mm(200), height: mm(260), dpi: DPI, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  bodyText: { fontSize: pt(11), lineHeight: pt(16) } as never,
  calloutStyles: [{ id: 'tinted', backgroundEnabled: true, background: { hex: '#e2f0f9', model: 'hex' }, padding: { top: mm(3), right: mm(5), bottom: mm(3), left: mm(5) } }] as never,
};
const build = (md: string, templates: PageTemplate[]): VDTDocument =>
  buildDocument({ markdown: md }, { ...PAGE, pageTemplates: templates }, createMeasurementCache());
const composedPage = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frame = (doc: VDTDocument, name: string): VDTFrame => composedPage(doc).composed!.frames.find((f) => f.name === name)!;
const boxOf = (doc: VDTDocument, f: VDTFrame): VDTBlock => composedPage(doc).floats!.find((b) => b.id === f.blockIds[0])!;
const rulesOf = (b: VDTBlock): VDTDesignRuleBlock[] => (b.designOverlay?.blocks ?? []).filter((x): x is VDTDesignRuleBlock => x.kind === 'rule');

const tpl = (frames: FrameConfig[]): PageTemplate => ({
  id: 'ficha',
  frames,
  groups: [{ name: 'g', kind: 'stack', gap: mm(4), frames: frames.map((f) => f.name) }],
});
const question: FrameConfig = { name: 'pregunta', placement: { anchor: { to: 'container', edge: 'top-left' } } };

describe('ruled frames (#914)', () => {
  it('an empty answer space is ruled at its pitch, as many rules as its height holds, painted with the decoration', () => {
    const doc = build('::::page{template="ficha"}\n\n:::frame{slot="pregunta"}\n\nWhat falls from the clouds?\n\n:::\n\n::::', [
      tpl([question, { name: 'lineas', optional: true, height: mm(24), rules: { every: mm(8), color: { hex: '#93bcd8', model: 'hex' }, width: pt(0.75), inset: mm(2) } }]),
    ]);
    const box = frame(doc, 'lineas');
    expect(box.rules).toHaveLength(3);
    const thick = (0.75 / 72) * DPI;
    box.rules!.forEach((r, k) => {
      expect(r.bbox.y + r.bbox.height).toBeCloseTo(box.rect.y + (k + 1) * 8 * MM, 3);
      expect(r.bbox.height).toBeCloseTo(thick, 6);
      expect(r.bbox.x).toBeCloseTo(box.rect.x + 2 * MM, 3);
      expect(r.bbox.width).toBeCloseTo(box.rect.width - 4 * MM, 3);
      expect(r.color).toBe('#93bcd8');
    });
    // The template has no decoration of its own: the rules are it.
    const deco = composedPage(doc).composed!.decoration!.blocks.filter((b) => b.kind === 'rule');
    expect(deco.map((b) => b.bbox.y)).toEqual(box.rules!.map((r) => r.bbox.y));
    // HTML draws them.
    expect(renderToHtml(doc).match(/#93bcd8/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('a frame that receives :::space{lines=N} is ruled N times at its text’s leading, over its background', () => {
    const answer: FrameConfig = { name: 'respuesta', style: 'tinted', rules: {} };
    const lineH = (16 / 72) * DPI;
    for (const n of [2, 5]) {
      const md = `::::page{template="ficha"}\n\n:::frame{slot="pregunta"}\n\nHow many?\n\n:::\n\n:::frame{slot="respuesta"}\n\n:::space{lines=${n}}\n\n:::\n\n::::`;
      const doc = build(md, [tpl([question, answer])]);
      const f = frame(doc, 'respuesta');
      expect(f.rules).toBeUndefined();
      const box = boxOf(doc, f);
      const rules = rulesOf(box);
      expect(rules).toHaveLength(n);
      // `innerRect` is in the box's own coordinates.
      const top = box.bbox.y + box.callout!.innerRect.y;
      rules.forEach((r, k) => expect(r.bbox.y + r.bbox.height).toBeCloseTo(top + (k + 1) * lineH, 3));
      // Painted after the box's background, before its text.
      const overlay = box.designOverlay!.blocks;
      expect(overlay.findIndex((b) => b.kind === 'rule')).toBeGreaterThan(overlay.findIndex((b) => b.kind === 'box'));
    }
  });

  it('a frame that grows gets more rules', () => {
    const answer: FrameConfig = { name: 'respuesta', rules: { every: mm(8) }, minHeight: mm(16) };
    const page = (k: number) => `::::page{template="ficha"}\n\n:::frame{slot="pregunta"}\n\nWrite.\n\n:::\n\n:::frame{slot="respuesta"}\n\n${'Line of text that runs on. '.repeat(k)}\n\n:::\n\n::::`;
    const short = boxOf(build(page(1), [tpl([question, answer])]), frame(build(page(1), [tpl([question, answer])]), 'respuesta'));
    const longDoc = build(page(200), [tpl([question, answer])]);
    const long = boxOf(longDoc, frame(longDoc, 'respuesta'));
    expect(rulesOf(short)).toHaveLength(2);
    expect(rulesOf(long).length).toBeGreaterThan(4);
  });

  it('a misspelt key of rules is an unknownConfigKey', () => {
    const warnings = validatePageTemplates({ pageTemplates: [{ id: 't', frames: [{ name: 'a', rules: { evry: 'line' } as never }] }] });
    expect(warnings.some((w) => w.kind === 'unknownConfigKey' && w.path === '/pageTemplates/0/frames/0/rules/evry')).toBe(true);
  });
});
