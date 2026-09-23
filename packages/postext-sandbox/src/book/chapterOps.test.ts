import { describe, expect, it } from 'vitest';
import {
  addChapter, cloneBook, deriveChapterTitle, h1Count, isPristineBook, mergeWithPrevious, moveChapter,
  newChapter, removeChapter, renameChapter, replaceChapterMarkdown, sampleBook, singleChapterBook, splitChapterAt,
  splitChapterAtHeadings, wordCount,
} from './chapterOps';
import type { BookContent } from './types';

function book(): BookContent {
  return {
    chapters: [newChapter('a', 'A', '# A\n\ntext a', 1), newChapter('b', 'B', '# B\n\ntext b', 1), newChapter('c', 'C', '# C', 1)],
    activeChapterId: 'b',
  };
}

describe('deriveChapterTitle', () => {
  it('uses the first H1 outside front matter and fences', () => {
    expect(deriveChapterTitle('---\ntitle: FM\n---\n```\n# no\n```\n# **Real** _title_ {#id}\n', 'x')).toBe('Real title');
    expect(deriveChapterTitle('# Salud y enfermedad. \\\\ Salud comunitaria {author="X"}', 'x')).toBe('Salud y enfermedad. Salud comunitaria');
  });
  it('falls back to the front-matter title, then the fallback', () => {
    expect(deriveChapterTitle('---\ntitle: "From FM"\n---\nbody', 'x')).toBe('From FM');
    expect(deriveChapterTitle('just text', 'Chapter 1')).toBe('Chapter 1');
  });
});

describe('counts', () => {
  it('counts H1s and words', () => {
    expect(h1Count('# a\n## b\n# c\n```\n# d\n```')).toBe(2);
    expect(wordCount('---\ntitle: x y z\n---\nHello, world! It\'s 3 words')).toBe(5);
  });
});

