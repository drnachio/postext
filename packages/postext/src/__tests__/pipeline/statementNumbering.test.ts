import { describe, it, expect, beforeAll } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { parseMarkdown } from '../../parse';
import { initMathEngine } from '../../math';
import { resolveAllConfig } from '../../pipeline/config';
import { applyStatementNumbering, numberStatements } from '../../pipeline/statementNumbering';
import { continuationAfter, contentOutline } from '../../pipeline/continuation';
import { resolveMathConfig, stripMathDefaults } from '../../defaults';
import type { CalloutStyleConfig, PostextConfig, VDTBlock, VDTDocument } from '../../index';

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

beforeAll(async () => {
  await initMathEngine();
}, 60_000);

const pt = (value: number) => ({ value, unit: 'pt' as const });

const THEOREMS: CalloutStyleConfig[] = [
  { id: 'theorem', numbering: { label: 'Theorem' }, body: { italic: true } },
  { id: 'lemma', numbering: { label: 'Lemma', counter: 'theorem' } },
  { id: 'definition', numbering: { label: 'Definition' } },
  { id: 'proof', numbering: { label: 'Proof', counter: false, bold: false, italic: true }, endMark: '□' },
];

const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  bodyText: { firstLineIndent: pt(0) },
  headings: { levels: [] },
  calloutStyles: THEOREMS,
};

const build = (markdown: string, config: PostextConfig = PAGE): VDTDocument =>
  buildDocument({ markdown }, config, createMeasurementCache());

const blocksOf = (doc: VDTDocument): VDTBlock[] => doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks));
const segText = (b: VDTBlock): string => b.lines.map((l) => (l.segments ?? []).map((s) => s.text).join('')).join(' ');
const refTexts = (doc: VDTDocument): string[] =>
  blocksOf(doc).flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.refResourceId !== undefined).map((s) => s.text)));
const texOf = (doc: VDTDocument): string[] => blocksOf(doc).filter((b) => b.type === 'mathDisplay').map((b) => b.tex ?? '');

const numbered = (markdown: string, config: PostextConfig = PAGE) => {
  const resolved = resolveAllConfig(config);
  const blocks = parseMarkdown(markdown);
  const numbering = numberStatements(blocks, resolved);
  return { numbering, blocks: applyStatementNumbering(blocks, numbering, resolved) };
};

