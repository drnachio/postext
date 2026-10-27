import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildDocument, contrastPairs } from 'postext';
import type { PostextConfig } from 'postext';
import { SandboxStoreContext } from '../context/SandboxContext.js';
import { ColorPicker } from '../controls/color/ColorPicker.js';
import { DEFAULT_LABELS } from '../types/defaultLabels.js';
import { computeWarnings } from '../warnings/compute.js';
import { isAcceptedWarning, warningCategory } from '../warnings/categories.js';
import type { WarningPayload } from '../warnings/types.js';
import { configKeyOf } from '../book/layoutKeys.js';
import { contrastSnapshot, publishContrast } from './contrastStore.js';
import { contrastDetail, contrastTitle } from './contrastText.js';
import { counterpartsFor, counterpartsOn, measureField, normalizeHex, ratioText } from './fieldContrast.js';

// #748: the contrast check in the Sandbox. The Checks panel lists the
// pairs that do not read; a colour field shows the ratio its colour has
// against the colours the book sets it with.

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
const hex = (h6: string) => ({ hex: h6, model: 'hex' as const });
const OCHRE = '#b7820f';
const config = (extra: PostextConfig = {}): PostextConfig => ({
  page: { width: pt(300), height: pt(400), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { color: hex('#111111'), fontSize: pt(10), lineHeight: pt(14) },
  headings: { levels: [{ level: 1, color: hex(OCHRE), fontSize: pt(12), fontWeight: 400 }] },
  ...extra,
});
const markdown = '# A title in ochre\n\nBody text in near black, with enough words to make a line.';

type ContrastWarning = { payload: Extract<WarningPayload, { kind: 'contrast' }>; sourceStart?: number };
const contrastWarnings = (cfg: PostextConfig) =>
  computeWarnings({ markdown, config: cfg, doc: buildDocument({ markdown }, cfg) })
    .filter((w) => w.payload.kind === 'contrast') as unknown as ContrastWarning[];

describe('contrast in the Checks panel', () => {
  it('lists a pair under AA once, with its book page and its place in the text', () => {
    const found = contrastWarnings(config());
    expect(found).toHaveLength(1);
    const { check, page } = found[0]!.payload;
    expect(page).toBe(1);
    expect(check).toMatchObject({ kind: 'lowContrast', color: OCHRE, background: '#ffffff', required: 4.5, level: 'AA', failing: ['screen'], text: 'A title in ochre' });
    expect(found[0]!.sourceStart).toBe(0);
    expect(warningCategory('contrast')).toBe('contrast');
    expect(contrastTitle(check, DEFAULT_LABELS)).toBe('Low contrast');
    expect(contrastDetail(check, DEFAULT_LABELS)).toBe('“A title in ochre”: ⁦#b7820f⁩ on ⁦#ffffff⁩, 12 pt. 3.37:1 on screen; AA asks for 4.5:1.');
  });

  it('follows the level, and stops with the check turned off', () => {
    expect(contrastWarnings(config({ contrast: { level: 'AAA' } })).length).toBeGreaterThanOrEqual(1);
    expect(contrastWarnings(config({ contrast: { level: 'AAA' } }))[0]!.payload.check).toMatchObject({ required: 7, level: 'AAA' });
    expect(contrastWarnings(config({ contrast: { enabled: false } }))).toEqual([]);
  });

  it('words reversed text with its inks, size and face', () => {
    expect(contrastDetail({
      kind: 'reversedText', color: '#ffffff', background: '#1b3a6b', sizePt: 7, weight: 300, italic: true, role: 'body',
      text: 'Small print', count: 3, reasons: ['small', 'italic', 'light'], minimumPt: 12, inks: 4,
    }, DEFAULT_LABELS)).toBe('“Small print”: ⁦#ffffff⁩ knocked out of ⁦#1b3a6b⁩ (4 of the four inks), 7 pt, weight 300 italic. Under 12 pt it can fill in on press. Set so in 3 places.');
  });

  it('leaves the layout alone when its settings change', () => {
    expect(configKeyOf(config({ contrast: { level: 'AAA', mode: 'both' } }))).toBe(configKeyOf(config()));
    expect(configKeyOf(config({ contrast: { allow: [{ fg: OCHRE, reason: 'Brand' }] } }))).toBe(configKeyOf(config()));
  });

  // #1124: a pair `contrast.allow` accepts is listed as accepted, with its
  // reason, and is not counted.
  it('lists an allowed pair as accepted, apart from the warnings', () => {
    const found = contrastWarnings(config({ contrast: { allow: [{ fg: OCHRE, bg: '#ffffff', reason: 'The publisher\'s ochre' }] } }));
    expect(found).toHaveLength(1);
    expect(isAcceptedWarning(found[0]!)).toBe(true);
    const { check } = found[0]!.payload;
    expect(check.accepted).toEqual({ reason: 'The publisher\'s ochre', fg: OCHRE, bg: '#ffffff' });
    expect(contrastDetail(check, DEFAULT_LABELS)).toBe('“A title in ochre”: ⁦#b7820f⁩ on ⁦#ffffff⁩, 12 pt. 3.37:1 on screen; AA asks for 4.5:1. Accepted: The publisher\'s ochre');
    expect(contrastDetail({ ...check, accepted: { reason: '' } }, DEFAULT_LABELS)).toMatch(/Accepted in the contrast settings\.$/);
    expect(isAcceptedWarning(contrastWarnings(config())[0]!)).toBe(false);
  });
});

describe('contrast beside a colour field', () => {
  const doc = buildDocument({ markdown }, config());
  const pairs = contrastPairs(doc);
  const snapshot = { level: 'AA' as const, media: ['screen' as const] };

  it('finds the colours a colour is set with, as text and as ground', () => {
    expect(counterpartsFor(OCHRE, pairs)).toEqual([{ role: 'text', other: '#ffffff', sizePt: 12, large: false, required: 4.5, count: 1 }]);
    const white = counterpartsFor('#FFF', pairs);
    expect(white.map((c) => `${c.role} ${c.other}`).sort()).toEqual(['ground #111111', `ground ${OCHRE}`]);
    expect(counterpartsFor('#123456', pairs)).toEqual([]);
    expect(normalizeHex('#ABCDEFFF')).toBe('#abcdef');
    expect(normalizeHex('#abcdef80')).toBe('#abcdef80');
  });

  it('measures a colour on a ground of its own against that ground only (#1244)', () => {
    // White is the paper here: on a disc of its own a white number is read
    // against the disc, not against the texts set on the paper.
    const on = counterpartsOn('#ffffff', '#295AA3', pairs, 11, 'AA');
    expect(on).toEqual([{ role: 'text', other: '#295aa3', sizePt: 11, large: false, required: 4.5, count: 0 }]);
    expect(ratioText(measureField('#ffffff', on, snapshot)!.worst.ratio)).toBe('6.8');
    // The pairs the pages set, when they have one.
    expect(counterpartsOn(OCHRE, '#FFFFFF', pairs, 9, 'AA')).toEqual(counterpartsFor(OCHRE, pairs));
  });

  it('measures the field against them, worst first', () => {
    const ochre = measureField(OCHRE, counterpartsFor(OCHRE, pairs), snapshot)!;
    expect(ochre.failing).toBe(true);
    expect(ratioText(ochre.worst.ratio)).toBe('3.3');
    expect(ochre.worst.reaches).toBeUndefined();
    const white = measureField('#ffffff', counterpartsFor('#ffffff', pairs), snapshot)!;
    expect(white.failing).toBe(true);
    expect(white.items.map((i) => i.other)).toEqual([OCHRE, '#111111']);
    expect(white.items[1]).toMatchObject({ failing: false, reaches: 'AAA' });
    expect(measureField('#ffffff', [], snapshot)).toBeNull();
  });

  it('follows the colour as it is edited, before the next layout', () => {
    // The same counterparts, a darker ochre: the ratio is worked out again.
    const darker = measureField('#7a5600', counterpartsFor(OCHRE, pairs), snapshot)!;
    expect(darker.failing).toBe(false);
    expect(darker.worst.reaches).toBe('AA');
  });

  it('never rounds a ratio up past a threshold', () => {
    expect(ratioText(4.499)).toBe('4.4');
    expect(ratioText(4.5)).toBe('4.5');
    expect(ratioText(6.999, 2)).toBe('6.99');
    expect(ratioText(21)).toBe('21.0');
  });

  it('shows the ratio beside the field, with a mark and a description', async () => {
    publishContrast([doc], config(), undefined);
    expect(contrastSnapshot().pairs).toHaveLength(pairs.length);
    const render = (value: string) => {
      const state = { config: config(), resources: [], labels: DEFAULT_LABELS, locale: 'en' };
      const store = { getSnapshot: () => state, subscribe: () => () => {}, dispatch: () => {} };
      return renderToString(h(SandboxStoreContext, { value: store as never },
        h(ColorPicker, { label: 'Colour', value: hex(value), onChange: () => {} })));
    };
    const failing = render(OCHRE);
    expect(failing).toContain('data-contrast="fail"');
    expect(failing).toContain('3.3');
    expect(failing).toContain('Contrast 3.37:1, under the 4.5:1 that AA asks');
    const passing = render('#111111');
    expect(passing).toContain('data-contrast="pass"');
    expect(passing).toContain('reaches AAA');
    // A colour the pages set neither as text nor as ground has no ratio.
    expect(render('#00ff00')).not.toContain('data-contrast');
  });
});
