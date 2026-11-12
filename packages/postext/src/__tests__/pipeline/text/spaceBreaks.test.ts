import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { ruledSpaces, spaceBreakDemerits } from '../../../measure/spaceBreaks.js';
import { spaceBreaking } from '../../../pipeline/text/spaceBreaks.js';
import { findSpaceBreaks } from '../../../checks/spaceBreaks.js';
import { resolveBodyTextConfig, stripBodyTextDefaults } from '../../../defaults/index.js';
import { collectConfigWarnings } from '../../../checks/configWarnings.js';
import type { PostextConfig, VDTDocument } from '../../../index.js';

// #1519: a citation or a lone operator at a line edge, as composition rules
// ('allow' | 'warn' | 'avoid') the line breaker prices.

// Deterministic text measurement stub (no DOM in the node test env): every
// character, the space included, is 7 px wide.
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
const config = (width: number, bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
  locale: 'es',
  page: { dpi: 72, width: pt(width), height: pt(3000), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  bodyText: { firstLineIndent: pt(0), textAlign: 'justify', hyphenation: { enabled: true }, ...bodyText },
});
const linesOf = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => l.text))));

/** Both rules avoided at a cost no line outweighs, a loose one included: a
 *  break there is kept only where no setting avoids it. */
const DEAR: PostextConfig['bodyText'] = { citationBreaks: 'avoid', citationBreakPenalty: 1e10, operatorBreaks: 'avoid', operatorBreakPenalty: 1e10 };

const MD = 'En comparación con otros tests, el test de Napoleón obtuvo un LR+ = 18,29 y un LR– = 0,21, con p < 0,05 en todos los grupos. Sin embargo, otros autores [12] no lo confirmaron, y algunos estudios [14, 16] tampoco (18). La sensibilidad fue de 0,92 ± 0,03 frente a la de los estudios previos [21–24], y la especificidad, de 0,88 × 1,1 en la serie corregida [3].';
const WIDTHS = [98, 105, 112, 119, 126, 133, 140, 147, 154, 161, 168, 175, 182];

/** Breaks that leave a line starting with a citation or a piece of one
 *  ("16]"), or a line starting or ending on a lone sign: a line that does
 *  both counts twice, as it is reported. */
const faults = (lines: string[]): number => lines.reduce((n, l, i) => {
  const t = l.trim();
  const starts = i > 0 && (/^[[(]\d/u.test(t) || /^\d+[a-z]?[\])]/u.test(t) || /^[=<±×]\s/u.test(t));
  const ends = i + 1 < lines.length && /\s[=<±×]$/u.test(t);
  return n + (starts ? 1 : 0) + (ends ? 1 : 0);
}, 0);

describe('the spaces the rules price', () => {
  it('are the spaces before and inside a citation, and around a lone operator', () => {
    const text = 'autores [12] y [14, 16] con LR+ = 18,29 y p < 0,05 (18).';
    const at = ruledSpaces(text, { citations: true, operators: true })
      .map((s) => `${text.slice(0, s.at).split(' ').at(-1)}_${text.slice(s.at + 1).split(' ')[0]}`);
    // "(18)" after "0,05" follows a number: no citation.
    expect(at.sort()).toEqual(['<_0,05', '=_18,29', 'LR+_=', '[14,_16]', 'autores_[12]', 'p_<', 'y_[14,'].sort());
    expect(ruledSpaces(text, { citations: false, operators: false })).toEqual([]);
    // A word in brackets is no citation; a hyphen between words no operator.
    expect(ruledSpaces('el término [sic] y bien - mal', { citations: true, operators: true })).toEqual([]);
    // Nor a number in parentheses after a number (a year and an issue).
    expect(ruledSpaces('Lancet 2016 (3) 10', { citations: true, operators: false })).toEqual([]);
  });

  it('take the marker a numbered style sets for [@key, p. 12], and the signs added since the booleans', () => {
    expect(ruledSpaces('según Pérez [3, p. 12] y', { citations: true, operators: false }).map((s) => s.text)).toEqual(['[3, p. 12]', '[3, p. 12]']);
    for (const sign of ['+', '·', '→', '−', '÷']) {
      expect(ruledSpaces(`a ${sign} b`, { citations: false, operators: true }).map((s) => s.at)).toEqual([1, 3]);
    }
  });

  it('leave right-to-left and CJK text alone, match by match', () => {
    expect(ruledSpaces('قال المؤلف [12] ذلك', { citations: true, operators: true })).toEqual([]);
    // A Latin citation beside Arabic words elsewhere in the paragraph is
    // still a citation.
    expect(ruledSpaces('قال ذلك. Smith [12] dijo', { citations: true, operators: true }).map((s) => s.text)).toEqual(['[12]']);
  });

  it('cost the spaces they find, by piece', () => {
    const pieces = ['autores', ' ', '[12]', ' ', 'y', ' ', 'p', ' ', '<', ' ', '0,05'];
    const costs = spaceBreakDemerits(pieces, (i) => pieces[i] === ' ', { citations: 500, operators: 700 });
    expect([...costs!.entries()]).toEqual([[1, 500], [7, 700], [9, 700]]);
    expect(spaceBreakDemerits(pieces, (i) => pieces[i] === ' ', { citations: 0, operators: 0 })).toBeUndefined();
  });
});

