// Exercises, composed and comic pages and music scores in the semantic
// .docx (#1444): set natively or as placeholders, never as raw source, the
// answers out of the pupil's text, and an unedited export reading back
// into the exact Markdown.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, looseMarkup } from '../fixtures/harness.js';
import { preferredWordVariant } from './pages.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const EXERCISES =
  '# Practice\n\n' +
  ':::exercise{level=1}\nWhich of these does the configuration decide?\n\n- [ ] The words of a heading\n- [x] The colour of the band\n- [ ] Which figure a paragraph mentions\n:::\n\n' +
  ':::exercise{bank level=2}\nComplete the sentences.\n\n1. A figure floats after its [[mention]].\n2. The engine breaks a paragraph as a [[whole]].\n\n::bank[margin | column]\n:::\n\n' +
  ':::exercise\nMatch each output with what it is for.\n\n- PDF/X -> The printer\n- EPUB -> An e-reader\n- SCORM -> A learning platform\n:::\n\n' +
  ':::exercise{type="truefalse"}\nTrue or false?\n\n- [x] Water boils at 100 °C at sea level.\n- [ ] The sun turns round the earth.\n:::\n\n' +
  ':::exercise{type="open" lines=2}\nWhy do pages have margins?\n\n:::solution\nTo hold the text and the thumbs.\n:::\n:::\n';

/** Unzip, change the document part, zip again. */
function edit(bytes: Uint8Array, f: (xml: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(f(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

/** The text of every `w:t` in the document, in order. */
const words = (doc: string): string => [...doc.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('|');

describe('semantic docx: exercises', () => {
  it('sets each kind natively with the answers left out', async () => {
    const e = await exportDocx(EXERCISES);
    expect(exportProblems(e, [EXERCISES])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    expect(e.doc).not.toContain('ptx:raw:exercise');
    const text = words(e.doc);
    for (const raw of ['[x]', '[ ]', '[[', '->', '::bank', ':::solution', 'thumbs']) expect(text).not.toContain(raw);
    // Numbers, options, blanks, the bank, the matching table, the lines.
    expect(text).toContain('1. ');
    expect(text).toContain('●○○');
    expect(text).toMatch(/a\) \|The words of a heading/);
    expect(text).toMatch(/A figure floats after its _{6,}\./);
    for (const w of ['mention', 'whole', 'margin', 'column']) expect(e.frag(e.map.fragments.find((f) => f.role === 'exercise:bank')!.text).text).toContain(w);
    expect(text).toContain('1. PDF/X');
    expect(text).toContain('The printer');
    // Boxes in Arial, which every reader has: the body face may lack them.
    expect(text).toContain('□| T   |□| F');
    expect(e.doc).toMatch(/<w:rFonts w:ascii="Arial"[^>]*\/>(?:(?!<\/w:r>)[^])*<w:t[^>]*>□<\/w:t>/);
    expect(e.doc.match(/<w:tag w:val="ptx:exercise"\/>/g)).toHaveLength(5);
    // The words written in the Markdown stay mapped to it.
    expect(e.frag('Which of these does the configuration decide?').target).toEqual({ kind: 'markdown', chapter: 0 });
    expect(e.frag('The colour of the band').role).toBe('exercise:option');
    expect(e.frag('Water boils at 100 °C at sea level.').role).toBe('exercise:statement');
  });

  it('reads back unchanged, and a corrected option lands in the source', async () => {
    const chapters = [{ id: 'ch1', markdown: EXERCISES }];
    const e = await exportDocx(EXERCISES);
    const same = applyDocxEdits(e.bytes, { chapters });
    expect(same.edits).toEqual([]);
    expect(same.chapters[0]!.markdown).toBe(EXERCISES);
    const fixed = applyDocxEdits(edit(e.bytes, (x) => x.replace('The colour of the band', 'The colour of the chapter band')), { chapters });
    expect(fixed.chapters[0]!.markdown).toBe(EXERCISES.replace('The colour of the band', 'The colour of the chapter band'));
    // A blank is the engine's: typing into it changes nothing.
    const typed = applyDocxEdits(edit(e.bytes, (x) => x.replace(/_{6,}/, 'mention')), { chapters });
    expect(typed.chapters[0]!.markdown).toBe(EXERCISES);
    expect(typed.edits.every((x) => x.status === 'rejected')).toBe(true);
  });

  it('prints the key where the book puts its solutions', async () => {
    const after = await exportDocx(EXERCISES, { config: { exercises: { solutions: { placement: 'after' } } } as never });
    expect(exportProblems(after, [EXERCISES])).toEqual([]);
    // Right after the exercise, no number: the box says which it is.
    expect(after.map.fragments.filter((f) => f.role === 'exercise:key').map((f) => f.text)).toEqual(['b)', '1 mention · 2 whole', expect.stringMatching(/^1 [abc]\) · 2 [abc]\) · 3 [abc]\)$/), '1 T · 2 F']);
    // The worked solution is the Markdown's own text.
    expect(after.frag('To hold the text and the thumbs.').target).toEqual({ kind: 'markdown', chapter: 0 });
    const chapterEnd = await exportDocx(EXERCISES, { config: { exercises: { solutions: { placement: 'chapterEnd' } } } as never });
    expect(exportProblems(chapterEnd, [EXERCISES])).toEqual([]);
    expect(chapterEnd.doc).toContain('<w:tag w:val="ptx:solutions"/>');
    expect(chapterEnd.frag('Solutions').role).toBe('exercise:solutions');
    // Listed at the end, each key under its number; the open question has
    // no key, so its worked solution takes the number's line.
    expect(chapterEnd.map.fragments.filter((f) => f.role === 'exercise:key').map((f) => f.text)).toEqual(['1. b)', '2. 1 mention · 2 whole', expect.stringMatching(/^3\. 1 [abc]\) · 2 [abc]\) · 3 [abc]\)$/), '4. 1 T · 2 F']);
    expect(chapterEnd.map.fragments.filter((f) => f.role === 'exercise:worked:label').map((f) => f.text)).toEqual(['5. ']);
    expect(applyDocxEdits(chapterEnd.bytes, { chapters: [{ id: 'ch1', markdown: EXERCISES }] }).edits).toEqual([]);
  });

  it("fills the slots in a teacher's edition", async () => {
    const e = await exportDocx(EXERCISES, { config: { exercises: { edition: 'teacher' } } as never });
    expect(exportProblems(e, [EXERCISES])).toEqual([]);
    expect(e.map.fragments.find((f) => f.role === 'exercise:gaps')!.text).toBe('A figure floats after its mention.');
    expect(words(e.doc)).toContain(' ✓');
  });

  it('numbers exercises on through the chapters', async () => {
    const one = ':::exercise\nPick.\n\n- [x] A\n- [ ] B\n:::\n';
    const e = await exportDocx(['# One\n\n' + one, '# Two\n\n' + one + '\n' + one]);
    // Reset at each first-level heading, as the default style counts.
    expect(e.map.fragments.filter((f) => f.role === 'exercise:instruction:label').map((f) => f.text)).toEqual(['1. ', '1. ', '2. ']);
  });
});

