import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { formatWarning } from '../../../pipeline/contentWarnings.js';
import { validatePageTemplates } from '../../../composed/validate.js';
import { lookOver, normalizeFrameLooks } from '../../../composed/templates.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import type { FrameLookEntry, PageTemplate } from '../../../composed/types.js';
import type { ContentWarning, PostextConfig, VDTDesignBoxBlock, VDTDocument, VDTFrame, VDTPage } from '../../../index.js';
import { CAPTIONS, GRID_CONFIG, GRID_RESOURCES, PHOTO_TEMPLATE } from '../fixtures/grid.js';

// #1089: named frame looks. `frameLooks` defines them, a `:::frame{slot}`
// piece names one with `look="<id>"`, and each item of a repeating grid can
// so wear a colour of its own without leaving the grid.

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

const hex = (h: string, extra: Record<string, unknown> = {}) => ({ hex: h, model: 'hex' as const, ...extra });
/** Nine pill colours, one per photo. */
const PILLS = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#8338ec', '#3a86ff', '#ff006e', '#6a994e'];
const LOOKS: FrameLookEntry[] = PILLS.map((c, k) => ({ id: `pill-${k + 1}`, background: hex(c), body: { color: hex('#ffffff') } }));
const PICTURES = GRID_RESOURCES.filter((r) => r.id.startsWith('foto-')).map((r) => r.id);

/** A photo card whose pill (and, when given, photo frame) names a look. */
const item = (k: number, caption: string, pillLook?: string, photoLook?: string): string =>
  `:::frame{slot="foto"${photoLook ? ` look="${photoLook}"` : ''}}\n::resource{id="${PICTURES[k % PICTURES.length]}"}\n\n`
  + `:::frame{slot="pie"${pillLook ? ` look="${pillLook}"` : ''}}\n${caption}\n:::\n:::\n`;
const page = (items: readonly string[]): string => `::::page{template="fotos"}\n# Animals of the river\n\n${items.join('\n')}::::\n`;
const ninePills = (): string => page(CAPTIONS.en.map((c, k) => item(k, c, `pill-${k + 1}`)));

const build = (markdown: string, config: Partial<PostextConfig> = {}): VDTDocument =>
  buildDocument({ markdown, resources: GRID_RESOURCES }, { ...GRID_CONFIG, frameLooks: LOOKS, ...config }, createMeasurementCache());
const composed = (doc: VDTDocument): VDTPage => doc.pages.find((p) => p.composed)!;
const frame = (p: VDTPage, name: string): VDTFrame => p.composed!.frames.find((f) => f.name === name)!;
/** The fill and border of a frame's box. */
const box = (doc: VDTDocument, name: string): VDTDesignBoxBlock['box'] => {
  const p = composed(doc);
  const f = frame(p, name);
  const b = (p.floats ?? []).find((x) => x.id === f.blockIds[0])!;
  return b.designOverlay!.blocks.find((x): x is VDTDesignBoxBlock => x.kind === 'box')!.box;
};
/** The colour of a frame's first line of text. */
const textColor = (doc: VDTDocument, name: string): string | undefined => {
  const p = composed(doc);
  const ids = new Set(frame(p, name).blockIds);
  return (p.floats ?? []).find((b) => ids.has(b.id) && b.type === 'paragraph')?.color;
};
const warningsOf = (doc: VDTDocument, kind: ContentWarning['kind']) => (doc.contentWarnings ?? []).filter((w) => w.kind === kind);

