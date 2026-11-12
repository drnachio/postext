import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { findStacks } from '../../../checks/stacks.js';
import { useWasmLineBreaker } from '../../../knuthPlass/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import type { PostextConfig, VDTDocument, VDTLine } from '../../../index.js';

// #1542: the line-edge rules (stacks, citation and operator breaks) in the
// line breakers outside the running text's Knuth–Plass: the greedy
// fallback, verse turnovers, contents and index entries, ragged text; and
// the faults of captions and table cells reported under 'warn'.

// Every character, the space included, is 7 px wide.
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
const config = (width: number, bodyText: PostextConfig['bodyText'] = {}, extra: PostextConfig = {}): PostextConfig => ({
  locale: 'es',
  page: { dpi: 72, width: pt(width), height: pt(6000), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  ...extra,
  bodyText: { firstLineIndent: pt(0), textAlign: 'justify', hyphenation: { enabled: true }, ...bodyText },
});
const textOf = (lines: readonly VDTLine[]): string[] => lines.map((l) => l.text);
const bodyLines = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => textOf(b.lines))));

/** Both space rules avoided at a cost no line outweighs. */
const DEAR: PostextConfig['bodyText'] = { citationBreaks: 'avoid', citationBreakPenalty: 1e10, operatorBreaks: 'avoid', operatorBreakPenalty: 1e10 };
const STACKS: PostextConfig['bodyText'] = { stacks: 'avoid', stackPenalty: 1e10 };

/** Breaks that leave a line starting with a citation or a piece of one, or
 *  starting or ending on a lone sign. */
const faults = (lines: string[]): number => lines.reduce((n, l, i) => {
  const t = l.trim();
  const starts = i > 0 && (/^[[(]\d/u.test(t) || /^\d+[a-z]?[\])]/u.test(t) || /^[=<±×]\s/u.test(t));
  const ends = i + 1 < lines.length && /\s[=<±×]$/u.test(t);
  return n + (starts ? 1 : 0) + (ends ? 1 : 0);
}, 0);

const CITED = 'Otros autores [12] no lo confirmaron, y algunos estudios [14, 16] tampoco, con p < 0,05 en todos los grupos y un LR+ = 18,29 en la serie corregida [3] de los estudios [21–24].';

afterEach(() => useWasmLineBreaker(true));

describe('the greedy fallback', () => {
  // A token with no break wider than the measure: Knuth–Plass finds no
  // setting within it, and the word-by-word breaker sets the paragraph.
  const LONG = 'BCDFGHJKLMNPQRSTVWXZBCDFGHJKLMNP';
  for (const [name, md] of [['plain', `${LONG} ${CITED}`], ['formatted', `*${LONG}* ${CITED}`]] as const) {
    it(`keeps citations and signs with their words where it can (${name} text)`, () => {
      let off = 0;
      let on = 0;
      let greedy = 0;
      for (const textAlign of ['justify', 'left'] as const) {
        for (let width = 112; width <= 210; width += 7) {
          const plain = buildDocument({ markdown: md }, config(width, { textAlign }));
          const ruled = buildDocument({ markdown: md }, config(width, { textAlign, ...DEAR }));
          // Only where the token was divided: the paragraph went to the
          // greedy pass.
          if (!ruled.blocks.some((b) => b.lines.some((l) => l.wordDivided !== undefined))) continue;
          greedy++;
          off += faults(bodyLines(plain));
          on += faults(bodyLines(ruled));
          // No line runs past the measure for it.
          for (const b of ruled.blocks) for (const l of b.lines) expect(l.bbox.width).toBeLessThanOrEqual(width + 0.01);
        }
      }
      expect(greedy).toBeGreaterThan(5);
      expect(off).toBeGreaterThan(0);
      expect(on).toBeLessThan(off);
    });
  }

  it('ends a line elsewhere when it would end on the word the line above ends on', () => {
    const md = `${LONG} ${'de la casa de la sierra y de la mar de la luna, de la noche y del día de la fiesta de la vida '.repeat(3)}`;
    let off = 0;
    let on = 0;
    for (let width = 98; width <= 210; width += 7) {
      off += findStacks(buildDocument({ markdown: md }, config(width, { textAlign: 'left', stacks: 'warn' }))).filter((s) => s.edge === 'end').length;
      on += findStacks(buildDocument({ markdown: md }, config(width, { textAlign: 'left', ...STACKS }))).filter((s) => s.edge === 'end').length;
    }
    expect(off).toBeGreaterThan(0);
    expect(on).toBeLessThan(off);
  });
});

