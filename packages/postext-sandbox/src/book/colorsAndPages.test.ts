// #1618: a layout record is stamped without the colours of the
// configuration, so no colour may move a line. The guide and a showcase
// chapter are laid out with their design as it is and with every colour
// changed: the two documents hold the same boxes in the same places.

import { describe, expect, it } from 'vitest';
import { buildDocument, type PostextConfig, type VDTDocument } from 'postext';
import { createPostextGuideConfig } from '../context/guideConfig.js';
import { DEFAULT_MARKDOWN_EN } from '../defaultMarkdown/index.js';
import { configKeyOf, pagesConfigKeyOf } from './layoutKeys.js';

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

const isColor = (v: unknown): v is { hex: string; model: string } =>
  typeof v === 'object' && v !== null && typeof (v as { hex?: unknown }).hex === 'string' && typeof (v as { model?: unknown }).model === 'string';

/** `config` with every colour replaced by another one. */
function recolored<T>(value: T, count = { n: 0 }): T {
  if (isColor(value)) {
    count.n++;
    return { hex: `#${((count.n * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, '0')}`, model: 'hex' } as T;
  }
  if (Array.isArray(value)) return value.map((item) => recolored(item, count)) as T;
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, recolored(v, count)])) as T;
}

const COLOR_TEXT = /^(#[0-9a-f]{3,8}|rgba?\(.*\)|hsla?\(.*\))$/i;

/** The document as text, every colour it carries written the same. */
function geometry(doc: VDTDocument): string {
  return JSON.stringify(doc, (key, value: unknown) => {
    // A composed page's fingerprint of what it was set from, colours included.
    if (key === 'layoutKey') return '';
    if (isColor(value)) return '#';
    if (typeof value === 'string' && COLOR_TEXT.test(value)) return '#';
    return value;
  });
}

const showcase = new URL('../../../../apps/web/public/presets/alf-layla/', import.meta.url).href;
const preset = (await import(/* @vite-ignore */ `${showcase}preset.json`)) as { default: { config: PostextConfig } };
const tale = ((await import(/* @vite-ignore */ `${showcase}chapters/ar/102-merchant-jinni.md?raw`)) as { default: string }).default;

const BOOKS: [string, string, PostextConfig][] = [
  ['the guide', DEFAULT_MARKDOWN_EN, createPostextGuideConfig('en')],
  ['a tale of the Nights', tale, preset.default.config],
];

describe.each(BOOKS)('colours move no line: %s', (_name, markdown, config) => {
  const pages = geometry(buildDocument({ markdown }, config));

  it('lays out the same with every colour changed', () => {
    const count = { n: 0 };
    const other = recolored(config, count);
    expect(count.n).toBeGreaterThan(5);
    expect(configKeyOf(other)).not.toBe(configKeyOf(config));
    expect(pagesConfigKeyOf(other)).toBe(pagesConfigKeyOf(config));
    expect(geometry(buildDocument({ markdown }, other)) === pages).toBe(true);
  });
});

describe('pagesConfigKeyOf', () => {
  it('tells a setting that shapes pages apart', () => {
    const base = createPostextGuideConfig('en');
    const larger: PostextConfig = { ...base, bodyText: { ...base.bodyText, fontSize: { value: 12.5, unit: 'pt' } } as never };
    expect(pagesConfigKeyOf(larger)).not.toBe(pagesConfigKeyOf(base));
  });

  it('is the same for a colour changed, and another for a colour set where there was none', () => {
    const plain: PostextConfig = { headings: { levels: [{ level: 2, fontSize: { value: 14, unit: 'pt' } }] } as never };
    const red: PostextConfig = { headings: { levels: [{ level: 2, fontSize: { value: 14, unit: 'pt' }, color: { hex: '#aa0000', model: 'hex' } }] } as never };
    const blue: PostextConfig = { headings: { levels: [{ level: 2, fontSize: { value: 14, unit: 'pt' }, color: { hex: '#0000aa', model: 'hex' } }] } as never };
    expect(pagesConfigKeyOf(red)).toBe(pagesConfigKeyOf(blue));
    expect(pagesConfigKeyOf(red)).not.toBe(pagesConfigKeyOf(plain));
    expect(configKeyOf(red)).not.toBe(configKeyOf(blue));
  });
});
