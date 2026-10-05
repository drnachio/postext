import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';
import { parseAttrBlobStrict, parseDirectiveAttrs } from '../../parse/attrs';
import { duplicateAnchors } from '../../pipeline/anchors';

const refsOf = (md: string) => parseMarkdown(md).flatMap((b) => b.spans.filter((s) => s.ref).map((s) => s.ref!));

describe('`#id` in attribute blocks (#261)', () => {
  it('reads Pandoc identifiers beside other attributes', () => {
    expect(parseDirectiveAttrs('#sec-intro style="x"')).toEqual({ id: 'sec-intro', style: 'x' });
    expect(parseDirectiveAttrs('type=note #box')).toEqual({ type: 'note', id: 'box' });
    expect(parseAttrBlobStrict('#a style="x"')?.map((t) => [t.key, t.value])).toEqual([['id', 'a'], ['style', 'x']]);
  });

  it('leaves a hash inside a value alone', () => {
    expect(parseDirectiveAttrs('color=#fff')).toEqual({ color: '#fff' });
    expect(parseDirectiveAttrs('text="a #b"')).toEqual({ text: 'a #b' });
  });

  it('takes a heading identifier out of its title', () => {
    const [h] = parseMarkdown('## Method {#sec-method}');
    expect(h!.text).toBe('Method');
    expect(h!.attrs).toEqual({ id: 'sec-method' });
  });
});

describe('inline anchors (#261)', () => {
  const md = 'Some [key idea]{#key} here and :anchor{#inv} there, see [a link](http://x).';

  it('keeps the text of a bracketed span and drops the invisible anchor', () => {
    const [p] = parseMarkdown(md);
    expect(p!.text).toBe('Some key idea here and there, see a link.');
    expect(p!.anchorMarks!.map((m) => [m.anchorId, m.text])).toEqual([['key', 'key idea'], ['inv', undefined]]);
  });

  it('attaches each anchor to a character of the source', () => {
    const [p] = parseMarkdown(md);
    const [key, inv] = p!.anchorMarks!;
    expect(md.slice(key!.anchor, key!.anchor + 3)).toBe('key');
    expect(inv!.attach).toBe('before');
  });

  it('leaves anchors in inline code as text', () => {
    const [p] = parseMarkdown('Write `:anchor{#x}` to set one.');
    expect(p!.anchorMarks).toBeUndefined();
  });

  it('leaves a span anchor that runs into inline code as text (#413)', () => {
    // From the `[` of the directive label, the span pattern reaches into the code.
    const [p] = parseMarkdown('عبارة :ltr[`[هذه الكلمات]{#key}`] هنا');
    expect(p!.anchorMarks).toBeUndefined();
    expect(p!.text).toBe('عبارة [هذه الكلمات]{#key} هنا');
  });

  it('finds an anchor after a match that starts in inline code (#413)', () => {
    const [p] = parseMarkdown('`x [y` [z]{#z} end');
    expect(p!.text).toBe('x [y z end');
    expect(p!.anchorMarks!.map((m) => [m.anchorId, m.text])).toEqual([['z', 'z']]);
  });

  it('keeps a mark that holds a whole code span (#413)', () => {
    const [p] = parseMarkdown('The [the `key` word]{#k} and :index[`foo`] here');
    expect(p!.text).toBe('The the key word and foo here');
    expect(p!.anchorMarks!.map((m) => [m.anchorId, m.text])).toEqual([['k', 'the key word']]);
    expect(p!.indexMarks!.map((m) => m.path)).toEqual([['foo']]);
  });

  it('makes a container identifier an anchor on its first text block', () => {
    const blocks = parseMarkdown(':::callout{#box title="Note"}\nInside.\n:::');
    const p = blocks.find((b) => b.type === 'paragraph')!;
    expect(p.anchorMarks!.map((m) => [m.anchorId, m.text])).toEqual([['box', 'Note']]);
  });

  it('reports an identifier set twice', () => {
    const blocks = parseMarkdown('# A {#x}\n\nText [here]{#x}.');
    expect(duplicateAnchors(blocks).map((d) => d.id)).toEqual(['x']);
  });
});

describe('pandoc-crossref references (#262)', () => {
  it('reads @prefix:id, bracketed and suppressed forms', () => {
    expect(refsOf('See @sec:intro, [@fig:map] and [-@tbl:data].')).toEqual([
      { resourceId: 'sec:intro' },
      { resourceId: 'fig:map' },
      { resourceId: 'tbl:data', style: 'number' },
    ]);
  });

  it('capitalises the label after a capital prefix', () => {
    expect(refsOf('@Sec:intro opens it.')).toEqual([{ resourceId: 'sec:intro', case: 'capitalize' }]);
  });

  it('leaves e-mail addresses, unknown prefixes and a trailing stop alone', () => {
    expect(refsOf('Write to me@sec:intro or @foo:bar.')).toEqual([]);
    const [p] = parseMarkdown('End of @sec:intro.');
    expect(p!.text.endsWith('.')).toBe(true);
    expect(refsOf('End of @sec:intro.')).toEqual([{ resourceId: 'sec:intro' }]);
  });

  it('reads the new :ref styles', () => {
    expect(refsOf(':ref{id="a" style=page} :ref{id="a" style=pageNumber} :ref{id="a" style=title}').map((r) => r.style))
      .toEqual(['page', 'pageNumber', 'title']);
  });
});
