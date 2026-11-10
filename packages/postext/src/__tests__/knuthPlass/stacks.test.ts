import { describe, it, expect } from 'vitest';
import { foldEdge, isMonosyllable, textEdges, edgesStack, LineEdges } from '../../knuthPlass/breakpoints.js';
import { stackWeight, OPAQUE } from '../../knuthPlass/breakpoints/edges.js';
import { resolveBodyTextConfig } from '../../defaults/text/bodyText.js';
import { stripBodyTextDefaults } from '../../defaults/text/bodyText/strip.js';
import { collectConfigWarnings } from '../../checks/configWarnings.js';
import { buildDocument } from '../../pipeline/index.js';
import { findStacks } from '../../checks/stacks.js';
import type { KPItem } from '../../knuthPlass/types.js';
import type { PostextConfig, VDTDocument } from '../../index.js';

// #1463: stacks, two lines in a row that end or start alike, as a
// composition rule ('allow' | 'warn' | 'avoid').

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
const column = (width: number, bodyText: PostextConfig['bodyText'] = {}): PostextConfig => ({
  locale: 'es',
  page: { dpi: 72, width: pt(width), height: pt(2000), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  bodyText: { firstLineIndent: pt(0), ...bodyText },
});
/** Stacks avoided at a cost no line outweighs, a loose one included: a
 *  stack is kept only where no setting avoids it. */
const DEAR: PostextConfig['bodyText'] = { stacks: 'avoid', stackPenalty: 1e10 };
const lineTexts = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => l.text))));
const edge = (text: string, end: boolean) => textEdges(text, 3, end);

const MD = 'Lo dijo lentamente y luego, tranquilamente, lo repitió de nuevo para que lo entendiera claramente '
  + 'la gente que estaba allí sentada, y la gente que lo oyó lo repitió de nuevo a la gente que no estaba, '
  + 'que la gente siempre repite lo que oye de la gente.';
const TEXT = 'El término hombro congelado debería reservarse para la capsulitis adhesiva idiopática, en la que la rigidez sigue un curso natural conocido. El término hombro rígido puede utilizarse si se conoce la causa: hombro rígido postraumático, hombro rígido secundario a causas intraarticulares (lesiones condrales o labrales), capsulares (contracturas tras cirugía o inmovilización prolongada), extraarticulares (adherencias subacromiales, osificación heterotópica, malunión de fracturas) o causas neurológicas (lesiones del plexo braquial). La exploración de la movilidad pasiva y activa permite distinguir entre la debilidad y la rigidez, y la palpación de la cápsula orienta el diagnóstico de la lesión.';

/** Stacks between consecutive lines of one paragraph, as `findStacks`
 *  reads them. */
const stacksIn = (lines: string[]): number => {
  let n = 0;
  for (let k = 1; k < lines.length; k++) {
    for (const end of [true, false]) if (edgesStack(edge(lines[k]!, end), edge(lines[k - 1]!, end))) n++;
  }
  return n;
};

describe('what stacks compare', () => {
  it('the same word at an edge, whatever its length', () => {
    expect(edge('va a decir que y', true)).toMatchObject({ word: 'y', chars: 'e y' });
    expect(edgesStack(edge('dijo que y', true), edge('vino luego y', true))).toBe(true);
    expect(edgesStack(edge('dijo que y', true), edge('vino luego a', true))).toBe(false);
  });

  it('the same characters at an edge, spaces included, past the punctuation', () => {
    expect(edge('lo vio en la', true).chars).toBe(' la');
    expect(edgesStack(edge('lo vio en la', true), edge('y otro de la', true))).toBe(true);
    expect(edgesStack(edge('lentamente,', true), edge('claramente.', true))).toBe(true);
    expect(edgesStack(edge('ella', true), edge('bala', true))).toBe(false);
    // `de la` against `del todo`: `de ` is not `del`.
    expect(edgesStack(edge('de la casa', false), edge('del todo', false))).toBe(false);
    expect(edge('«Casa, dijo', false)).toMatchObject({ word: 'casa', chars: 'cas' });
  });

  it('reads accented and plain letters alike', () => {
    expect(foldEdge('Sól')).toBe('sol');
    expect(foldEdge('ÁRBOL')).toBe('arbol');
    expect(edgesStack(edge('sólido y', false), edge('solidez', false))).toBe(true);
  });

  it('never compares a formula, a chip or a swatch, nor credits the word before it', () => {
    expect(edge(`la suma ${OPAQUE}`, true)).toMatchObject({ word: '', chars: '' });
    expect(edge(`${OPAQUE} es la suma`, false)).toMatchObject({ word: '', chars: '' });
  });

  it('has no edges in scripts without word spaces', () => {
    expect(edge('我们今天去学校', true)).toMatchObject({ word: '', chars: '' });
    expect(edge('きょうはがっこうへ', false)).toMatchObject({ word: '', chars: '' });
    expect(edge('ภาษาไทยไม่มีช่องว่าง', true)).toMatchObject({ word: '', chars: '' });
    // Arabic, Greek and Cyrillic separate their words: compared.
    expect(edge('قال في الكتاب', true).word).toBe('الكتاب');
    expect(edgesStack(edge('сказал он и', true), edge('пришёл и', true))).toBe(true);
  });

  it('a word longer than any the eye reads as one has no word edge', () => {
    expect(edge(`la ${'a'.repeat(60)}`, true).word).toBe('');
  });

  it('tells monosyllables in Latin, Greek and Cyrillic, and none elsewhere', () => {
    for (const w of ['a', 'y', 'de', 'la', 'que', 'con', 'bien', 'muy', 'los', 'και', 'το', 'и', 'на', 'что']) expect(isMonosyllable(foldEdge(w)), w).toBe(true);
    for (const w of ['una', 'para', 'sobre', 'casa', 'είναι', 'когда', '3', '', 'في', 'الكتاب', '我']) expect(isMonosyllable(foldEdge(w)), w).toBe(false);
    // A repeated monosyllable costs twice.
    expect(stackWeight(edge('va de', true), edge('vino de', true))).toBe(2);
    expect(stackWeight(edge('va casa', true), edge('vino casa', true))).toBe(1);
  });
});

