import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { resolvePageTemplate, stripPageTemplatesDefaults } from '../../composed/templates.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import type { PageTemplate, PostextConfig, VDTDesignTextBlock, VDTDocument } from '../../index.js';

// #975: a child template or a variant takes an inherited decoration
// element out with `{ id, remove: true }`.

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
const text = (id: string, content: string) => ({
  kind: 'text', id, content,
  placement: { anchor: { to: 'container', edge: id === 'folio' ? 'bottom-center' : 'top-left' } },
} as never);

const BASE: PageTemplate = {
  id: 'base',
  frames: [{ name: 'texto', flow: true }],
  decoration: { elements: [text('head', 'Odd head'), text('head-even', 'Even head'), text('folio', '{pageNumber}')] },
};
const NO_EVEN: PageTemplate = { id: 'no-even', extends: 'base', decoration: { elements: [{ id: 'head-even', remove: true }] } };
const VARIANT: PageTemplate = { id: 'by-side', extends: 'base', variants: { verso: { decoration: { elements: [{ id: 'head', remove: true }] } } } };

const ids = (t: ReturnType<typeof resolvePageTemplate>) => t!.decoration.elements.map((e) => e.id);
const cfg = (templates: PageTemplate[]): Pick<PostextConfig, 'pageTemplates'> => ({ pageTemplates: templates });

describe('decoration element removal (#975)', () => {
  it('drops the inherited element and keeps the others in order', () => {
    expect(ids(resolvePageTemplate(cfg([BASE, NO_EVEN]), 'base'))).toEqual(['head', 'head-even', 'folio']);
    const t = resolvePageTemplate(cfg([BASE, NO_EVEN]), 'no-even');
    expect(ids(t)).toEqual(['head', 'folio']);
    // Paths still point at the template that wrote each element.
    expect(t!.decorationPaths).toEqual(['/pageTemplates/0/decoration/elements/0', '/pageTemplates/0/decoration/elements/2']);
  });

  it('removes in a variant, after the extends chain, on the page of that side only', () => {
    const c = cfg([BASE, VARIANT]);
    expect(ids(resolvePageTemplate(c, 'by-side', { parity: 'recto' }))).toEqual(['head', 'head-even', 'folio']);
    expect(ids(resolvePageTemplate(c, 'by-side', { parity: 'verso' }))).toEqual(['head-even', 'folio']);
  });

  it('a removal can be followed by a new element of the same id, and one naming nothing changes nothing', () => {
    const redo: PageTemplate = { id: 'redo', extends: 'base', decoration: { elements: [{ id: 'head', remove: true }, text('head', 'Other')] } };
    const t = resolvePageTemplate(cfg([BASE, redo]), 'redo');
    expect(ids(t)).toEqual(['head-even', 'folio', 'head']);
    const idle: PageTemplate = { id: 'idle', extends: 'base', decoration: { elements: [{ id: 'nothing', remove: true }] } };
    expect(ids(resolvePageTemplate(cfg([BASE, idle]), 'idle'))).toEqual(['head', 'head-even', 'folio']);
  });

  it('survives stripping and raises no warning', () => {
    expect(stripPageTemplatesDefaults([BASE, NO_EVEN])![1]!.decoration).toEqual({ elements: [{ id: 'head-even', remove: true }] });
    expect(collectConfigWarnings({ pageTemplates: [BASE, NO_EVEN] }).filter((w) => w.kind === 'contentInConfig' || w.kind === 'unknownConfigKey')).toEqual([]);
  });

  it('draws only the elements left: a page of the child shows no even head', () => {
    const doc: VDTDocument = buildDocument(
      { markdown: '::::page{template="no-even"}\n\n:::frame{slot="texto"}\n\nBody.\n\n:::\n\n::::' },
      {
        page: { width: mm(200), height: mm(260), dpi: 300, margins: { top: mm(20), bottom: mm(20), left: mm(20), right: mm(20) } } as never,
        pageTemplates: [BASE, NO_EVEN],
      },
      createMeasurementCache(),
    );
    const drawn = (doc.pages.find((p) => p.composed)!.composed!.decoration?.blocks ?? [])
      .filter((b): b is VDTDesignTextBlock => b.kind === 'text')
      .flatMap((b) => b.lines.map((l) => l.text));
    expect(drawn).toContain('Odd head');
    expect(drawn).not.toContain('Even head');
  });
});
