// Markdown safety: story text that looks like Postext markup comes back
// from the engine's own parser as the same text, with no directive,
// link, note, reference or emphasis made of it.

import { describe, expect, it } from 'vitest';
import { escapeStory, guardBlockStart } from '../escape.js';
import { captionLabel } from '../pictures.js';
import { bodyOf, importOne, marksOf, parse, plain, para, run } from './kit.test-helper.js';

const JOINER = /\u2060/g;

const ADVERSARIAL = [
  'A note marker [^1] and its definition look [^note]: here.',
  'A link [text](https://example.org) and an image ![alt](pic.png) typed as text.',
  'Directives :chip[x]{style="a"} :mark[y] :ref{id="fig"} :index[z]{term="A!B"} :swatch{color="#f00"} :anchor{#k} :tab and :index alone.',
  'Emphasis *stars* **double** _under_ __dunder__ ~sub~ ^sup^ ~~strike~~ ++plus++ `code` $x^2$ and snake_case_name.',
  'Backslashes C:\\Temp\\new \\* \\\\ break \\ref{eq} and a trailing one \\',
  'Citations [@smith2020] and @sec:intro and [-@fig:map] and an e-mail a@b.org.',
  'A ruby {\u7d05\u6a13|h\u00f3ng|l\u00f3u} and an anchor [words]{#key} and braces {a} {b|c}.',
  'Brackets ] [ ]] [[ ) ( and a pipe | and <b>html</b> &amp; entities.',
  '\uff1a\uff1a\uff1a full-width and ::: mid-line fences ::::page{template="x"} here.',
];

const STARTS = ['# Not a heading', '## Nor this', '- not a list', '* nor this', '+ nor this', '1. not numbered', '12) nor this', '> not a quote', ':::callout{type="x"}', ':::', '::::page{template="x"}', '::resource{id="x"}', '$$', '---', '[^1]: not a definition', '```js', '~~~', '\u0663. not numbered', '-', '***'];

describe('story text that looks like markup', () => {
  it('reads back as the same text with no mark, in a flowing book', () => {
    const r = importOne(ADVERSARIAL.map((t) => plain(t)).join(''));
    const blocks = parse(bodyOf(r));
    expect(blocks.map((b) => b.type)).toEqual(ADVERSARIAL.map(() => 'paragraph'));
    expect(blocks.map((b) => b.text.replace(JOINER, ''))).toEqual(ADVERSARIAL);
    expect(marksOf(blocks)).toEqual([]);
  });

  it('reads back the same inside a frame of a composed page', () => {
    const r = importOne(ADVERSARIAL.map((t) => plain(t)).join(''), { layout: 'pages' });
    const blocks = parse(bodyOf(r)).filter((b) => b.type === 'paragraph');
    expect(blocks.map((b) => b.text.replace(JOINER, ''))).toEqual(ADVERSARIAL);
    expect(marksOf(blocks)).toEqual([]);
  });

  it('keeps a line that opens like a block a paragraph', () => {
    const r = importOne(STARTS.map((t) => plain(t)).join(''));
    const blocks = parse(bodyOf(r));
    expect(blocks.map((b) => b.type)).toEqual(STARTS.map(() => 'paragraph'));
    expect(blocks.map((b) => b.text.replace(JOINER, ''))).toEqual(STARTS);
    expect(marksOf(blocks)).toEqual([]);
  });

  it('does not let a first line pass for front matter', () => {
    const r = importOne(plain('---') + plain('title: stolen') + plain('---') + plain('Body.'));
    const blocks = parse(bodyOf(r));
    expect(blocks.map((b) => b.text.replace(JOINER, ''))).toEqual(['---', 'title: stolen', '---', 'Body.']);
  });

  it('keeps markup characters literal inside real marks', () => {
    const r = importOne(para(run('bold *star* ] and [^1]', 'FontStyle="Bold"') + run(' then some plain words of the paragraph that outweigh the rest ') + run('under ] line', 'Underline="true"') + run(' and ') + run('a_b [c] (d)', 'FontStyle="Italic"')));
    const blocks = parse(bodyOf(r));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.text.replace(JOINER, '')).toBe('bold *star* ] and [^1] then some plain words of the paragraph that outweigh the rest under ] line and a_b [c] (d)');
    const spans = blocks[0]!.spans;
    expect(spans.find((s) => s.bold)?.text.replace(JOINER, '')).toBe('bold *star* ] and [^1]');
    expect(spans.find((s) => s.italic)?.text.replace(JOINER, '')).toBe('a_b [c] (d)');
    expect(marksOf(blocks).filter((m) => /^(?:footnote|ref|chip):/.test(m))).toEqual([]);
  });

  it('writes text made only of markup characters', () => {
    const only = ['*_[]()#`~^$|\\<>:', '***', '___', '[[[]]]', '::::', '$$$$', '~~~~'];
    const r = importOne(only.map((t) => plain(t)).join(''));
    const blocks = parse(bodyOf(r));
    expect(blocks.map((b) => b.text.replace(JOINER, ''))).toEqual(only);
    expect(marksOf(blocks)).toEqual([]);
  });

  it('escapes one string at a time the same way', () => {
    expect(parse(escapeStory('[^1] *x*'))[0]!.text.replace(JOINER, '')).toBe('[^1] *x*');
    expect(guardBlockStart('1. x')).not.toBe('1. x');
    expect(guardBlockStart('plain')).toBe('plain');
  });
});

describe('caption labels', () => {
  it('takes a label only when all of it is there', () => {
    expect(captionLabel('Figure 3. The delta')).toMatchObject({ kind: 'figure', rest: 'The delta' });
    expect(captionLabel('Fig. 12: A map')).toMatchObject({ kind: 'figure', rest: 'A map' });
    expect(captionLabel('Tabla 2.1 \u2014 Resultados')).toMatchObject({ kind: 'table', rest: 'Resultados' });
    expect(captionLabel('Table 4')).toMatchObject({ kind: 'table', rest: '' });
  });
  it('never cuts a label out of a word or a sentence', () => {
    for (const t of ['Figures of speech', 'Figurative language 3. is', 'Table 5 is empty', 'Tablets 3. and more', 'Mapa del tesoro', 'Figure it out', 'Tabular data 1.']) expect(captionLabel(t), t).toBeUndefined();
  });
});