describe('semantic docx: pages Word cannot hold', () => {
  const md =
    'Before.\n\n' +
    '::::page{template="sheet"}\n## On one page\n\n:::frame{slot="card" label="Write"}\nPlain Markdown.\n:::\n::::\n\n' +
    ':::page{split="30 / *"}\n::panel{art=a}\ncaption: Every summer.\n::panel{art=b}\nMaya: Hi there.\n:::\n\n' +
    ':::strip{split="* | *" caption="A strip *lettered* here" id=s1}\n::panel{art=a}\neditor: Hello.\n::panel{art=b}\n:::\n\n' +
    'After.\n';

  it('writes what fills them as flowing text, mapped to the Markdown, not their source', async () => {
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    const text = words(e.doc);
    for (const raw of ['::::page', ':::page', ':::strip', '::panel', 'caption:', '— see the PDF']) expect(text).not.toContain(raw);
    // The composed page starts a page of its own, its frame's label a title.
    expect(e.doc).toContain('<w:tag w:val="ptx:composedPage:sheet"/>');
    expect(e.doc).toContain('<w:tag w:val="ptx:frame:card"/>');
    expect(e.doc.slice(e.doc.indexOf('ptx:composedPage:sheet'))).toMatch(/^[^]*?<w:pageBreakBefore\/>/);
    expect(e.frag('On one page').target).toEqual({ kind: 'markdown', chapter: 0 });
    expect(e.frag('Write').role).toBe('attr:frame:label');
    expect(e.frag('Plain Markdown.').target).toEqual({ kind: 'markdown', chapter: 0 });
    // The panels' script, a line each: a key that is the speaker's name
    // mapped, a lower-case key shown with a capital (generated), the colon
    // the engine's.
    expect(e.frag('Every summer.').role).toBe('comic:caption');
    expect(e.frag('Maya').target).toEqual({ kind: 'markdown', chapter: 0 });
    expect(e.frag('Editor').target).toEqual({ kind: 'generated' });
    expect(e.frag('Editor').role).toBe('comic:speaker');
    expect(e.frag(': ').target).toEqual({ kind: 'generated' });
    expect(e.frag('Hello.').role).toBe('comic:speech');
    expect(text).toContain('Editor|: |Hello.');
    // A comic page starts a page.
    const beforePage = e.doc.slice(0, e.doc.indexOf('ptx:comicPage'));
    expect(beforePage.lastIndexOf('<w:pageBreakBefore/>')).toBeGreaterThan(beforePage.lastIndexOf('ptx:composedPage'));
    const caption = e.frag('A strip *lettered* here');
    expect(md.slice(caption.range[0], caption.range[1])).toBe('A strip *lettered* here');
    const chapters = [{ id: 'ch1', markdown: md }];
    const same = applyDocxEdits(e.bytes, { chapters });
    expect(same.edits).toEqual([]);
    expect(same.chapters[0]!.markdown).toBe(md);
    const r = applyDocxEdits(edit(e.bytes, (x) => x.replace('lettered', 'drawn').replace('>Write<', '>Read<').replace('Hello.', 'Hello there.').replace('>Maya<', '>Lena<')), { chapters });
    expect(r.chapters[0]!.markdown).toBe(md.replace('lettered', 'drawn').replace('label="Write"', 'label="Read"').replace('editor: Hello.', 'editor: Hello there.').replace('Maya: Hi', 'Lena: Hi'));
    // A name made from the key is not the key: renaming it changes nothing.
    const renamed = applyDocxEdits(edit(e.bytes, (x) => x.replace('>Editor<', '>Writer<')), { chapters });
    expect(renamed.chapters[0]!.markdown).toBe(md);
  });

  it('numbers a strip counted as a figure, and a :ref to it prints its label', async () => {
    const strip = 'The strip in :ref{id="s2"} was lettered.\n\n:::strip{split="* | *" caption="A strip." type=figure id=s2}\n::panel{art=a}\nmaya: Hello.\n:::\n\nAfter.\n';
    const e = await exportDocx(strip);
    expect(exportProblems(e, [strip])).toEqual([]);
    const text = words(e.doc);
    expect(text).not.toContain('s2');
    expect(text).toMatch(/The strip in \|?Fig\. 1\|? was lettered\./);
    expect(e.frag('Figure 1. ').target).toEqual({ kind: 'generated' });
    expect(text).toMatch(/Figure \|?1\|?\. \|A strip\./);
    const same = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: strip }] });
    expect(same.edits).toEqual([]);
    expect(same.chapters[0]!.markdown).toBe(strip);
  });

  it('stands in for a page with nothing to write, in the book language', async () => {
    const empty = 'Before.\n\n:::page{split="*"}\n::panel\n:::\n\nAfter.\n';
    const e = await exportDocx(empty);
    expect(exportProblems(e, [empty])).toEqual([]);
    expect(e.frag('Comic page — see the PDF or the formatted .docx').role).toBe('placeholder:comicPage');
    expect(applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: empty }] }).chapters[0]!.markdown).toBe(empty);
    const es = await exportDocx(empty, { config: { locale: 'es' } as never });
    expect(es.frag('Página de cómic — véase el PDF o el .docx maquetado').role).toBe('placeholder:comicPage');
  });

  it('suggests the formatted variant when pages are most of the book', () => {
    const comic = ':::page{split="*"}\n::panel{art=a}\ncaption: A long caption that fills the page with words and more words.\n:::\n';
    expect(preferredWordVariant([{ markdown: '# A\n\nText.\n' }])).toBe('semantic');
    expect(preferredWordVariant([{ markdown: 'Intro.\n\n' + comic + comic }])).toBe('formatted');
    expect(preferredWordVariant([{ markdown: '---\ntitle: x\n---\n' + md }])).toBe('formatted');
    expect(preferredWordVariant([{ markdown: `# Guide\n\n${'A paragraph of the guide. '.repeat(40)}\n\n${comic}` }])).toBe('semantic');
  });
});

describe('semantic docx: music scores', () => {
  it('engraves a score as pictures that read back as nothing', async () => {
    const md = 'The tune:\n\n```abc {alt="A short melody"}\nX:1\nM:3/4\nL:1/8\nK:G\nD2 | G2 B2 d2 | c2 A2 F2 | G6 |]\n```\n\nAfter.\n';
    const e = await exportDocx(md, { rasterizeSvg: async () => PNG.slice() });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.warnings).toEqual([]);
    expect(e.doc).toContain('<w:tag w:val="ptx:score"/>');
    expect(e.doc).toContain('descr="A short melody"');
    expect(e.doc).not.toContain('ptx:raw:score');
    expect(Object.keys(e.files).some((p) => /^word\/media\/.*\.svg$/.test(p))).toBe(true);
    expect(applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }] }).edits).toEqual([]);
  }, 30000);

  it('keeps the notation as source without a rasterizer', async () => {
    const md = '```abc\nX:1\nK:C\nC D E F |]\n```\n';
    const e = await exportDocx(md);
    expect(e.doc).toContain('ptx:raw:score');
    expect(e.warnings.map((w) => w.code)).toEqual(['scoreWithoutFallback']);
  });
});
