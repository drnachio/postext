import { describe, it, expect, beforeAll } from 'vitest';
import { initMusicEngine, renderScore, type ScoreRenderOptions } from '../../music/index.js';

const ODE = `X:1
T:Ode to Joy
C:L. van Beethoven
M:4/4
L:1/4
K:D
FFGA|AGFE|DDEF|F3/2E/2E2|FFGA|AGFE|DDEF|E3/2D/2D2|
EEFD|EF/2G/2FD|EF/2G/2FE|DEA,2|FFGA|AGFE|DDEF|E3/2D/2D2|]
`;

const OPTS: ScoreRenderOptions = {
  staffSizePx: 24, font: 'Bravura', spacing: 1, barNumbers: 'system', systemSpacing: 4,
};

describe('music engine', () => {
  beforeAll(async () => { await initMusicEngine(); }, 60_000);

  it('engraves ABC into one slice per system, narrower measures giving more systems', () => {
    const wide = renderScore(ODE, 'abc', 700, OPTS);
    const narrow = renderScore(ODE, 'abc', 300, OPTS);
    expect(wide.error).toBeUndefined();
    expect(wide.systems.length).toBeGreaterThan(0);
    expect(narrow.systems.length).toBeGreaterThan(wide.systems.length);
    for (const s of narrow.systems) {
      expect(s.widthPx).toBe(300);
      expect(s.heightPx).toBeGreaterThan(24);
      expect(s.items.some((i) => i.type === 'path' && i.fill)).toBe(true);
      expect(s.items.some((i) => i.type === 'path' && !i.fill)).toBe(true);
      expect(s.svg).not.toMatch(/<use|<style|<svg[^>]*><svg/);
    }
    expect(wide.title).toBe('Ode to Joy');
    expect(wide.composer).toBe('L. van Beethoven');
  });

  it('keeps every painted item inside the slice', () => {
    const r = renderScore(ODE, 'abc', 400, OPTS);
    for (const s of r.systems) {
      for (const it of s.items) {
        if (it.type !== 'path') continue;
        const nums = it.d.match(/-?\d*\.?\d+(?:e-?\d+)?/g)!.map(Number);
        const xs = nums.filter((_, k) => k % 2 === 0);
        expect(Math.min(...xs)).toBeGreaterThan(-5);
        expect(Math.max(...xs)).toBeLessThan(405);
      }
    }
  });

  it('engraves a four-part chorale written in Humdrum', () => {
    const kern = [
      '**kern\t**kern\t**kern\t**kern',
      '*clefF4\t*clefGv2\t*clefG2\t*clefG2',
      '*k[f#]\t*k[f#]\t*k[f#]\t*k[f#]',
      '*M4/4\t*M4/4\t*M4/4\t*M4/4',
      '4GG\t4B\t4d\t4b',
      '4D\t4d\t4f#\t4a',
      '4E\t4B\t4e\t4g',
      '4D\t4d\t4f#\t4a',
      '=\t=\t=\t=',
      '1GG\t1B\t1d\t1g',
      '==\t==\t==\t==',
      '*-\t*-\t*-\t*-',
    ].join('\n');
    const r = renderScore(kern, 'humdrum', 500, OPTS);
    expect(r.error).toBeUndefined();
    expect(r.systems.length).toBeGreaterThan(0);
    // Four staves: a system much taller than one staff.
    expect(r.systems[0]!.heightPx).toBeGreaterThan(OPTS.staffSizePx * 4);
    // The bracket joining the staves stays inside the slice.
    for (const it of r.systems[0]!.items) {
      if (it.type !== 'path') continue;
      for (const m of it.d.matchAll(/[MLC]([^A-Za-z]*)/g)) {
        const xs = m[1]!.trim().split(/[\s,]+/).map(Number).filter((_, k) => k % 2 === 0);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(-0.01);
      }
    }
  });

  it('prints bar numbers at each system, on every bar, or not at all', () => {
    const bars = `X:1\nM:4/4\nL:1/4\nK:C\n${'CDEF|GABc|cBAG|FEDC|'.repeat(3)}]\n`;
    const words = (barNumbers: ScoreRenderOptions['barNumbers']) =>
      renderScore(bars, 'abc', 330, { ...OPTS, barNumbers }).systems.map((s) => s.items.filter((i) => i.type === 'text').map((i) => (i as { text: string }).text));
    const system = words('system');
    expect(system[0]).toEqual([]);
    expect(system.slice(1).every((w) => w.length === 1 && /^\d+$/.test(w[0]!))).toBe(true);
    expect(words('every').flat().length).toBeGreaterThan(system.flat().length);
    expect(words('none').flat()).toEqual([]);
  });

  it('keeps a chord symbol\'s raised figure smaller and on its own baseline (**harm)', () => {
    const kern = ['**kern\t**harm', '*clefF4\t*', '*M4/4\t*', '4G\tI', '4D\tV7', '4C\tIV', '4G\tI', '==\t==', '*-\t*-'].join('\n');
    const words = renderScore(kern, 'humdrum', 600, OPTS).systems.flatMap((s) => s.items.filter((i) => i.type === 'text')) as Array<{ text: string; x: number; y: number; sizePx: number }>;
    const v = words.find((w) => w.text === 'V');
    const seven = words.find((w) => w.text === '7');
    expect(v).toBeDefined();
    expect(seven).toBeDefined();
    expect(seven!.sizePx).toBeLessThan(v!.sizePx);
    expect(seven!.y).not.toBeCloseTo(v!.y, 1);
    expect(seven!.x).toBeGreaterThan(v!.x);
    expect(words.some((w) => w.text === 'V7')).toBe(false);
  });

  it('reports a source that does not load', () => {
    const r = renderScore('<not-music/>', 'mei', 400, OPTS);
    expect(r.systems).toHaveLength(0);
  });
});
