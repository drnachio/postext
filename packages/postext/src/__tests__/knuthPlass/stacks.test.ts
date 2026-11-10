import { describe, it, expect } from 'vitest';
import { edgesStack, foldEdge, isMonosyllable } from '../../knuthPlass/breakpoints.js';
import { resolveBodyTextConfig } from '../../defaults/text/bodyText.js';
import { buildDocument } from '../../pipeline/index.js';
import type { PostextConfig, VDTDocument } from '../../index.js';

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
const ON: PostextConfig['bodyText'] = { avoidStacks: true };
const lineTexts = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => l.text))));

const MD = 'Lo dijo lentamente y luego, tranquilamente, lo repitió de nuevo para que lo entendiera claramente '
  + 'la gente que estaba allí sentada, y la gente que lo oyó lo repitió de nuevo a la gente que no estaba, '
  + 'que la gente siempre repite lo que oye de la gente.';

const edge = (line: string, end: boolean): string => {
  const words = line.replace(/-$/, '').trim().split(/\s+/);
  return (end ? words[words.length - 1]! : words[0]!).replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase();
};
/** A line's first three characters, spaces included. */
const head = (line: string): string => line.trim().replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 3).toLowerCase();
const startStacks = (lines: string[]): number => lines.slice(1).filter((l, k) => edgesStack(edge(l, false), edge(lines[k]!, false), head(l), head(lines[k]!))).length;

describe('edgesStack', () => {
  it('stacks the same word, whatever its length and the character count', () => {
    // Short words (`y`, `a`, `de`, `un`) stack on their own, past the
    // characters the edges share.
    for (const w of ['y', 'a', 'de', 'un']) expect(edgesStack(w, w, '', '')).toBe(true);
    expect(edgesStack('y', 'y', 'o y', 'a y')).toBe(true);
    expect(edgesStack('que', 'que', 'que', 'que')).toBe(true);
    // Two different short words do not.
    expect(edgesStack('y', 'a', '', '')).toBe(false);
  });

  it('stacks the same characters at the edge, spaces included', () => {
    // `…en la` over `…de la`: ` la` is the same three characters.
    expect(edgesStack('la', 'la', ' la', ' la')).toBe(true);
    expect(edgesStack('ella', 'bala', 'lla', 'ala')).toBe(false);
    expect(edgesStack('lentamente', 'claramente', 'nte', 'nte')).toBe(true);
    // `de la` against `del todo`: `de ` is not `del`.
    expect(edgesStack('de', 'del', 'de ', 'del')).toBe(false);
  });

  it('never stacks an empty edge', () => {
    expect(edgesStack('', '', '', '')).toBe(false);
  });
});

describe('stacks in justified text', () => {
  it('are not avoided by default, so documents keep their lines', () => {
    const b = resolveBodyTextConfig();
    expect(b).toMatchObject({ avoidStacks: false, stackMinCharacters: 3, stackPenalty: 100000 });
    for (const w of [189, 210, 260]) {
      const plain = lineTexts(buildDocument({ markdown: MD }, column(w)));
      const explicit = lineTexts(buildDocument({ markdown: MD }, column(w, { avoidStacks: false, stackPenalty: 900, stackMinCharacters: 2 })));
      expect(explicit, `${w}`).toEqual(plain);
    }
  });

  it('avoid consecutive lines that start alike', () => {
    const off = lineTexts(buildDocument({ markdown: MD }, column(210)));
    const on = lineTexts(buildDocument({ markdown: MD }, column(210, ON)));
    expect(startStacks(off)).toBeGreaterThan(0);
    expect(startStacks(on)).toBe(0);
  });
});

describe('stacks are a limit, not a preference', () => {
  // A medical paragraph in a narrow justified column: as a preference, a
  // stack gave way to keep the spacing, and the breaker's node merging, or
  // a setting one line shorter (`looseness`), could keep one where another
  // setting avoided it.
  const TEXT = 'El término hombro congelado debería reservarse para la capsulitis adhesiva idiopática, en la que la rigidez sigue un curso natural conocido. El término hombro rígido puede utilizarse si se conoce la causa: hombro rígido postraumático, hombro rígido secundario a causas intraarticulares (lesiones condrales o labrales), capsulares (contracturas tras cirugía o inmovilización prolongada), extraarticulares (adherencias subacromiales, osificación heterotópica, malunión de fracturas) o causas neurológicas (lesiones del plexo braquial). La exploración de la movilidad pasiva y activa permite distinguir entre la debilidad y la rigidez, y la palpación de la cápsula orienta el diagnóstico de la lesión.';
  /** A line's last three characters, spaces included. */
  const tail = (line: string): string => line.replace(/-$/, '').trimEnd().replace(/[^\p{L}\p{N}]+$/u, '').slice(-3).toLowerCase();
  const endStacks = (lines: string[]): number => lines.slice(1).filter((l, k) => edgesStack(edge(l, true), edge(lines[k]!, true), tail(l), tail(lines[k]!))).length;

  it('never sets a stack where a setting avoids it', () => {
    for (let w = 240; w <= 360; w += 7) {
      const lines = lineTexts(buildDocument({ markdown: TEXT }, column(w, {
        textAlign: 'justify',
        avoidStacks: true,
      })));
      expect(endStacks(lines), `${w}`).toBe(0);
      expect(startStacks(lines), `${w}`).toBe(0);
    }
  });
});

