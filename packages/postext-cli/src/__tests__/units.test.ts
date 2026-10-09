import { describe, expect, it } from 'bun:test';
import { Options, parseArgs, UsageError } from '../args';
import { BOOK_OPTIONS, COMMANDS, commandOptions, findCommand } from '../commands';
import { applySet, deepMerge, parseChapterList } from '../input';
import { pageFileName, selectPages, type BookPage } from '../outputs/images';

describe('parseArgs', () => {
  const specs = commandOptions(findCommand('images')!);
  it('reads long, short, = and negated options', () => {
    const { positionals, options } = parseArgs(['book.postext', '-o', 'out', '--dpi=72', '--no-color', '-p', '#1-#3', '--set', 'a=1', '--set', 'b.c=x'], specs);
    expect(positionals).toEqual(['book.postext']);
    expect(options).toEqual({ out: 'out', dpi: 72, color: false, pages: '#1-#3', set: ['a=1', 'b.c=x'] });
  });
  it('rejects unknown options and missing values', () => {
    expect(() => parseArgs(['--nope'], specs)).toThrow(UsageError);
    expect(() => parseArgs(['--dpi'], specs)).toThrow(UsageError);
    expect(() => parseArgs(['--dpi', 'many'], specs)).toThrow(UsageError);
  });
  it('keeps everything after -- as inputs', () => {
    expect(parseArgs(['--', '-weird.md'], specs).positionals).toEqual(['-weird.md']);
  });
  it('checks choices', () => {
    const opts = new Options({ mode: 'paged' });
    expect(() => opts.choice('mode', ['single', 'multi'] as const)).toThrow(UsageError);
  });
  it('gives every book command the book options, with no name clashes', () => {
    for (const c of COMMANDS) {
      const names = commandOptions(c).map((o) => o.name);
      expect(new Set(names).size).toBe(names.length);
      const shorts = commandOptions(c).filter((o) => o.short).map((o) => o.short);
      expect(new Set(shorts).size).toBe(shorts.length);
    }
    expect(commandOptions(findCommand('pdf')!).some((o) => o.name === BOOK_OPTIONS[0]!.name)).toBe(true);
  });
});

describe('config edits', () => {
  it('--set writes dotted paths, JSON values and array indices', () => {
    const config = applySet({ page: { dpi: 300 } } as never, ['page.dpi=150', 'bodyText.fontFamily=Lora', 'headings.levels.0.italic=true', 'layout.columns="2"']);
    expect(config).toEqual({ page: { dpi: 150 }, bodyText: { fontFamily: 'Lora' }, headings: { levels: [{ italic: true }] }, layout: { columns: '2' } } as never);
  });
  it('--set needs PATH=VALUE', () => {
    expect(() => applySet({}, ['page.dpi'])).toThrow(UsageError);
  });
  it('deepMerge merges objects and replaces arrays', () => {
    expect(deepMerge<Record<string, unknown>>({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] }, e: 2 })).toEqual({ a: { b: 1, c: [3] }, d: 1, e: 2 });
  });
  it('--chapters reads lists and ranges, clamping open ranges', () => {
    expect(parseChapterList('1,3-4', 5)).toEqual([0, 2, 3]);
    expect(parseChapterList('2-', 4)).toEqual([1, 2, 3]);
    expect(parseChapterList('1-9', 2)).toEqual([0, 1]);
    expect(() => parseChapterList('7', 3)).toThrow(UsageError);
    expect(() => parseChapterList('x', 3)).toThrow(UsageError);
  });
});

describe('pages', () => {
  const labels = ['i', 'ii', '1', '2', '3', '4'];
  const pages = labels.map((label, i) => ({ label, position: i + 1, chapter: i < 2 ? 1 : 2 }) as BookPage);
  it('picks pages as printed and by position', () => {
    expect(selectPages(pages, 'ii').map((p) => p.position)).toEqual([2]);
    expect(selectPages(pages, '2-3').map((p) => p.label)).toEqual(['2', '3']);
    expect(selectPages(pages, '#1-#2,4').map((p) => p.label)).toEqual(['i', 'ii', '4']);
    expect(selectPages(pages, '#5-').map((p) => p.label)).toEqual(['3', '4']);
    expect(selectPages(pages, undefined)).toHaveLength(6);
    expect(() => selectPages(pages, '99')).toThrow();
  });
  it('names files from the pattern', () => {
    expect(pageFileName('page-{n:03}', pages[3]!, 'png')).toBe('page-004.png');
    expect(pageFileName('c{chapter}-{label}', pages[0]!, 'jpeg')).toBe('c1-i.jpg');
    expect(pageFileName('x/{n}.webp', pages[0]!, 'png')).toBe('x_1.webp');
  });
});
