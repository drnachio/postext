import { describe, it, expect, beforeAll } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { createMeasurementCache } from '../../measure/index.js';
import { parseMarkdown } from '../../parse/index.js';
import { initMathEngine } from '../../math/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import { computeHeadingContext, computeResourceNumbering, renderTemplateNumber } from '../../pipeline/resources/resourceNumbering.js';
import { numberStatements } from '../../pipeline/text/statementNumbering.js';
import { defaultResourceTypes } from '../../defaults/resources/resourceTypes.js';
import type { CalloutStyleConfig, PostextConfig, Resource, ResourceType, VDTDocument } from '../../index.js';

// #730: the tokens of a resource numbering template take the style a
// heading template's take after a colon. `{h1:A}.{n}` letters the
// appendix, `{h1:I}.{n}` follows a chapter numbered in Roman, and `{n:i}`
// formats the counter itself. Numbered boxes and labelled equations read
// their templates with the same code.
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

const H = { h1: 2, h2: 3, h3: 0, h4: 0, h5: 0, h6: 0 };
const render = (template: string, n = 4, heading = H, digits?: 'latn' | 'arab', locale?: string, format: ResourceType['counterFormat'] = 'decimal'): string =>
  renderTemplateNumber(template, n, format, heading, digits, locale);

describe('a style on the tokens of a resource template (#730)', () => {
  it('formats a heading token as a heading template does', () => {
    expect(render('{h1:A}.{n}')).toBe('B.4');
    expect(render('{h1:I}.{h2:a}.{n}')).toBe('II.c.4');
    // The short aliases.
    expect(render('{h1:1}-{h1:01}-{h1:A}-{h1:a}-{h1:I}-{h1:i}')).toBe('2-02-B-b-II-ii');
    // The numbering-format names, in either spelling, and the one-character tokens.
    expect(render('{h1:upper-alpha}.{h2:lower-roman}')).toBe('B.iii');
    expect(render('{h1:roman-upper}.{h2:alpha-lower}')).toBe('II.c');
    expect(render('{h1:一}', 4, H, undefined, 'zh-Hans')).toBe('二');
    expect(render('{h2:①}')).toBe('③');
    expect(render('第{h1:一}章 図{n}', 4, H, undefined, 'ja')).toBe('第二章 図4');
  });

  it('spells a heading number in the document language', () => {
    expect(render('{h1:Words}.{n}', 4, H, undefined, 'en')).toBe('Two.4');
    expect(render('{h1:words}.{n}', 4, H, undefined, 'es')).toBe('dos.4');
    expect(render('{h1:Ordinal}', 4, H, undefined, 'en')).toBe('Second');
  });

  it('formats the counter itself, over the type\'s counterFormat', () => {
    expect(render('{n:i}')).toBe('iv');
    expect(render('{n:A}', 4, H, undefined, undefined, 'roman-lower')).toBe('D');
    // Without a suffix `{n}` follows counterFormat, as before.
    expect(render('{n}', 4, H, undefined, undefined, 'roman-lower')).toBe('iv');
    expect(render('{h1}.{n}', 4, H, undefined, undefined, 'alpha-upper')).toBe('2.D');
  });

  it('a heading token with no value prints nothing and takes its separator with it, whatever its style', () => {
    const none = { ...H, h1: 0 };
    expect(render('{h1}.{n}', 4, none)).toBe('4');
    expect(render('{h1:A}.{n}', 4, none)).toBe('4');
    expect(render('{h1:I}.{n}', 4, none)).toBe('4');
    // A positional East Asian style would write a zero.
    expect(render('{h1:cjk-decimal}.{n}', 4, none)).toBe('4');
    expect(render('{h1:Words}.{n}', 4, none, undefined, 'en')).toBe('4');
  });

  it('a token without a suffix prints what it printed; an unknown style counts in decimal', () => {
    expect(render('{h1}.{n}')).toBe('2.4');
    expect(render('{h1}.{h2}.{n}')).toBe('2.3.4');
    expect(render('{h1:nonsense}.{n}')).toBe('2.4');
    expect(render('{ h1 : A }.{ n }')).toBe('B.4');
    // Other groups in braces are literal text, as before; escapes too.
    expect(render('{x}.{n}')).toBe('{x}.4');
    expect(render('\\{h1:A\\}.{n}')).toBe('{h1:A}.4');
  });

  it('keeps the document\'s digits on the decimal tokens', () => {
    expect(render('{h1}.{n}', 4, H, 'arab')).toBe('٢.٤');
    expect(render('{h1:A}.{n}', 4, H, 'arab')).toBe('B.٤');
    expect(render('{h1:1}.{n:1}', 4, H, 'arab')).toBe('٢.٤');
  });
});

