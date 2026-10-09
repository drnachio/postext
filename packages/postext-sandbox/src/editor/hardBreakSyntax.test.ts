import { describe, expect, it } from 'vitest';
import { breakableLines, hardBreakMarks } from './hardBreakSyntax';

const marked = (text: string, next?: string) => hardBreakMarks(text, next).map((r) => text.slice(r.from, r.to));

describe('forced line break highlighting (#620)', () => {
  it('marks a backslash ending a line the paragraph goes on after', () => {
    expect(marked('One line\\', 'next line')).toEqual(['\\']);
    expect(marked('One line\\\\', 'next line')).toEqual(['\\\\']);
    expect(marked('Ends the paragraph\\', '')).toEqual([]);
    expect(marked('Ends the paragraph\\', undefined)).toEqual([]);
    expect(marked('Before a list\\', '- item')).toEqual([]);
    expect(marked('Before a heading\\', '# Title')).toEqual([]);
    expect(marked('> Quoted\\', '> more')).toEqual(['\\']);
    expect(marked('> Quoted\\', 'not quoted')).toEqual([]);
    expect(marked('- an item\\', 'next')).toEqual([]);
  });

  it('marks `\\\\` before a space, not glued to a character, nor in code or maths', () => {
    expect(marked('a \\\\ b')).toEqual(['\\\\']);
    expect(marked('- item \\\\ two')).toEqual(['\\\\']);
    expect(marked('rise \\\\*40')).toEqual([]);
    expect(marked('C:\\\\path')).toEqual([]);
    expect(marked('code `a \\\\ b` and $x \\\\ y$')).toEqual([]);
    expect(marked('\\\\ at the start')).toEqual([]);
  });

  it('leaves display formulas and poems alone', () => {
    const lines = ['Text \\\\ here', '$$', 'a \\\\ b', '$$', ':::verse', 'one \\\\ two', ':::', 'After \\\\ this'];
    expect(breakableLines(lines)).toEqual([true, false, false, false, false, false, false, true]);
    expect(breakableLines(['$$a \\\\ b$$', 'x'])).toEqual([false, true]);
  });
});