describe('labelled equations (#530)', () => {
  it('numbers each labelled display in reading order, the label turned into a tag', () => {
    const { numbering, blocks } = numbered('$$a = b \\label{eq:a}$$\n\n$$c = d$$\n\n$$\ne = f\n\\label{eq:e}\n$$');
    expect([...numbering.targets.values()].map((t) => [t.id, t.number, t.label])).toEqual([['eq:a', '1', '(1)'], ['eq:e', '2', '(2)']]);
    const tex = blocks.filter((b) => b.type === 'mathDisplay').map((b) => b.tex);
    expect(tex[0]).toBe('a = b \\tag*{(1)}');
    expect(tex[1]).toBe('c = d');
    expect(tex[2]).toContain('\\tag*{(2)}');
    expect(tex[2]).not.toContain('\\label');
    expect(numbering.counters.equation?.counter).toBe(2);
  });

  it('numbers the labelled rows of an align, skipping \\nonumber rows', () => {
    const { numbering, blocks } = numbered('$$\n\\begin{align}\nx &= 1 \\label{eq:x} \\\\\ny &= 2 \\nonumber \\label{eq:y} \\\\\nz &= 3 \\label{eq:z}\n\\end{align}\n$$');
    expect(numbering.targets.get('eq:x')?.number).toBe('1');
    expect(numbering.targets.has('eq:y')).toBe(false);
    expect(numbering.targets.get('eq:z')?.number).toBe('2');
    const tex = blocks[0]!.tex!;
    expect(tex).toContain('x &= 1 \\tag*{(1)}');
    expect(tex).toContain('z &= 3 \\tag*{(2)}');
    expect(tex).not.toMatch(/\\nonumber|\\label/);
  });

  it('keeps an explicit \\tag, uncounted, and names it by its label', () => {
    const { numbering, blocks } = numbered('$$a \\tag{A} \\label{eq:a}$$\n\n$$b \\label{eq:b}$$\n\n$$c \\tag*{iii} \\label{eq:c}$$');
    expect(numbering.targets.get('eq:a')).toMatchObject({ number: 'A', label: '(A)' });
    expect(numbering.targets.get('eq:b')).toMatchObject({ number: '1', label: '(1)' });
    expect(numbering.targets.get('eq:c')).toMatchObject({ number: 'iii', label: 'iii' });
    expect(blocks[0]!.tex).toBe('a \\tag{A} ');
  });

  it('follows the configured template, format and reset', () => {
    const config: PostextConfig = { ...PAGE, math: { equationNumbering: { numberingTemplate: '{h1}.{n}', resetOn: 'h1', format: '[{n}]' } } };
    const { numbering } = numbered('# One\n\n$$a \\label{eq:a}$$\n\n$$b \\label{eq:b}$$\n\n# Two\n\n$$c \\label{eq:c}$$', config);
    expect([...numbering.targets.values()].map((t) => t.label)).toEqual(['[1.1]', '[1.2]', '[2.1]']);
  });

  it('prints no number when numbering is off, the label dropped', () => {
    const { numbering, blocks } = numbered('$$a \\label{eq:a}$$', { ...PAGE, math: { equationNumbering: { enabled: false } } });
    expect(numbering.targets.size).toBe(0);
    expect(blocks[0]!.tex).toBe('a ');
  });

  it('resolves and links \\eqref, \\ref, :ref and @eq: in the text', () => {
    const doc = build('See \\eqref{eq:a}, \\ref{eq:a}, Eq.~\\eqref{eq:b}, :ref{id="eq:b"} and @eq:a.\n\n$$a = b \\label{eq:a}$$\n\n$$c = d \\label{eq:b}$$');
    expect(refTexts(doc)).toEqual(['(1)', '1', '(2)', '(2)', '(1)']);
    const refs = blocksOf(doc).flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.refResourceId !== undefined)));
    expect(refs.every((s) => s.refAnchor === true)).toBe(true);
    // The tie is a no-break space before the reference.
    expect(segText(blocksOf(doc)[0]!)).toContain('Eq.\u00a0(2)');
    // Each label is an anchor on its formula.
    const anchors = doc.anchors ?? [];
    const formulas = blocksOf(doc).filter((b) => b.type === 'mathDisplay');
    expect(anchors.find((a) => a.id === 'eq:a')).toMatchObject({ y: formulas[0]!.bbox.y });
    expect(anchors.find((a) => a.id === 'eq:b')).toMatchObject({ y: formulas[1]!.bbox.y });
  });

  it('prints the number a reference inside a formula names', () => {
    const doc = build('$$a = b \\label{eq:a}$$\n\nBy $x \\eqref{eq:a}$ we get\n\n$$c = d \\quad\\text{by}~\\eqref{eq:a} \\label{eq:c}$$');
    expect(texOf(doc)[1]).toContain('\\text{(1)}');
    const inline = blocksOf(doc).filter((b) => b.type === 'paragraph').flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).find((s) => s.kind === 'math');
    expect(inline?.mathRender?.tex).toBe('x \\text{(1)}');
  });

  it('a \\ref inside $…$ in the text stays in the formula', () => {
    const blocks = parseMarkdown('See $\\ref{eq:a}$ and \\ref{eq:a}.');
    const spans = blocks[0]!.spans;
    expect(spans.filter((s) => s.ref).map((s) => s.ref!.resourceId)).toEqual(['eq:a']);
    expect(spans.find((s) => s.math)?.math?.tex).toBe('\\ref{eq:a}');
  });

  it('warns about a reference to a label nothing sets', () => {
    const doc = build('See \\eqref{eq:missing}.\n\n$$a \\label{eq:a}$$');
    expect(refTexts(doc)).toEqual(['?']);
    expect(doc.contentWarnings?.some((w) => w.kind === 'unknownResourceId' && w.resourceId === 'eq:missing')).toBe(true);
  });

  it('numbers on through the chapters of a book', () => {
    const resolvedConfig = PAGE;
    const one = { markdown: '# One\n\n$$a \\label{eq:a}$$\n\n:::callout{type="theorem" #thm:a}\nT.\n:::\n' };
    const after = continuationAfter(one, resolvedConfig);
    expect(after.statementCounters).toEqual({
      equation: { counter: 1, heading: expect.anything() },
      theorem: { counter: 1, heading: expect.anything() },
    });
    const two = { markdown: '# Two\n\nAs \\eqref{eq:b} and :ref{id="thm:b"}.\n\n$$b \\label{eq:b}$$\n\n:::callout{type="lemma" #thm:b}\nL.\n:::\n' };
    const outline = contentOutline(two, resolvedConfig, after).outline;
    expect(outline.filter((e) => e.numberLabel).map((e) => e.numberLabel)).toEqual(['(2)', 'Lemma\u00a02']);
    const doc = buildDocument({ ...two, continuation: after }, resolvedConfig, createMeasurementCache());
    expect(refTexts(doc)).toEqual(['(2)', 'Lemma\u00a02']);
  });
});

