import { describe, it, expect } from 'vitest';
import { computeHeadingNumbers, computeHeadingNumbering, parseTemplate } from '../numbering';
import { numberToWords } from '../numberWords';
import { parseMarkdown } from '../parse';
import { buildDocument } from '../pipeline';
import { computeOutlineFor } from '../pipeline/outline';
import { continuationAfter } from '../pipeline/continuation';
import type { PostextConfig } from '../types';

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

describe('numberToWords', () => {
  it('spells English cardinals and ordinals', () => {
    expect(numberToWords(1)).toBe('one');
    expect(numberToWords(14)).toBe('fourteen');
    expect(numberToWords(21)).toBe('twenty-one');
    expect(numberToWords(40)).toBe('forty');
    expect(numberToWords(105)).toBe('one hundred five');
    expect(numberToWords(2024)).toBe('two thousand twenty-four');
    expect(numberToWords(1, 'ordinal')).toBe('first');
    expect(numberToWords(2, 'ordinal')).toBe('second');
    expect(numberToWords(3, 'ordinal')).toBe('third');
    expect(numberToWords(12, 'ordinal')).toBe('twelfth');
    expect(numberToWords(20, 'ordinal')).toBe('twentieth');
    expect(numberToWords(21, 'ordinal')).toBe('twenty-first');
    expect(numberToWords(100, 'ordinal')).toBe('one hundredth');
  });

  it('spells Spanish cardinals', () => {
    expect(numberToWords(1, 'cardinal', 'es')).toBe('uno');
    expect(numberToWords(16, 'cardinal', 'es')).toBe('dieciséis');
    expect(numberToWords(21, 'cardinal', 'es')).toBe('veintiuno');
    expect(numberToWords(22, 'cardinal', 'es')).toBe('veintidós');
    expect(numberToWords(31, 'cardinal', 'es')).toBe('treinta y uno');
    expect(numberToWords(100, 'cardinal', 'es')).toBe('cien');
    expect(numberToWords(101, 'cardinal', 'es')).toBe('ciento uno');
    expect(numberToWords(500, 'cardinal', 'es')).toBe('quinientos');
    expect(numberToWords(1000, 'cardinal', 'es')).toBe('mil');
    expect(numberToWords(21000, 'cardinal', 'es')).toBe('veintiún mil');
    expect(numberToWords(31005, 'cardinal', 'es')).toBe('treinta y un mil cinco');
  });

  it('spells Spanish ordinals the way the RAE prefers', () => {
    expect(numberToWords(1, 'ordinal', 'es')).toBe('primero');
    expect(numberToWords(3, 'ordinal', 'es')).toBe('tercero');
    expect(numberToWords(7, 'ordinal', 'es')).toBe('séptimo');
    expect(numberToWords(11, 'ordinal', 'es')).toBe('undécimo');
    expect(numberToWords(12, 'ordinal', 'es')).toBe('duodécimo');
    expect(numberToWords(13, 'ordinal', 'es')).toBe('decimotercero');
    expect(numberToWords(18, 'ordinal', 'es')).toBe('decimoctavo');
    expect(numberToWords(21, 'ordinal', 'es')).toBe('vigesimoprimero');
    expect(numberToWords(28, 'ordinal', 'es')).toBe('vigesimoctavo');
    expect(numberToWords(30, 'ordinal', 'es')).toBe('trigésimo');
    expect(numberToWords(34, 'ordinal', 'es')).toBe('trigésimo cuarto');
    expect(numberToWords(100, 'ordinal', 'es')).toBe('centésimo');
    expect(numberToWords(121, 'ordinal', 'es')).toBe('centésimo vigesimoprimero');
  });

  it('prints digits past the spelled range and nothing below one', () => {
    expect(numberToWords(1_000_000)).toBe('1000000');
    expect(numberToWords(1000, 'ordinal', 'es')).toBe('1000');
    expect(numberToWords(0)).toBe('');
  });
});

describe('spelled-out numbering templates (EF-27)', () => {
  it('parses words and ordinal counters, the case of the suffix picking the case', () => {
    expect(parseTemplate('{1:words}')).toEqual([{ kind: 'counter', level: 1, style: 'words' }]);
    expect(parseTemplate('{1:Ordinal}')).toEqual([{ kind: 'counter', level: 1, style: 'Ordinal' }]);
    const blocks = parseMarkdown('# A\n\n# B\n\n# C');
    expect(computeHeadingNumbers(blocks, { 1: 'Chapter {1:Words}' })).toEqual(['Chapter One', 'Chapter Two', 'Chapter Three']);
    expect(computeHeadingNumbers(blocks, { 1: '{1:ordinal}' })).toEqual(['first', 'second', 'third']);
    expect(computeHeadingNumbering(blocks, { 1: 'CAPÍTULO {1:ORDINAL}' }, undefined, undefined, { locale: 'es' }).prefixes)
      .toEqual(['CAPÍTULO PRIMERO', 'CAPÍTULO SEGUNDO', 'CAPÍTULO TERCERO']);
  });

  it('reports every numbered heading’s counter value', () => {
    const blocks = parseMarkdown('# A\n\n## a\n\n## b\n\n# B');
    expect(computeHeadingNumbering(blocks, {}).values).toEqual([1, 1, 2, 2]);
  });
});

