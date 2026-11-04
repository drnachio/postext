import { describe, expect, it } from 'vitest';
import { isExportedDocx, readExportMap } from 'postext/word';
import { unzipSync } from 'fflate';
import { harness } from '../webmcp/tools/testHarness.js';
import { layoutConfig } from '../webmcp/host.js';
import { buildWordExport, docxFileName, fontUse, layOutWordChain, wordChapters, type WordExportNote, type WordExportProgress } from './wordExport.js';

function input(scope: 'chapter' | 'book') {
  const { host, get } = harness();
  const s = get();
  return {
    service: host.layout,
    clientId: 'test',
    scope,
    chapters: s.chapters,
    activeChapterId: s.activeChapterId,
    resources: s.resources,
    config: layoutConfig(s),
    plan: host.store.getPlan(s),
  };
}

describe('the Sandbox Word export (#1397)', () => {
  it('names the file after the book, and the chapter when only one goes', () => {
    expect(docxFileName('Moby Dick', null)).toBe('Moby Dick.docx');
    expect(docxFileName('A/B: C?', 'One')).toBe('A B C - One.docx');
    expect(docxFileName('', null)).toBe('document.docx');
  });

  it('takes the chapter on screen or the whole book', () => {
    const { get } = harness();
    const s = get();
    expect(wordChapters(s.chapters, 'chapter', 'b').map((c) => c.id)).toEqual(['b']);
    expect(wordChapters(s.chapters, 'book', 'b').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('lays the book out as the PDF tab does, one document per chapter', async () => {
    const book = await layOutWordChain(input('book'));
    expect(book.docs).toHaveLength(2);
    expect(book.chapters.map((c) => c.id)).toEqual(['a', 'b']);
    const chapter = await layOutWordChain(input('chapter'));
    expect(chapter.docs).toHaveLength(1);
    expect(chapter.chapters.map((c) => c.id)).toEqual(['a']);
    const use = fontUse(book.docs);
    expect(use.fontStrings.length).toBeGreaterThan(0);
    expect([...use.usedText.values()].some((set) => set.has('P'.codePointAt(0)!))).toBe(true);
  });

  it('writes the formatted document with its progress, and says which fonts could not be had', async () => {
    const progress: WordExportProgress[] = [];
    const notes: WordExportNote[] = [];
    const asked: string[] = [];
    const bytes = await buildWordExport({
      ...input('book'),
      variant: 'formatted',
      title: 'Guide',
      fontProvider: async (family, weight, style) => {
        asked.push(`${family}|${weight}|${style}`);
        throw new Error('offline');
      },
      onProgress: (p) => progress.push(p),
      onNote: (n) => notes.push(n),
    });
    expect(isExportedDocx(bytes)).toBe(true);
    expect(readExportMap(unzipSync(bytes))?.variant).toBe('formatted');
    expect(new Set(progress.map((p) => p.phase))).toEqual(new Set(['layout', 'fonts', 'pages']));
    expect(progress.at(-1)).toMatchObject({ phase: 'pages' });
    expect(asked.length).toBeGreaterThan(0);
    const families = new Set(asked.map((k) => k.split('|')[0]));
    expect(notes.filter((n) => n.kind === 'font').map((n) => (n as { family: string }).family).sort()).toEqual([...families].sort());
    expect(notes.every((n) => n.kind !== 'font' || n.reason === 'missing')).toBe(true);
  });

  it('writes the semantic document from the chapters', async () => {
    const bytes = await buildWordExport({ ...input('chapter'), variant: 'semantic', title: 'Guide' });
    const map = readExportMap(unzipSync(bytes));
    expect(map?.variant).toBe('semantic');
    expect(map?.chapters.map((c) => c.id)).toEqual(['a']);
  });
});