describe('numbered statements (#530)', () => {
  it('counts boxes, shared and separate counters, with a run-in label', () => {
    const md = [
      ':::callout{type="definition" #def:a}', 'A definition.', ':::', '',
      ':::callout{type="lemma" #lem:a}', 'A lemma.', ':::', '',
      ':::callout{type="theorem" #thm:a title="Bradley–Terry"}', 'A theorem.', ':::', '',
      ':::callout{type="definition"}', 'Another.', ':::', '',
      'By :ref{id="thm:a"}, \\ref{lem:a} and :ref{id="thm:a" style=title}.',
    ].join('\n');
    const { numbering, blocks } = numbered(md);
    expect([...numbering.targets.values()].map((t) => [t.id, t.label])).toEqual([
      ['def:a', 'Definition\u00a01'], ['lem:a', 'Lemma\u00a01'], ['thm:a', 'Theorem\u00a02'],
    ]);
    const paras = blocks.filter((b) => b.type === 'paragraph').map((b) => b.text);
    expect(paras.slice(0, 4)).toEqual([
      'Definition\u00a01. A definition.',
      'Lemma\u00a01. A lemma.',
      'Theorem\u00a02 (Bradley–Terry). A theorem.',
      'Definition\u00a02. Another.',
    ]);
    // The theorem's body is italic: its label (a flipped span) is upright,
    // the title in parentheses upright and not bold.
    const thm = blocks.find((b) => b.text.startsWith('Theorem'))!;
    expect(thm.spans.slice(0, 3).map((s) => [s.text, s.bold, s.italic])).toEqual([
      ['Theorem\u00a02', true, true], [' (Bradley–Terry)', false, true], ['.', true, true],
    ]);
    // The title moved into the label: the box prints none.
    const start = blocks.find((b) => b.type === 'containerStart' && b.containerAttrs?.type === 'theorem')!;
    expect(start.containerAttrs?.title).toBeUndefined();
    // The source map keeps one entry per character.
    for (const b of blocks) expect(b.sourceMap.length).toBe(b.text.length);

    const doc = build(md);
    expect(refTexts(doc)).toEqual(['Theorem\u00a02', '1', 'Bradley–Terry']);
  });

  it('numbers per section with a heading template', () => {
    const styles: CalloutStyleConfig[] = [{ id: 'theorem', numbering: { label: 'Theorem', numberingTemplate: '{h1}.{h2}.{n}', resetOn: 'h2' } }];
    const md = '# A\n\n## a\n\n:::callout{#t1}\nx\n:::\n\n:::callout{#t2}\ny\n:::\n\n## b\n\n:::callout{#t3}\nz\n:::\n';
    const { numbering } = numbered(md, { ...PAGE, calloutStyles: styles });
    expect([...numbering.targets.values()].map((t) => t.number)).toEqual(['1.1.1', '1.1.2', '1.2.1']);
  });

  it('sets the label as the box title with placement title', () => {
    const styles: CalloutStyleConfig[] = [{ id: 'theorem', numbering: { label: 'Theorem', placement: 'title' } }];
    const { blocks } = numbered(':::callout{title="Main"}\nBody.\n:::', { ...PAGE, calloutStyles: styles });
    expect(blocks[0]!.containerAttrs?.title).toBe('Theorem\u00a01 (Main)');
    expect(blocks[1]!.text).toBe('Body.');
  });

  it('gives a box that opens with a list a paragraph for its label', () => {
    const { blocks } = numbered(':::callout{type="definition"}\n- one\n- two\n:::');
    expect(blocks.map((b) => b.type)).toEqual(['containerStart', 'paragraph', 'listItem', 'listItem', 'containerEnd']);
    expect(blocks[1]!.text).toBe('Definition\u00a01. ');
  });

  it('ends a proof with its mark, flush right on the last line', () => {
    const md = ':::callout{type="proof"}\nShort proof.\n:::';
    const { blocks } = numbered(md);
    const p = blocks.find((b) => b.type === 'paragraph')!;
    // With maths running the square is TeX's own glyph: Fontsource's latin
    // files have no □ (#545).
    expect(p.text).toBe('Proof. Short proof. \uFFFC');
    expect(p.spans[p.spans.length - 1]!.math?.tex).toBe('\\square');
    expect(p.endMark).toBe('□');
    const doc = build(md);
    const para = blocksOf(doc).find((b) => b.type === 'paragraph')!;
    const line = para.lines[para.lines.length - 1]!;
    const segs = line.segments!;
    const markSeg = segs[segs.length - 1]!;
    expect(markSeg.kind).toBe('math');
    const before = segs[segs.length - 2]!;
    expect(before.kind).toBe('space');
    expect(before.labelTab).toBe(true);
    // The mark ends where the measure ends.
    const right = Math.max(...blocksOf(doc).filter((b) => b.type === 'callout').map((b) => b.bbox.x + b.bbox.width));
    const markEnd = line.bbox.x + segs.reduce((w, s) => w + s.width, 0);
    expect(markEnd).toBeLessThanOrEqual(right + 0.5);
    expect(line.bbox.width).toBeCloseTo(segs.reduce((w, s) => w + s.width, 0), 3);
  });

  it('sets the mark as text when maths is off', () => {
    const { blocks } = numbered(':::callout{type="proof"}\nShort proof.\n:::', { ...PAGE, math: { enabled: false } });
    expect(blocks.find((b) => b.type === 'paragraph')!.text).toBe('Proof. Short proof. □');
  });

  it('takes a proof ending in a formula as the formula\'s tag', () => {
    const { blocks } = numbered(':::callout{type="proof"}\nThus\n$$x = y$$\n:::');
    expect(blocks.find((b) => b.type === 'mathDisplay')!.tex).toBe('x = y\\tag*{$\\square$}');
  });
});

describe('equation numbering config (#530)', () => {
  it('resolves and strips its defaults', () => {
    expect(resolveMathConfig(undefined).equationNumbering).toEqual({ enabled: true, numberingTemplate: '{n}', resetOn: 'never', counterFormat: 'decimal', format: '({n})' });
    expect(resolveMathConfig({ equationNumbering: { format: '[{n}]' } }).equationNumbering.format).toBe('[{n}]');
    expect(stripMathDefaults({ equationNumbering: { format: '({n})', resetOn: 'h1' } })).toEqual({ equationNumbering: { resetOn: 'h1' } });
    expect(stripMathDefaults({ equationNumbering: { enabled: true } })).toBeUndefined();
  });
});
