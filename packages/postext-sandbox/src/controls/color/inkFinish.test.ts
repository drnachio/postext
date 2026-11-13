// Special inks in the Sandbox (#1570): the finish and sheen choices and the
// generic special inks the palette adds.

import { describe, expect, it } from 'vitest';
import { resolveInkFinish } from 'postext';
import { DEFAULT_LABELS } from '../../types/defaultLabels.js';
import { SPECIAL_INK_PRESETS, finishText, finishWithKind, finishWithSheen, sameFinish, sheensFor, specialInkEntry } from './inkFinish.js';
import { usedInkFinishes, usesSpecialInks } from '../../print/usedInkFinishes.js';

describe('finish choices', () => {
  it('offer the sheens each finish takes', () => {
    expect(sheensFor('varnish')).toEqual(['gloss', 'satin', 'matte', 'softTouch']);
    expect(sheensFor('metallic')).toEqual(['gloss', 'satin', 'matte']);
    expect(sheensFor('foil')).toEqual(['gloss', 'satin', 'matte']);
    expect(sheensFor('fluorescent')).toEqual([]);
    expect(sheensFor('white')).toEqual([]);
  });

  it('keep the sheen across kinds that can carry it, and drop it otherwise', () => {
    expect(finishWithKind({ kind: 'varnish', sheen: 'matte' }, 'metallic')).toEqual({ kind: 'metallic', sheen: 'matte' });
    expect(finishWithKind({ kind: 'varnish', sheen: 'softTouch' }, 'foil')).toEqual({ kind: 'foil' });
    expect(finishWithKind({ kind: 'metallic', sheen: 'gloss' }, 'white')).toEqual({ kind: 'white' });
    expect(finishWithKind({ kind: 'metallic' }, 'none')).toBeUndefined();
    expect(finishWithSheen({ kind: 'varnish' }, 'softTouch')).toEqual({ kind: 'varnish', sheen: 'softTouch' });
    expect(finishWithSheen({ kind: 'metallic', sheen: 'gloss' }, undefined)).toEqual({ kind: 'metallic' });
    expect(finishWithSheen({ kind: 'metallic' }, 'softTouch')).toEqual({ kind: 'metallic' });
    expect(sameFinish(undefined, undefined)).toBe(true);
    expect(sameFinish({ kind: 'foil' }, { kind: 'foil', sheen: 'gloss' })).toBe(false);
  });

  it('read in words', () => {
    expect(finishText({ kind: 'metallic' }, DEFAULT_LABELS)).toBe('Metallic');
    expect(finishText({ kind: 'varnish', sheen: 'softTouch' }, DEFAULT_LABELS)).toBe('Varnish, soft touch');
  });
});

describe('the special ink presets', () => {
  it('are the thirteen generic inks, each named, with a finish the engine accepts', () => {
    expect(SPECIAL_INK_PRESETS.map((p) => p.id)).toEqual([
      'metallic-gold', 'metallic-silver', 'metallic-copper', 'gold-foil', 'silver-foil',
      'fluo-pink', 'fluo-yellow', 'fluo-orange', 'fluo-green', 'opaque-white',
      'gloss-varnish', 'matte-varnish', 'soft-touch-varnish',
    ]);
    for (const p of SPECIAL_INK_PRESETS) {
      expect(DEFAULT_LABELS[p.labelKey], p.id).toBeTruthy();
      expect(resolveInkFinish(p.finish), p.id).toEqual(p.finish);
      expect(p.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('add a spot colour of the ink whose finish the engine reads, under a name no entry has', () => {
    const gold = SPECIAL_INK_PRESETS[0]!;
    const first = specialInkEntry(gold, 'Metallic gold', 'a');
    expect(first).toEqual({ id: 'a', name: 'Metallic gold', value: { hex: gold.hex, model: 'spot', spot: { name: 'Metallic gold', cmyk: gold.cmyk, tint: 100, finish: { kind: 'metallic' } } } });
    const second = specialInkEntry(gold, 'Metallic gold', 'b', [first]);
    expect(second.name).toBe('Metallic gold 2');
    expect(second.value.spot?.name).toBe('Metallic gold 2');
    const config = { colorPalette: [first], bodyText: { color: { ...first.value, paletteId: 'a' } } };
    expect(usedInkFinishes(config as never).get('metallic gold')).toEqual({ kind: 'metallic' });
    expect(usesSpecialInks(config as never)).toBe(true);
    expect(usesSpecialInks({ print: { inks: [{ name: 'Barniz', finish: { kind: 'varnish' } }] } })).toBe(true);
    expect(usesSpecialInks({ bodyText: { color: { hex: '#0033a0', model: 'spot', spot: { name: 'PANTONE 286 C', cmyk: { c: 100, m: 70, y: 0, k: 0 } } } } } as never)).toBe(false);
  });
});