describe('chapter list operations', () => {
  it('replaces markdown only when it changed', () => {
    const b = book();
    expect(replaceChapterMarkdown(b, 'a', '# A\n\ntext a')).toBe(b);
    const next = replaceChapterMarkdown(b, 'a', 'new', 9);
    expect(next.chapters[0]!.markdown).toBe('new');
    expect(next.chapters[0]!.updatedAt).toBe(9);
    expect(next.chapters[1]).toBe(b.chapters[1]);
  });
  it('adds after the active chapter and activates it', () => {
    const next = addChapter(book(), newChapter('d', 'D'));
    expect(next.chapters.map((c) => c.id)).toEqual(['a', 'b', 'd', 'c']);
    expect(next.activeChapterId).toBe('d');
  });
  it('refuses to remove the last chapter and re-targets the active one', () => {
    const only = singleChapterBook('x', 'a', 'A');
    expect(removeChapter(only, 'a')).toBe(only);
    const next = removeChapter(book(), 'b');
    expect(next.chapters.map((c) => c.id)).toEqual(['a', 'c']);
    expect(next.activeChapterId).toBe('c');
    const last = removeChapter({ ...book(), activeChapterId: 'c' }, 'c');
    expect(last.activeChapterId).toBe('b');
  });
  it('renames (trimmed, non-empty) and moves', () => {
    expect(renameChapter(book(), 'a', '  ')).toEqual(book());
    expect(renameChapter(book(), 'a', ' New ').chapters[0]!.title).toBe('New');
    expect(moveChapter(book(), 'c', 0).chapters.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    expect(moveChapter(book(), 'a', 99).chapters.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });
  it('splits at an offset and at headings', () => {
    const split = splitChapterAt(book(), 'a', 4, 'n');
    expect(split.chapters.map((c) => c.id)).toEqual(['a', 'n', 'b', 'c']);
    expect(split.chapters[0]!.markdown).toBe('# A');
    expect(split.chapters[1]!.markdown).toBe('text a');
    expect(split.activeChapterId).toBe('n');

    let n = 0;
    const src = singleChapterBook('---\ntitle: T\n---\n# One\np1\n# Two\np2\n```\n# not\n```\n# Three\n', 'a', 'Doc');
    const { book: out, created } = splitChapterAtHeadings(src, 'a', () => `n${++n}`);
    expect(created).toBe(2);
    expect(out.chapters.map((c) => c.title)).toEqual(['Doc', 'Two', 'Three']);
    expect(out.chapters[0]!.markdown).toBe('---\ntitle: T\n---\n# One\np1');
    expect(out.chapters[1]!.markdown).toBe('# Two\np2\n```\n# not\n```');
    expect(splitChapterAtHeadings(book(), 'a', () => 'x').created).toBe(0);
  });
  it('merges into the previous chapter, blanking front matter', () => {
    const b = book();
    b.chapters[1] = { ...b.chapters[1]!, markdown: '---\nt: 1\n---\n# B' };
    const next = mergeWithPrevious(b, 'b');
    expect(next.chapters.map((c) => c.id)).toEqual(['a', 'c']);
    expect(next.chapters[0]!.markdown).toBe('# A\n\ntext a\n\n# B');
    expect(next.activeChapterId).toBe('a');
    expect(mergeWithPrevious(book(), 'a')).toEqual(book());
  });
  it('clones with fresh ids and remaps the active id', () => {
    let n = 0;
    const cloned = cloneBook(book(), () => `id${++n}`);
    expect(cloned.chapters.map((c) => c.id)).toEqual(['id1', 'id2', 'id3']);
    expect(cloned.activeChapterId).toBe('id2');
    expect(cloned.chapters[0]!.markdown).toBe('# A\n\ntext a');
  });
  it('detects a pristine sample book', () => {
    expect(isPristineBook(singleChapterBook('S', 'a', 'A'), ['S'])).toBe(true);
    expect(isPristineBook(book(), ['S'])).toBe(false);
  });
});

describe('sampleBook', () => {
  const sample = [
    '---',
    'title: "Guide"',
    '---',
    '',
    '# Guide {style="cover"}',
    '',
    'Colophon.',
    '',
    '# Contents',
    '',
    ':::toc',
    '',
    ':::numbering{format="decimal" startAt=1}',
    '',
    ':::part{number="I" title="Basics"}',
    '1. Intro',
    ':::',
    '',
    '# Intro',
    '',
    'Text.',
    '',
    ':::callout{type="tip"}',
    'Box.',
    ':::',
    '',
    '# Next',
    '',
    'More.',
  ].join('\n');

  it('cuts one chapter per level-1 heading, a part going with the chapter it opens', () => {
    let n = 0;
    const book = sampleBook(sample, () => `c${n++}`, 'Fallback');
    expect(book.chapters.map((c) => c.title)).toEqual(['Guide', 'Contents', 'Intro', 'Next']);
    expect(book.chapters[0]!.markdown.startsWith('---\ntitle')).toBe(true);
    expect(book.chapters[1]!.markdown).toBe('# Contents\n\n:::toc');
    expect(book.chapters[2]!.markdown.startsWith(':::numbering{format="decimal" startAt=1}\n\n:::part')).toBe(true);
    expect(book.chapters[2]!.markdown.endsWith(':::callout{type="tip"}\nBox.\n:::')).toBe(true);
    expect(book.activeChapterId).toBe('c0');
  });

  it('recognises the untouched sample as a book or as one chapter', () => {
    let n = 0;
    const book = sampleBook(sample, () => `c${n++}`, 'Fallback');
    expect(isPristineBook(book, [sample])).toBe(true);
    expect(isPristineBook(singleChapterBook(sample, 'x', 'Guide'), [sample])).toBe(true);
    const edited = { ...book, chapters: book.chapters.map((c, i) => (i === 3 ? { ...c, markdown: c.markdown + '!' } : c)) };
    expect(isPristineBook(edited, [sample])).toBe(false);
  });
});