describe('verse turnovers', () => {
  const md = (line: string) => `:::verse{align=start}\n${line}\nUna línea corta.\n:::`;
  it('break under the rules', () => {
    let off = 0;
    for (let width = 140; width <= 280; width += 7) {
      const verse = (doc: VDTDocument) => doc.blocks.flatMap((b) => textOf(b.lines.filter((l) => l.verseLine)));
      const plain = verse(buildDocument({ markdown: md(CITED) }, config(width, { textAlign: 'left' })));
      const ruled = verse(buildDocument({ markdown: md(CITED) }, config(width, { textAlign: 'left', ...DEAR })));
      off += faults(plain);
      expect(faults(ruled), `${width}: ${ruled.join(' | ')}`).toBe(0);
      expect(ruled.length).toBeGreaterThan(2);
    }
    expect(off).toBeGreaterThan(0);
  });
});

describe('contents and index entries', () => {
  const TITLE = 'Resultados con p < 0,05 en el grupo de control y LR+ = 18,29 en la serie de los autores [12] y [14]';
  it('a contents entry that wraps is broken under the rules', () => {
    const md = `:::toc\n:::\n\n# ${TITLE}\n\nTexto.`;
    let off = 0;
    for (let width = 140; width <= 320; width += 7) {
      const toc = (doc: VDTDocument) => doc.blocks.filter((b) => b.tocEntry).flatMap((b) => textOf(b.lines));
      const plain = toc(buildDocument({ markdown: md }, config(width)));
      const ruled = toc(buildDocument({ markdown: md }, config(width, DEAR)));
      expect(ruled.length, `${width}`).toBeGreaterThan(1);
      off += faults(plain);
      expect(faults(ruled), `${width}: ${ruled.join(' | ')}`).toBe(0);
    }
    expect(off).toBeGreaterThan(0);
  });

  it('an index entry that turns over is broken under the rules', () => {
    // No brackets in a term: they would close the mark.
    const md = 'Texto :index[Resultados con p < 0,05 en el grupo de control y LR+ = 18,29 en la serie corregida con p < 0,01 en los grupos] y más.\n\n:::index\n:::';
    let off = 0;
    for (let width = 140; width <= 320; width += 7) {
      const index = (doc: VDTDocument) => doc.blocks.filter((b) => b.lines.some((l) => l.indexLevel !== undefined)).flatMap((b) => textOf(b.lines));
      const plain = index(buildDocument({ markdown: md }, config(width)));
      const ruled = index(buildDocument({ markdown: md }, config(width, DEAR)));
      expect(ruled.length, `${width}`).toBeGreaterThan(1);
      off += faults(plain);
      expect(faults(ruled), `${width}: ${ruled.join(' | ')}`).toBe(0);
    }
    expect(off).toBeGreaterThan(0);
  });
});

