// Exercises in the semantic .docx as the engine prints them (#1444):
// numbers counted through the book, the book's digits, keys where the
// engine flushes them, and the text around a gap kept editable.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems } from '../fixtures/harness.js';

/** Unzip, change the document part, zip again. */
function edit(bytes: Uint8Array, f: (xml: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(f(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

const words = (doc: string): string => [...doc.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
const labels = (e: Awaited<ReturnType<typeof exportDocx>>): string[] => e.map.fragments.filter((f) => f.role === 'exercise:instruction:label').map((f) => f.text);
const one = ':::exercise\nPick.\n\n- [x] A\n- [ ] B\n:::\n';

describe('semantic docx: exercise numbers', () => {
  it('counts a chapter with no exercises among the headings before', async () => {
    const config = { exerciseStyles: [{ id: 'exercise', number: { template: '{h1}.{n}' } }] } as never;
    const e = await exportDocx(['# One\n\n' + one, '# Two\n\nNo exercises here.\n', '# Three\n\n' + one], { config });
    expect(labels(e)).toEqual(['1.1. ', '3.1. ']);
  });

  it('leaves unnumbered headings of earlier chapters out of the count', async () => {
    const config = { exerciseStyles: [{ id: 'exercise', number: { template: '{h1}.{n}' } }], headingStyles: [{ id: 'front', numbered: false }] } as never;
    const e = await exportDocx(['# Preface {style="front"}\n\nText.\n', '# One\n\n' + one], { config });
    expect(labels(e)).toEqual(['1.1. ']);
  });

  it('prints numbers and labels in the book digits', async () => {
    const md = ':::exercise\nPick.\n\n- [x] A\n- [ ] B\n:::\n\n:::exercise{type="truefalse"}\nTrue?\n\n- [x] Yes.\n- [ ] No.\n:::\n';
    const e = await exportDocx(md, { config: { numerals: 'arab' } as never });
    expect(labels(e)).toEqual(['١. ', '٢. ']);
    expect(e.map.fragments.filter((f) => f.role === 'exercise:statement:label').map((f) => f.text)).toContain('١. ');
  });
});

describe('semantic docx: exercise keys', () => {
  const chapterEnd = { exercises: { solutions: { placement: 'chapterEnd' } } } as never;

  it('prints the keys of a section before the next first-level heading', async () => {
    const md = '# First\n\n' + one + '\n# Second\n\n' + one;
    const e = await exportDocx(md, { config: chapterEnd });
    expect(exportProblems(e, [md])).toEqual([]);
    const text = words(e.doc);
    const firstKey = text.indexOf('1. a)');
    expect(firstKey).toBeGreaterThan(0);
    expect(firstKey).toBeLessThan(text.indexOf('Second'));
    expect(text.lastIndexOf('1. a)')).toBeGreaterThan(text.indexOf('Second'));
    expect(applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }] }).edits).toEqual([]);
  });

  it('prints no line for an exercise with nothing to answer', async () => {
    const md = one + '\n:::exercise{type="open" lines=2}\nWhy?\n:::\n';
    const e = await exportDocx(md, { config: chapterEnd });
    expect(e.map.fragments.filter((f) => f.role === 'exercise:key').map((f) => f.text)).toEqual(['1. a)']);
  });

  it("marks the right option of an inline choice in a teacher's edition", async () => {
    const md = ':::exercise\nChoose.\n\n1. She [[go | (goes)]] home.\n:::\n';
    const pupil = await exportDocx(md);
    expect(words(pupil.doc)).toContain('She (go / goes) home.');
    const teacher = await exportDocx(md, { config: { exercises: { edition: 'teacher' } } as never });
    // Only the right option is bold; the other stays plain beside it.
    expect(teacher.doc).toMatch(/She \(go \/ <\/w:t><\/w:r><w:r><w:rPr><w:b\/><w:bCs\/><\/w:rPr><w:t[^>]*>goes<\/w:t>/);
  });
});

describe('semantic docx: text around a gap', () => {
  const md = ':::exercise\nComplete.\n\n1. A figure floats after its [[mention]].\n:::\n';

  it('stays mapped, and a correction to it lands in the source', async () => {
    const e = await exportDocx(md);
    expect(e.frag('A figure floats after its __________.').target).toEqual({ kind: 'markdown', chapter: 0 });
    const chapters = [{ id: 'ch1', markdown: md }];
    expect(applyDocxEdits(e.bytes, { chapters }).edits).toEqual([]);
    const fixed = applyDocxEdits(edit(e.bytes, (x) => x.replace('A figure floats', 'A figure moves')), { chapters });
    expect(fixed.chapters[0]!.markdown).toBe(md.replace('floats', 'moves'));
    // The blank itself is the engine's: typing into it changes nothing.
    const typed = applyDocxEdits(edit(e.bytes, (x) => x.replace(/_{4}(_+)/, 'ment$1')), { chapters });
    expect(typed.chapters[0]!.markdown).toBe(md);
  });
});

describe('semantic docx: what prints nothing or fits its parent', () => {
  it('leaves out a solution or hint outside an exercise', async () => {
    const md = 'Before.\n\n:::solution\nThe secret answer.\n:::\n\n:::hint\nA clue.\n:::\n\nAfter.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(words(e.doc)).not.toContain('secret');
    expect(words(e.doc)).not.toContain('clue');
    expect(e.doc).not.toContain('ptx:raw:solution');
    expect(applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }] }).chapters[0]!.markdown).toBe(md);
  });

  it('sizes a page placeholder to the box it stands in', async () => {
    const md = ':::callout{type="note"}\nIn a box.\n\n:::strip{split="* | *"}\n::panel{art=a}\n::panel{art=b}\n:::\n:::\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    const widths = [...e.doc.matchAll(/<w:tblW w:w="(\d+)"/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThanOrEqual(2);
    // The strip's frame is narrower than the box around it.
    expect(widths[1]!).toBeLessThan(widths[0]!);
  });
});
