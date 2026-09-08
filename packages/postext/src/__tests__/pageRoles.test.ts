import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { classifyPage } from '../pipeline/pageRoles';
import { resolveAllConfig } from '../pipeline/config';
import { createVDTPage } from '../vdt';
import type { PostextConfig, DesignElement } from '../types';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });

const smallPage: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(240),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
  },
};

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `Paragraph ${i} with enough words to consume vertical space and force the column and page to overflow onto following pages.`,
  ).join('\n\n');

/** Two chapters: H1 defaults to `breakBefore: { enabled: true, parity: 'always-odd' }`,
 *  so chapter 2 is preceded by a mandatory blank separator (and parity padding). */
const twoChapters = `# One\n\n${filler(60)}\n\n# Two\n\n${filler(4)}`;

describe('classifyPages', () => {
  it('classifies opener / body / blank pages', () => {
    const doc = buildDocument({ markdown: twoChapters }, smallPage);
    const roles = doc.pages.map((p) => p.role);
    expect(roles[0]).toBe('opener');
    expect(roles[1]).toBe('body');
    expect(roles).toContain('blank');
    // Every page carrying the second H1 is an opener; blank flags map to 'blank'.
    for (const p of doc.pages) {
      const first = p.columns.find((c) => c.blocks.length > 0)?.blocks[0];
      if (p.blankForForce || p.blankForParity) expect(p.role).toBe('blank');
      else if (first?.type === 'heading' && first.headingLevel === 1) expect(p.role).toBe('opener');
    }
    expect(doc.pages.filter((p) => p.role === 'opener')).toHaveLength(2);
  });

  it('a heading that neither spans the page nor breaks before it does not make an opener', () => {
    const doc = buildDocument(
      { markdown: `## Section\n\n${filler(3)}` },
      { ...smallPage, headings: { levels: [{ level: 2, breakBefore: { enabled: false } }] } },
    );
    expect(doc.pages[0]!.role).toBe('body');
  });

  it('classifyPage: part pages and empty pages', () => {
    const resolved = resolveAllConfig(smallPage);
    const empty = createVDTPage(0, 100, 100);
    expect(classifyPage(empty, resolved)).toBe('blank');
    const part = createVDTPage(1, 100, 100);
    part.partInfo = { number: 'I', title: 'Part One' };
    part.columns.push({ index: 0, bbox: { x: 0, y: 0, width: 100, height: 100 }, blocks: [{
      id: 'b', type: 'paragraph', bbox: { x: 0, y: 0, width: 0, height: 0 }, lines: [], pageIndex: 1, columnIndex: 0,
      dirty: false, snappedToGrid: false, fontString: '', color: '', textAlign: 'left',
    }], availableHeight: 100, baselineOffset: 0 });
    expect(classifyPage(part, resolved)).toBe('part');
  });
});

describe('per-element pages filter', () => {
  const header = (pages: DesignElement['pages']): PostextConfig['header'] => ({
    elements: [{
      kind: 'text', id: 'el', pages, content: '{pageNumber}', fontSize: pt(8), overflow: 'ellipsis-end',
      placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
    }],
  });

  it("pages:'body' element is hidden on the opener page", () => {
    const doc = buildDocument({ markdown: twoChapters }, { ...smallPage, header: header('body') });
    const opener = doc.pages[0]!;
    const body = doc.pages[1]!;
    expect(opener.role).toBe('opener');
    expect(opener.header).toBeUndefined();
    expect(body.role).toBe('body');
    expect(body.header?.blocks).toHaveLength(1);
  });

  it("pages:'opener' folio appears only on openers", () => {
    const doc = buildDocument({ markdown: twoChapters }, { ...smallPage, footer: header('opener') });
    for (const p of doc.pages) {
      if (p.role === 'opener') expect(p.footer?.blocks).toHaveLength(1);
      else expect(p.footer).toBeUndefined();
    }
  });

  it("pages:'all' (default) renders everywhere, blank pages included", () => {
    const doc = buildDocument({ markdown: twoChapters }, { ...smallPage, footer: header(undefined) });
    for (const p of doc.pages) expect(p.footer?.blocks).toHaveLength(1);
  });
});
