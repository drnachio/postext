import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { sourceAt } from '../../composed/sourceMap.js';
import { isAllowedPlaceholder, allowedPlaceholdersFor } from '../../design/placeholders.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import type { PageTemplate } from '../../composed/types.js';
import type { PostextConfig, VDTDesignTextBlock, VDTDocument } from '../../index.js';

// #984: a decoration text that sits over a frame answers a click before the
// bare frame, and `{headingNumber}` prints the counter of the heading a frame
// takes.

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

const CONFIG: PostextConfig = {
  page: { width: mm(200), height: mm(260), dpi: DPI, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, numberingTemplate: '{1}.', breakBefore: { enabled: false } }] } as never,
  bodyText: { fontSize: pt(11), lineHeight: pt(16), firstLineIndent: pt(0) } as never,
  calloutStyles: [{ id: 'tab', backgroundEnabled: true, background: { hex: '#ffffff', model: 'hex' }, padding: { top: mm(3), right: mm(5), bottom: mm(3), left: mm(5) } }] as never,
};

const badge = (content: string): never => ({
  kind: 'text', id: 'insignia', content, fontSize: pt(14),
  placement: { anchor: { to: '#titulo', edge: 'align-top-left' }, offset: { x: mm(2), y: mm(2) } },
} as never);

const TEMPLATE = (content: string): PageTemplate => ({
  id: 'ficha',
  frames: [
    { name: 'titulo', takes: 'h1', style: 'tab', placement: { anchor: { to: 'container', edge: 'top-left' } }, height: mm(30), width: mm(100) },
    { name: 'texto', flow: true, placement: { anchor: { to: '#titulo', edge: 'below' } } },
  ],
  decoration: { elements: [badge(content)] },
});

const MD = (n: number): string => Array.from({ length: n }, (_, k) => `::::page{template="ficha"}\n\n# Title ${k + 1}\n\nBody ${k + 1}.\n\n::::`).join('\n\n');
const build = (content: string, pages = 2): VDTDocument =>
  buildDocument({ markdown: MD(pages) }, { ...CONFIG, pageTemplates: [TEMPLATE(content)] }, createMeasurementCache());
const decorationText = (doc: VDTDocument, page: number): string[] =>
  (doc.pages.filter((p) => p.composed)[page]!.composed!.decoration?.blocks ?? [])
    .filter((b): b is VDTDesignTextBlock => b.kind === 'text')
    .flatMap((b) => b.lines.map((l) => l.text));

describe('{headingNumber} in a composed page’s decoration (#984)', () => {
  it('prints the counter of the heading the title frame took, page by page', () => {
    const doc = build('{headingNumber}');
    expect(decorationText(doc, 0)).toEqual(['1']);
    expect(decorationText(doc, 1)).toEqual(['2']);
  });

  it('reads the heading of a named frame, and nothing of a frame with none', () => {
    const doc = build('{headingNumber.titulo}/{headingNumber.texto}/{headingNumber.nada}');
    expect(decorationText(doc, 0)).toEqual(['1//']);
  });

  it('is an allowed name for the decoration of a composed page only', () => {
    expect(isAllowedPlaceholder('headingNumber', 'composed')).toBe(true);
    expect(isAllowedPlaceholder('headingNumber.titulo', 'composed')).toBe(true);
    expect(isAllowedPlaceholder('headingNumber', 'header')).toBe(false);
    expect(allowedPlaceholdersFor('composed').has('pageNumber')).toBe(true);
    expect(collectConfigWarnings({ pageTemplates: [TEMPLATE('{headingNumber}')] }).filter((w) => w.kind === 'contentInConfig')).toEqual([]);
  });
});

describe('a decoration text over a frame (#984)', () => {
  it('answers a click on its words before the frame under it', () => {
    const doc = build('{headingNumber}', 1);
    const page = doc.pages.find((p) => p.composed)!;
    const text = page.composed!.decoration!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
    const frame = page.composed!.frames.find((f) => f.name === 'titulo')!;
    // The words lie inside the title frame's box.
    expect(text.bbox.x).toBeGreaterThanOrEqual(frame.rect.x);
    expect(text.bbox.y + text.bbox.height).toBeLessThanOrEqual(frame.rect.y + frame.rect.height);
    const hit = sourceAt(doc, page.index, text.bbox.x + 2, text.bbox.y + text.bbox.height / 2);
    expect(hit[0]!.level).toBe('design');
    expect(hit[0]!.source).toMatchObject({ kind: 'config' });
    expect(hit.map((e) => e.level)).toContain('slot');
    // The frame's own padding, away from the words, is still the frame.
    const away = sourceAt(doc, page.index, frame.rect.x + frame.rect.width - 20, frame.rect.y + frame.rect.height - 5);
    expect(away[0]!.level).toBe('frame');
  });

  it('a frame with text of its own at the point keeps the click', () => {
    const doc = build('{headingNumber}', 1);
    const page = doc.pages.find((p) => p.composed)!;
    const title = (page.floats ?? []).find((b) => b.type === 'heading')!;
    const hit = sourceAt(doc, page.index, title.bbox.x + 3, title.bbox.y + title.bbox.height / 2);
    expect(hit[0]!.level).not.toBe('frame');
    expect(hit.map((e) => e.level)).not.toContain('slot');
  });
});
