import { describe, expect, it } from 'vitest';
import {
  finishInks, finishOfInkName, finishOfSpot, finishOverprintsByDefault, finishPaintsOnScreen, finishSheen,
  guessInkFinish, normalizeSpotColor, printedSpot, separatePrintColors, sheenLevel, spotInks, varnishHexes,
} from '../../color/index.js';
import { resolveInkFinish, resolvePrintConfig } from '../../defaults/output/print.js';
import type { InkFinish, PostextConfig, SpotColor } from '../../types.js';

// #1563: special inks. A spot colour or an ink table entry carries a
// finish; the screen learns it by hex (`finishInks`), the ink's name only
// ever suggests one (`guessInkFinish`).

const kind = (name: string) => guessInkFinish(name)?.kind;

describe('guessInkFinish', () => {
  it('reads the finish words of the ten site languages', () => {
    const cases: Array<[string, InkFinish['kind']]> = [
      // English
      ['Gold', 'metallic'], ['PANTONE 871 C', 'metallic'], ['PANTONE 8003 C', 'metallic'], ['Metallic silver', 'metallic'],
      ['Hot foil', 'foil'], ['Gold foil', 'foil'], ['Fluo pink', 'fluorescent'], ['PANTONE 806 C', 'fluorescent'],
      ['Neon green', 'fluorescent'], ['Opaque white', 'white'], ['Spot UV', 'varnish'], ['Gloss varnish', 'varnish'],
      // Spanish
      ['Oro metalizado', 'metallic'], ['Plata', 'metallic'], ['Estampación oro', 'foil'], ['Rosa flúor', 'fluorescent'],
      ['Blanco opaco', 'white'], ['Barniz UVI', 'varnish'], ['Barniz oro', 'varnish'],
      // Catalan
      ['Daurat', 'metallic'], ['Coure metal·litzat', 'metallic'], ['Blanc', 'white'], ['Vernís selectiu', 'varnish'],
      // French
      ['Or métallisé', 'metallic'], ['Argent', 'metallic'], ['Dorure à chaud', 'foil'], ['Jaune fluo', 'fluorescent'],
      ['Blanc couvrant', 'white'], ['Vernis sélectif', 'varnish'],
      // German
      ['Silber', 'metallic'], ['Kupfer', 'metallic'], ['Heißfolie', 'foil'], ['Leuchtgrün', 'fluorescent'],
      ['Deckweiß', 'white'], ['Weiss', 'white'], ['UV-Lack', 'varnish'], ['Drucklack', 'varnish'],
      // Italian
      ['Argento', 'metallic'], ['Rame', 'metallic'], ['Stampa a caldo', 'foil'], ['Verde fluorescente', 'fluorescent'],
      ['Bianco coprente', 'white'], ['Vernice lucida', 'varnish'],
      // Portuguese
      ['Ouro', 'metallic'], ['Prata', 'metallic'], ['Hot stamping', 'foil'], ['Branco', 'white'], ['Verniz localizado', 'varnish'],
      // Japanese
      ['ゴールド', 'metallic'], ['金インキ', 'metallic'], ['銀', 'metallic'], ['箔押し', 'foil'], ['蛍光ピンク', 'fluorescent'],
      ['白インキ', 'white'], ['ホワイト', 'white'], ['UVニス', 'varnish'],
      // Chinese
      ['专金', 'metallic'], ['银色', 'metallic'], ['白金', 'metallic'], ['烫金', 'foil'], ['荧光黄', 'fluorescent'],
      ['白墨', 'white'], ['光油', 'varnish'], ['局部上光', 'varnish'],
      // Arabic
      ['حبر ذهبي', 'metallic'], ['فضي', 'metallic'], ['رقائق ذهبية', 'foil'], ['وردي فلوري', 'fluorescent'],
      ['أبيض معتم', 'white'], ['ورنيش لامع', 'varnish'],
    ];
    for (const [name, expected] of cases) expect([name, kind(name)]).toEqual([name, expected]);
  });

  it('suggests nothing for ordinary inks and names that only hold a finish word', () => {
    for (const name of [
      'Color', 'Colour', 'Orange', 'Corporate blue', 'Black or white', 'PANTONE 286 C', 'PANTONE 185 C', 'Goldenrod',
      'Silverado', 'Coral', 'Uvula', 'Lackey', 'Blancmange', 'Whitesmoke', 'Neonate', 'Floral', 'PANTONE 8 C', 'Magenta',
      'Golden yellow', 'Rouge', 'Grün', '红色', '藍', 'أحمر',
    ]) {
      // 'Black or white' names white: it is the one exception here.
      if (name === 'Black or white') {
        expect(kind(name)).toBe('white');
        continue;
      }
      expect([name, kind(name)]).toEqual([name, undefined]);
    }
  });

  it('reads the sheen of a varnish, a foil or a metallic ink', () => {
    expect(guessInkFinish('Matte varnish')).toEqual({ kind: 'varnish', sheen: 'matte' });
    expect(guessInkFinish('Barniz mate')).toEqual({ kind: 'varnish', sheen: 'matte' });
    expect(guessInkFinish('Soft touch varnish')).toEqual({ kind: 'varnish', sheen: 'softTouch' });
    expect(guessInkFinish('Barniz tacto suave')).toEqual({ kind: 'varnish', sheen: 'softTouch' });
    expect(guessInkFinish('Seidenmatt Lack')).toEqual({ kind: 'varnish', sheen: 'satin' });
    expect(guessInkFinish('Vernis satiné')).toEqual({ kind: 'varnish', sheen: 'satin' });
    expect(guessInkFinish('Gloss gold foil')).toEqual({ kind: 'foil', sheen: 'gloss' });
    expect(guessInkFinish('Gold matt')).toEqual({ kind: 'metallic', sheen: 'matte' });
    expect(guessInkFinish('マットニス')).toEqual({ kind: 'varnish', sheen: 'matte' });
    expect(guessInkFinish('哑光油')).toEqual({ kind: 'varnish', sheen: 'matte' });
    // Soft touch is a varnish's only; a white or fluorescent ink has no sheen.
    expect(guessInkFinish('Soft touch gold')).toEqual({ kind: 'metallic' });
    expect(guessInkFinish('Matte white')).toEqual({ kind: 'white' });
  });
});

