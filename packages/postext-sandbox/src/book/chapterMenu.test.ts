import { describe, expect, it } from 'vitest';
import { chapterFilterKey, chapterMatches, chapterMenuEntries, partLabel, type ChapterMenuSource } from './chapterMenu';

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

// #199: 紅樓夢, 120 回 in twelve 卷 of ten, after an unnumbered front page.
function hongloumeng(): ChapterMenuSource[] {
  const front: ChapterMenuSource = { id: 'front', title: '紅樓夢', number: null };
  const chapters = Array.from({ length: 120 }, (_, i): ChapterMenuSource => ({
    id: `c${i + 1}`,
    title: i === 26 ? '第二十七回　滴翠亭楊妃戲彩蝶　埋香塚飛燕泣殘紅' : `第${i + 1}回`,
    number: i + 1,
    part: { number: CN[Math.floor(i / 10)]!, title: `卷${CN[Math.floor(i / 10)]}` },
  }));
  return [front, ...chapters];
}

describe('chapterMenuEntries', () => {
  it('groups the chapters under twelve part headers', () => {
    const entries = chapterMenuEntries(hongloumeng());
    const headers = entries.filter((e) => e.kind === 'part');
    expect(headers).toHaveLength(12);
    expect(entries).toHaveLength(121 + 12);
    // The front page has no part; each header precedes its ten chapters.
    expect(entries[0]).toEqual({ kind: 'chapter', index: 0 });
    expect(entries[1]).toMatchObject({ kind: 'part', firstIndex: 1, part: { number: '一', title: '卷一' } });
    expect(entries.slice(2, 12).every((e) => e.kind === 'chapter')).toBe(true);
    const third = headers[2]!;
    expect(third).toMatchObject({ firstIndex: 21, part: { title: '卷三' } });
  });

  it('keeps a flat list for a book without parts', () => {
    const flat = [{ id: 'a', title: 'A', number: 1 }, { id: 'b', title: 'B', number: 2 }];
    expect(chapterMenuEntries(flat)).toEqual([{ kind: 'chapter', index: 0 }, { kind: 'chapter', index: 1 }]);
  });

  it('filters by number or title, keeping the headers of the parts shown', () => {
    const book = hongloumeng();
    for (const q of ['27', '埋香', '２７']) {
      const found = chapterMenuEntries(book, q).filter((e) => e.kind === 'chapter');
      expect(found.map((e) => (e.kind === 'chapter' ? book[e.index]!.id : '')), q).toContain('c27');
    }
    const onlyTitle = chapterMenuEntries(book, '埋香');
    expect(onlyTitle).toEqual([
      { kind: 'part', key: 'part-21', part: { number: '三', title: '卷三' }, firstIndex: 21 },
      { kind: 'chapter', index: 27 },
    ]);
    // A part's name lists its chapters.
    expect(chapterMenuEntries(book, '卷十二').filter((e) => e.kind === 'chapter')).toHaveLength(10);
    expect(chapterMenuEntries(book, 'nothing like this')).toEqual([]);
  });
});

describe('chapterMatches / partLabel', () => {
  it('matches the start of the number and any part of the title', () => {
    const c = { id: 'x', title: 'The Solar System', number: 12 };
    expect(chapterMatches('1', c)).toBe(true);
    expect(chapterMatches('2', c)).toBe(false);
    expect(chapterMatches('solar', c)).toBe(true);
    expect(chapterMatches('  ', c)).toBe(true);
  });

  it('joins number and title', () => {
    expect(partLabel({ number: 'I', title: 'Sistema solar' })).toBe('I · Sistema solar');
    expect(partLabel({ number: '', title: '卷一' })).toBe('卷一');
    expect(partLabel({ number: 'II', title: '' })).toBe('II');
  });
});

// #199 review: Zhuyin, Cangjie and Japanese input confirm a conversion with
// Enter; with 埋 half-typed that Enter must not open the first match.
describe('chapterFilterKey', () => {
  it('leaves every key to an IME while it composes', () => {
    for (const key of ['Enter', 'ArrowDown', 'ArrowUp', 'Escape', 'Tab', 'a']) {
      expect(chapterFilterKey(key, { composing: true, empty: false })).toBe('compose');
      expect(chapterFilterKey(key, { composing: true, empty: true })).toBe('compose');
    }
  });

  it('opens the first match, moves into the list or edits the field otherwise', () => {
    expect(chapterFilterKey('Enter', { composing: false, empty: false })).toBe('open');
    expect(chapterFilterKey('ArrowDown', { composing: false, empty: true })).toBe('active');
    expect(chapterFilterKey('ArrowDown', { composing: false, empty: false })).toBe('menu');
    expect(chapterFilterKey('ArrowUp', { composing: false, empty: true })).toBe('menu');
    expect(chapterFilterKey('Escape', { composing: false, empty: false })).toBe('menu');
    expect(chapterFilterKey('埋', { composing: false, empty: false })).toBe('field');
  });
});
