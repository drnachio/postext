import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { renderToHtmlIndexed } from '../../html-backend/html-backend.js';
import { composedReadingOrder, composedPaintOrder } from '../../index.js';
import type { FrameConfig, PageTemplate } from '../../composed/types.js';
import type { PostextConfig, VDTDocument, VDTPage } from '../../index.js';

// #1116: an empty styled frame fence (#1084) reads where its fence lies in
// the Markdown, not after every other frame of the page.

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
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const CONFIG: PostextConfig = {
  page: { width: mm(200), height: mm(260), dpi: 300, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] } as never,
  bodyText: { fontSize: pt(11), lineHeight: pt(16), firstLineIndent: pt(0) } as never,
  calloutStyles: [{
    id: 'caja', backgroundEnabled: true, background: hex('#ffeb99'),
    border: { enabled: true, color: hex('#222222') }, padding: { top: mm(3), right: mm(5), bottom: mm(3), left: mm(5) },
    label: { color: hex('#ffffff'), background: hex('#333333'), height: mm(6), paddingX: mm(3) },
  }] as never,
};
const atY = (y: number): FrameConfig['placement'] => ({ anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(0), y: mm(y) } });
// The frames are laid top to bottom in the opposite order of the Markdown,
// so neither the layout nor the template order gives the reading order.
const FRAMES: FrameConfig[] = [
  { name: 'last', placement: atY(0), width: mm(100) },
  { name: 'caja', style: 'caja', placement: atY(60), width: mm(100), minHeight: mm(30) },
  { name: 'first', placement: atY(140), width: mm(100) },
];
const MD = [
  '::::page{template="ficha"}', '',
  ':::frame{slot="first"}', 'Opening words.', ':::', '',
  ':::frame{slot="caja" label="Inset"}', ':::', '',
  ':::frame{slot="last"}', 'Closing words.', ':::', '',
  '::::',
].join('\n');
const build = (): VDTDocument =>
  buildDocument({ markdown: MD }, { ...CONFIG, pageTemplates: [{ id: 'ficha', frames: FRAMES } as PageTemplate] }, createMeasurementCache());
const page = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;

describe('an empty styled fence reads in its Markdown place (#1116)', () => {
  it('the reading order is the Markdown order', () => {
    const doc = build();
    const order = composedReadingOrder(composedPaintOrder(page(doc)))
      .flatMap((item) => (item.kind === 'frame' ? [item.frame.name] : []));
    expect(order).toEqual(['first', 'caja', 'last']);
  });

  it('HTML (and so EPUB) sets the tab between the two frames', () => {
    const doc = build();
    const html = renderToHtmlIndexed(doc).pages[page(doc).index]!.innerHtml;
    const at = (name: string): number => html.indexOf(`data-frame-id="cp0:${name}"`);
    expect(at('first')).toBeGreaterThan(-1);
    expect(at('caja')).toBeGreaterThan(at('first'));
    expect(at('last')).toBeGreaterThan(at('caja'));
    expect(html.indexOf('>Inset<')).toBeGreaterThan(at('caja'));
  });
});
