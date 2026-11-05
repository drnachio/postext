import { beforeAll, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { initMathEngine } from '../../math/index.js';
import type { PostextConfig } from '../../index.js';
import { applyDocxEdits } from './index.js';
import type { BlockView } from './blocks.js';
import { slideOffAtoms } from './edits.js';
import { readExportMap } from '../anchors/exportMap.js';
import { formattedDocx } from '../formatted/index.js';
import { build, config, documentXml, mm, unzip } from '../formatted/formatted.test-helper.js';

// The formatted writer holds an atom's room with U+00A0, the character a
// typed no-break space is too: deleting a source NBSP next to an atom must
// take the NBSP, never the atom, and clearing the atom's holder run (marked
// w:noProof) the atom, never the NBSP.

const NB = ' ';
const SW = ':swatch{color="#ff0000"}';
const LTR = config();
const RTL = config({ locale: 'ar', direction: 'rtl', bodyText: { textAlign: 'justify', firstLineIndent: mm(0) } } as Partial<PostextConfig>);

beforeAll(async () => {
  await initMathEngine();
});

/** Exports `md`, rewrites the `nth` text run holding `from` and imports it
 *  back (`strip` drops the w:noProof marks first, as a file written before
 *  #1406 or an editor that lost them). */
async function roundTrip(md: string, cfg: PostextConfig, from: string, to: string, nth = 0, strip = false) {
  const files = unzip(await formattedDocx({ docs: [build(md, cfg)], chapters: [{ id: 'c', markdown: md }], date: '2026-11-04T00:00:00Z', exportId: 'h' }));
  const xml = strip ? documentXml(files).replaceAll('<w:noProof/>', '') : documentXml(files);
  const parts = xml.split(/(<w:t xml:space="preserve">[^<]*<\/w:t>)/);
  const at = parts.map((p, i) => [p, i] as const).filter(([p]) => p.startsWith('<w:t ') && p.slice(0, -6).includes(from))[nth]?.[1];
  expect(at, `run ${nth} holding ${JSON.stringify(from)}`).toBeDefined();
  const run = parts[at!]!;
  parts[at!] = run.slice(0, -6).replace(from, to) + '</w:t>';
  const edited = parts.join('');
  expect(edited).not.toBe(xml);
  files['word/document.xml'] = strToU8(edited);
  return applyDocxEdits(zipSync(files), { chapters: [{ id: 'c', markdown: md }] });
}

describe('round trip, no-break spaces beside atoms', () => {
  const cases: [string, PostextConfig, string, string, string, string][] = [
    ['NBSP before maths', LTR, `Mass 5${NB}$m$ here.\n`, `5${NB}`, '5', 'Mass 5$m$ here.\n'],
    ['NBSP after maths', LTR, `Mass $m$${NB}kg here.\n`, `${NB}kg`, 'kg', 'Mass $m$kg here.\n'],
    ['NBSP before a swatch', LTR, `Key${NB}${SW} red here.\n`, `Key${NB}`, 'Key', `Key${SW} red here.\n`],
    ['NBSP after a swatch', LTR, `Key ${SW}${NB}red here.\n`, `${NB}red`, 'red', `Key ${SW}red here.\n`],
    ['NBSP before maths, RTL', RTL, `الكتلة${NB}$m$ هنا.\n`, `الكتلة${NB}`, 'الكتلة', 'الكتلة$m$ هنا.\n'],
    ['NBSP after maths, RTL', RTL, `الكتلة $m$${NB}كغ هنا.\n`, `${NB}كغ`, 'كغ', 'الكتلة $m$كغ هنا.\n'],
    ['NBSP before a swatch, RTL', RTL, `لون${NB}${SW} أحمر.\n`, `لون${NB}`, 'لون', `لون${SW} أحمر.\n`],
    ['NBSP after a swatch, RTL', RTL, `لون ${SW}${NB}أحمر.\n`, `${NB}أحمر`, 'أحمر', `لون ${SW}أحمر.\n`],
  ];
  for (const [name, cfg, md, from, to, want] of cases) {
    it(`deletes a ${name} and keeps the atom`, async () => {
      const r = await roundTrip(md, cfg, from, to);
      expect(r.chapters[0]!.markdown).toBe(want);
    });
  }

  it('deletes the NBSP, not one of several atoms after it', async () => {
    expect((await roundTrip(`Mass 5${NB}$m$$n$ here.\n`, LTR, `5${NB}`, '5')).chapters[0]!.markdown).toBe('Mass 5$m$$n$ here.\n');
    expect((await roundTrip(`Mass 5${NB}$m$${SW} here.\n`, LTR, `5${NB}`, '5')).chapters[0]!.markdown).toBe(`Mass 5$m$${SW} here.\n`);
    expect((await roundTrip(`Mass $m$$n$${NB}kg here.\n`, LTR, `${NB}kg`, 'kg')).chapters[0]!.markdown).toBe('Mass $m$$n$kg here.\n');
  });

  it('deletes the atom whose holder run was cleared, and keeps the NBSP beside it', async () => {
    // Run 0 is "Mass 5" + NBSP, run 1 the equation's holder.
    expect((await roundTrip(`Mass 5${NB}$m$ here.\n`, LTR, NB, '', 1)).chapters[0]!.markdown).toBe(`Mass 5${NB} here.\n`);
    expect((await roundTrip(`Mass $m$${NB}kg here.\n`, LTR, NB, '', 0)).chapters[0]!.markdown).toBe(`Mass ${NB}kg here.\n`);
    expect((await roundTrip('Mass 5 $m$ here.\n', LTR, NB, '', 0)).chapters[0]!.markdown).toBe('Mass 5  here.\n');
  });

  it('keeps the atoms when the holder marks are gone', async () => {
    expect((await roundTrip(`Mass 5${NB}$m$$n$ here.\n`, LTR, `5${NB}`, '5', 0, true)).chapters[0]!.markdown).toBe('Mass 5$m$$n$ here.\n');
    expect((await roundTrip(`Mass 5${NB}$m$ here.\n`, LTR, `5${NB}`, '5', 0, true)).chapters[0]!.markdown).toBe('Mass 5$m$ here.\n');
  });

  it('marks holder runs w:noProof and says so in the map', async () => {
    const md = `Mass 5${NB}$m$ here.\n`;
    const files = unzip(await formattedDocx({ docs: [build(md, LTR)], chapters: [{ id: 'c', markdown: md }], date: '2026-11-04T00:00:00Z', exportId: 'h' }));
    const runs = [...documentXml(files).matchAll(/<w:r>(<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)<w:t xml:space="preserve">([^<]*)<\/w:t><\/w:r>/g)].map((m) => [m[2], m[1]!.includes('<w:noProof/>')]);
    expect(runs).toEqual([[`Mass 5${NB}`, false], [NB, true], [' here.', false]]);
    expect(readExportMap(files)?.holders).toBe(true);
  });

  it('still turns the NBSP into a space and edits real text beside an atom', async () => {
    expect((await roundTrip(`Mass 5${NB}$m$ here.\n`, LTR, `5${NB}`, '5 ')).chapters[0]!.markdown).toBe('Mass 5 $m$ here.\n');
    expect((await roundTrip('Mass 5 $m$ here.\n', LTR, '5 ', '5')).chapters[0]!.markdown).toBe('Mass 5$m$ here.\n');
    expect((await roundTrip(`Key ${SW} red here.\n`, LTR, 'Key ', 'Lock ')).chapters[0]!.markdown).toBe(`Lock ${SW} red here.\n`);
  });
});

describe('slideOffAtoms', () => {
  // O: "a" + NBSP (source) + holder (atom) + NBSP (source) + "b", holders
  // U+2060 or U+00A0: only an equal neighbour lets a hunk slide.
  const view = (holder: string, N: string) =>
    ({ O: `a${NB}${holder}${NB}b`, N, M: [0, 1, -1, 3, 4], atomOf: Int32Array.from([-1, -1, 0, -1, -1]) }) as unknown as BlockView;

  it('slides a deletion of the holder left or right onto the equal source NBSP', () => {
    const v = view(NB, `a${NB}${NB}b`);
    expect(slideOffAtoms(v, [{ a0: 2, a1: 3, b0: 2, b1: 2 }])).toEqual([{ a0: 1, a1: 2, b0: 1, b1: 1 }]);
    const right = { ...v, M: [0, -1, -1, 3, 4] } as BlockView;
    expect(slideOffAtoms(right, [{ a0: 2, a1: 3, b0: 2, b1: 2 }])).toEqual([{ a0: 3, a1: 4, b0: 3, b1: 3 }]);
  });

  it('slides past several atoms when it must, and keeps off them without marks', () => {
    // O: "a" + NBSP (source) + two holders + "b"; N lost one NBSP.
    const v = { O: `a${NB}${NB}${NB}b`, N: `a${NB}${NB}b`, M: [0, 1, -1, -1, 4], atomOf: Int32Array.from([-1, -1, 0, 1, -1]) } as unknown as BlockView;
    expect(slideOffAtoms(v, [{ a0: 3, a1: 4, b0: 3, b1: 3 }])).toEqual([{ a0: 1, a1: 2, b0: 1, b1: 1 }]);
  });

  it('follows the holder marks read back', () => {
    // O: "a" + NBSP (source) + holder + "b". The NBSP Word kept is marked a
    // holder: the source NBSP went. It is not: the holder went.
    const v = (held: boolean) =>
      ({ O: `a${NB}${NB}b`, N: `a${NB}b`, M: [0, 1, -1, 3], atomOf: Int32Array.from([-1, -1, 0, -1]), NHeld: [false, held, false] }) as unknown as BlockView;
    expect(slideOffAtoms(v(true), [{ a0: 2, a1: 3, b0: 2, b1: 2 }])).toEqual([{ a0: 1, a1: 2, b0: 1, b1: 1 }]);
    expect(slideOffAtoms(v(false), [{ a0: 2, a1: 3, b0: 2, b1: 2 }])).toEqual([{ a0: 2, a1: 3, b0: 2, b1: 2 }]);
    expect(slideOffAtoms(v(false), [{ a0: 1, a1: 2, b0: 1, b1: 1 }])).toEqual([{ a0: 2, a1: 3, b0: 2, b1: 2 }]);
  });

  it('leaves a holder that differs from its neighbours, or a retyped atom, on the atom', () => {
    expect(slideOffAtoms(view('\u2060', `a${NB}${NB}b`), [{ a0: 2, a1: 3, b0: 2, b1: 2 }])).toEqual([{ a0: 2, a1: 3, b0: 2, b1: 2 }]);
    expect(slideOffAtoms(view(NB, `a${NB}x${NB}b`), [{ a0: 2, a1: 3, b0: 2, b1: 3 }])).toEqual([{ a0: 2, a1: 3, b0: 2, b1: 3 }]);
  });
});
