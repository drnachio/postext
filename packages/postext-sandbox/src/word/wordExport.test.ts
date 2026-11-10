import { describe, expect, it } from 'vitest';
import { isExportedDocx, readExportMap } from 'postext/word';
import { strFromU8, unzipSync } from 'fflate';
import { harness } from '../webmcp/tools/testHarness.js';
import { layoutConfig } from '../webmcp/host.js';
import { buildWordExport, docxFileName, fontUse, wordChapters, type WordExportNote, type WordExportProgress } from './wordExport.js';

function input(scope: 'chapter' | 'book') {
  const { get } = harness();
  const s = get();
  return {
    scope,
    chapters: s.chapters,
    activeChapterId: s.activeChapterId,
    resources: s.resources,
    config: layoutConfig(s),
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

  it('reads the faces and the characters of the export from the settings and the text, with no layout', () => {
    const i = input('book');
    const use = fontUse(i.config, wordChapters(i.chapters, 'book', i.activeChapterId), i.resources, 'Guide');
    expect(use.faces.length).toBeGreaterThan(0);
    expect(new Set(use.faces.map((f) => `${f.family}|${f.weight}|${f.style}`)).size).toBe(use.faces.length);
    expect(use.faces.every((f) => use.usedText.get(f.family)?.has('G'.codePointAt(0)!))).toBe(true);
  });

  it('writes the formatted document as flowing text in the book\'s design, and says which fonts could not be had', async () => {
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
    const files = unzipSync(bytes);
    expect(readExportMap(files)?.chapters.map((c) => c.id)).toEqual(['a', 'b']);
    // Flowing text: no line sits in a text box.
    expect(strFromU8(files['word/document.xml']!)).not.toContain('<w:txbxContent>');
    expect(new Set(progress.map((p) => p.phase))).toEqual(new Set(['fonts', 'write']));
    expect(progress.at(-1)).toMatchObject({ phase: 'write' });
    expect(asked.length).toBeGreaterThan(0);
    const families = new Set(asked.map((k) => k.split('|')[0]));
    expect(notes.filter((n) => n.kind === 'font').map((n) => (n as { family: string }).family).sort()).toEqual([...families].sort());
    expect(notes.every((n) => n.kind !== 'font' || n.reason === 'missing')).toBe(true);
  });

  it('writes the semantic document from the chapters, with no font asked for', async () => {
    let asked = 0;
    const bytes = await buildWordExport({ ...input('chapter'), variant: 'semantic', title: 'Guide', fontProvider: async () => { asked++; throw new Error('not asked'); } });
    const files = unzipSync(bytes);
    const map = readExportMap(files);
    expect(map?.chapters.map((c) => c.id)).toEqual(['a']);
    expect(asked).toBe(0);
    expect(Object.keys(files).some((f) => f.startsWith('word/fonts/'))).toBe(false);
  });
});
