import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { VDTDocument } from '../../vdt';
import type { PostextConfig, Resource, ResourcePlacement, ResourceType } from '../../types';

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

/**
 * What gets a number, and what `{h1}` counts — the rules the configuration
 * docs state under "Resource types › What is numbered".
 */

const mm = (value: number) => ({ value, unit: 'mm' as const });

const fig = (id: string, placement?: ResourcePlacement, typeId = 'figure'): Resource => ({
  id, typeId, kind: 'svg', caption: `Caption ${id}.`, createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width: 400, height: 200 },
  ...(placement ? { placement } : {}),
});

const base = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  page: { width: mm(150), height: mm(200), margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
  layout: { layoutType: 'single' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  ...extra,
});

const build = (markdown: string, resources: Resource[], cfg: PostextConfig): VDTDocument =>
  buildDocument({ markdown, resources }, cfg, createMeasurementCache());

/** Number printed with each placed resource, by id. */
function numbers(doc: VDTDocument): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const b of [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])]) {
    const rb = b.resourceBlock;
    if (rb) out[rb.resource.id] = rb.number;
  }
  return out;
}

const TEXT = 'Some words of running text to set the paragraph. '.repeat(4);

describe('what a resource counter counts (EF-49)', () => {
  it('numbers every resource the text references, floated or inline, in order of first reference', () => {
    const md = [
      `${TEXT} See :ref{id="a"}.`,
      '::resource{id="b"}',
      `${TEXT} Then :ref{id="c"} and :ref{id="a"} again.`,
    ].join('\n\n');
    const doc = build(md, [fig('a'), fig('b', { position: 'here' }), fig('c', { position: 'top', span: 'page' })], base());
    expect(numbers(doc)).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('skips a resource only a design image element draws: a lone referenced plate is number I', () => {
    const plate: ResourceType = {
      id: 'plate', name: 'Plate', shortLabel: 'Pl.', captionPrefix: 'Plate',
      numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'roman-upper',
    };
    const cfg = base({
      resourceTypes: [plate],
      headingStyles: [{
        id: 'bleed',
        advancedDesign: {
          enabled: true,
          minHeight: mm(40),
          slot: { elements: [{ kind: 'image', id: 'art', resourceId: 'dawn', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(40), height: mm(20) } } }] },
        },
      }],
    });
    const md = `# Dawn {style="bleed"}\n\n${TEXT} See :ref{id="noon"}.`;
    const doc = build(md, [fig('dawn', undefined, 'plate'), fig('noon', undefined, 'plate')], cfg);
    const n = numbers(doc);
    expect(n.noon).toBe('I');
    expect(n.dawn).toBeUndefined();
  });

  it('{h1} counts every level-1 heading not styled numbered: false, even one that prints no number', () => {
    // The built-in types number `{h1}.{n}`: an article whose only H1 is its
    // title numbers its figures 1.1, 1.2…
    const md = `# The article title\n\n${TEXT} See :ref{id="a"} and :ref{id="b"}.`;
    expect(numbers(build(md, [fig('a'), fig('b')], base()))).toEqual({ a: '1.1', b: '1.2' });
  });

  it('…so an unnumbered title takes `{n}` types, or a heading style with numbered: false', () => {
    const md = `# The article title\n\n${TEXT} See :ref{id="a"} and :ref{id="b"}.`;
    const flat: ResourceType = {
      id: 'figure', name: 'Figure', shortLabel: 'Fig.', captionPrefix: 'Figure',
      numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal',
    };
    expect(numbers(build(md, [fig('a'), fig('b')], base({ resourceTypes: [flat] })))).toEqual({ a: '1', b: '2' });

    // An H1 that does not count leaves {h1} as it was — empty here, before
    // any counted H1: `{h1}.{n}` collapses to the counter, and
    // `resetOn: 'h1'` never fires across such headings.
    const titled = `# The article title {style="title"}\n\n${TEXT} See :ref{id="a"}.\n\n# Methods {style="title"}\n\n${TEXT} See :ref{id="b"}.`;
    const doc = build(titled, [fig('a'), fig('b')], base({ headingStyles: [{ id: 'title', numbered: false }] }));
    expect(numbers(doc)).toEqual({ a: '1', b: '2' });
  });

  it('an H1 with numbered: false leaves {h1} as it was — empty only before the first counted H1', () => {
    const md = `# Intro\n\n${TEXT} See :ref{id="a"}.\n\n# Appendix {style="plain"}\n\n${TEXT} See :ref{id="b"}.\n\n# Two\n\n${TEXT} See :ref{id="c"}.`;
    const doc = build(md, [fig('a'), fig('b'), fig('c')], base({ headingStyles: [{ id: 'plain', numbered: false }] }));
    // The appendix neither advances {h1} nor resets the count under it.
    expect(numbers(doc)).toEqual({ a: '1.1', b: '1.2', c: '2.1' });
  });
});
