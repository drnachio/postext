import { beforeAll, describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { initMathEngine } from '../../math/index.js';
import type { PostextConfig } from '../../index.js';
import { applyDocxEdits } from './index.js';
import type { BlockView } from './blocks.js';
import { slideOffAtoms } from './edits.js';
import { formattedDocx } from '../formatted/index.js';
import { build, config, documentXml, mm, unzip } from '../formatted/formatted.test-helper.js';

// The formatted writer holds an atom's room with U+00A0, the character a
// typed no-break space is too: deleting a source NBSP next to an atom must
// take the NBSP, never the atom.

const NB = ' ';
const SW = ':swatch{color="#ff0000"}';
const LTR = config();
const RTL = config({ locale: 'ar', direction: 'rtl', bodyText: { textAlign: 'justify', firstLineIndent: mm(0) } } as Partial<PostextConfig>);

beforeAll(async () => {
  await initMathEngine();
});

/** Exports `md`, rewrites the first text run holding `from` and imports it back. */
async function roundTrip(md: string, cfg: PostextConfig, from: string, to: string) {
  const files = unzip(await formattedDocx({ docs: [build(md, cfg)], chapters: [{ id: 'c', markdown: md }], date: '2026-11-04T00:00:00Z', exportId: 'h' }));
  const xml = documentXml(files);
  const run = [...xml.matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>/g)].map((m) => m[1]!).find((t) => t.includes(from));
  expect(run, `a run holding ${JSON.stringify(from)}`).toBeDefined();
  const edited = xml.replace(`>${run}<`, `>${run!.replace(from, to)}<`);
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

  it('leaves a holder that differs from its neighbours, or a retyped atom, on the atom', () => {
    expect(slideOffAtoms(view('\u2060', `a${NB}${NB}b`), [{ a0: 2, a1: 3, b0: 2, b1: 2 }])).toEqual([{ a0: 2, a1: 3, b0: 2, b1: 2 }]);
    expect(slideOffAtoms(view(NB, `a${NB}x${NB}b`), [{ a0: 2, a1: 3, b0: 2, b1: 3 }])).toEqual([{ a0: 2, a1: 3, b0: 2, b1: 3 }]);
  });
});