describe('captions and table cells under warn', () => {
  const build = (width: number, bodyText: PostextConfig['bodyText']) => buildDocument({
    markdown: 'Texto.\n\n::resource{id="fig"}\n\n::resource{id="tab"}',
    resources: [
      {
        id: 'fig', typeId: 'figure', kind: 'bitmap', caption: CITED, createdAt: 0, updatedAt: 0,
        bitmap: { fileId: 'f.png', format: 'png', width: 400, height: 100 },
        placement: { position: 'here' },
      },
      {
        id: 'tab', typeId: 'table', kind: 'table', caption: 'Tabla', createdAt: 0, updatedAt: 0,
        table: { model: { rows: [[{ content: 'Celda' }, { content: CITED }]] } },
        placement: { position: 'here' },
      },
    ],
  }, config(width, bodyText));
  const resourceLines = (doc: VDTDocument, kind: 'bitmap' | 'table'): VDTLine[] => {
    const rb = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])].find((b) => b.resourceBlock?.kind === kind)!.resourceBlock!;
    return kind === 'table' ? rb.table!.cells.find((c) => c.col === 1)!.lines : rb.captionLines;
  };

  it('report each citation and operator break with the caption or cell it lies in', () => {
    let seen = 0;
    for (let width = 160; width <= 300; width += 14) {
      const doc = build(width, { citationBreaks: 'warn', operatorBreaks: 'warn' });
      const warned = (doc.contentWarnings ?? []).filter((w) => (w.kind === 'citationBreak' || w.kind === 'operatorBreak') && w.resourceId !== undefined);
      const caption = warned.filter((w) => 'part' in w && w.part === 'caption' && w.resourceId === 'fig');
      const cell = warned.filter((w) => 'part' in w && w.part === 'cell' && w.resourceId === 'tab');
      expect(caption.length, `caption ${width}`).toBe(faults(textOf(resourceLines(doc, 'bitmap'))));
      expect(cell.length, `cell ${width}`).toBe(faults(textOf(resourceLines(doc, 'table'))));
      for (const w of cell) expect('cell' in w && w.cell).toEqual({ row: 0, col: 1 });
      for (const w of warned) {
        expect(w.pageIndex).toBe(0);
        expect(formatWarning(w)).toMatch(/^In (the caption of|cell 1, 2 of the table) "(fig|tab)": /);
      }
      seen += warned.length;
      // Under 'allow', none.
      expect((build(width, {}).contentWarnings ?? []).filter((w) => w.kind === 'citationBreak' || w.kind === 'operatorBreak')).toEqual([]);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('report stacks there too, and under avoid only those the breaker kept', () => {
    const repeated = 'de la casa de la sierra y de la mar de la luna, de la noche y del día de la fiesta de la vida de la casa de la sierra';
    let warned = 0;
    let kept = 0;
    for (let width = 98; width <= 210; width += 7) {
      const doc = buildDocument({
        markdown: 'Texto.\n\n::resource{id="fig"}',
        resources: [{ id: 'fig', typeId: 'figure', kind: 'bitmap', caption: repeated, createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f.png', format: 'png', width: 400, height: 100 }, placement: { position: 'here' } }],
      }, config(width, { stacks: 'warn' }));
      warned += (doc.contentWarnings ?? []).filter((w) => w.kind === 'stack' && w.resourceId === 'fig').length;
      const avoided = buildDocument({
        markdown: 'Texto.\n\n::resource{id="fig"}',
        resources: [{ id: 'fig', typeId: 'figure', kind: 'bitmap', caption: repeated, createdAt: 0, updatedAt: 0, bitmap: { fileId: 'f.png', format: 'png', width: 400, height: 100 }, placement: { position: 'here' } }],
      }, config(width, STACKS));
      kept += (avoided.contentWarnings ?? []).filter((w) => w.kind === 'stack' && w.resourceId === 'fig').length;
    }
    expect(warned).toBeGreaterThan(0);
    expect(kept).toBeLessThan(warned);
  });
});

describe('ragged text and stacks', () => {
  const md = 'de la casa de la sierra y de la mar de la luna, de la noche y del día de la fiesta de la vida, de la casa y de la sierra de la mar, de la luna y de la noche del día.';
  it("is broken whole on Knuth–Plass under stacks: 'avoid' without optimalRagged, as under the space rules, in both breakers", () => {
    let off = 0;
    let on = 0;
    for (let width = 98; width <= 210; width += 7) {
      const ragged = { textAlign: 'left' as const, optimalRagged: false, ...STACKS };
      const lines = bodyLines(buildDocument({ markdown: md }, config(width, ragged)));
      // The same lines as with optimalRagged asked for.
      expect(lines, `${width}`).toEqual(bodyLines(buildDocument({ markdown: md }, config(width, { ...ragged, optimalRagged: true }))));
      // The TypeScript breaker sets them alike.
      useWasmLineBreaker(false);
      expect(bodyLines(buildDocument({ markdown: md }, config(width, ragged))), `ts ${width}`).toEqual(lines);
      useWasmLineBreaker(true);
      off += findStacks(buildDocument({ markdown: md }, config(width, { textAlign: 'left', optimalRagged: false, stacks: 'warn' }))).length;
      on += findStacks(buildDocument({ markdown: md }, config(width, ragged))).length;
    }
    expect(off).toBeGreaterThan(0);
    expect(on).toBeLessThan(off);
  });
});