describe('bodyText.citationBreaks and operatorBreaks', () => {
  it('are allowed by default and resolve, strip and check as composition rules', () => {
    expect(resolveBodyTextConfig({})).toMatchObject({ citationBreaks: 'allow', citationBreakPenalty: 10000, operatorBreaks: 'allow', operatorBreakPenalty: 10000 });
    expect(stripBodyTextDefaults({ citationBreaks: 'allow', operatorBreakPenalty: 10000 })).toBeUndefined();
    expect(stripBodyTextDefaults({ citationBreaks: 'avoid', operatorBreaks: 'warn', operatorBreakPenalty: 500 })).toEqual({ citationBreaks: 'avoid', operatorBreaks: 'warn', operatorBreakPenalty: 500 });
    expect(collectConfigWarnings({ bodyText: { operatorBreaks: 'never' as 'avoid' } })).toContainEqual({
      kind: 'unknownConfigValue', path: 'bodyText.operatorBreaks', value: 'never', used: 'allow',
    });
    // The breaker hears of them only under 'avoid', at a cost.
    expect(spaceBreaking(resolveBodyTextConfig({ citationBreaks: 'warn' }))).toBeUndefined();
    expect(spaceBreaking(resolveBodyTextConfig({ operatorBreaks: 'avoid', operatorBreakPenalty: 0 }))).toBeUndefined();
    expect(spaceBreaking(resolveBodyTextConfig({ citationBreaks: 'avoid' }))).toEqual({ citations: 10000, operators: 0 });
  });

  it("leave the lines as they were under 'allow' and 'warn', and report each fault under 'warn'", () => {
    let seen = 0;
    for (const width of WIDTHS) {
      const plain = buildDocument({ markdown: MD }, config(width));
      const warn = buildDocument({ markdown: MD }, config(width, { citationBreaks: 'warn', operatorBreaks: 'warn' }));
      expect(linesOf(warn), `${width}`).toEqual(linesOf(plain));
      const found = (warn.contentWarnings ?? []).filter((w) => w.kind === 'citationBreak' || w.kind === 'operatorBreak');
      expect(found.length, `${width}`).toBe(faults(linesOf(warn)));
      expect(found.length).toBe(findSpaceBreaks(warn).length);
      for (const w of found) {
        expect(w.pageIndex).toBe(0);
        expect(MD.slice(w.sourceStart, w.sourceEnd)).toContain(w.kind === 'citationBreak' || w.kind === 'operatorBreak' ? w.text : '');
      }
      expect((plain.contentWarnings ?? []).filter((w) => w.kind === 'citationBreak' || w.kind === 'operatorBreak')).toEqual([]);
      seen += found.length;
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("under 'avoid' at a high cost keep every citation and sign with its words where a setting can, and report the rest", () => {
    for (const textAlign of ['justify', 'left'] as const) {
      let off = 0;
      for (const width of WIDTHS) {
        off += faults(linesOf(buildDocument({ markdown: MD }, config(width, { textAlign }))));
        const doc = buildDocument({ markdown: MD }, config(width, { textAlign, ...DEAR }));
        const lines = linesOf(doc);
        // From 20 characters a line, every citation fits beside its word
        // ("estudios [14, 16]" is 17); narrower, some cannot.
        if (width >= 140) expect(faults(lines), `${textAlign} ${width}: ${lines.join(' | ')}`).toBe(0);
        // Those it kept are reported.
        expect((doc.contentWarnings ?? []).filter((w) => w.kind === 'citationBreak' || w.kind === 'operatorBreak').length, `${textAlign} ${width}`).toBe(faults(lines));
        // No space turned into a no-break space: the text is as written.
        expect(lines.join('')).not.toContain(' ');
      }
      expect(off, textAlign).toBeGreaterThan(0);
    }
  });

  it("under 'avoid' at the default cost set fewer faults than under 'allow'", () => {
    let off = 0;
    let on = 0;
    for (const width of WIDTHS) {
      off += faults(linesOf(buildDocument({ markdown: MD }, config(width))));
      on += faults(linesOf(buildDocument({ markdown: MD }, config(width, { citationBreaks: 'avoid', operatorBreaks: 'avoid' }))));
    }
    expect(off).toBeGreaterThan(0);
    expect(on).toBeLessThan(off);
  });
});

describe('citations and signs in captions and table cells', () => {
  const build = (width: number, bodyText: PostextConfig['bodyText']) => buildDocument({
    markdown: 'Texto.\n\n::resource{id="fig"}\n\n::resource{id="tab"}',
    resources: [
      {
        id: 'fig', typeId: 'figure', kind: 'bitmap', caption: MD, createdAt: 0, updatedAt: 0,
        bitmap: { fileId: 'f.png', format: 'png', width: 400, height: 100 },
        placement: { position: 'here' },
      },
      {
        id: 'tab', typeId: 'table', kind: 'table', caption: 'Tabla', createdAt: 0, updatedAt: 0,
        table: { model: { rows: [[{ content: MD }]] } },
        placement: { position: 'here' },
      },
    ],
  }, config(width, bodyText));
  const blocks = (doc: VDTDocument) => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
  const captionOf = (doc: VDTDocument) => blocks(doc).find((b) => b.resourceBlock?.kind === 'bitmap')!.resourceBlock!.captionLines.map((l) => l.text);
  const cellOf = (doc: VDTDocument) => blocks(doc).find((b) => b.resourceBlock?.kind === 'table')!.resourceBlock!.table!.cells[0]!.lines.map((l) => l.text);

  it('follow the rules too', () => {
    let seen = 0;
    for (let w = 160; w <= 300; w += 7) {
      const off = build(w, {});
      const on = build(w, DEAR);
      seen += faults(captionOf(off)) + faults(cellOf(off));
      expect(faults(captionOf(on)), `caption ${w}`).toBe(0);
      expect(faults(cellOf(on)), `cell ${w}`).toBe(0);
    }
    expect(seen).toBeGreaterThan(0);
  });
});