describe('the line edges of a paragraph', () => {
  const box = (text?: string): KPItem => ({ type: 'box', width: 10, sourceIndex: 0, ...(text !== undefined ? { text } : {}) });
  const space: KPItem = { type: 'glue', width: 5, stretch: 2, shrink: 1, sourceIndex: 0 };
  const end: KPItem[] = [{ type: 'glue', width: 0, stretch: 1e9, shrink: 0, sourceIndex: -1 }, { type: 'penalty', width: 0, penalty: -10000, flagged: false, sourceIndex: -1 }];

  it('does not credit a box with no text the word before it', () => {
    const items = [box('casa'), space, box(), space, box('fin'), ...end];
    const edges = new LineEdges(items, 3);
    expect(edges.end(3)).toMatchObject({ word: '', chars: '' });
    expect(edges.end(1).word).toBe('casa');
  });

  it('does not glue the words across a forced or a zero-width break', () => {
    const forced = [box('uno'), { type: 'penalty', width: 0, penalty: -10000, flagged: false, sourceIndex: 0 } as KPItem, box('dos'), space, box('tres'), ...end];
    expect(new LineEdges(forced, 3).end(3).word).toBe('dos');
    const zw = [box('uno'), { type: 'penalty', width: 0, penalty: 0, flagged: false, sourceIndex: 0, separates: true } as KPItem, box('dos'), space, box('tres'), ...end];
    const edges = new LineEdges(zw, 3);
    expect(edges.end(3).word).toBe('dos');
    expect(edges.start(1).word).toBe('dos');
  });

  it('leaves out of a short line the edge it does not hold', () => {
    const items = [box('dijo'), space, box('que'), space, box('y'), ...end];
    const edges = new LineEdges(items, 3);
    // The last line, "y", holds its word but not three characters.
    expect(edges.lineEnd(3, items.length - 1)).toMatchObject({ word: 'y', chars: '' });
    expect(edges.end(items.length - 1).chars).toBe('e y');
  });
});

