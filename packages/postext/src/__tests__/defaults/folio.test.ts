import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FOLIO_CONFIG,
  FOLIO_PAPER_STOCKS,
  resolveFolioConfig,
  stripFolioDefaults,
} from '../../defaults/folio';
import { applyPaletteToConfig, stripConfigDefaults } from '../../defaults';
import { resolveAllConfig } from '../../pipeline/config';
import type { ColorValue, FolioPaperType } from '../../types';

const hex = (value: string): ColorValue => ({ hex: value, model: 'hex' });

describe('resolveFolioConfig', () => {
  it('fills every setting with the defaults when nothing is set', () => {
    expect(resolveFolioConfig()).toEqual(DEFAULT_FOLIO_CONFIG);
    expect(resolveFolioConfig({})).toEqual(DEFAULT_FOLIO_CONFIG);
  });

  it('takes grammage, bulk, finish, texture and shade from the paper type', () => {
    for (const type of Object.keys(FOLIO_PAPER_STOCKS) as FolioPaperType[]) {
      const stock = FOLIO_PAPER_STOCKS[type];
      const paper = resolveFolioConfig({ paper: { type } }).paper;
      expect(paper.type).toBe(type);
      expect(paper.grammage).toBe(stock.grammage);
      expect(paper.bulk).toBe(stock.bulk);
      expect(paper.finish).toBe(stock.finish);
      expect(paper.texture).toBe(stock.texture);
      expect(paper.shade.hex).toBe(stock.shade);
    }
  });

  it('reads auto finish and texture as the stock’s', () => {
    const paper = resolveFolioConfig({ paper: { type: 'coatedGloss', finish: 'auto', texture: 'auto' } }).paper;
    expect(paper.finish).toBe('gloss');
    expect(paper.texture).toBe('smooth');
    const set = resolveFolioConfig({ paper: { type: 'coatedGloss', finish: 'matte', texture: 'laid' } }).paper;
    expect(set.finish).toBe('matte');
    expect(set.texture).toBe('laid');
  });

  it('keeps the values set over the stock’s', () => {
    const paper = resolveFolioConfig({ paper: { type: 'bookWove', grammage: 100, bulk: 2, shade: hex('#eeeeee') } }).paper;
    expect(paper.grammage).toBe(100);
    expect(paper.bulk).toBe(2);
    expect(paper.shade.hex).toBe('#eeeeee');
  });

  it('falls back to the default stock for an unknown paper type', () => {
    const paper = resolveFolioConfig({ paper: { type: 'vellumx' as FolioPaperType } }).paper;
    expect(paper.type).toBe('uncoated');
    expect(paper.grammage).toBe(FOLIO_PAPER_STOCKS.uncoated.grammage);
  });

  it('gives a hardcover cloth and a softcover card when the cover material is auto', () => {
    expect(resolveFolioConfig({ binding: { type: 'hardcover' } }).binding.coverMaterial).toBe('cloth');
    expect(resolveFolioConfig({ binding: { type: 'paperback' } }).binding.coverMaterial).toBe('paper');
    expect(resolveFolioConfig({ binding: { type: 'sewn', coverMaterial: 'auto' } }).binding.coverMaterial).toBe('paper');
    expect(resolveFolioConfig({ binding: { type: 'layflat' } }).binding.coverMaterial).toBe('paper');
    expect(resolveFolioConfig({ binding: { type: 'paperback', coverMaterial: 'leather' } }).binding.coverMaterial).toBe('leather');
  });

  it('clamps the numbers to their ranges', () => {
    const r = resolveFolioConfig({
      tilt: 90,
      paper: { grammage: 5000, bulk: 0.1, textureStrength: 5 },
      lighting: { intensity: 0 },
    });
    expect(r.tilt).toBe(40);
    expect(r.paper.grammage).toBe(2500);
    expect(r.paper.bulk).toBe(0.5);
    expect(r.paper.textureStrength).toBe(2);
    expect(r.lighting.intensity).toBe(0.25);
    expect(resolveFolioConfig({ tilt: -5, lighting: { intensity: 9 } })).toMatchObject({ tilt: 0, lighting: { intensity: 2 } });
  });

  it('ignores non-positive and non-finite numbers', () => {
    const r = resolveFolioConfig({ tilt: Number.NaN, paper: { type: 'bible', grammage: 0, bulk: -1 } });
    expect(r.tilt).toBe(DEFAULT_FOLIO_CONFIG.tilt);
    expect(r.paper.grammage).toBe(FOLIO_PAPER_STOCKS.bible.grammage);
    expect(r.paper.bulk).toBe(FOLIO_PAPER_STOCKS.bible.bulk);
  });

  it('leaves the surface colour out unless it is set', () => {
    expect(resolveFolioConfig({ surface: { type: 'plain' } }).surface).toEqual({ type: 'plain' });
    expect(resolveFolioConfig({ surface: { color: hex('#336699') } }).surface).toEqual({ type: 'oak', color: hex('#336699') });
  });
});

