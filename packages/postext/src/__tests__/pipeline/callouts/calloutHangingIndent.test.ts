import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { pageDisplayList } from '../../../paint/displayList/index.js';
import { resolveCalloutStylesConfig, stripCalloutStylesDefaults } from '../../../defaults/boxes/calloutStyles.js';
import { resolveBodyTextConfig } from '../../../defaults/text/bodyText.js';
import { resolveHeadingsConfig } from '../../../defaults/structure/headings.js';
import { resolveUnorderedListsConfig } from '../../../defaults/text/unorderedLists.js';
import type { PostextConfig } from '../../../types.js';
import type { VDTBlock, VDTDocument } from '../../../vdt.js';

// #1451: a box's `body.hangingIndent` hangs its paragraphs, so a note set
// `*⇥Note …` keeps its marker at the box's edge and its text, turnovers
// included, at the hang.

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
// 72 dpi: a point is a pixel; every glyph is 7 px wide.
const HANG = 30;
const config = (body: Record<string, unknown>, bodyText: Record<string, unknown> = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14), firstLineIndent: pt(0), hyphenation: { enabled: false }, avoidRunts: false, ...bodyText },
  calloutStyles: [{ id: 'note', title: '', body: { textAlign: 'left', ...body } }] as never,
  pageTemplates: [{ id: 'notes', frames: [{ name: 'notes', style: 'note', placement: { anchor: { to: 'container', edge: 'top-left' } }, width: pt(200) }] }],
});
const NOTE = 'First note that runs on long enough to turn over onto a second and a third line.';
const SECOND = 'Second note, also long enough to turn over onto a line of its own.';
// The marker is escaped: `*` and a tab would open a list item.
const notes = `\\*\t${NOTE}\n\n\\*\\*\\*\\*\t${SECOND}`;
const hanging = { hangingIndent: pt(HANG), tabStops: [{ position: pt(HANG) }] };

const frameDoc = (body: Record<string, unknown>, text = notes, bodyText?: Record<string, unknown>): VDTDocument =>
  buildDocument({ markdown: `::::page{template="notes"}\n\n:::frame{slot="notes"}\n\n${text}\n\n:::\n\n::::` }, config(body, bodyText));
const boxDoc = (body: Record<string, unknown>, text = notes, bodyText?: Record<string, unknown>): VDTDocument =>
  buildDocument({ markdown: `:::callout{type="note"}\n${text}\n:::\n` }, config(body, bodyText));
const paragraphs = (doc: VDTDocument): VDTBlock[] =>
  [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].filter((b) => b.type === 'paragraph');
// Each line's start, from the box's inner edge (the paragraph's own box).
const starts = (b: VDTBlock): number[] => b.lines.map((l) => l.bbox.x - b.bbox.x);

