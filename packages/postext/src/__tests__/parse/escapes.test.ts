import { describe, it, expect } from 'vitest';
import { parseInlineFormatting, stripInlineFormatting } from '../../parse/inlineFormatting';
import { mapInlineSnippet, parseInlineSnippetSpans } from '../../parse/inlineSnippet';

const text = (spans: { text: string }[]) => spans.map((s) => s.text).join('');

describe('backslash escapes in inline formatting', () => {
  it('\\* sets a literal asterisk instead of opening italics', () => {
    const spans = parseInlineFormatting('\\* pOH = −log [OH^−^]. En todos los casos pH + pOH = 14.');
    expect(text(spans)).toBe('* pOH = −log [OH−]. En todos los casos pH + pOH = 14.');
    expect(spans.every((s) => !s.italic)).toBe(true);
    expect(spans.some((s) => s.script === 'sup' && s.text === '−')).toBe(true);
  });

  it('an escaped marker inside bold stays bold and literal', () => {
    const spans = parseInlineFormatting('**pOH\\***');
    expect(text(spans)).toBe('pOH*');
    expect(spans.every((s) => s.bold)).toBe(true);
  });

  it('escapes cover _, ^, ~ and the backtick', () => {
    expect(text(parseInlineFormatting('a\\_b \\^c\\^ d\\~e \\`f\\`'))).toBe('a_b ^c^ d~e `f`');
    expect(stripInlineFormatting('**x** \\* y')).toBe('x * y');
  });

  it('snippets (table notes) map the literal back to its source offset', () => {
    const m = mapInlineSnippet('\\* nota');
    expect(m.text).toBe('* nota');
    expect(m.sourceMap[0]).toBe(1);
    expect(text(parseInlineSnippetSpans('\\* nota'))).toBe('* nota');
  });
});
