import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { collectContentWarnings } from '../pipeline/contentWarnings';
import { parsePaperAttrs } from '../pipeline/paper';
import type { PostextConfig } from '../types';
import type { VDTPage } from '../vdt';

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

const config: PostextConfig = {
  page: {
    width: pt(360),
    height: pt(240),
    margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) },
  },
  layout: { layoutType: 'single' },
  colorPalette: [{ id: 'cream', name: 'Cream', value: { hex: '#f3ead3', model: 'hex' } }],
};

/** `n` paragraphs every word of which is `tag`, so any line tells which
 *  run it comes from. */
const filler = (tag: string, n: number) =>
  Array.from({ length: n }, () => Array.from({ length: 40 }, () => tag).join(' ')).join('\n\n');

/** The tags (`Matte`, `Gloss`…) of the lines set on a page. */
function tagsOn(page: VDTPage): Set<string> {
  const out = new Set<string>();
  for (const col of page.columns) {
    for (const b of col.blocks) {
      for (const line of b.lines) {
        for (const word of line.text.split(/\s+/)) if (/^[A-Z][a-z]+$/.test(word)) out.add(word);
      }
    }
  }
  return out;
}

describe(':::paper — a run of pages on another stock', () => {
  const md = `${filler('Matte', 12)}

:::paper{type=coatedGloss grammage=130 shade=#fff}
${filler('Gloss', 30)}
:::

${filler('After', 12)}`;
  const doc = buildDocument({ markdown: md }, config);

  it('stamps the pages set from inside the run, and only those', () => {
    const gloss = doc.pages.filter((p) => tagsOn(p).has('Gloss'));
    expect(gloss.length).toBeGreaterThan(1);
    for (const page of doc.pages) {
      if (tagsOn(page).has('Gloss')) {
        expect(page.paper).toEqual({ type: 'coatedGloss', grammage: 130, shade: { hex: '#ffffff', model: 'hex' } });
      } else {
        expect('paper' in page).toBe(false);
      }
    }
  });

  it('starts the run on a fresh page, and what follows it too', () => {
    for (const page of doc.pages) {
      const tags = tagsOn(page);
      // A stock covers whole pages: no page mixes text from in and out.
      expect(tags.has('Gloss') && (tags.has('Matte') || tags.has('After'))).toBe(false);
    }
    const firstGloss = doc.pages.findIndex((p) => tagsOn(p).has('Gloss'));
    expect(tagsOn(doc.pages[firstGloss - 1]!).has('Matte')).toBe(true);
    const lastGloss = doc.pages.map((p) => tagsOn(p).has('Gloss')).lastIndexOf(true);
    expect(tagsOn(doc.pages[lastGloss + 1]!).has('After')).toBe(true);
  });

  it('leaves a document without the container unchanged', () => {
    const plain = buildDocument({ markdown: filler('Matte', 6) }, config);
    expect(plain.pages.every((p) => !('paper' in p))).toBe(true);
  });

  it('leaves no blank page when the run ends the document', () => {
    const tail = buildDocument({ markdown: `${filler('Matte', 2)}\n\n:::paper{type=bible}\n${filler('Gloss', 2)}\n:::\n` }, config);
    const last = tail.pages[tail.pages.length - 1]!;
    expect(tagsOn(last).has('Gloss')).toBe(true);
    expect(last.paper).toEqual({ type: 'bible' });
  });
});

describe(':::paper — nesting', () => {
  it('merges an inner fence over the outer one, each breaking pages', () => {
    const md = `:::paper{type=coatedMatte grammage=150 showThrough=false}
${filler('Outer', 2)}

:::paper{grammage=200 shade=cream}
${filler('Inner', 2)}
:::

${filler('Tail', 2)}
:::

${filler('After', 1)}`;
    const doc = buildDocument({ markdown: md }, config);
    const outer = { type: 'coatedMatte', grammage: 150, showThrough: false };
    for (const page of doc.pages) {
      const tags = tagsOn(page);
      expect(tags.size).toBeLessThanOrEqual(1);
      if (tags.has('Outer') || tags.has('Tail')) expect(page.paper).toEqual(outer);
      if (tags.has('Inner')) {
        expect(page.paper).toEqual({
          ...outer,
          grammage: 200,
          shade: { hex: '#f3ead3', model: 'hex', paletteId: 'cream' },
        });
      }
      if (tags.has('After')) expect(page.paper).toBeUndefined();
    }
    expect(doc.pages.some((p) => tagsOn(p).has('Inner'))).toBe(true);
    expect(doc.pages.some((p) => tagsOn(p).has('Tail'))).toBe(true);
  });
});

describe(':::paper — attributes', () => {
  it('reads every attribute of FolioPaperConfig', () => {
    expect(parsePaperAttrs({
      type: 'bookWove', grammage: '80', bulk: '1.8', finish: 'uncoated', texture: 'laid',
      textureStrength: '0.5', shade: '#F6EFDC', showThrough: 'false',
    }).paper).toEqual({
      type: 'bookWove', grammage: 80, bulk: 1.8, finish: 'uncoated', texture: 'laid',
      textureStrength: 0.5, shade: { hex: '#f6efdc', model: 'hex' }, showThrough: false,
    });
    expect(parsePaperAttrs({ showThrough: '' }).paper).toEqual({ showThrough: true });
  });

  it('drops invalid values and unknown keys, and warns about each', () => {
    const attrs = {
      type: 'vellumPlus', grammage: '-3', bulk: 'thick', finish: 'shiny', texture: 'rough',
      textureStrength: '5', shade: 'nope', showThrough: 'maybe', weight: '90', id: 'plates',
    };
    const { paper, issues } = parsePaperAttrs(attrs);
    expect(paper).toEqual({});
    expect(issues.map((i) => i.key).sort()).toEqual(
      ['bulk', 'finish', 'grammage', 'shade', 'showThrough', 'texture', 'textureStrength', 'type', 'weight'],
    );

    const md = `:::paper{type=coatedGloss grammage=heavy}\n${filler('Gloss', 2)}\n:::\n`;
    const warnings = collectContentWarnings(md, config, []);
    expect(warnings.filter((w) => w.kind === 'paperAttributeInvalid')).toEqual([
      expect.objectContaining({ kind: 'paperAttributeInvalid', key: 'grammage', value: 'heavy' }),
    ]);
    const doc = buildDocument({ markdown: md }, config);
    expect(doc.pages[0]!.paper).toEqual({ type: 'coatedGloss' });
    expect(doc.contentWarnings?.some((w) => w.kind === 'paperAttributeInvalid')).toBe(true);
  });
});