describe('finish defaults', () => {
  it('fills in the sheen and the overprint each kind has', () => {
    expect(finishSheen({ kind: 'varnish' })).toBe('gloss');
    expect(finishSheen({ kind: 'foil' })).toBe('gloss');
    expect(finishSheen({ kind: 'metallic' })).toBe('satin');
    expect(finishSheen({ kind: 'white', sheen: 'gloss' })).toBeUndefined();
    expect([1, 0.7, 0.4, 0.2, 0]).toEqual((['gloss', 'satin', 'matte', 'softTouch', undefined] as const).map(sheenLevel));
    expect(finishOverprintsByDefault({ kind: 'white' })).toBe(true);
    expect(finishOverprintsByDefault({ kind: 'varnish' })).toBe(true);
    expect(finishOverprintsByDefault({ kind: 'metallic' })).toBe(false);
    expect(finishPaintsOnScreen({ kind: 'varnish' })).toBe(false);
    expect(finishPaintsOnScreen({ kind: 'foil' })).toBe(true);
    expect(finishPaintsOnScreen(undefined)).toBe(true);
  });

  it('checks a finish as written', () => {
    expect(resolveInkFinish({ kind: 'gold' })).toBeUndefined();
    expect(resolveInkFinish({ kind: 'varnish', sheen: 'softTouch' })).toEqual({ kind: 'varnish', sheen: 'softTouch' });
    expect(resolveInkFinish({ kind: 'foil', sheen: 'softTouch' })).toEqual({ kind: 'foil' });
    expect(resolveInkFinish({ kind: 'white', sheen: 'gloss' })).toEqual({ kind: 'white' });
  });
});

const GOLD: SpotColor = { name: 'Gold', cmyk: { c: 0, m: 20, y: 60, k: 20 }, finish: { kind: 'metallic' } };
const VARNISH: SpotColor = { name: 'Varnish', cmyk: { c: 0, m: 0, y: 0, k: 0 }, finish: { kind: 'varnish', sheen: 'matte' } };
const WHITE: SpotColor = { name: 'White', cmyk: { c: 0, m: 0, y: 0, k: 0 }, finish: { kind: 'white' } };

