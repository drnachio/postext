// The Checks panel's words for the special-ink and die-cut findings
// (#1570), whatever fields the engine gives them.

import { describe, expect, it } from 'vitest';
import { DEFAULT_LABELS } from '../types/defaultLabels.js';
import type { PreflightCheck } from '../warnings/types.js';
import { isSpecialFindingKind, preflightDetail, preflightTitle } from './preflightText.js';

const check = (c: Record<string, unknown>) => ({ severity: 'warning', ...c }) as unknown as PreflightCheck;

describe('special-ink and die-cut findings', () => {
  it('have their own titles', () => {
    expect(preflightTitle(check({ kind: 'spotInkFinish' }), DEFAULT_LABELS)).toBe(DEFAULT_LABELS.preflightSpotInkFinish);
    expect(preflightTitle(check({ kind: 'whiteInkOnWhite' }), DEFAULT_LABELS)).toBe(DEFAULT_LABELS.preflightWhiteInkOnWhite);
    expect(preflightTitle(check({ kind: 'dieCutText' }), DEFAULT_LABELS)).toBe(DEFAULT_LABELS.preflightDieCutText);
    expect(preflightTitle(check({ kind: 'dieCutTrim' }), DEFAULT_LABELS)).toBe(DEFAULT_LABELS.preflightDieCutTrim);
    expect(preflightTitle(check({ kind: 'dieCutGutter' }), DEFAULT_LABELS)).toBe(DEFAULT_LABELS.preflightDieCutGutter);
    expect(isSpecialFindingKind('dieCutTrim')).toBe(true);
    expect(isSpecialFindingKind('nearTrim')).toBe(false);
  });

  it('name the ink, its finish and the die', () => {
    expect(preflightDetail(check({ kind: 'spotInkFinish', ink: 'Gold', finish: { kind: 'metallic' } }), DEFAULT_LABELS)).toBe('“Gold” (Metallic) prints on a plate of its own. Ask the printer for the ink by that name.');
    expect(preflightDetail(check({ kind: 'spotInkFinish', ink: 'Barniz', finish: 'varnish' }), DEFAULT_LABELS)).toContain('(Varnish)');
    expect(preflightDetail(check({ kind: 'whiteInkOnWhite', name: 'Opaque white' }), DEFAULT_LABELS)).toContain('“Opaque white”');
    expect(preflightDetail(check({ kind: 'dieCutText', die: 'moon' }), DEFAULT_LABELS)).toContain('“moon”');
    expect(preflightDetail(check({ kind: 'dieCutTrim', source: 'moon' }), DEFAULT_LABELS)).toContain('“moon”');
    expect(preflightDetail(check({ kind: 'dieCutGutter', id: 'moon' }), DEFAULT_LABELS)).toContain('“moon”');
  });

  it('give the press order of white inks and varnishes', () => {
    expect(preflightTitle(check({ kind: 'inkPressOrder' }), DEFAULT_LABELS)).toBe(DEFAULT_LABELS.preflightInkPressOrder);
    const detail = preflightDetail(check({ kind: 'inkPressOrder', first: ['Opaque white'], last: [] }), DEFAULT_LABELS);
    expect(detail).toContain('Opaque white');
    expect(detail).toContain('—');
  });
});
