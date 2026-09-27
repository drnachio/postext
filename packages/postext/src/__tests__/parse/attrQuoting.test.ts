import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';
import { parseDirectiveAttrs } from '../../parse/attrs';
import { parseInlineSnippetSpans } from '../../parse/inlineSnippet';

// EF-39: the attribute-value rules the Document Format page states, pinned
// so the docs cannot drift from the parser.
describe('attribute values', () => {
  it('take double quotes, single quotes, a bare word or nothing', () => {
    expect(parseDirectiveAttrs('a="x y" b=\'p q\' c=17 d')).toEqual({ a: 'x y', b: 'p q', c: '17', d: '' });
    // Spaces around `=` are allowed; a repeated key keeps the last value.
    expect(parseDirectiveAttrs('a = "1" a="2"')).toEqual({ a: '2' });
  });

  it('single quotes hold double quotes and vice versa; there are no escapes', () => {
    expect(parseDirectiveAttrs('lead=\'He said "hi"\'')).toEqual({ lead: 'He said "hi"' });
    expect(parseDirectiveAttrs('lead="it\'s"')).toEqual({ lead: "it's" });
    // A backslash is literal: the value ends at the next quote of its kind.
    expect(parseDirectiveAttrs('lead="a\\"b"').lead).toBe('a\\');
    // Typographic quotes are ordinary characters.
    expect(parseDirectiveAttrs('lead="“Hola”, dijo"')).toEqual({ lead: '“Hola”, dijo' });
  });

  it('a bare value stops at the first space', () => {
    expect(parseDirectiveAttrs('title=Hello world')).toEqual({ title: 'Hello', world: '' });
  });

  it('a `$` in a value is plain text, in headings and inline references', () => {
    const [h] = parseMarkdown('# Prices {lead="from $5 to $6"}');
    expect(h!.text).toBe('Prices');
    expect(h!.attrs).toEqual({ lead: 'from $5 to $6' });
    expect(h!.spans.some((s) => s.math)).toBe(false);
    const spans = parseInlineSnippetSpans('See :ref{id="f1" text="$5 plan"} now.');
    expect(spans.find((s) => s.ref)!.ref!.text).toBe('$5 plan');
    expect(spans.some((s) => s.math)).toBe(false);
  });

  it('`}` ends the block: a fence whose value holds one is not a directive', () => {
    const [fence] = parseMarkdown(':::callout{title="a}b"}\nText.\n:::');
    expect(fence!.type).toBe('paragraph');
    const [ok] = parseMarkdown(':::callout{title="a b"}\nText.\n:::');
    expect(ok!.containerAttrs).toEqual({ title: 'a b' });
    // Inline, the block ends at the first `}` too: the rest is text.
    const spans = parseInlineSnippetSpans('See :ref{id="f1" text="a}b"} now.');
    expect(spans.find((s) => s.ref)!.ref!.text).toBe('"a');
    expect(spans.map((s) => s.text).join('')).toContain('b"} now.');
  });

  it('`{` or `}` in a value leaves a heading attribute block in the title', () => {
    const [h] = parseMarkdown('# Title {note="a{b"}');
    expect(h!.attrs).toBeUndefined();
    expect(h!.text).toBe('Title {note="a{b"}');
    for (const src of ['# Title {note="a}b"}', '# Title {note="a} b"}']) {
      const [closed] = parseMarkdown(src);
      expect(closed!.attrs).toBeUndefined();
      expect(closed!.text).toBe(src.slice(2));
    }
  });

  it('a `{` after a space starts a heading block over', () => {
    // The block is the last `{…}` after a space: the title keeps the start
    // of the value, and only what follows the inner brace is read.
    const [h] = parseMarkdown('# Title {note="a {b"}');
    expect(h!.text).toBe('Title {note="a');
    expect(h!.attrs).toEqual({ b: '' });
    const [hEs] = parseMarkdown('# Título {nota="a {b"}');
    expect(hEs!.text).toBe('Título {nota="a');
    expect(hEs!.attrs).toEqual({ b: '' });
  });

  it('a heading block needs a space before it and must end the line', () => {
    expect(parseMarkdown('# Title{a="1"}')[0]!.attrs).toBeUndefined();
    expect(parseMarkdown('# Title {a="1"} tail')[0]!.attrs).toBeUndefined();
    expect(parseMarkdown('# Title {}')[0]!.text).toBe('Title {}');
  });

  it('parses the Document Format page example', () => {
    const md = '# The Long Road {lead=\'A "road novel", they said\' price="$18"}\n\n:::callout{type="note" title=\'The "fast" path\'}\nText.\n:::';
    const [h, fence] = parseMarkdown(md);
    expect(h!.text).toBe('The Long Road');
    expect(h!.attrs).toEqual({ lead: 'A "road novel", they said', price: '$18' });
    expect(fence!.containerAttrs).toEqual({ type: 'note', title: 'The "fast" path' });
    const es = '# El largo camino {lead=\'Una "novela de carretera", dijeron\' precio="18 $"}\n\n:::callout{type="note" title=\'El camino "rápido"\'}\nTexto.\n:::';
    const [hEs, fenceEs] = parseMarkdown(es);
    expect(hEs!.text).toBe('El largo camino');
    expect(hEs!.attrs).toEqual({ lead: 'Una "novela de carretera", dijeron', precio: '18 $' });
    expect(fenceEs!.containerAttrs).toEqual({ type: 'note', title: 'El camino "rápido"' });
    expect(parseDirectiveAttrs('title=Hola mundo')).toEqual({ title: 'Hola', mundo: '' });
  });

  it('`::resource` takes `id` in double quotes and nothing else', () => {
    expect(parseMarkdown('::resource{id="fig"}')[0]!.type).toBe('resourceBlock');
    expect(parseMarkdown("::resource{id='fig'}")[0]!.type).toBe('paragraph');
    expect(parseMarkdown('::resource{id=fig}')[0]!.type).toBe('paragraph');
  });
});