describe('a lettered appendix (#730)', () => {
  const figure = (id: string, typeId: string): Resource => ({
    id, typeId, kind: 'bitmap', caption: 'A picture.', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: 100 }, placement: { position: 'here' },
  });
  const base = defaultResourceTypes('en').find((t) => t.id === 'table')!;
  const types: ResourceType[] = [
    ...defaultResourceTypes('en').filter((t) => t.id !== 'table'),
    { ...base, numberingTemplate: '{h1}.{n}', resetOn: 'h1' },
    { ...base, id: 'table-a', numberingTemplate: '{h1:A}.{n}', resetOn: 'h1' },
  ];
  const MD = [
    '# Method', '', 'See :ref{id="t1"}.', '', '::resource{id="t1"}', '',
    '# Interview guide {style="appendix" startAt=1}', '', 'See :ref{id="a1"} and :ref{id="a2"}.', '', '::resource{id="a1"}', '', '::resource{id="a2"}', '',
    '# Consent form {style="appendix"}', '', 'See :ref{id="b1"}.', '', '::resource{id="b1"}', '',
  ].join('\n');
  const resources = [figure('t1', 'table'), figure('a1', 'table-a'), figure('a2', 'table-a'), figure('b1', 'table-a')];
  const config: PostextConfig = {
    headings: { levels: [{ level: 1, numberingTemplate: '{1}', breakBefore: { enabled: false } }] },
    headingStyles: [{ id: 'appendix', numbered: true, numberingTemplate: 'Appendix {1:A}' }],
    resourceTypes: types,
  };

  it('one type letters every appendix', () => {
    const blocks = parseMarkdown(MD);
    const numbers = computeResourceNumbering(blocks, types, resources, computeHeadingContext(blocks));
    expect(numbers.t1!.number).toBe('1.1');
    expect(numbers.a1!.number).toBe('A.1');
    expect(numbers.a2!.number).toBe('A.2');
    expect(numbers.b1!.number).toBe('B.1');
  });

  it('prints the letter in the caption and in the reference', () => {
    const doc: VDTDocument = buildDocument({ markdown: MD, resources }, config, createMeasurementCache());
    const all = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks));
    const refs = all.flatMap((b) => b.lines.flatMap((l) => (l.segments ?? []).filter((s) => s.refResourceId !== undefined).map((s) => s.text.replace(/\u00a0/g, ' '))));
    expect(refs).toEqual(['Tab. 1.1', 'Tab. A.1', 'Tab. A.2', 'Tab. B.1']);
    const captions = JSON.stringify(doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])]).filter((b) => 'resourceBlock' in b && b.resourceBlock));
    for (const label of ['A.1', 'A.2', 'B.1']) expect(captions, label).toContain(label);
    expect(captions).not.toContain('{h1:A}');
    // The appendices themselves are lettered by their style.
    const heads = all.filter((b) => b.type === 'heading').map((b) => b.lines.map((l) => l.text).join(' '));
    expect(heads.some((h) => h.includes('Appendix A'))).toBe(true);
    expect(heads.some((h) => h.includes('Appendix B'))).toBe(true);
  });
});

describe('numbered boxes and labelled equations read the same template (#730)', () => {
  const pt = (value: number) => ({ value, unit: 'pt' as const });
  const PAGE: PostextConfig = {
    page: { width: pt(400), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    bodyText: { firstLineIndent: pt(0) },
    headings: { levels: [] },
  };
  const numbered = (markdown: string, config: PostextConfig) => numberStatements(parseMarkdown(markdown), resolveAllConfig(config));

  it('a box style', () => {
    const styles: CalloutStyleConfig[] = [{ id: 'theorem', numbering: { label: 'Theorem', numberingTemplate: '{h1:A}.{n}', resetOn: 'h1' } }];
    const md = '# One\n\n:::callout{#t1}\nx\n:::\n\n# Two\n\n:::callout{#t2}\ny\n:::\n\n:::callout{#t3}\nz\n:::\n';
    const numbering = numbered(md, { ...PAGE, calloutStyles: styles });
    expect([...numbering.targets.values()].map((t) => t.number)).toEqual(['A.1', 'B.1', 'B.2']);
  });

  it('the equations', () => {
    const config: PostextConfig = { ...PAGE, math: { equationNumbering: { numberingTemplate: '{h1:I}.{n:a}', resetOn: 'h1' } } };
    const numbering = numbered('# One\n\n$$a \\label{eq:a}$$\n\n$$b \\label{eq:b}$$\n\n# Two\n\n$$c \\label{eq:c}$$', config);
    expect([...numbering.targets.values()].map((t) => t.label)).toEqual(['(I.a)', '(I.b)', '(II.a)']);
  });
});
