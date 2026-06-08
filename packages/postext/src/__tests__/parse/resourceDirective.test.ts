import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse';

describe('::resource block directive', () => {
  it('parses ::resource{id="x"} into a resourceBlock with the id', () => {
    const blocks = parseMarkdown('::resource{id="fig-1"}\n');
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(block.type).toBe('resourceBlock');
    expect(block.resourceId).toBe('fig-1');
    expect(block.text).toBe('');
    expect(block.spans).toEqual([]);
  });

  it('tolerates surrounding whitespace on the line', () => {
    const blocks = parseMarkdown('   ::resource{id="abc"}   \n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.type).toBe('resourceBlock');
    expect(blocks[0]!.resourceId).toBe('abc');
  });

  it('records the source span of the directive line', () => {
    const blocks = parseMarkdown('::resource{id="r1"}\n');
    const block = blocks[0]!;
    expect(block.sourceStart).toBe(0);
    expect(block.sourceEnd).toBeGreaterThan(block.sourceStart);
  });

  it('parses ids containing hyphens, dots and digits', () => {
    const blocks = parseMarkdown('::resource{id="img.2024-final_3"}\n');
    expect(blocks[0]!.type).toBe('resourceBlock');
    expect(blocks[0]!.resourceId).toBe('img.2024-final_3');
  });

  describe('malformed variants fall through to paragraph', () => {
    const cases: Array<[string, string]> = [
      ['missing id attribute', '::resource{}\n'],
      ['single-quoted id', "::resource{id='x'}\n"],
      ['unquoted id', '::resource{id=x}\n'],
      ['empty id value', '::resource{id=""}\n'],
      ['no braces', '::resource id="x"\n'],
      ['trailing junk after braces', '::resource{id="x"} extra\n'],
      ['extra attribute inside braces', '::resource{id="x" foo="y"}\n'],
      ['triple colon directive form', ':::resource{id="x"}\n'],
      ['single colon', ':resource{id="x"}\n'],
    ];

    for (const [name, input] of cases) {
      it(name, () => {
        const blocks = parseMarkdown(input);
        expect(blocks.every((b) => b.type !== 'resourceBlock')).toBe(true);
        expect(blocks.some((b) => b.type === 'paragraph')).toBe(true);
      });
    }
  });

  it('does not treat ::resource embedded mid-paragraph as a block', () => {
    const blocks = parseMarkdown('see ::resource{id="x"} here\n');
    expect(blocks.every((b) => b.type !== 'resourceBlock')).toBe(true);
  });
});
