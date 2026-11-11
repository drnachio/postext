import { describe, expect, it } from 'vitest';
import { applyFindReplace, numberedLines } from './textEdits.js';

const text = '# Title\n\nOne fish, two fish.\nRed fish, blue fish.\n';

describe('applyFindReplace', () => {
  it('replaces the one passage it finds, and says where', () => {
    const { text: out, applied } = applyFindReplace(text, [{ find: 'Red fish', replace: 'Green fish' }]);
    expect(out).toBe('# Title\n\nOne fish, two fish.\nGreen fish, blue fish.\n');
    expect(applied).toEqual([{ find: 'Red fish', count: 1, lines: [4] }]);
  });

  it('applies edits in order, each on what the ones before left', () => {
    const { text: out } = applyFindReplace(text, [{ find: 'Red', replace: 'Green' }, { find: 'Green fish', replace: 'Green frog' }]);
    expect(out).toContain('Green frog, blue fish.');
  });

  it('refuses a passage that occurs more than once, unless all is set', () => {
    expect(() => applyFindReplace(text, [{ find: 'fish', replace: 'frog' }])).toThrow(/occurs 4 times \(lines 3, 3, 4, 4\)/);
    const { text: out, applied } = applyFindReplace(text, [{ find: 'fish', replace: 'frog', all: true }]);
    expect(out).toBe('# Title\n\nOne frog, two frog.\nRed frog, blue frog.\n');
    expect(applied[0]!.count).toBe(4);
  });

  it('refuses a passage that is not there, or an empty one, and changes nothing', () => {
    expect(() => applyFindReplace(text, [{ find: 'Red', replace: 'Green' }, { find: 'whale', replace: 'x' }])).toThrow(/Edit 2: the text to find is not in the chapter/);
    expect(() => applyFindReplace(text, [{ find: '', replace: 'x' }])).toThrow(/empty "find"/);
  });
});

describe('numberedLines', () => {
  it('numbers the lines it gives', () => {
    expect(numberedLines(text, 3, 4)).toEqual({ text: '3\tOne fish, two fish.\n4\tRed fish, blue fish.', from: 3, to: 4, total: 5 });
    expect(numberedLines('a\nb').text).toBe('1\ta\n2\tb');
    expect(numberedLines('a\nb', 9).from).toBe(2);
  });
});
