import { describe, expect, it } from 'vitest';
import type { CoverConfig, ProductionSheet } from 'postext/production';
import { bookDesign, chooseSheetDesign, designOf, sheetDesignChoices, sheetDesignTarget, shownSheetNames, withDesign } from './sheetDesign.js';

// #1673: a case, a jacket or an endpaper drawn with a design of its own.

const caseSheet = { kind: 'case' } as ProductionSheet;
const green = { hex: '#24452f', model: 'hex' as const };
const book: CoverConfig = { background: { hex: '#ffffff', model: 'hex' }, image: { resourceId: 'art' } };

describe('a design per sheet', () => {
  it('names the shown sheet as the engine does, and offers no own design on a paperback cover', () => {
    expect(shownSheetNames('cover', caseSheet)).toEqual(['case', 'cover']);
    expect(shownSheetNames('endpaperFront', undefined)).toEqual(['endpaperFront', 'endpapers']);
    expect(sheetDesignChoices(shownSheetNames('cover', { kind: 'softcover' } as ProductionSheet))).toEqual([]);
    expect(sheetDesignChoices(['endpaperBack', 'endpapers'])).toEqual(['endpaperBack', 'endpapers']);
  });

  it('gives a sheet its own design as a copy of the book’s, edited apart from it', () => {
    const names = shownSheetNames('cover', caseSheet);
    const own = chooseSheetDesign(book, names, 'case')!;
    expect(sheetDesignTarget(own, names)).toBe('case');
    expect(own.sheets!.case).toEqual(book);
    const plain = withDesign(own, 'case', { background: green });
    expect(designOf(plain, 'case')).toEqual({ background: green });
    expect(bookDesign(plain)).toEqual(book);
    // The book's design edited keeps the sheets' own.
    const edited = withDesign(plain, null, { ...book, mirrorMargin: 3 });
    expect(edited!.sheets!.case).toEqual({ background: green });
    expect(edited!.mirrorMargin).toBe(3);
  });

  it('goes back to the book’s design, and a shared endpaper design replaces this endpaper’s', () => {
    const names = shownSheetNames('endpaperFront', undefined);
    const front = chooseSheetDesign(book, names, 'endpaperFront')!;
    expect(Object.keys(front.sheets!)).toEqual(['endpaperFront']);
    const shared = chooseSheetDesign(front, names, 'endpapers')!;
    expect(Object.keys(shared.sheets!)).toEqual(['endpapers']);
    const back = chooseSheetDesign(shared, names, null)!;
    expect(back.sheets).toBeUndefined();
    expect(back).toEqual(book);
  });
});
