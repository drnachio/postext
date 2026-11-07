// Heading designs, hidden headings and box labels in the semantic .docx
// (#1444): the texts a design prints in reading order around the heading,
// mapped to the attribute they show, and an unedited export reading back
// into the exact Markdown.

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems, looseMarkup } from '../fixtures/harness.js';
import { hideRuns } from './hide.js';

/** Unzip, change the document part, zip again. */
function edit(bytes: Uint8Array, f: (xml: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(f(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

const mm = (value: number) => ({ value, unit: 'mm' });
const at = (y: number, x = 0) => ({ anchor: { to: 'container', edge: 'top-left' }, offset: { x: mm(x), y: mm(y) } });
const text = (id: string, content: string, y: number, extra: object = {}) => ({ kind: 'text', id, content, placement: at(y), fontSize: { value: 12, unit: 'pt' }, ...extra });

const config = {
  headingStyles: [
    {
      id: 'opener',
      advancedDesign: {
        enabled: true,
        slot: {
          elements: [
            // Painted in this order; read top to bottom.
            text('lead', '{attr.lead}', 40),
            text('title', '{titleText}', 20),
            text('kicker', '{attr.kicker}', 5),
            text('credit', 'Chapter {chapterNumber}', 60),
            // A shadow a hair under the kicker: the same words twice.
            text('kickerShadow', '{attr.kicker}', 5.3, { color: '#cccccc' }),
          ],
        },
      },
    },
  ],
} as never;

const MD = '# Rivers {style="opener" kicker="Unit one" lead="Where water goes"}\n\nThe text.\n';

describe('semantic docx: heading designs', () => {
  it('writes the texts a design prints in reading order, mapped to the attributes they show', async () => {
    const e = await exportDocx(MD, { config });
    expect(exportProblems(e, [MD])).toEqual([]);
    expect(looseMarkup(e.doc)).toEqual([]);
    const pos = (s: string): number => e.doc.indexOf(`>${s}<`);
    // Kicker above the title, lead and credit below it, the body last.
    expect(pos('Unit one')).toBeGreaterThan(0);
    expect(pos('Unit one')).toBeLessThan(pos('Rivers'));
    expect(pos('Rivers')).toBeLessThan(pos('Where water goes'));
    expect(pos('Where water goes')).toBeLessThan(pos('Chapter 1'));
    expect(pos('Chapter 1')).toBeLessThan(pos('The text.'));
    // The shadow is not written a second time.
    expect(e.doc.split('>Unit one<')).toHaveLength(2);
    expect(e.frag('Unit one').role).toBe('attr:heading:kicker');
    expect(e.frag('Where water goes').role).toBe('attr:heading:lead');
    expect(e.frag('Chapter 1').target).toEqual({ kind: 'generated' });
    // The title stays the outline's heading.
    expect(e.frag('Rivers').target).toEqual({ kind: 'markdown', chapter: 0 });
  });

  it('reads back unchanged, and a lead edited in Word lands in lead="…"', async () => {
    const chapters = [{ id: 'ch1', markdown: MD }];
    const e = await exportDocx(MD, { config });
    const same = applyDocxEdits(e.bytes, { chapters });
    expect(same.edits).toEqual([]);
    expect(same.chapters[0]!.markdown).toBe(MD);
    const r = applyDocxEdits(edit(e.bytes, (x) => x.replace('>Where water goes<', '>Where the water goes<')), { chapters });
    expect(r.chapters[0]!.markdown).toBe(MD.replace('lead="Where water goes"', 'lead="Where the water goes"'));
    // The generated credit is the engine's: an edit to it changes nothing.
    const g = applyDocxEdits(edit(e.bytes, (x) => x.replace('>Chapter 1<', '>Chapter one<')), { chapters });
    expect(g.chapters[0]!.markdown).toBe(MD);
  });

  it('writes a hidden heading hidden but mapped, out of the outline', async () => {
    const md = '# Cover {hidden=true}\n\nThe text.\n';
    const e = await exportDocx(md);
    expect(exportProblems(e, [md])).toEqual([]);
    const p = /<w:p>(?:(?!<\/w:p>)[^])*?>Cover<\/w:t>/.exec(e.doc)?.[0] ?? '';
    expect(p).toContain('<w:outlineLvl w:val="9"/>');
    expect(p).toContain('<w:vanish/>');
    expect(e.frag('Cover').target).toEqual({ kind: 'markdown', chapter: 0 });
    const same = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }] });
    expect(same.edits).toEqual([]);
    expect(same.chapters[0]!.markdown).toBe(md);
  });

  it('puts vanish where CT_RPr has it', () => {
    expect(hideRuns('<w:r><w:rPr><w:b/><w:color w:val="FF0000"/><w:sz w:val="20"/></w:rPr><w:t>a</w:t></w:r><w:r><w:t>b</w:t></w:r>')).toBe(
      '<w:r><w:rPr><w:b/><w:vanish/><w:color w:val="FF0000"/><w:sz w:val="20"/></w:rPr><w:t>a</w:t></w:r><w:r><w:rPr><w:vanish/></w:rPr><w:t>b</w:t></w:r>',
    );
  });
});

