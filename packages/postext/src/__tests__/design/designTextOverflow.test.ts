import { describe, it, expect } from 'vitest';
import { layoutDesignSlot, type LayoutIssue, type ResolvedTextPrimitive } from '../../design/layout';
import { defaultTextOverflow, resolveDesignSlot, stripDesignSlotDefaults, type DesignSlotKind } from '../../defaults/headerFooter';
import { resolveAllConfig } from '../../pipeline/config';
import type { DesignPlaceholderContext } from '../../design/placeholders';
import type { DesignElement, DesignTextElement, ResolvedDesignTextElement } from '../../types';
import type { VDTPage } from '../../vdt';

// #628: a design text that sets no `overflow` takes its slot's default —
// a heading or part title wraps, a running head, a folio and a contents
// part row end in `…` — and a cut line is reported as a layout issue.

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

const DPI = 72;
const pt = (value: number) => ({ value, unit: 'pt' as const });
const stubPage = { index: 0, pageLabel: '1' } as unknown as VDTPage;
const placeholders: DesignPlaceholderContext = { kind: 'header', page: stubPage, allPages: [stubPage], metadata: {}, chapterTitleByPageIndex: [] };

const TITLE = 'The history of the Spanish nation';

/** A text element `chars` characters wide (7 px each). */
const element = (chars: number, extra: Partial<DesignTextElement> = {}): DesignElement => ({
  kind: 'text', id: 't', content: TITLE, fontSize: pt(10),
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(chars * 7) } },
  ...extra,
} as DesignElement);

const layout = (el: DesignElement, kind: DesignSlotKind) =>
  layoutDesignSlot(resolveDesignSlot({ elements: [el] }, kind), { container: { x: 0, y: 0, width: 400, height: 100 }, dpi: DPI, placeholders }, 0);
const lines = (el: DesignElement, kind: DesignSlotKind): string[] =>
  (layout(el, kind).primitives[0] as ResolvedTextPrimitive).lines.map((l) => l.text);
const cuts = (el: DesignElement, kind: DesignSlotKind = 'header'): LayoutIssue[] =>
  layout(el, kind).issues.filter((i) => i.kind === 'textTruncated');

describe('#628: the default overflow of a design text follows its slot', () => {
  it('wraps in heading and part designs, ends in an ellipsis elsewhere', () => {
    expect(defaultTextOverflow('heading')).toBe('wrap');
    expect(defaultTextOverflow('part')).toBe('wrap');
    expect(defaultTextOverflow('header')).toBe('ellipsis-end');
    expect(defaultTextOverflow('footer')).toBe('ellipsis-end');
    expect(defaultTextOverflow('tocRow')).toBe('ellipsis-end');
    for (const kind of ['header', 'footer', 'heading', 'part', 'tocRow'] as const) {
      const el = resolveDesignSlot({ elements: [element(10)] }, kind).elements[0] as ResolvedDesignTextElement;
      expect(el.overflow, kind).toBe(defaultTextOverflow(kind));
      const own = resolveDesignSlot({ elements: [element(10, { overflow: 'clip' })] }, kind).elements[0] as ResolvedDesignTextElement;
      expect(own.overflow, kind).toBe('clip');
    }
  });

  it('a title wider than its box wraps in a heading design, and is cut in a running head', () => {
    expect(lines(element(20), 'heading')).toEqual(['The history of the', 'Spanish nation']);
    expect(lines(element(20), 'part')).toEqual(['The history of the', 'Spanish nation']);
    expect(lines(element(20), 'header')).toEqual(['The history of the…']);
    expect(lines(element(20), 'tocRow')).toEqual(['The history of the…']);
  });

  it('resolves the designs of headings, heading styles, parts and contents rows by their kind', () => {
    const slot = { elements: [element(20)] };
    const resolved = resolveAllConfig({
      headings: { levels: [{ level: 1, advancedDesign: { enabled: true, slot } }] },
      headingStyles: [{ id: 'chapter', advancedDesign: { enabled: true, slot }, header: slot }],
      parts: { design: slot, versoDesign: slot },
      toc: { parts: { design: slot } },
    });
    const overflowOf = (s: { elements: unknown[] } | undefined) => (s?.elements[0] as ResolvedDesignTextElement | undefined)?.overflow;
    expect(overflowOf(resolved.headings.levels[0]!.advancedDesign.slot)).toBe('wrap');
    expect(overflowOf(resolved.headingStyles[0]!.overrides.advancedDesign?.slot)).toBe('wrap');
    expect(overflowOf(resolved.headingStyles[0]!.header)).toBe('ellipsis-end');
    expect(overflowOf(resolved.parts.design)).toBe('wrap');
    expect(overflowOf(resolved.parts.versoDesign)).toBe('wrap');
    expect(overflowOf(resolved.toc.parts.design)).toBe('ellipsis-end');
  });

  it('never strips a heading, part or contents row slot, even an empty one', () => {
    for (const kind of ['heading', 'part', 'tocRow'] as const) {
      expect(stripDesignSlotDefaults({ elements: [] }, kind), kind).toEqual({ elements: [] });
    }
  });
});

describe('#628: a cut design text is reported', () => {
  it('reports an ellipsis at the end, the start or the middle, with the whole text', () => {
    for (const mode of ['ellipsis-end', 'ellipsis-start', 'ellipsis-middle'] as const) {
      expect(cuts(element(20, { overflow: mode })), mode).toEqual([{ kind: 'textTruncated', elementId: 't', mode, text: TITLE }]);
    }
  });

  it('reports a clipped text only when its ink runs past the box', () => {
    expect(cuts(element(20, { overflow: 'clip' }))).toEqual([{ kind: 'textTruncated', elementId: 't', mode: 'clip', text: TITLE }]);
    expect(cuts(element(TITLE.length, { overflow: 'clip' }))).toEqual([]);
  });

  it('reports nothing when the text fits, or wraps', () => {
    expect(cuts(element(TITLE.length))).toEqual([]);
    expect(cuts(element(20, { overflow: 'wrap' }))).toEqual([]);
    expect(cuts(element(20), 'heading')).toEqual([]);
  });

  it('reports a text with inline marks by its printed text', () => {
    const el = element(20, { content: 'The *history* of the Spanish nation', inlineMarks: true });
    expect(cuts(el)).toEqual([{ kind: 'textTruncated', elementId: 't', mode: 'ellipsis-end', text: TITLE }]);
    expect(cuts({ ...el, overflow: 'clip' } as DesignElement)).toEqual([{ kind: 'textTruncated', elementId: 't', mode: 'clip', text: TITLE }]);
    expect(cuts(element(TITLE.length + 2, { content: 'The *history* of the Spanish nation', inlineMarks: true }))).toEqual([]);
  });

  it('flags the primitive with how it was cut', () => {
    const prim = layout(element(20, { overflow: 'ellipsis-start' }), 'header').primitives[0] as ResolvedTextPrimitive;
    expect(prim.truncated).toBe('ellipsis-start');
    expect((layout(element(TITLE.length), 'header').primitives[0] as ResolvedTextPrimitive).truncated).toBeUndefined();
  });
});