describe('bodyText.stacks', () => {
  it('is allowed by default and resolves, strips and checks as a composition rule', () => {
    expect(resolveBodyTextConfig({})).toMatchObject({ stacks: 'allow', stackMinCharacters: 3, stackPenalty: 3000 });
    expect(resolveBodyTextConfig({ stacks: 'never' as 'avoid' }).stacks).toBe('allow');
    expect(stripBodyTextDefaults({ stacks: 'allow', stackMinCharacters: 3, stackPenalty: 3000 })).toBeUndefined();
    expect(stripBodyTextDefaults({ stacks: 'warn', stackPenalty: 900 })).toEqual({ stacks: 'warn', stackPenalty: 900 });
    expect(collectConfigWarnings({ bodyText: { stacks: 'never' as 'avoid' } })).toContainEqual({
      kind: 'unknownConfigValue', path: 'bodyText.stacks', value: 'never', used: 'allow',
    });
  });

  it("leaves the lines as they were under 'allow' and 'warn', and under 'avoid' at no cost", () => {
    for (const w of [189, 210, 260]) {
      const plain = lineTexts(buildDocument({ markdown: MD }, column(w)));
      expect(lineTexts(buildDocument({ markdown: MD }, column(w, { stacks: 'warn', stackMinCharacters: 2 }))), `${w}`).toEqual(plain);
      expect(lineTexts(buildDocument({ markdown: MD }, column(w, { stacks: 'avoid', stackPenalty: 0 }))), `${w}`).toEqual(plain);
    }
  });

  it("reports each stack under 'warn', and none under 'allow'", () => {
    const md = TEXT;
    let reported = 0;
    for (let w = 240; w <= 360; w += 20) {
      const warn = buildDocument({ markdown: md }, column(w, { textAlign: 'justify', stacks: 'warn' }));
      const found = (warn.contentWarnings ?? []).filter((x) => x.kind === 'stack');
      expect(found.length, `${w}`).toBe(findStacks(warn).length);
      expect(found.length, `${w}`).toBe(stacksIn(lineTexts(warn)));
      reported += found.length;
      for (const s of found) {
        if (s.kind !== 'stack') continue;
        expect(s.pageIndex).toBe(0);
        expect(md.slice(s.sourceStart, s.sourceEnd)).toContain(s.lines[0].trim().split(' ')[0]!);
        const [a, b] = s.lines.map((l) => edge(l, s.edge === 'end'));
        expect(edgesStack(a!, b!)).toBe(true);
      }
      const allow = buildDocument({ markdown: md }, column(w, { textAlign: 'justify' }));
      expect((allow.contentWarnings ?? []).filter((x) => x.kind === 'stack')).toEqual([]);
    }
    expect(reported).toBeGreaterThan(0);
  });

  it("under 'avoid' at a high cost sets no stack where a setting avoids it", () => {
    let off = 0;
    for (let w = 240; w <= 360; w += 7) {
      off += stacksIn(lineTexts(buildDocument({ markdown: TEXT }, column(w, { textAlign: 'justify' }))));
      const on = buildDocument({ markdown: TEXT }, column(w, { textAlign: 'justify', ...DEAR }));
      expect(stacksIn(lineTexts(on)), `${w}`).toBe(0);
      // The stacks it kept are reported: none here.
      expect((on.contentWarnings ?? []).filter((x) => x.kind === 'stack'), `${w}`).toEqual([]);
    }
    expect(off).toBeGreaterThan(0);
  });

  it("under 'avoid' at the default cost sets fewer stacks, in ragged text too", () => {
    for (const textAlign of ['justify', 'left'] as const) {
      let off = 0;
      let on = 0;
      for (let w = 200; w <= 360; w += 8) {
        const extra = textAlign === 'left' ? { optimalRagged: true } : {};
        off += stacksIn(lineTexts(buildDocument({ markdown: TEXT + '\n\n' + MD }, column(w, { textAlign, ...extra }))));
        on += stacksIn(lineTexts(buildDocument({ markdown: TEXT + '\n\n' + MD }, column(w, { textAlign, ...extra, stacks: 'avoid' }))));
      }
      expect(on, textAlign).toBeLessThan(off);
    }
  });

  it('never compares an inline formula by its source', () => {
    // Two lines ending on the same formula: no word, no characters.
    const md = 'Sea la suma $x+y$ y luego otra suma $x+y$ y una tercera suma $x+y$ y una cuarta suma $x+y$ y la quinta $x+y$';
    const doc = buildDocument({ markdown: md }, column(120, { stacks: 'warn' }));
    for (const s of findStacks(doc)) expect(s.text).not.toMatch(/[+$]/);
  });
});

describe('stacks in captions and table cells', () => {
  const build = (width: number, bodyText: PostextConfig['bodyText'], align: 'justify' | 'left') => buildDocument({
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
  }, { ...column(width, bodyText), captionStyle: { align } });
  const blocks = (doc: VDTDocument) => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
  const captionOf = (doc: VDTDocument) => blocks(doc).find((b) => b.resourceBlock?.kind === 'bitmap')!.resourceBlock!.captionLines.map((l) => l.text);
  const cellOf = (doc: VDTDocument) => blocks(doc).find((b) => b.resourceBlock?.kind === 'table')!.resourceBlock!.table!.cells[0]!.lines.map((l) => l.text);

  for (const align of ['justify', 'left'] as const) {
    it(`avoids them where a setting does (${align})`, () => {
      let seen = 0;
      for (let w = 160; w <= 300; w += 7) {
        const off = build(w, {}, align);
        const on = build(w, DEAR, align);
        seen += stacksIn(captionOf(off)) + stacksIn(cellOf(off));
        expect(stacksIn(captionOf(on)), `caption ${w}`).toBe(0);
        expect(stacksIn(cellOf(on)), `cell ${w}`).toBe(0);
        expect(cellOf(on).length, `${w}`).toBeGreaterThan(1);
      }
      expect(seen).toBeGreaterThan(0);
    });
  }
});
