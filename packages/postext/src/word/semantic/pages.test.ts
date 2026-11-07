// Exercises, composed and comic pages and music scores in the semantic
// .docx (#1444): set natively or as placeholders, never as raw source, the
// answers out of the pupil's text, and an unedited export reading back
// into the exact Markdown.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../roundtrip/index.js';
import { exportDocx, exportProblems, looseMarkup } from './fixtures/harness.js';
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
    expect(text).toMatch(/A figure floats after its \|_{6,}\|\./);
    for (const w of ['mention', 'whole', 'margin', 'column']) expect(e.frag(e.map.fragments.find((f) => f.role === 'exercise:bank')!.text).text).toContain(w);
    expect(text).toContain('1. PDF/X');
    expect(text).toContain('The printer');
    expect(text).toContain('☐ T   ☐ F');
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
    expect(after.map.fragments.filter((f) => f.role === 'exercise:key').map((f) => f.text)).toEqual(['1. b)', '2. 1 mention · 2 whole', expect.stringMatching(/^3\. 1 [abc]\) · 2 [abc]\) · 3 [abc]\)$/), '4. 1 T · 2 F', '5. ']);
    // The worked solution is the Markdown's own text.
    expect(after.frag('To hold the text and the thumbs.').target).toEqual({ kind: 'markdown', chapter: 0 });
    const chapterEnd = await exportDocx(EXERCISES, { config: { exercises: { solutions: { placement: 'chapterEnd' } } } as never });
    expect(exportProblems(chapterEnd, [EXERCISES])).toEqual([]);
    expect(chapterEnd.doc).toContain('<w:tag w:val="ptx:solutions"/>');
    expect(chapterEnd.frag('Solutions').role).toBe('exercise:solutions');
    expect(applyDocxEdits(chapterEnd.bytes, { chapters: [{ id: 'ch1', markdown: EXERCISES }] }).edits).toEqual([]);
  });

  it("fills the slots in a teacher's edition", async () => {
    const e = await exportDocx(EXERCISES, { config: { exercises: { edition: 'teacher' } } as never });
    expect(exportProblems(e, [EXERCISES])).toEqual([]);
    expect(e.map.fragments.find((f) => f.role === 'exercise:gaps')!.text).toBe('1. A figure floats after its mention.');
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
    ':::page{split="30 / *"}\n::panel{art=a}\ncaption: Every summer.\n::panel{art=b}\n:::\n\n' +
    ':::strip{split="* | *" caption="A strip *lettered* here" id=s1}\n::panel{art=a}\neditor: Hello.\n::panel{art=b}\n:::\n\n' +
    'After.\n';

  it('stands in for them with a labelled placeholder, not their source', async () => {
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    const text = words(e.doc);
    for (const raw of ['::::page', ':::page', ':::strip', '::panel', 'caption:', 'On one page']) expect(text).not.toContain(raw);
    expect(e.frag('Composed page — see the PDF or the formatted .docx').role).toBe('placeholder:composedPage');
    expect(e.frag('Comic page — see the PDF or the formatted .docx').role).toBe('placeholder:comicPage');
    expect(e.frag('Comic strip — see the PDF or the formatted .docx').role).toBe('placeholder:strip');
    const caption = e.frag('A strip *lettered* here');
    expect(md.slice(caption.range[0], caption.range[1])).toBe('A strip *lettered* here');
    const chapters = [{ id: 'ch1', markdown: md }];
    expect(applyDocxEdits(e.bytes, { chapters }).edits).toEqual([]);
    const r = applyDocxEdits(edit(e.bytes, (x) => x.replace('Comic page — see', 'Comic page - see').replace('lettered', 'drawn')), { chapters });
    expect(r.chapters[0]!.markdown).toBe(md.replace('lettered', 'drawn'));
  });

  it('speaks the book language', async () => {
    const e = await exportDocx(md, { config: { locale: 'es' } as never });
    expect(e.frag('Página compuesta — véase el PDF o el .docx maquetado').role).toBe('placeholder:composedPage');
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