describe('normalised spot colours keep their finish', () => {
  it('keeps the finish and overprints a white ink and a varnish by default', () => {
    expect(normalizeSpotColor(GOLD)).toMatchObject({ finish: { kind: 'metallic' }, overprint: false });
    expect(normalizeSpotColor(VARNISH)).toMatchObject({ finish: { kind: 'varnish', sheen: 'matte' }, overprint: true });
    expect(normalizeSpotColor(WHITE).overprint).toBe(true);
    expect(normalizeSpotColor({ ...WHITE, overprint: false }).overprint).toBe(false);
    // An unknown finish is dropped; a plain ink is unchanged.
    expect(normalizeSpotColor({ ...GOLD, finish: { kind: 'chrome' } as unknown as InkFinish })).not.toHaveProperty('finish');
    expect(normalizeSpotColor({ name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } })).toEqual({
      name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 }, tint: 100, overprint: false,
    });
  });

  it('takes the ink table finish over the colour and reports one ink with two finishes', () => {
    const inks = resolvePrintConfig({ inks: [{ name: 'PANTONE 877 C', finish: { kind: 'metallic', sheen: 'gloss' } }, { name: 'Lack', finish: { kind: 'varnish' } }] }).inks;
    const silver = normalizeSpotColor({ name: 'PANTONE 877 C', cmyk: { c: 0, m: 0, y: 0, k: 40 } });
    expect(printedSpot(silver, inks)).toMatchObject({ finish: { kind: 'metallic', sheen: 'gloss' }, overprint: false });
    expect(finishOfSpot({ name: 'pantone 877 c', cmyk: silver.cmyk }, inks)).toEqual({ kind: 'metallic', sheen: 'gloss' });
    // A varnish the table names overprints unless the table says not.
    expect(printedSpot(normalizeSpotColor({ name: 'Lack', cmyk: silver.cmyk }), inks)?.overprint).toBe(true);
    const { conflicts } = spotInks([normalizeSpotColor(GOLD), normalizeSpotColor({ ...GOLD, finish: { kind: 'foil' } })]);
    expect(conflicts).toEqual(['Gold']);
  });

  it('keeps two colours of one hex and different finishes apart', () => {
    const config: PostextConfig = {
      bodyText: { color: { hex: '#c9a13b', model: 'spot', spot: GOLD } },
      headings: { color: { hex: '#c9a13b', model: 'spot', spot: { ...GOLD, finish: { kind: 'foil' } } } },
    };
    const out = separatePrintColors(config);
    expect(out.headings?.color?.hex).not.toBe('#c9a13b');
  });
});

describe('finishInks', () => {
  const doc = (config: Record<string, unknown>, printColors?: unknown[]) =>
    ({ config: { ...config, print: resolvePrintConfig(config.print as PostextConfig['print']) }, ...(printColors ? { printColors } : {}) }) as never;

  it('maps each special ink by screen hex, through the ink table', () => {
    const d = doc({
      colorPalette: [
        { id: 'gold', name: 'Gold', value: { hex: '#C9A13B', model: 'spot', spot: GOLD } },
        { id: 'v', name: 'Varnish', value: { hex: '#fefefe', model: 'spot', spot: { ...VARNISH, tint: 50 } } },
        { id: 'pms', name: 'PMS', value: { hex: '#1f3f99', model: 'spot', spot: { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } } } },
        { id: 'neon', name: 'Neon', value: { hex: '#ff3399', model: 'spot', spot: { name: 'Neon pink', cmyk: { c: 0, m: 80, y: 0, k: 0 } } } },
      ],
      print: { inks: [{ name: 'Neon pink', pdfName: 'PANTONE 806 C', finish: { kind: 'fluorescent' } }, { name: 'Gold', output: 'process' }] },
    });
    const inks = finishInks(d);
    // The gold goes to process: no finish there.
    expect([...inks.keys()].sort()).toEqual(['#fefefe', '#ff3399']);
    expect(inks.get('#fefefe')).toEqual({ kind: 'varnish', sheen: 'matte', tint: 50, name: 'Varnish', overprint: true });
    expect(inks.get('#ff3399')).toMatchObject({ kind: 'fluorescent', name: 'PANTONE 806 C', overprint: false });
    expect([...varnishHexes(d)]).toEqual(['#fefefe']);
    expect(finishOfInkName(d, 'neon PINK')).toEqual({ kind: 'fluorescent' });
    expect(finishOfInkName(d, 'Varnish')).toEqual({ kind: 'varnish', sheen: 'matte' });
    expect(finishOfInkName(d, 'Gold')).toBeUndefined();
    expect(finishOfInkName(d, 'PANTONE 286 C')).toBeUndefined();
  });

  it('reads the colours the pipeline added and is empty for plain documents', () => {
    expect(finishInks(doc({ bodyText: { color: { hex: '#000000', model: 'hex' } } })).size).toBe(0);
    const d = doc({}, [{ hex: '#d4af37', model: 'spot', spot: { ...GOLD, tint: 60 } }]);
    expect(finishInks(d).get('#d4af37')).toMatchObject({ kind: 'metallic', tint: 60 });
  });
});
