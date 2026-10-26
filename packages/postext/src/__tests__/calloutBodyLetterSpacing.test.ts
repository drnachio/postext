import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline/index.js';
import { renderToHtml } from '../html-backend/html-backend.js';
import { resolveCalloutStylesConfig, stripCalloutStylesDefaults } from '../defaults/boxes/calloutStyles.js';
import { resolveBodyTextConfig } from '../defaults/text/bodyText.js';
import { resolveHeadingsConfig } from '../defaults/structure/headings.js';
import { resolveUnorderedListsConfig } from '../defaults/text/unorderedLists.js';
import type { PostextConfig } from '../types.js';
import type { VDTBlock, VDTDocument } from '../vdt.js';

// #974: a box's `body` tracks its paragraphs and list items, as a paragraph
// style's `letterSpacing` (#907) does.

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
const em = (value: number) => ({ value, unit: 'em' as const });
const config = (body: Record<string, unknown>): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false }, avoidRunts: false },
  calloutStyles: [{ id: 'caja', title: '', body: { textAlign: 'left', ...body } }] as never,
});
// A 27-character line takes 189 px of 7 px glyphs; the box is 280 px wide.
const TEXT = 'Seven times nine is sixty-three and the rest of the line goes on and on to the end.';
const md = `:::callout{style="caja"}\n${TEXT}\n\n- one item that is long enough to turn over onto a second line of the box, yes\n:::\n`;
const build = (body: Record<string, unknown>): VDTDocument => buildDocument({ markdown: md }, config(body));
const inBox = (doc: VDTDocument): VDTBlock[] => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].filter((b) => b.type === 'paragraph' || b.type === 'listItem');
const para = (doc: VDTDocument): VDTBlock => inBox(doc).find((b) => b.type === 'paragraph')!;

describe('calloutStyles[].body.letterSpacing (#974)', () => {
  it('resolves absent when unset or zero, and survives the strip when set', () => {
    const body = resolveBodyTextConfig();
    const ul = resolveUnorderedListsConfig(undefined, body);
    const [none, zero, set] = resolveCalloutStylesConfig([{ id: 'a' }, { id: 'b', body: { letterSpacing: em(0) } }, { id: 'c', body: { letterSpacing: em(-0.03) } }], body, resolveHeadingsConfig({}), ul);
    expect(none!.body.letterSpacing).toBeUndefined();
    expect(zero!.body.letterSpacing).toBeUndefined();
    expect(set!.body.letterSpacing).toEqual(em(-0.03));
    expect(stripCalloutStylesDefaults([{ id: 'c', body: { letterSpacing: em(-0.03) } }])).toEqual([{ id: 'c', body: { letterSpacing: em(-0.03) } }]);
  });

  it('measures the tracking into the box’s lines and stamps it on the blocks', () => {
    const plain = para(build({}));
    const tight = para(build({ letterSpacing: em(-0.05) }));
    expect(plain.letterSpacing).toBeUndefined();
    // 0.05 em of the box’s 10 px body, after every glyph.
    expect(tight.letterSpacing).toBeCloseTo(-0.5, 5);
    const first = (b: VDTBlock) => b.lines[0]!;
    const perChar = (b: VDTBlock) => first(b).bbox.width / first(b).text.length;
    expect(perChar(tight)).toBeCloseTo(perChar(plain) - 0.5, 3);
  });

  it('a tracked box that the source just fits keeps the line the untracked one breaks', () => {
    // 7 px glyphs: 40 characters take 280 px, the box’s whole measure less its padding is less.
    const one = (extra: Record<string, unknown>) => para(buildDocument(
      { markdown: ':::callout{style="caja"}\n' + 'x'.repeat(39) + ' ' + 'y'.repeat(39) + '\n:::\n' },
      config({ ...extra }),
    ));
    const plain = one({});
    const tight = one({ letterSpacing: pt(-0.4) });
    expect(plain.lines.length).toBeGreaterThanOrEqual(tight.lines.length);
    expect(tight.lines[0]!.text.length).toBeGreaterThanOrEqual(plain.lines[0]!.text.length);
  });

  it('tracks list items of the box too', () => {
    const item = inBox(build({ letterSpacing: em(0.1) })).find((b) => b.type === 'listItem')!;
    expect(item.letterSpacing).toBeCloseTo(1, 5);
  });

  it('is painted by the HTML backend', () => {
    expect(renderToHtml(build({ letterSpacing: em(0.1) }))).toMatch(/letter-spacing:\s*1(\.0+)?px/);
  });

  it('a frame whose style tracks its body sets its text so', () => {
    const cfg: PostextConfig = {
      ...config({ letterSpacing: em(-0.05) }),
      pageTemplates: [{ id: 'ficha', frames: [{ name: 'texto', style: 'caja', placement: { anchor: { to: 'container', edge: 'top-left' } }, width: { value: 250, unit: 'pt' } }] }],
    };
    const doc = buildDocument({ markdown: '::::page{template="ficha"}\n\n:::frame{slot="texto"}\n\n' + TEXT + '\n\n:::\n\n::::' }, cfg);
    const page = doc.pages.find((p) => p.composed)!;
    const text = (page.floats ?? []).find((b) => b.type === 'paragraph')!;
    expect(text.letterSpacing).toBeCloseTo(-0.5, 5);
  });
});
