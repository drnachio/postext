// Equations through the semantic writer and back (#1395): the writer
// records a hash of the canonical OMML per equation, so an equation Word
// only rewrote (rsid attributes, Cambria Math run properties, whitespace)
// keeps its TeX byte-identical, and a changed one goes through ommlToTex.

import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { semanticDocx } from '../semantic/index.js';
import { readExportMap } from '../anchors/exportMap.js';
import { ommlHash } from '../anchors/ommlHash.js';
import { applyDocxEdits } from './index.js';

const DATE = '2026-11-04T00:00:00Z';

function edit(bytes: Uint8Array, f: (xml: string) => string): Uint8Array {
  const files = unzipSync(bytes);
  files['word/document.xml'] = strToU8(f(strFromU8(files['word/document.xml']!)));
  return zipSync(files);
}

/** What Word does to an equation it saves without the user touching it. */
const wordRewrite = (xml: string): string =>
  xml
    .replaceAll('<m:r>', '<m:r w:rsidR="00A1B2C3">\n  <w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr>\n  ')
    .replaceAll('<m:sSup>', '<m:sSup><m:sSupPr><m:ctrlPr><w:rPr><w:i/></w:rPr></m:ctrlPr></m:sSupPr>');

describe('equations round trip', () => {
  const md = 'The bound $b = 100\\,|r|^3$ holds, and\n\n$$\\int_0^1 x^2\\,dx = \\tfrac{1}{3}$$\n\nafter it.\n';
  const chapters = [{ id: 'c', markdown: md }];

  it('records the canonical OMML hash of every equation', async () => {
    const bytes = await semanticDocx({ chapters, config: {}, date: DATE });
    const map = readExportMap(unzipSync(bytes))!;
    const maths = map.fragments.flatMap((f) => f.atoms ?? []).filter((a) => a.kind === 'math');
    expect(maths).toHaveLength(2);
    for (const a of maths) expect(a.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('keeps untouched equations byte-identical, also after Word rewrites them', async () => {
    const bytes = await semanticDocx({ chapters, config: {}, date: DATE });
    expect(applyDocxEdits(bytes, { chapters }).edits).toEqual([]);
    const rewritten = edit(bytes, wordRewrite);
    expect(strFromU8(unzipSync(rewritten)['word/document.xml']!)).toContain('Cambria Math');
    const r = applyDocxEdits(rewritten, { chapters });
    expect(r.edits).toEqual([]);
    expect(r.chapters[0]!.markdown).toBe(md);
  });

  it('converts an equation the user changed', async () => {
    const bytes = await semanticDocx({ chapters, config: {}, date: DATE });
    const changed = edit(bytes, (x) => x.replace('>100</m:t>', '>200</m:t>'));
    const r = applyDocxEdits(changed, { chapters });
    expect(r.edits).toHaveLength(1);
    const out = r.chapters[0]!.markdown;
    expect(out).toContain('200');
    expect(out).not.toContain('100');
    // Everything else stays as written.
    expect(out.slice(out.indexOf(' holds'))).toBe(md.slice(md.indexOf(' holds')));
  });

  it('hashes OMML independently of attributes, namespaces and whitespace', () => {
    const a = '<m:oMath><m:r><m:t>x</m:t></m:r></m:oMath>';
    const b = '<m:oMath xmlns:m="urn:m" w:rsidR="1">\n <m:r><w:rPr><w:i/></w:rPr><m:t>x</m:t></m:r>\n</m:oMath>';
    expect(ommlHash(a)).toBe(ommlHash(b));
    expect(ommlHash('<m:oMathPara>' + a + '</m:oMathPara>')).toBe(ommlHash(a));
    expect(ommlHash(a.replace('x', 'y'))).not.toBe(ommlHash(a));
    // Text inside m:t keeps its spaces.
    expect(ommlHash(a.replace('>x<', '>x <'))).not.toBe(ommlHash(a));
    expect(ommlHash('<w:r/>')).toBeUndefined();
  });
});