describe('stripFolioDefaults', () => {
  it('returns undefined for nothing or only defaults', () => {
    expect(stripFolioDefaults(undefined)).toBeUndefined();
    expect(stripFolioDefaults({})).toBeUndefined();
    expect(
      stripFolioDefaults({
        tilt: 22,
        paper: { type: 'uncoated', grammage: 90, bulk: 1.25, finish: 'auto', texture: 'wove', textureStrength: 1, showThrough: true },
        binding: { type: 'hardcover', coverMaterial: 'auto', coverColor: hex('#2C3E57') },
        surface: { type: 'oak' },
        lighting: { environment: 'studio', intensity: 1, shadows: true },
      }),
    ).toBeUndefined();
  });

  it('strips paper values equal to the chosen stock’s, not to the default stock’s', () => {
    const stock = FOLIO_PAPER_STOCKS.coatedSilk;
    expect(
      stripFolioDefaults({
        paper: { type: 'coatedSilk', grammage: stock.grammage, bulk: stock.bulk, finish: 'silk', texture: 'smooth', shade: hex(stock.shade) },
      }),
    ).toEqual({ paper: { type: 'coatedSilk' } });
    // 90 g/m² is the default stock's weight but not coated silk's.
    expect(stripFolioDefaults({ paper: { type: 'coatedSilk', grammage: 90 } })).toEqual({ paper: { type: 'coatedSilk', grammage: 90 } });
  });

  it('keeps a palette-linked colour even when its value equals the default', () => {
    const shade: ColorValue = { ...hex(FOLIO_PAPER_STOCKS.uncoated.shade), paletteId: 'paper' };
    expect(stripFolioDefaults({ paper: { shade } })).toEqual({ paper: { shade } });
  });

  it('keeps an explicit cover material and a surface colour', () => {
    expect(stripFolioDefaults({ binding: { coverMaterial: 'cloth' }, surface: { color: hex('#123456') } })).toEqual({
      binding: { coverMaterial: 'cloth' },
      surface: { color: hex('#123456') },
    });
  });

  it('round-trips: the stripped config resolves to the same settings', () => {
    const folio = {
      tilt: 30,
      paper: { type: 'bookWove' as const, grammage: 80, bulk: 1.8, texture: 'laid' as const, showThrough: false },
      binding: { type: 'paperback' as const, coverColor: hex('#aa3322') },
      lighting: { environment: 'lamp' as const, intensity: 1, shadows: false },
    };
    expect(resolveFolioConfig(stripFolioDefaults(folio))).toEqual(resolveFolioConfig(folio));
  });
});

describe('folio in the document config', () => {
  it('is stripped by stripConfigDefaults', () => {
    expect(stripConfigDefaults({ folio: { tilt: 22 } }).folio).toBeUndefined();
    expect(stripConfigDefaults({ folio: { tilt: 10 } }).folio).toEqual({ tilt: 10 });
  });

  it('is resolved into the ResolvedConfig only when the config sets it', () => {
    expect('folio' in resolveAllConfig({})).toBe(false);
    expect(resolveAllConfig({ folio: { paper: { type: 'bible' } } }).folio?.paper.grammage).toBe(FOLIO_PAPER_STOCKS.bible.grammage);
  });

  it('follows palette-linked colours', () => {
    const config = {
      colorPalette: [{ id: 'cloth', name: 'Cloth', value: hex('#880000') }],
      folio: { binding: { coverColor: { ...hex('#000000'), paletteId: 'cloth' } }, paper: { shade: { ...hex('#000000'), paletteId: 'cloth' } } },
    };
    expect(applyPaletteToConfig(config)?.folio?.binding?.coverColor?.hex).toBe('#880000');
    const resolved = resolveAllConfig(config).folio!;
    expect(resolved.binding.coverColor.hex).toBe('#880000');
    expect(resolved.paper.shade.hex).toBe('#880000');
  });
});
