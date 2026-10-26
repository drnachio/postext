/**
 * `contrast.allow` (#1124): the source's own colour pairs, accepted with a
 * reason. An accepted pair is still reported, marked accepted, after the
 * findings that are not; text outside what the entry names stays a
 * warning.
 */
import { describe, expect, it } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { contrastDocument, type ContrastIssue } from '../../checks/contrast.js';
import { resolveContrastAllow, resolveContrastConfig, stripContrastDefaults } from '../../defaults/output/contrast.js';
import type { PostextConfig } from '../../types.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const mm = (value: number) => ({ value, unit: 'mm' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

const OCHRE = '#b7820f';
const config = (extra: PostextConfig = {}): PostextConfig => ({
  page: { width: mm(150), height: mm(200), dpi: 300, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { color: hex(OCHRE), fontSize: pt(10), lineHeight: pt(14) },
  ...extra,
});
const low = (issues: ContrastIssue[]) => issues.filter((i) => i.kind === 'lowContrast');
const warnings = (issues: ContrastIssue[]) => issues.filter((i) => !i.accepted);

describe('contrast.allow resolves', () => {
  it('normalises colours and drops entries that match nothing', () => {
    expect(resolveContrastAllow([
      { fg: 'B7820F', bg: '#FFF', reason: 'Brand ochre' },
      { style: ' note ', reason: 'Source box' },
      { reason: 'Nothing named' },
      { fg: 'ochre', reason: 'Not a colour' },
    ])).toEqual([
      { fg: '#b7820f', bg: '#ffffff', reason: 'Brand ochre' },
      { style: 'note', reason: 'Source box' },
    ]);
    expect(resolveContrastConfig().allow).toEqual([]);
    expect(stripContrastDefaults({ allow: [] })).toBeUndefined();
    expect(stripContrastDefaults({ allow: [{ fg: '#b7820f', reason: 'r' }] })).toEqual({ allow: [{ fg: '#b7820f', reason: 'r' }] });
  });
});

describe('contrastDocument with contrast.allow', () => {
  it('reports the low pair as a warning without an entry', () => {
    const issues = contrastDocument(buildDocument({ markdown: 'Ochre text on paper.' }, config()));
    expect(low(issues)).toHaveLength(1);
    expect(issues[0]!.accepted).toBeUndefined();
  });

  it('lists a pair allowed by its colours as accepted, with the reason', () => {
    const cfg = config({ contrast: { allow: [{ fg: OCHRE, bg: '#ffffff', reason: 'The publisher\'s ochre' }] } });
    const issues = contrastDocument(buildDocument({ markdown: 'Ochre text on paper.' }, cfg));
    expect(low(issues)).toHaveLength(1);
    expect(issues[0]!.accepted).toEqual({ reason: 'The publisher\'s ochre', fg: OCHRE, bg: '#ffffff' });
    expect(warnings(issues)).toEqual([]);
  });

  it('keeps a pair the entry does not name as a warning', () => {
    const cfg = config({ contrast: { allow: [{ fg: OCHRE, bg: '#000000', reason: 'Only on black' }] } });
    expect(warnings(contrastDocument(buildDocument({ markdown: 'Ochre text on paper.' }, cfg)))).toHaveLength(1);
  });

  it('accepts every pair set in a box style, and only there', () => {
    const cfg = config({
      bodyText: { color: hex('#000000'), fontSize: pt(10), lineHeight: pt(14) },
      calloutStyles: [
        { id: 'note', name: 'Note', backgroundEnabled: true, background: hex('#102a43'), body: { color: hex('#243b53') } },
        { id: 'aside', name: 'Aside', backgroundEnabled: true, background: hex('#102a43'), body: { color: hex('#243b53') } },
      ],
      contrast: { allow: [{ style: 'note', reason: 'The source sets its notes so' }] },
    });
    const md = ':::callout{type="note"}\nInside the note.\n:::\n\nBetween.\n\n:::callout{type="aside"}\nInside the aside.\n:::';
    const issues = low(contrastDocument(buildDocument({ markdown: md }, cfg)));
    // The same colours: one finding accepted (the note), one not (the aside).
    const accepted = issues.filter((i) => i.accepted);
    const open = issues.filter((i) => !i.accepted);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ color: '#243b53', background: '#102a43', accepted: { style: 'note', reason: 'The source sets its notes so' } });
    expect(accepted[0]!.text).toContain('note');
    expect(open).toHaveLength(1);
    expect(open[0]!.text).toContain('aside');
    // The warnings come first.
    expect(issues.indexOf(open[0]!)).toBeLessThan(issues.indexOf(accepted[0]!));
  });

  it('narrows a style entry by colour', () => {
    const cfg = config({
      calloutStyles: [{ id: 'note', name: 'Note', backgroundEnabled: true, background: hex('#102a43'), body: { color: hex('#243b53') } }],
      contrast: { allow: [{ style: 'note', fg: '#999999', reason: 'Another colour' }] },
    });
    const issues = contrastDocument(buildDocument({ markdown: ':::callout{type="note"}\nInside.\n:::' }, cfg));
    expect(warnings(issues).length).toBeGreaterThan(0);
  });
});