describe('stacks in justified captions', () => {
  // Captions are broken as the running text is: two lines ending (or
  // starting) alike are avoided there too.
  const caption = (width: number, bodyText: PostextConfig['bodyText']): string[] => {
    const doc = buildDocument({
      markdown: 'Texto.\n\n::resource{id="fig"}',
      resources: [{
        id: 'fig', typeId: 'figure', kind: 'bitmap', caption: MD, createdAt: 0, updatedAt: 0,
        bitmap: { fileId: 'f.png', format: 'png', width: 400, height: 100 },
        placement: { position: 'here' },
      }],
    }, { ...column(width, bodyText), captionStyle: { align: 'justify' } });
    const blocks = [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
    return blocks.flatMap((b) => b.resourceBlock?.captionLines.map((l) => l.text) ?? []);
  };
  const tail = (line: string): string => line.replace(/-$/, '').trimEnd().replace(/[^\p{L}\p{N}]+$/u, '').slice(-3).toLowerCase();
  const stacks = (lines: string[]): number =>
    lines.slice(1).filter((l, k) => edgesStack(edge(l, true), edge(lines[k]!, true), tail(l), tail(lines[k]!))).length + startStacks(lines);

  it('avoids them where a setting does', () => {
    let seen = 0;
    for (let w = 160; w <= 300; w += 7) {
      const off = caption(w, {});
      const on = caption(w, ON);
      expect(on.length, `${w}`).toBeGreaterThan(1);
      seen += stacks(off);
      expect(stacks(on), `${w}`).toBe(0);
    }
    // The text does stack when the rule is off.
    expect(seen).toBeGreaterThan(0);
  });
});

describe('stacks in ragged captions and table cells', () => {
  // Set line by line, a ragged text cannot look back to avoid a stack:
  // with stacks avoided it is broken whole, as ragged running text is.
  const tail = (line: string): string => line.replace(/-$/, '').trimEnd().replace(/[^\p{L}\p{N}]+$/u, '').slice(-3).toLowerCase();
  const stacks = (lines: string[]): number =>
    lines.slice(1).filter((l, k) => edgesStack(edge(l, true), edge(lines[k]!, true), tail(l), tail(lines[k]!))).length + startStacks(lines);
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
  }, { ...column(width, bodyText), captionStyle: { align: 'left' } });
  const blocks = (doc: VDTDocument) => [...doc.blocks, ...doc.pages.flatMap((p) => p.floats ?? [])];
  const captionOf = (doc: VDTDocument) => blocks(doc).find((b) => b.resourceBlock?.kind === 'bitmap')!.resourceBlock!.captionLines.map((l) => l.text);
  const cellOf = (doc: VDTDocument) => blocks(doc).find((b) => b.resourceBlock?.kind === 'table')!.resourceBlock!.table!.cells[0]!.lines.map((l) => l.text);

  it('avoids them where a setting does', () => {
    let seen = 0;
    for (let w = 160; w <= 300; w += 7) {
      const off = build(w, {});
      const on = build(w, ON);
      seen += stacks(captionOf(off)) + stacks(cellOf(off));
      expect(stacks(captionOf(on)), `caption ${w}`).toBe(0);
      expect(stacks(cellOf(on)), `cell ${w}`).toBe(0);
      expect(cellOf(on).length, `${w}`).toBeGreaterThan(1);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('what stacks compare', () => {
  it('reads accented and plain letters alike', () => {
    expect(foldEdge('Sól')).toBe('sol');
    expect(foldEdge('ÁRBOL')).toBe('arbol');
    // `sólido` over `solidificado`: their first three characters stack.
    expect(edgesStack('solido', 'solidificado', foldEdge('sól'), foldEdge('sol'))).toBe(true);
  });

  it('tells monosyllables', () => {
    for (const w of ['a', 'y', 'o', 'e', 'u', 'de', 'la', 'el', 'en', 'que', 'con', 'por', 'bien', 'muy', 'los']) expect(isMonosyllable(w), w).toBe(true);
    for (const w of ['una', 'para', 'sobre', 'entre', 'casa', '3', '']) expect(isMonosyllable(w), w).toBe(false);
  });

  it('never lets a monosyllable stack, even with a soft stack penalty', () => {
    // A penalty of 3000 lets other stacks give way to the spacing; a
    // repeated `y`, `a`, `de`, `la` never does.
    const mono = (lines: string[], end: boolean) => lines.slice(1).filter((l, k) => {
      const a = foldEdge(edge(l, end));
      return a === foldEdge(edge(lines[k]!, end)) && isMonosyllable(a);
    }).length;
    let seenOff = 0;
    for (let w = 150; w <= 330; w += 6) {
      const soft = lineTexts(buildDocument({ markdown: MD }, column(w, { textAlign: 'justify', avoidStacks: true, stackPenalty: 3000 })));
      expect(mono(soft, true) + mono(soft, false), `${w}`).toBe(0);
      const off = lineTexts(buildDocument({ markdown: MD }, column(w, { textAlign: 'justify' })));
      seenOff += mono(off, true) + mono(off, false);
    }
    expect(seenOff).toBeGreaterThan(0);
  });
});
