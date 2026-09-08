import { describe, it, expect } from 'vitest';
import { parseMarkdown, parseMarkdownWithIssues, KNOWN_CONTAINERS, KNOWN_DIRECTIVES } from '../../parse';
import type { ContentBlock } from '../../parse';

/** Assert every plain-text char of `block` maps back to the same char in the
 *  original markdown (the sourceMap must survive the surrounding fences). */
const expectSourceMapAligned = (markdown: string, block: ContentBlock): void => {
  expect(block.sourceMap).toHaveLength(block.text.length);
  for (let i = 0; i < block.text.length; i++) {
    const ch = block.text[i]!;
    const src = markdown[block.sourceMap[i]!];
    // Paragraph line joins map a plain space onto the source newline.
    if (ch === ' ' && src === '\n') continue;
    expect(src).toBe(ch);
  }
};

describe('fenced containers', () => {
  it('exposes the known names', () => {
    expect([...KNOWN_CONTAINERS]).toEqual(['callout', 'paragraphs', 'part']);
    expect([...KNOWN_DIRECTIVES]).toEqual(['pagebreak', 'numbering']);
  });

  it('parses callout fence into start/end markers with attrs and matching containerId', () => {
    const md = ':::callout{style="note" title=\'Heads up\'}\nInside.\n:::\n';
    const { blocks, issues } = parseMarkdownWithIssues(md);
    expect(issues).toEqual([]);
    expect(blocks.map((b) => b.type)).toEqual(['containerStart', 'paragraph', 'containerEnd']);

    const start = blocks[0]!;
    expect(start.containerName).toBe('callout');
    expect(start.containerAttrs).toEqual({ style: 'note', title: 'Heads up' });
    expect(start.containerId).toBe(1);
    expect(start.text).toBe('');
    expect(start.spans).toEqual([]);
    expect(start.sourceMap).toEqual([]);
    expect(start.sourceStart).toBe(0);
    expect(start.sourceEnd).toBe(md.indexOf('\n'));

    const end = blocks[2]!;
    expect(end.containerName).toBe('callout');
    expect(end.containerId).toBe(1);
    expect(end.text).toBe('');
    expect(end.sourceMap).toEqual([]);
    expect(md.slice(end.sourceStart, end.sourceEnd)).toBe(':::');
  });

  it('start marker without attrs carries an empty attrs object', () => {
    const blocks = parseMarkdown(':::part\n# Title\n:::\n');
    expect(blocks[0]!.type).toBe('containerStart');
    expect(blocks[0]!.containerAttrs).toEqual({});
    expect(blocks[1]!.type).toBe('heading');
  });

  it('inner paragraph and list sourceMap map to original chars', () => {
    const md = [
      'Before.',
      '',
      ':::callout{style="tip"}',
      'A **bold** line',
      'and a second one.',
      '',
      '- first *item*',
      '- second item',
      '',
      '> quoted',
      ':::',
      '',
      'After.',
      '',
    ].join('\n');
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual([
      'paragraph',
      'containerStart',
      'paragraph',
      'listItem',
      'listItem',
      'blockquote',
      'containerEnd',
      'paragraph',
    ]);
    for (const block of blocks) expectSourceMapAligned(md, block);
    expect(blocks[2]!.text).toBe('A bold line and a second one.');
    expect(blocks[3]!.text).toBe('first item');
    expect(blocks[5]!.text).toBe('quoted');
    expect(blocks[7]!.text).toBe('After.');
  });

  it('closing fence terminates a paragraph without a blank line', () => {
    const md = ':::callout\nOne\nTwo\n:::\nOutside\n';
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(['containerStart', 'paragraph', 'containerEnd', 'paragraph']);
    expect(blocks[1]!.text).toBe('One Two');
    expect(blocks[3]!.text).toBe('Outside');
    expectSourceMapAligned(md, blocks[1]!);
  });

  it('closing fence terminates a list', () => {
    const md = ':::paragraphs{style="lead"}\n- a\n- b\n:::\n- c\n';
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual([
      'containerStart',
      'listItem',
      'listItem',
      'containerEnd',
      'listItem',
    ]);
    expect(blocks[2]!.text).toBe('b');
    expect(blocks[4]!.text).toBe('c');
  });

  it('closing fence terminates a blockquote', () => {
    const blocks = parseMarkdown(':::callout\n> q1\n> q2\n:::\n');
    expect(blocks.map((b) => b.type)).toEqual(['containerStart', 'blockquote', 'containerEnd']);
    expect(blocks[1]!.text).toBe('q1 q2');
  });

  it('directive line terminates a paragraph', () => {
    const md = 'Hello\n:::pagebreak\nWorld\n';
    const blocks = parseMarkdown(md);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'directive', 'paragraph']);
    expect(blocks[0]!.text).toBe('Hello');
    expect(blocks[1]!.directiveName).toBe('pagebreak');
    expect(blocks[2]!.text).toBe('World');
  });

  it('opening fence terminates a paragraph', () => {
    const blocks = parseMarkdown('Hello\n:::callout\nInside\n:::\n');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'containerStart', 'paragraph', 'containerEnd']);
    expect(blocks[0]!.text).toBe('Hello');
  });

  it('unclosed container auto-closes at EOF and reports unclosedContainer', () => {
    const md = 'Intro\n\n:::callout{style="warn"}\nNever closed\n';
    const { blocks, issues } = parseMarkdownWithIssues(md);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'containerStart', 'paragraph', 'containerEnd']);

    const end = blocks[3]!;
    expect(end.containerId).toBe(blocks[1]!.containerId);
    expect(end.sourceStart).toBe(md.length);
    expect(end.sourceEnd).toBe(md.length);
    expect(end.sourceMap).toEqual([]);

    expect(issues).toHaveLength(1);
    const issue = issues[0]!;
    expect(issue.kind).toBe('unclosedContainer');
    expect(issue.delimiter).toBe(':::');
    expect(issue.sourceStart).toBe(md.indexOf(':::callout'));
    expect(md.slice(issue.sourceStart, issue.sourceEnd)).toBe(':::callout{style="warn"}');
    if (issue.kind === 'unclosedContainer') {
      expect(issue.containerName).toBe('callout');
      expect(issue.containerId).toBe(1);
    }
  });

  it('stray ::: falls through to a paragraph', () => {
    const { blocks, issues } = parseMarkdownWithIssues('Text\n\n:::\n\nMore\n');
    expect(issues).toEqual([]);
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(blocks[1]!.text).toBe(':::');
  });

  it('a second ::: after a container closed is a paragraph, not a second end', () => {
    const blocks = parseMarkdown(':::callout\nx\n:::\n:::\n');
    expect(blocks.map((b) => b.type)).toEqual(['containerStart', 'paragraph', 'containerEnd', 'paragraph']);
    expect(blocks[3]!.text).toBe(':::');
  });

  it('nested containers get distinct ids and close in LIFO order', () => {
    const md = ':::part\n:::callout\ninner\n:::\nouter\n:::\n';
    const { blocks, issues } = parseMarkdownWithIssues(md);
    expect(issues).toEqual([]);
    expect(blocks.map((b) => [b.type, b.containerName, b.containerId])).toEqual([
      ['containerStart', 'part', 1],
      ['containerStart', 'callout', 2],
      ['paragraph', undefined, undefined],
      ['containerEnd', 'callout', 2],
      ['paragraph', undefined, undefined],
      ['containerEnd', 'part', 1],
    ]);
  });

  it('nested unclosed containers auto-close innermost first, one issue each', () => {
    const { blocks, issues } = parseMarkdownWithIssues(':::part\n:::callout\ntext\n');
    const ends = blocks.filter((b) => b.type === 'containerEnd');
    expect(ends.map((b) => b.containerId)).toEqual([2, 1]);
    expect(issues.map((i) => i.kind)).toEqual(['unclosedContainer', 'unclosedContainer']);
  });

  it('container ids restart at 1 on each parse', () => {
    parseMarkdown(':::callout\na\n:::\n');
    expect(parseMarkdown(':::callout\nb\n:::\n')[0]!.containerId).toBe(1);
  });

  it('unknown ::: name is not a container', () => {
    // Existing behaviour: an unrecognised `:::name` is plain paragraph text
    // (it takes the following line with it, as any paragraph line would) and
    // the trailing `:::` has nothing to close, so it is a paragraph too.
    const { blocks, issues } = parseMarkdownWithIssues(':::nosuch\ntext\n:::\n');
    expect(issues).toEqual([]);
    expect(blocks.every((b) => b.type === 'paragraph')).toBe(true);
    expect(blocks[0]!.text).toBe(':::nosuch text');
    expect(blocks[1]!.text).toBe(':::');
  });

  it('single-line directives keep working inside a container', () => {
    const blocks = parseMarkdown(':::part\nA\n\n:::pagebreak\n\nB\n:::\n');
    expect(blocks.map((b) => b.type)).toEqual([
      'containerStart',
      'paragraph',
      'directive',
      'paragraph',
      'containerEnd',
    ]);
  });

  it('documents without containers produce no container blocks or issues', () => {
    const md = '# H\n\nPara\n\n- item\n\n> quote\n\n:::pagebreak\n\n$$\nx\n$$\n';
    const { blocks, issues } = parseMarkdownWithIssues(md);
    expect(issues).toEqual([]);
    expect(blocks.some((b) => b.type === 'containerStart' || b.type === 'containerEnd')).toBe(false);
    expect(blocks.some((b) => b.containerId !== undefined)).toBe(false);
  });
});
