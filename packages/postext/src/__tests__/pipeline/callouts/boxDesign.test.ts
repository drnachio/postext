import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { resolveCalloutStylesConfig, stripCalloutStylesDefaults } from '../../../defaults/boxes/calloutStyles.js';
import { resolveBodyTextConfig } from '../../../defaults/text/bodyText.js';
import { resolveHeadingsConfig } from '../../../defaults/structure/headings.js';
import { resolveUnorderedListsConfig } from '../../../defaults/text/unorderedLists.js';
import { configDesignSlots } from '../../../design/slots.js';
import type { CalloutStyleConfig, PostextConfig } from '../../../types.js';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument } from '../../../vdt.js';

// #1014: a box style's design, laid out in a band under the box title, and
// a heading style whose section ends at the next heading of any level.

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
const text = (id: string, content: string, y: number) => ({
  kind: 'text' as const, id, content, fontSize: pt(10),
  placement: { anchor: { to: 'container' as const, edge: 'top-left' as const }, offset: { x: pt(0), y: pt(y) } },
});
const page = { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } };
const config = (style: CalloutStyleConfig, extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page,
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false } },
  calloutStyles: [style],
  ...extra,
});
const frames = (doc: VDTDocument): VDTBlock[] =>
  [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].filter((b) => b.type === 'callout');
const texts = (frame: VDTBlock): string[] =>
  (frame.designOverlay?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text').map((b) => b.lines.map((l) => l.text).join(' '));
const paragraphs = (doc: VDTDocument): VDTBlock[] =>
  [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].filter((b) => b.type === 'paragraph');

describe('calloutStyles[].design (#1014)', () => {
  it('resolves on once set, keeps setsContent off by default, and survives the strip', () => {
    const body = resolveBodyTextConfig();
    const ul = resolveUnorderedListsConfig(undefined, body);
    const slot = { elements: [text('w', '{boxText}', 0)] };
    const [none, set, off] = resolveCalloutStylesConfig(
      [{ id: 'a' }, { id: 'b', design: { slot, minHeight: pt(30) } }, { id: 'c', design: { enabled: false, setsContent: true, slot } }],
      body, resolveHeadingsConfig({}), ul,
    );
    expect(none!.design).toBeUndefined();
    expect(set!.design).toMatchObject({ enabled: true, setsContent: false, minHeight: pt(30) });
    // A box design's text wraps, as a heading design's does.
    expect(set!.design!.slot.elements[0]).toMatchObject({ overflow: 'wrap' });
    expect(off!.design).toMatchObject({ enabled: false, setsContent: true });
    expect(stripCalloutStylesDefaults([{ id: 'b', design: { slot } }])).toEqual([{ id: 'b', design: { slot } }]);
  });

  it('is listed among the configuration’s design slots', () => {
    const slots = configDesignSlots({ calloutStyles: [{ id: 'b', design: { slot: { elements: [] } } }] });
    expect(slots).toContainEqual(expect.objectContaining({ path: 'calloutStyles[0].design.slot', kind: 'box', owner: 'calloutStyles[0]', ownerId: 'b' }));
  });

  it('prints the box content when it sets it, and lays the content out no second time', () => {
    const style: CalloutStyleConfig = {
      id: 'row', title: 'Trace', design: { setsContent: true, minHeight: pt(60), slot: { elements: [
        text('model', '{boxText}', 0), text('second', '{boxText.2}', 20), text('pic', '[{attr.pic}]', 40),
      ] } },
    };
    const doc = buildDocument({ markdown: ':::callout{type="row" pic="cat"}\nmamá\n\npapá\n:::\n\nAfter.\n' }, config(style));
    const [frame] = frames(doc);
    expect(frame).toBeDefined();
    // {boxText} prints every paragraph, one per line.
    expect(texts(frame!)).toEqual(['mamá papá', 'papá', '[cat]', 'Trace']);
    // The content is the design's: only the paragraph after the box is set.
    expect(paragraphs(doc).map((p) => p.lines.map((l) => l.text).join(' '))).toEqual(['After.']);
    // The band is at least minHeight (60 pt) under the title.
    expect(frame!.bbox.height).toBeGreaterThanOrEqual(60);
  });

  it('sets the content under the band when the design does not set it', () => {
    const style: CalloutStyleConfig = { id: 'card', design: { minHeight: pt(40), slot: { elements: [text('k', '{attr.kicker}', 0)] } } };
    const doc = buildDocument({ markdown: ':::callout{type="card" kicker="Note"}\nBody text.\n:::\n' }, config(style));
    const [frame] = frames(doc);
    expect(texts(frame!)).toEqual(['Note']);
    const [body] = paragraphs(doc);
    expect(body!.lines[0]!.text).toBe('Body text.');
    // Under the 40 pt band.
    expect(body!.bbox.y - frame!.bbox.y).toBeGreaterThanOrEqual(40);
  });

  it('draws nothing without a design, as before', () => {
    const doc = buildDocument({ markdown: ':::callout{type="plain"}\nBody text.\n:::\n' }, config({ id: 'plain' }));
    expect(paragraphs(doc)).toHaveLength(1);
    expect(texts(frames(doc)[0]!)).toEqual([]);
  });
});

describe('headingStyles[].sectionEnd (#1014)', () => {
  const folio = { elements: [text('folio', 'F{pageNumber}', 0)] };
  const footerText = (p: { footer?: { blocks: { kind: string }[] } }): string =>
    (p.footer?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text').map((b) => b.lines.map((l) => l.text).join(' ')).join(' ');
  const build = (sectionEnd?: 'level' | 'heading') => buildDocument(
    { markdown: '# Book {style="cover"}\n\n## One\n\nText.\n\n## Two\n\nText.\n' },
    {
      page,
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: folio,
      bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0) },
      headings: { levels: [{ level: 1, breakBefore: { enabled: false } }, { level: 2, breakBefore: { enabled: true, parity: 'any' } }] },
      headingStyles: [{ id: 'cover', footer: { elements: [] }, ...(sectionEnd ? { sectionEnd } : {}) }],
    },
  );

  it('by default, the cover’s empty footer runs over its level-2 chapters', () => {
    const doc = build();
    expect(doc.pages.length).toBe(3);
    expect(doc.pages.map(footerText)).toEqual(['', '', '']);
  });

  it('with sectionEnd: heading, it stops at the first chapter', () => {
    const doc = build('heading');
    expect(doc.pages.map(footerText)).toEqual(['', 'F2', 'F3']);
  });
});
