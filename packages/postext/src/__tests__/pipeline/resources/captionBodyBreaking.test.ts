import { describe, it, expect } from 'vitest';
import { layoutResourceBlock } from '../../../pipeline/resources/resourceLayout.js';
import { snippetBreaking } from '../../../pipeline/resources/resourceLayout/snippets.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import { defaultResourceTypes } from '../../../defaults/resources/resourceTypes.js';
import { mergeCaptionStyle, resolveCaptionStyleConfig, stripCaptionStyleDefaults } from '../../../defaults/resources/captionStyle.js';
import { resolveBodyTextConfig } from '../../../defaults/text/bodyText.js';
import type { VDTLine } from '../../../vdt.js';
import type { CaptionStyleConfig, PostextConfig, Resource } from '../../../types.js';

// A caption or a note broken as the body text is (`bodyBreaking`): the
// optimal breaker within the body's word-spacing limits, words divided when
// the body hyphenates, the body's hyphenation and stack rules; and a
// caption's own leading (`lineHeight`). Unset, both leave every caption as
// it was.

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

const LONG = 'Typographers balance justification against hyphenation when narrow measures leave conspicuous rivers between extraordinarily long words in captions underneath illustrations.';

const figure: Resource = {
  id: 'fig',
  typeId: 'figure',
  kind: 'bitmap',
  caption: LONG,
  note: LONG,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'fig.png', format: 'png', width: 400, height: 200 },
};

function layout(captionStyle: CaptionStyleConfig | undefined, width = 300, extra: PostextConfig = {}) {
  const resourceTypes = defaultResourceTypes();
  const resolved = resolveAllConfig({ ...extra, ...(captionStyle ? { captionStyle } : {}) });
  const { block } = layoutResourceBlock({
    resource: figure,
    resourceType: resourceTypes.find((t) => t.id === figure.typeId),
    number: '1',
    resolved,
    columnWidth: width,
    resourceNumbering: { fig: { number: '1', typeId: 'figure', heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    resourceTypes,
    resources: [figure],
  });
  return block;
}

const painted = (line: VDTLine): number => (line.segments ?? []).reduce((w, s) => w + s.width, 0);
const shape = (lines: VDTLine[]) => lines.map((l) => [l.text, l.bbox.y, l.bbox.width, l.hyphenated ?? false]);

describe('captions and notes broken as the body text', () => {
  it('leaves every caption and note as it was by default', () => {
    for (const align of ['justify', 'left'] as const) {
      const before = layout({ align, note: { align } }, 180);
      const off = layout({ align, bodyBreaking: false, note: { align, bodyBreaking: false } }, 180);
      expect(shape(off.captionLines), align).toEqual(shape(before.captionLines));
      expect(shape(off.noteLines), align).toEqual(shape(before.noteLines));
      expect(before.captionLines.some((l) => l.hyphenated), align).toBe(false);
    }
  });

  it('divides words when the body hyphenates, justified or ragged', () => {
    const hyphenated = (style: CaptionStyleConfig, extra?: PostextConfig) => layout(style, 180, extra).captionLines.some((l) => l.hyphenated);
    expect(hyphenated({ align: 'justify', bodyBreaking: true })).toBe(true);
    // Ragged, the words may be divided, on the ragged optimal breaker.
    expect(snippetBreaking('left', true, resolveAllConfig({}))).toMatchObject({ hyphenate: true, optimal: true, optimalRagged: true });
    const off: PostextConfig = { bodyText: { hyphenation: { enabled: false } } };
    expect(hyphenated({ align: 'justify', bodyBreaking: true }, off)).toBe(false);
  });

  it('sets a justified caption flush with both edges, the last line natural', () => {
    const lines = layout({ align: 'justify', bodyBreaking: true }).captionLines;
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines.slice(0, -1)) expect(line.bbox.x + painted(line)).toBeCloseTo(300, 6);
    expect(painted(lines[lines.length - 1]!)).toBeLessThan(300);
  });

  it('breaks the note as the body text too', () => {
    const lines = layout({ note: { align: 'justify', bodyBreaking: true } }, 180).noteLines;
    expect(lines.some((l) => l.hyphenated)).toBe(true);
    for (const line of lines.slice(0, -1)) expect(line.bbox.x + painted(line)).toBeCloseTo(180, 6);
  });

  it('keeps the numbered label whole and marked on the optimal breaker', () => {
    // The label is painted in its own colour from `captionLabel`, which the
    // Knuth–Plass lines must carry: with body breaking, and with stacks
    // avoided, which also breaks captions whole.
    const stacks: PostextConfig = { bodyText: { stacks: 'avoid' } };
    for (const [style, extra] of [[{ align: 'justify', bodyBreaking: true }, {}], [{ align: 'left' }, stacks]] as const) {
      const segs = layout(style, 180, extra).captionLines[0]!.segments!;
      const label = segs.filter((s) => s.captionLabel && s.kind === 'text').map((s) => s.text).join('').replace(/ /g, ' ');
      expect(label).toBe('Figure 1.');
    }
  });

  it('takes its own leading', () => {
    const pitch = (lineHeight?: CaptionStyleConfig['lineHeight']) => {
      const lines = layout({ fontSize: { value: 8, unit: 'pt' }, ...(lineHeight ? { lineHeight } : {}) }, 180).captionLines;
      return lines[1]!.bbox.y - lines[0]!.bbox.y;
    };
    const natural = pitch();
    expect(pitch({ value: 20, unit: 'px' })).toBeCloseTo(20, 6);
    expect(pitch({ value: 2, unit: 'em' })).toBeGreaterThan(natural);
  });
});

describe('bodyBreaking and lineHeight in the config', () => {
  const body = resolveBodyTextConfig(undefined);

  it('resolve to the behaviour before when unset', () => {
    const cs = resolveCaptionStyleConfig({}, body);
    expect(cs.bodyBreaking).toBe(false);
    expect(cs.note.bodyBreaking).toBe(false);
    expect('lineHeight' in cs).toBe(false);
  });

  it('are stripped at their defaults and kept otherwise', () => {
    expect(stripCaptionStyleDefaults({ bodyBreaking: false, note: { bodyBreaking: false } })).toBeUndefined();
    expect(stripCaptionStyleDefaults({ bodyBreaking: true, lineHeight: { value: 11, unit: 'pt' }, note: { bodyBreaking: true } }))
      .toEqual({ bodyBreaking: true, lineHeight: { value: 11, unit: 'pt' }, note: { bodyBreaking: true } });
  });

  it('a resource type overrides them, and inherits them otherwise', () => {
    const base = resolveCaptionStyleConfig({ bodyBreaking: true, lineHeight: { value: 11, unit: 'pt' } }, body);
    expect(mergeCaptionStyle(base, { align: 'justify' })).toMatchObject({ bodyBreaking: true, lineHeight: { value: 11, unit: 'pt' } });
    expect(mergeCaptionStyle(base, { bodyBreaking: false, note: { bodyBreaking: true } })).toMatchObject({ bodyBreaking: false, note: { bodyBreaking: true } });
  });
});