describe('named frame looks (#1089)', () => {
  it('gives each pill of a 3 × 3 photo grid its own colour', () => {
    const doc = build(ninePills());
    for (let k = 0; k < 9; k++) {
      expect(box(doc, `pie[${k + 1}]`).backgroundColor).toBe(PILLS[k]);
      expect(textColor(doc, `pie[${k + 1}]`)).toBe('#ffffff');
      // The photo frames keep their style.
      expect(box(doc, `foto[${k + 1}]`).borderColor).toBe('#2a6f97');
    }
    expect(warningsOf(doc, 'lookUnknown')).toEqual([]);
    expect(warningsOf(doc, 'frameOverflow')).toEqual([]);
  });

  it('moves nothing: the grid is laid where it is without looks', () => {
    const plain = build(page(CAPTIONS.en.map((c, k) => item(k, c))), { frameLooks: undefined });
    const looked = build(ninePills());
    const rects = (doc: VDTDocument) => composed(doc).composed!.frames.map((f) => [f.name, f.rect]);
    expect(rects(looked)).toEqual(rects(plain));
    expect(box(plain, 'pie[1]').backgroundColor).toBe('#f4a259');
  });

  it('dresses an item\'s main frame too', () => {
    const doc = build(page([item(0, 'The heron', undefined, 'teal'), item(1, 'The otter')]), {
      frameLooks: [{ id: 'teal', border: { color: hex('#008080') } }],
    });
    expect(box(doc, 'foto[1]').borderColor).toBe('#008080');
    expect(box(doc, 'foto[2]').borderColor).toBe('#2a6f97');
    expect(box(doc, 'pie[1]').backgroundColor).toBe('#f4a259');
  });

  it('lays the named look over the template frame\'s look, key by key', () => {
    const template: PageTemplate = {
      ...PHOTO_TEMPLATE,
      frames: PHOTO_TEMPLATE.frames!.map((f) => (f.name === 'pie' ? { ...f, look: { background: hex('#000000'), body: { color: hex('#ffff00') } } } : f)),
    };
    const doc = build(page([item(0, 'The heron', 'fill'), item(1, 'The otter')]), {
      pageTemplates: [template],
      frameLooks: [{ id: 'fill', background: hex('#123456') }],
    });
    // The named look's fill, the template look's text colour.
    expect(box(doc, 'pie[1]').backgroundColor).toBe('#123456');
    expect(textColor(doc, 'pie[1]')).toBe('#ffff00');
    // An item that names none wears the template look.
    expect(box(doc, 'pie[2]').backgroundColor).toBe('#000000');
    expect(lookOver({ background: hex('#000000'), body: { color: hex('#ffff00') } }, { id: 'x', name: 'X', body: { boldColor: hex('#ff0000') } } as FrameLookEntry))
      .toEqual({ background: hex('#000000'), body: { color: hex('#ffff00'), boldColor: hex('#ff0000') } });
  });

  it('dresses a frame of a page with no grid', () => {
    const config: Partial<PostextConfig> = {
      pageTemplates: [{ id: 'ficha', header: false, frames: [{ name: 'caja', style: 'pastilla', flow: true, placement: { anchor: { to: 'container', edge: 'top-left' } } }] }],
      frameLooks: [{ id: 'rosa', background: hex('#f6c3d0') }],
    };
    const doc = build('::::page{template="ficha"}\n\n:::frame{slot="caja" look="rosa"}\nThe text of the box.\n:::\n\n::::\n', config);
    expect(box(doc, 'caja').backgroundColor).toBe('#f6c3d0');
  });

  it('warns of a look frameLooks lacks, at its value, and wears the style', () => {
    const md = page([item(0, 'The heron', 'pill-01'), item(1, 'The otter', 'pill-2')]);
    const doc = build(md);
    const ws = warningsOf(doc, 'lookUnknown') as Extract<ContentWarning, { kind: 'lookUnknown' }>[];
    expect(ws).toHaveLength(1);
    const w = ws[0]!;
    expect(w).toMatchObject({ template: 'fotos', frame: 'pie', look: 'pill-01', suggestion: 'pill-1', fenceIndex: 0 });
    expect(md.slice(w.sourceStart!, w.sourceEnd!)).toBe('pill-01');
    expect(formatWarning(w)).toContain('names the look "pill-01", which frameLooks does not have (did you mean "pill-1"?)');
    expect(box(doc, 'pie[1]').backgroundColor).toBe('#f4a259');
    expect(box(doc, 'pie[2]').backgroundColor).toBe(PILLS[1]);
    // With no frameLooks at all, every look is unknown.
    expect(warningsOf(build(md, { frameLooks: undefined }), 'lookUnknown')).toHaveLength(2);
  });

  it('a part palette recolours a palette-linked look colour', () => {
    const config: Partial<PostextConfig> = {
      colorPalette: [{ id: 'tint', name: 'Tint', value: hex('#ffeb99') }] as never,
      pageTemplates: [{ ...PHOTO_TEMPLATE, palette: 'tint=#c3e0f6' }],
      frameLooks: [{ id: 'linked', background: hex('#ffeb99', { paletteId: 'tint' }) }, { id: 'loose', background: hex('#abcdef') }],
    };
    const doc = build(page([item(0, 'The heron', 'linked'), item(1, 'The otter', 'loose')]), config);
    expect(box(doc, 'pie[1]').backgroundColor).toBe('#c3e0f6');
    expect(box(doc, 'pie[2]').backgroundColor).toBe('#abcdef');
  });
});

describe('frameLooks in the config (#1089)', () => {
  it('keeps what the engine can use, the first of each id', () => {
    const looks = normalizeFrameLooks([
      { id: 'a', name: 'A', background: hex('#111111'), border: { color: { model: 'hex' } }, frobnicate: 1 },
      { id: 'a', background: hex('#222222') },
      { background: hex('#333333') },
      { id: 'b' },
    ]);
    expect(looks).toEqual([{ id: 'a', name: 'A', background: hex('#111111') }, { id: 'b' }]);
    expect(normalizeFrameLooks([])).toBeUndefined();
    expect(resolveAllConfig({} as PostextConfig).frameLooks).toBeUndefined();
    expect(resolveAllConfig({ frameLooks: [{ id: 'a', background: hex('#111111') }] } as PostextConfig).frameLooks).toEqual([{ id: 'a', background: hex('#111111') }]);
  });

  it('is validated as a frame\'s look', () => {
    const w = validatePageTemplates({
      frameLooks: [{ id: 'a', backgrnd: hex('#000000'), label: { colour: hex('#000000') } }, { background: hex('#000000') }] as never,
    });
    expect(w.map((x) => `${x.kind} ${x.path}${x.suggestion ? ` → ${x.suggestion}` : ''}`).sort()).toEqual([
      'unknownConfigKey /frameLooks/0/backgrnd → background',
      'unknownConfigKey /frameLooks/0/label/colour → color',
      'unknownConfigValue /frameLooks/1/id',
    ]);
  });
});