describe('calloutStyles[].body.hangingIndent (#1451)', () => {
  it('resolves absent when unset, keeps a length or a flag, and survives the strip', () => {
    const body = resolveBodyTextConfig();
    const ul = resolveUnorderedListsConfig(undefined, body);
    const [none, length, paired, flag] = resolveCalloutStylesConfig([
      { id: 'a' },
      { id: 'b', body: { hangingIndent: pt(HANG) } },
      { id: 'c', body: { hangingIndent: pt(HANG), firstLineIndent: pt(5) } },
      { id: 'd', body: { hangingIndent: true, firstLineIndent: pt(5) } },
    ], body, resolveHeadingsConfig({}), ul);
    expect(none!.body.hangingIndent).toBeUndefined();
    expect(none!.body.ownFirstLineIndent).toBeUndefined();
    expect(length!.body.hangingIndent).toEqual(pt(HANG));
    expect(length!.body.ownFirstLineIndent).toBeUndefined();
    expect(paired!.body.ownFirstLineIndent).toBe(true);
    expect(flag!.body.hangingIndent).toBe(true);
    // A flag has no first line of its own to pair: the indent is the hang.
    expect(flag!.body.ownFirstLineIndent).toBeUndefined();
    expect(stripCalloutStylesDefaults([{ id: 'b', body: { hangingIndent: pt(HANG) } }, { id: 'd', body: { hangingIndent: false } }]))
      .toEqual([{ id: 'b', body: { hangingIndent: pt(HANG) } }, { id: 'd', body: { hangingIndent: false } }]);
  });

  it('a frame hangs its notes: the marker at the edge, the text and its turnovers at the hang', () => {
    const [first, second] = paragraphs(frameDoc(hanging));
    expect(first!.lines.length).toBeGreaterThan(2);
    expect(second!.lines.length).toBeGreaterThan(1);
    for (const p of [first!, second!]) {
      const [head, ...rest] = starts(p);
      expect(head).toBeCloseTo(0, 6);
      for (const x of rest) expect(x).toBeCloseTo(HANG, 6);
    }
  });

  it('without it the frame sets the notes flush, as before', () => {
    const [first] = paragraphs(frameDoc({ tabStops: [{ position: pt(HANG) }] }));
    for (const x of starts(first!)) expect(x).toBeCloseTo(0, 6);
  });

  it('a tab stop at the hang puts the first line’s text on the turnovers’ edge (display list)', () => {
    const doc = frameDoc(hanging);
    const pageIndex = doc.pages.findIndex((p) => p.composed);
    const [first, second] = paragraphs(doc);
    const items = pageDisplayList(doc, pageIndex).items.filter((i) => i.kind === 'text');
    for (const [p, word, marker] of [[first!, 'First', '*'], [second!, 'Second', '****']] as const) {
      const item = items.find((i) => i.kind === 'text' && i.lines[0]?.text.includes(word))!;
      expect(item.kind).toBe('text');
      if (item.kind !== 'text') continue;
      const edge = p.bbox.x;
      const [head, turn] = item.lines;
      const markerRun = head!.runs.find((r) => r.text === marker)!;
      const textRun = head!.runs.find((r) => r.text.startsWith(word))!;
      expect(markerRun.x).toBeCloseTo(edge, 6);
      expect(textRun.x).toBeCloseTo(edge + HANG, 6);
      expect(turn!.runs[0]!.x).toBeCloseTo(edge + HANG, 6);
    }
  });

  it('pairs with a first-line indent the style sets itself; an inherited one gives way', () => {
    const [own] = paragraphs(frameDoc({ ...hanging, firstLineIndent: pt(10) }));
    expect(starts(own!)[0]).toBeCloseTo(10, 6);
    expect(starts(own!)[1]).toBeCloseTo(HANG, 6);
    // The document's first-line indent (1 em) reaches the box unset.
    const [inherited] = paragraphs(frameDoc(hanging, notes, { firstLineIndent: em(1) }));
    expect(starts(inherited!)[0]).toBeCloseTo(0, 6);
    expect(starts(inherited!)[1]).toBeCloseTo(HANG, 6);
  });

  it('a box in the flow hangs its paragraphs the same way', () => {
    const [first] = paragraphs(boxDoc(hanging));
    const [head, ...rest] = starts(first!);
    expect(head).toBeCloseTo(0, 6);
    for (const x of rest) expect(x).toBeCloseTo(HANG, 6);
  });

  it('`true` hangs by the first-line indent, as `bodyText.hangingIndent`; `false` unhangs a hanging body', () => {
    const [flag] = paragraphs(frameDoc({ hangingIndent: true, firstLineIndent: pt(20) }));
    expect(starts(flag!)[0]).toBeCloseTo(0, 6);
    expect(starts(flag!)[1]).toBeCloseTo(20, 6);
    // Before #1451 the flag was not read in a box: the first line took the indent.
    const [plain] = paragraphs(frameDoc({ firstLineIndent: pt(20) }));
    expect(starts(plain!)[0]).toBeCloseTo(20, 6);
    expect(starts(plain!)[1]).toBeCloseTo(0, 6);
    const [unhung] = paragraphs(frameDoc({ hangingIndent: false, firstLineIndent: pt(20) }, notes, { hangingIndent: true }));
    expect(starts(unhung!)[0]).toBeCloseTo(20, 6);
    expect(starts(unhung!)[1]).toBeCloseTo(0, 6);
  });

  it('leaves list items and the running text alone', () => {
    const md = `Running text that is long enough to turn over onto a second line of the page, and then some more.\n\n:::callout{type="note"}\n- a list item in the box that is long enough to turn over onto a second line\n:::\n`;
    const doc = buildDocument({ markdown: md }, config(hanging));
    const plain = buildDocument({ markdown: md }, config({}));
    const lines = (d: VDTDocument) => [...d.blocks, ...d.pages.flatMap((p) => p.floats ?? [])]
      .filter((b) => b.type === 'paragraph' || b.type === 'listItem')
      .map((b) => b.lines.map((l) => [l.bbox.x, l.text]));
    expect(lines(doc)).toEqual(lines(plain));
  });
});
