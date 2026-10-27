import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import { collectConfigWarnings } from '../../../checks/configWarnings.js';
import { resolveLayoutConfig, stripLayoutDefaults } from '../../../defaults/layout.js';
import type { CompositionRule, PostextConfig, Resource, VDTDocument } from '../../../index.js';

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

const figure = (id: string, placement?: Resource['placement']): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figure ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: 200 },
  ...(placement ? { placement } : {}),
});

const pt = (value: number) => ({ value, unit: 'pt' as const });

/** Two-column page, balancing off; an H1 opens a page (`chapters`) or not. */
const page = (openerFloats?: CompositionRule, chapters = true): PostextConfig => ({
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: chapters, parity: 'any' } }] },
  ...(openerFloats ? { layout: { openerFloats } } : {}),
});

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');

const build = (markdown: string, resources: Resource[], config: PostextConfig): VDTDocument =>
  buildDocument({ markdown, resources }, config);

/** The page of each floated resource, by id. */
const floatPages = (doc: VDTDocument): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const p of doc.pages) {
    for (const b of p.floats ?? []) if (b.resourceBlock) out[b.resourceBlock.resource.id] ??= p.index;
    for (const c of p.columns) for (const b of c.blocks) if (b.resourceBlock) out[b.resourceBlock.resource.id] ??= p.index;
  }
  return out;
};
const headingPage = (doc: VDTDocument, title: string): number =>
  doc.blocks.find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes(title)))!.pageIndex;
const noted = (doc: VDTDocument) => (doc.contentWarnings ?? []).filter((w) => w.kind === 'openerFloat');

const BOOK = [
  '# Chapter one',
  `Intro :ref{id="f1"} text.`,
  filler(70),
  '# Chapter two',
  `Again :ref{id="f2"} text.`,
  filler(70, 100),
].join('\n\n');
const FIGURES = [figure('f1'), figure('f2')];

describe('layout.openerFloats (#749)', () => {
  it('is off by default: a float cited on an opener page is set there, and nothing is reported', () => {
    for (const rule of [undefined, 'allow'] as const) {
      const doc = build(BOOK, FIGURES, page(rule));
      const two = headingPage(doc, 'Chapter two');
      expect(two).toBeGreaterThan(1);
      expect(floatPages(doc)).toEqual({ f1: 0, f2: two });
      expect(noted(doc)).toEqual([]);
    }
  });

  it('warn: the same layout, and one warning for each float on an opener page', () => {
    const plain = build(BOOK, FIGURES, page());
    const doc = build(BOOK, FIGURES, page('warn'));
    expect(floatPages(doc)).toEqual(floatPages(plain));
    expect(doc.pages.length).toBe(plain.pages.length);
    const two = headingPage(doc, 'Chapter two');
    const found = noted(doc);
    expect(found.map((w) => [w.kind === 'openerFloat' && w.resourceId, w.pageIndex])).toEqual([['f1', 0], ['f2', two]]);
    // Each points at the block that cites the float.
    expect(BOOK.slice(found[0]!.sourceStart, found[0]!.sourceEnd)).toBe('Intro :ref{id="f1"} text.');
    expect(formatWarning(found[0]!)).toContain('The resource "f1" is set on an opener page');
  });

  it('avoid: the float takes the first slot after the opener page, which holds text alone', () => {
    const doc = build(BOOK, FIGURES, page('avoid'));
    const two = headingPage(doc, 'Chapter two');
    expect(floatPages(doc)).toEqual({ f1: 1, f2: two + 1 });
    for (const opener of [0, two]) {
      expect(doc.pages[opener]!.floats ?? []).toEqual([]);
      // The opener page still fills with text.
      expect(doc.pages[opener]!.columns.every((c) => c.blocks.length > 0)).toBe(true);
    }
    expect(noted(doc)).toEqual([]);
  });

  it('avoid: a float cited after the opener page is set as on any page', () => {
    const md = ['# Chapter one', filler(60), `Later :ref{id="f1"} text.`, filler(30, 100)].join('\n\n');
    const plain = build(md, [figure('f1')], page());
    const doc = build(md, [figure('f1')], page('avoid'));
    expect(floatPages(plain).f1).toBeGreaterThan(0);
    expect(floatPages(doc)).toEqual(floatPages(plain));
  });

  it('avoid: a chapter of one page sets its float on a page of its own before the next chapter', () => {
    const md = ['# Chapter one', `Short :ref{id="f1"} text.`, '# Chapter two', filler(4)].join('\n\n');
    const doc = build(md, [figure('f1')], page('avoid'));
    expect(headingPage(doc, 'Chapter one')).toBe(0);
    expect(floatPages(doc)).toEqual({ f1: 1 });
    expect(headingPage(doc, 'Chapter two')).toBe(2);
  });

  it('counts the first page of a document that starts with a heading, whatever its break', () => {
    const md = ['# A title', `Intro :ref{id="f1"} text.`, filler(70)].join('\n\n');
    expect(floatPages(build(md, [figure('f1')], page('avoid', false)))).toEqual({ f1: 1 });
    expect(noted(build(md, [figure('f1')], page('warn', false)))).toHaveLength(1);
    // A document that starts with text opens no chapter on its first page.
    const text = [`Intro :ref{id="f1"} text.`, filler(70)].join('\n\n');
    expect(floatPages(build(text, [figure('f1')], page('avoid', false)))).toEqual({ f1: 0 });
    expect(noted(build(text, [figure('f1')], page('warn', false)))).toEqual([]);
  });

  it('leaves an inline figure where it is embedded', () => {
    const md = ['# Chapter one', 'Intro text.', '::resource{id="f1"}', filler(20)].join('\n\n');
    const here = [figure('f1', { position: 'here' })];
    expect(floatPages(build(md, here, page('avoid')))).toEqual({ f1: 0 });
    expect(noted(build(md, here, page('warn')))).toEqual([]);
  });

  it('resolves and strips its setting', () => {
    expect(resolveLayoutConfig().openerFloats).toBe('allow');
    expect(resolveLayoutConfig({}).openerFloats).toBe('allow');
    expect(resolveLayoutConfig({ openerFloats: 'avoid' }).openerFloats).toBe('avoid');
    expect(resolveLayoutConfig({ openerFloats: 'never' as CompositionRule }).openerFloats).toBe('allow');
    expect(stripLayoutDefaults({ openerFloats: 'allow' })).toBeUndefined();
    expect(stripLayoutDefaults({ openerFloats: 'warn' })).toEqual({ openerFloats: 'warn' });
    expect(collectConfigWarnings({ layout: { openerFloats: 'never' as CompositionRule } })).toContainEqual({
      kind: 'unknownConfigValue', path: 'layout.openerFloats', value: 'never', used: 'allow',
    });
  });
});