describe('heading style numbering templates and startAt (EF-27)', () => {
  const config: PostextConfig = {
    page: { width: pt(360), height: pt(240), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
    headings: { levels: [{ level: 1, numberingTemplate: '{1}.', breakBefore: { enabled: false } }] },
    headingStyles: [{ id: 'appendix', numberingTemplate: 'Appendix {1:A}' }],
  };
  const markdown = [
    '# Method', 'Text.', '# Results', 'Text.',
    '# Survey instrument {style="appendix" startAt=1}', 'Text.',
    '# Raw data {style="appendix"}', 'Text.',
  ].join('\n\n');

  it('numbers a styled heading with the style’s template, restarting the counter at startAt', () => {
    const doc = buildDocument({ markdown }, config);
    const prefixes = doc.blocks.filter((b) => b.type === 'heading').map((b) => b.numberPrefix);
    expect(prefixes).toEqual(['1.', '2.', 'Appendix A', 'Appendix B']);
  });

  it('lists the same numbers in the outline and carries the restarted counter on', () => {
    const outline = computeOutlineFor(parseMarkdown(markdown), config);
    expect(outline.map((e) => e.number)).toEqual(['1.', '2.', 'Appendix A', 'Appendix B']);
    expect(outline.map((e) => e.counter)).toEqual([1, 2, 1, 2]);
    expect(continuationAfter({ markdown }, config).headings?.h1).toBe(2);
  });

  const head = (content: string): PostextConfig['header'] => ({
    elements: [{
      kind: 'text', id: 'h', content, fontSize: pt(8), overflow: 'ellipsis-end',
      placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
    }],
  });
  /** The running head over each heading's page. */
  const heads = (doc: ReturnType<typeof buildDocument>) => doc.blocks
    .filter((b) => b.type === 'heading')
    .map((b) => {
      const slot = doc.pages[b.pageIndex]!.header;
      return (slot?.blocks ?? []).map((x) => (x.kind === 'text' ? x.lines.map((l) => l.text).join(' ') : '')).join('');
    });

  it('gives the style’s number to {chapterNumber}, and the restarted ordinal without a template', () => {
    const onePerPage = { ...config, headings: { levels: [{ level: 1, numberingTemplate: '{1}.', breakBefore: { enabled: true, parity: 'any' as const } }] } };
    expect(heads(buildDocument({ markdown }, { ...onePerPage, header: head('[{chapterNumber}]') })))
      .toEqual(['[1.]', '[2.]', '[Appendix A]', '[Appendix B]']);
    const untemplated: PostextConfig = { ...onePerPage, headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] }, headingStyles: [], header: head('[{chapterNumber}]') };
    expect(heads(buildDocument({ markdown }, untemplated))).toEqual(['[1]', '[2]', '[1]', '[2]']);
  });

  it('prints no number anywhere for a style whose template is empty, while the heading still counts', () => {
    const md = ['# One', 'Text.', '# Two {style="bare"}', 'Text.', '# Three', 'Text.'].join('\n\n');
    for (const numberingTemplate of [undefined, '{1}.']) {
      const cfg: PostextConfig = {
        ...config,
        headings: { levels: [{ level: 1, ...(numberingTemplate ? { numberingTemplate } : {}), breakBefore: { enabled: true, parity: 'any' } }] },
        headingStyles: [{ id: 'bare', numberingTemplate: '' }],
        header: head('[{chapterNumber}]'),
      };
      const n = (k: number) => (numberingTemplate ? `${k}.` : String(k));
      const doc = buildDocument({ markdown: md }, cfg);
      expect(doc.blocks.filter((b) => b.type === 'heading').map((b) => b.numberPrefix ?? '')).toEqual(numberingTemplate ? [n(1), '', n(3)] : ['', '', '']);
      expect(heads(doc)).toEqual([`[${n(1)}]`, '[]', `[${n(3)}]`]);
      const outline = computeOutlineFor(parseMarkdown(md), cfg);
      expect(outline.map((e) => e.number)).toEqual([n(1), '', n(3)]);
      expect(outline.map((e) => e.numbered)).toEqual([true, true, true]);
    }
  });

  it('ignores a startAt that is not a positive integer', () => {
    const blocks = parseMarkdown('# A\n\n# B {startAt=0}\n\n# C {startAt="x"}');
    expect(computeHeadingNumbers(blocks, { 1: '{1}' })).toEqual(['1', '2', '3']);
  });
});
