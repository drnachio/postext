import { describe, expect, it } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { preflightDocument, type PreflightIssue } from '../../checks/preflight.js';
import type { PostextConfig, SpotColor } from '../../types.js';

(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext() {
    return { font: '', measureText: (s: string) => ({ width: s.length * 7 }) };
  }
};

// #1563: the preflight names each special ink and the order the press
// lays them in, warns of a white ink on white paper, and no longer takes a
// white ink or a varnish that overprints for a colour that vanishes.

const mm = (value: number) => ({ value, unit: 'mm' as const });
const CMYK0 = { c: 0, m: 0, y: 0, k: 0 };
const spot = (hex: string, s: SpotColor, overprint = false) => ({ hex, model: 'spot' as const, spot: s, ...(overprint ? { overprint: true } : {}) });
const GOLD: SpotColor = { name: 'Gold', cmyk: { c: 0, m: 20, y: 60, k: 20 }, finish: { kind: 'metallic' } };
const WHITE: SpotColor = { name: 'Opaque white', cmyk: CMYK0, finish: { kind: 'white' } };
const VARNISH: SpotColor = { name: 'Varnish', cmyk: CMYK0, finish: { kind: 'varnish', sheen: 'matte' } };

function config(extra: PostextConfig = {}): PostextConfig {
  return {
    page: { width: mm(100), height: mm(140), dpi: 150, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
  };
}
const pick = (issues: PreflightIssue[], kind: PreflightIssue['kind']) => issues.filter((i) => i.kind === kind);

describe('special inks in the preflight', () => {
  it('lists each special ink and the press order', () => {
    const doc = buildDocument({ markdown: '# Title\n\nText.' }, config({
      headings: { color: spot('#c9a13b', GOLD) },
      bodyText: { color: spot('#fefefe', VARNISH, true) },
      page: { ...config().page!, backgroundColor: spot('#ececec', WHITE) },
    }));
    const issues = preflightDocument(doc, { cmyk: true });
    expect(pick(issues, 'spotInkFinish').map((i) => i.kind === 'spotInkFinish' && [i.ink, i.finish, i.sheen]).sort()).toEqual([
      ['Gold', 'metallic', 'satin'], ['Opaque white', 'white', undefined], ['Varnish', 'varnish', 'matte'],
    ]);
    expect(pick(issues, 'inkPressOrder')).toMatchObject([{ severity: 'info', first: ['Opaque white'], last: ['Varnish'] }]);
    // A varnish that overprints is not a colour that vanishes on press.
    expect(pick(issues, 'overprintWhite')).toEqual([]);
    // The white ink is the paper: not on white.
    expect(pick(issues, 'whiteInkOnWhite')).toEqual([]);
    // Nothing for an RGB job.
    expect(pick(preflightDocument(doc, { cmyk: false }), 'spotInkFinish')).toEqual([]);
  });

  it('warns of a white ink on white paper', () => {
    const doc = buildDocument({ markdown: 'Text.' }, config({ bodyText: { color: spot('#ececec', WHITE) } }));
    const issues = preflightDocument(doc, { cmyk: true });
    expect(pick(issues, 'whiteInkOnWhite')).toMatchObject([{ severity: 'warning', ink: 'Opaque white', color: '#ececec', pageIndex: 0 }]);
    expect(pick(issues, 'inkPressOrder')).toMatchObject([{ first: ['Opaque white'], last: [] }]);
  });

  it('adds nothing for ordinary spot inks', () => {
    const doc = buildDocument({ markdown: 'Text.' }, config({ bodyText: { color: spot('#1f3f99', { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } }) } }));
    const issues = preflightDocument(doc, { cmyk: true });
    expect(issues.filter((i) => ['spotInkFinish', 'inkPressOrder', 'whiteInkOnWhite'].includes(i.kind))).toEqual([]);
  });
});
