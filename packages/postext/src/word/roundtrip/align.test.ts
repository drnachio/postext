// Fragments of the book matched with the bookmarks of a file exported
// before the book changed (#1458).

import { describe, expect, it } from 'vitest';
import { alignFragments, looseText, type Named } from './align.js';

const named = (texts: string[], from = 0): Named[] => texts.map((text, k) => ({ id: (from + k).toString(36), text }));
const pairs = (r: Named[], f: Named[]) => {
  const a = alignFragments(r, f);
  return { ids: [...a.ids].map(([x, y]) => `${x}>${y}`).join(' '), unplaced: [...a.unplaced].join(' '), foreign: [...a.foreign].join(' ') };
};

describe('alignFragments', () => {
  it('pairs name by name what did not change', () => {
    const texts = ['One paragraph here.', 'Another one there.', 'A third to close.'];
    expect(pairs(named(texts), named(texts))).toEqual({ ids: '0>0 1>1 2>2', unplaced: '', foreign: '' });
  });

  it('follows the names past a paragraph the book gained', () => {
    const file = named(['One paragraph here.', 'Another one there.', 'A third to close.']);
    const book = named(['One paragraph here.', 'Written since the export.', 'Another one there.', 'A third to close.']);
    expect(pairs(book, file)).toEqual({ ids: '0>0 2>1 3>2', unplaced: '1', foreign: '' });
  });

  it('follows the names past a paragraph the book lost', () => {
    const file = named(['One paragraph here.', 'Taken out since the export.', 'Another one there.']);
    const book = named(['One paragraph here.', 'Another one there.']);
    expect(pairs(book, file)).toEqual({ ids: '0>0 1>2', unplaced: '', foreign: '1' });
  });

  it('pairs a passage corrected in the file with the one it came from', () => {
    const file = named(['One paragraph here.', 'Another one there, with a word corrected by the reader.', 'A third to close.']);
    const book = named(['Written since.', 'One paragraph here.', 'Another one there, with a word changed by the reader.', 'A third to close.']);
    expect(pairs(book, file)).toEqual({ ids: '1>0 2>1 3>2', unplaced: '0', foreign: '' });
  });

  it('pairs in order what stands alone between two pairs, however much it changed', () => {
    // A table cell of one word, changed.
    const file = named(['Tool', 'Uneven', 'Engine']);
    const book = named(['Tool', 'Patchy', 'Engine']);
    expect(pairs(book, file).ids).toBe('0>0 1>1 2>2');
  });

  const A = 'The first paragraph says how water runs down a slope.';
  const B = 'The one after it tells where the river meets the sea, and what it leaves there.';

  it('pairs no half with two paragraphs the book joined since', () => {
    const file = named(['A line before them.', A, B, 'A line after them.']);
    const book = named(['A line before them.', `${A} ${B}`, 'A line after them.']);
    expect(pairs(book, file)).toEqual({ ids: '0>0 2>3', unplaced: '1', foreign: '1 2' });
    // Even when a word was corrected in one of the halves.
    const corrected = named(['A line before them.', A.replace('slope', 'hill'), B, 'A line after them.']);
    expect(pairs(book, corrected)).toEqual({ ids: '0>0 2>3', unplaced: '1', foreign: '1 2' });
  });

  it('pairs no half with a paragraph the book cut in two since', () => {
    const file = named(['A line before them.', `${A} ${B}`, 'A line after them.']);
    const book = named(['A line before them.', A, B, 'A line after them.']);
    expect(pairs(book, file)).toEqual({ ids: '0>0 3>2', unplaced: '1 2', foreign: '1' });
  });

  it('still pairs a corrected passage that stands beside a new one', () => {
    const file = named(['A line before them.', B.replace('meets', 'reaches'), 'A line after them.']);
    const book = named(['A line before them.', 'The river and the sea.', B, 'A line after them.']);
    expect(pairs(book, file)).toEqual({ ids: '0>0 2>1 3>2', unplaced: '1', foreign: '' });
  });

  it('pairs nothing of two texts that share nothing', () => {
    const file = named(['Nothing shared between the two.', 'Another book altogether.']);
    const book = named(['One paragraph here.', 'A second one there.']);
    expect(pairs(book, file)).toEqual({ ids: '', unplaced: '0 1', foreign: '0 1' });
  });

  it('compares texts with spaces as one and capitals apart', () => {
    expect(looseText('  WHERE   water\tGoes ')).toBe('where water goes');
    expect(pairs(named(['Where water goes']), named(['WHERE WATER GOES'])).ids).toBe('0>0');
  });
});
