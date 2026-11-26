import { describe, expect, it } from 'vitest';
import type { FrameConfig, PageTemplate } from 'postext';
import { planFramesToGrid } from './framesToGrid.js';

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Two cards of one width, one under the other: the first 6 mm tall, the
 *  second 60 mm tall once laid (the Guide's title page, #1723). */
function plan(first: Partial<FrameConfig>, second: Partial<FrameConfig> = {}) {
  const template: PageTemplate = {
    id: 'p',
    frames: [
      { name: 't1', width: mm(100), placement: { anchor: { to: 'container', edge: 'top-left' } }, ...first },
      { name: 't2', width: mm(100), placement: { anchor: { to: '#t1', edge: 'below' }, offset: { y: mm(4) } }, ...second },
    ],
  } as PageTemplate;
  return planFramesToGrid({
    templates: [template],
    templateId: 'p',
    frames: ['t1', 't2'],
    laid: {
      dpi: 25.4,
      area: { x: 0, y: 0, width: 150, height: 200 },
      rects: new Map([['t1', { x: 0, y: 0, width: 100, height: 6 }], ['t2', { x: 0, y: 10, width: 100, height: 60 }]]),
    },
    chapters: [],
  });
}

describe('turning cards of different heights into a grid (#1723)', () => {
  it('refuses when the first card has a set height that would cut the taller cards', () => {
    expect(plan({ height: mm(6) })).toEqual({ ok: false, reason: 'heights', frames: ['t1', 't2'] });
  });

  it('refuses when a later card has a set height of its own', () => {
    expect(plan({}, { height: mm(60) })).toMatchObject({ ok: false, reason: 'heights' });
  });

  it('accepts them when every card grows with its content', () => {
    const p = plan({});
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const t = p.templates[0]!.frames!.find((f) => f.name === 't');
    expect(t?.height).toBeUndefined();
  });

  it('accepts cards of one height with a set height', () => {
    const template: PageTemplate = {
      id: 'p',
      frames: [
        { name: 'c1', width: mm(40), height: mm(30), placement: { anchor: { to: 'container', edge: 'top-left' } } },
        { name: 'c2', width: mm(40), height: mm(30), placement: { anchor: { to: '#c1', edge: 'right-of' }, offset: { x: mm(5) } } },
      ],
    } as PageTemplate;
    const p = planFramesToGrid({
      templates: [template],
      templateId: 'p',
      frames: ['c1', 'c2'],
      laid: { dpi: 25.4, area: { x: 0, y: 0, width: 150, height: 200 }, rects: new Map([['c1', { x: 0, y: 0, width: 40, height: 30 }], ['c2', { x: 45, y: 0, width: 40, height: 30 }]]) },
      chapters: [],
    });
    expect(p).toMatchObject({ ok: true, columns: 2, rows: 1 });
  });
});