describe('semantic docx: box labels', () => {
  const cfg = { calloutStyles: [{ id: 'card', label: { position: 'top-right' } }] } as never;
  const md = ':::callout{type="card" label="SERVES 4"}\nTwo eggs.\n:::\n';

  it('writes the label as the first line, mapped to the attribute', async () => {
    const e = await exportDocx(md, { config: cfg });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc.indexOf('>SERVES 4<')).toBeLessThan(e.doc.indexOf('>Two eggs.<'));
    expect(e.frag('SERVES 4').role).toBe('attr:callout:label');
    const chapters = [{ id: 'ch1', markdown: md }];
    expect(applyDocxEdits(e.bytes, { chapters }).chapters[0]!.markdown).toBe(md);
    const r = applyDocxEdits(edit(e.bytes, (x) => x.replace('>SERVES 4<', '>SERVES 6<')), { chapters });
    expect(r.chapters[0]!.markdown).toBe(md.replace('SERVES 4', 'SERVES 6'));
  });
});

describe('semantic docx: what a title element prints around the title', () => {
  const cfg = (content: string, extra: object = {}) =>
    ({
      headingStyles: [{ id: 'opener', breakBefore: { enabled: true }, advancedDesign: { enabled: true, slot: { elements: [text('kicker', '{attr.kicker}', 5), text('title', content, 20, extra)] } } }],
    }) as never;
  const md = '# Rivers {style="opener" kicker="Unit one"}\n\nThe text.\n';

  it('keeps the number and words around {titleText} as generated text, the title mapped', async () => {
    const e = await exportDocx(md, { config: cfg('Chapter {chapterNumber}: {titleText} ۞') });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(e.doc).toMatch(/>Chapter 1: <\/w:t>(?:(?!<\/w:p>)[^])*>Rivers<\/w:t>(?:(?!<\/w:p>)[^])*> ۞<\/w:t>/);
    expect(e.frag('Chapter 1: ').target).toEqual({ kind: 'generated' });
    expect(e.frag('Rivers').target).toEqual({ kind: 'markdown', chapter: 0 });
    const chapters = [{ id: 'ch1', markdown: md }];
    const same = applyDocxEdits(e.bytes, { chapters });
    expect(same.edits).toEqual([]);
    expect(same.chapters[0]!.markdown).toBe(md);
    const r = applyDocxEdits(edit(e.bytes, (x) => x.replace('>Rivers<', '>Lakes<')), { chapters });
    expect(r.chapters[0]!.markdown).toBe(md.replace('# Rivers', '# Lakes'));
  });

  it('moves the page break from the heading up to the kicker above it', async () => {
    const e = await exportDocx(md, { config: cfg('{titleText}') });
    const para = (s: string): string => new RegExp(`<w:p>(?:(?!<w:p>)[^])*?>${s}</w:t>`).exec(e.doc)?.[0] ?? '';
    expect(para('Unit one')).toContain('<w:pageBreakBefore/>');
    expect(para('Rivers')).not.toContain('<w:pageBreakBefore/>');
  });

  it('gives two fitted sizes of one title element distinct style names', async () => {
    const two = '# Rivers {style="opener"}\n\nA.\n\n# Uncharacteristically {style="opener"}\n\nB.\n';
    const e = await exportDocx(two, { config: cfg('{titleText}', { fontSize: { value: 60, unit: 'pt' } }) });
    const names = [...e.part('word/styles.xml').matchAll(/<w:name w:val="(Postext Design opener title[^"]*)"\/>/g)].map((m) => m[1]);
    expect(names.length).toBe(2);
    expect(new Set(names).size).toBe(2);
  });
});
