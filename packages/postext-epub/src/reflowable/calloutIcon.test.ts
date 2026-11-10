import { describe, expect, it } from 'vitest';
import type { CalloutStyleConfig, PostextConfig, Resource } from 'postext';
import { baseConfig, layOut, pt } from './__tests__/vdt.js';
import { buildReflowablePublication } from './index.js';

// A box style's icon reflows as the box's first element, floated where the
// composed page draws it; a picture painted in one colour gets a copy of
// its own in that colour.

const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const RING_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="none" stroke="#000"/></svg>';
const ring: Resource = {
  id: 'ring', typeId: 'image', kind: 'svg', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'ring.svg', width: 10, height: 10 },
};

const KEY_BOX = ':::callout{type="key" title="Key points"}\nInside.\n:::';

async function book(style: CalloutStyleConfig, more: { config?: PostextConfig; markdown?: string; language?: string } = {}) {
  const config: PostextConfig = { ...baseConfig, ...more.config, calloutStyles: [style] };
  const pub = await buildReflowablePublication([layOut(more.markdown ?? KEY_BOX, config, [ring])], {
    layout: 'reflowable',
    metadata: { title: 'Sample book', language: more.language ?? 'en-US', modified: new Date(Date.UTC(2026, 10, 4)) },
    resourceBytes: (fileId) => (fileId === 'ring.svg' ? { bytes: new TextEncoder().encode(RING_SVG), mediaType: 'image/svg+xml' } : undefined),
  });
  const text = (type: string) => pub.items.filter((i) => i.mediaType === type).map((i) => (typeof i.data === 'string' ? i.data : new TextDecoder().decode(i.data)));
  return { pub, css: text('text/css').join('\n'), xhtml: text('application/xhtml+xml').join('\n'), svgs: pub.items.filter((i) => i.mediaType === 'image/svg+xml') };
}
const iconRule = (css: string) => /aside\.pt-callout-key > \.pt-callout-icon \{[^}]*\}/.exec(css)?.[0] ?? '';

describe('box icons in the reflowable EPUB', () => {
  it('writes a picture icon over a side stripe, in its tint', async () => {
    const { xhtml, css, svgs } = await book({
      id: 'key',
      stripe: { enabled: true, side: 'left', width: pt(12), color: hex('#b8c2d4') },
      icon: { kind: 'resource', resourceId: 'ring', size: pt(10), tint: hex('#999999') },
    });
    const aside = /<aside class="pt-callout pt-callout-key">[\s\S]*?<\/aside>/.exec(xhtml)?.[0] ?? '';
    expect(aside).toMatch(/^<aside[^>]*>\n<span class="pt-callout-icon" aria-hidden="true"><img src="\.\.\/images\/ring-999999\.svg" alt=""\/><\/span>\n<p class="pt-callout-title">Key points<\/p>/);
    // The tinted copy is carried; the untinted picture is not placed.
    expect(svgs.map((i) => i.href)).toEqual(['images/ring-999999.svg']);
    expect(String(svgs[0]!.data)).toContain('<feFlood flood-color="#999999"/>');
    const r = iconRule(css);
    expect(r).toContain('float: left');
    // Centred on the stripe: its margin box zero wide.
    const lead = Number(/margin-left: (-?[\d.]+)em/.exec(r)?.[1]);
    const back = Number(/margin-right: (-?[\d.]+)em/.exec(r)?.[1]);
    const width = Number(/width: ([\d.]+)em/.exec(r)?.[1]);
    expect(lead).toBeLessThan(0);
    expect(lead + width + back).toBeCloseTo(0, 2);
    // The stripe is in CSS px: half of it is a relative offset in px.
    expect(r).toContain('position: relative');
    expect(r).toMatch(/left: -8px/);
    expect(css).toMatch(/aside\.pt-callout-key \{[^}]*display: flow-root/);
  });

  it('gives an icon without a side stripe a column of its own', async () => {
    const { xhtml, css } = await book({ id: 'key', icon: { kind: 'glyph', glyph: '!', size: pt(12), color: hex('#aa0000') } });
    expect(xhtml).toContain('<span class="pt-callout-icon" aria-hidden="true">!</span>');
    // The glyph is the icon, not part of the title.
    expect(xhtml).toContain('<p class="pt-callout-title">Key points</p>');
    const r = iconRule(css);
    expect(r).toContain('color: #aa0000');
    expect(r).toContain('line-height: 1');
    expect(css).toMatch(/aside\.pt-callout-key \{[^}]*padding-left: [\d.]+em/);
  });

  it('draws a ring with CSS', async () => {
    const { xhtml, css } = await book({ id: 'key', icon: { kind: 'shape', shape: 'ring', size: pt(12), color: hex('#336699') } });
    expect(xhtml).toContain('<span class="pt-callout-icon" aria-hidden="true"></span>');
    const r = iconRule(css);
    expect(r).toContain('border-radius: 50%');
    expect(r).toMatch(/border: [\d.]+px solid #336699/);
  });

  it('writes no icon for a style without one', async () => {
    const { xhtml, css, svgs } = await book({ id: 'key' });
    expect(xhtml).not.toContain('pt-callout-icon');
    expect(css).not.toContain('pt-callout-icon');
    // The box is as it was: its title, and no picture of its own.
    expect(xhtml).toContain('<p class="pt-callout-title">Key points</p>');
    expect(svgs).toHaveLength(0);
  });

  it('leaves a picture in its own colours when its tint is no #rrggbb colour', async () => {
    const { xhtml, svgs } = await book({
      id: 'key',
      stripe: { enabled: true, side: 'left', width: pt(12), color: hex('#b8c2d4') },
      icon: { kind: 'resource', resourceId: 'ring', size: pt(10), tint: { hex: 'red"/><script/>', model: 'hex' } },
    });
    expect(xhtml).toContain('<img src="../images/ring.svg" alt=""/>');
    expect(svgs.map((i) => i.href)).toEqual(['images/ring.svg']);
    expect(svgs.map((i) => String(i.data)).join('')).not.toContain('feFlood');
  });

  it('puts the icon on the side of an end stripe', async () => {
    const { css } = await book({
      id: 'key',
      stripe: { enabled: true, side: 'end', width: pt(12), color: hex('#b8c2d4') },
      icon: { kind: 'glyph', glyph: '!', size: pt(12) },
    });
    expect(css).toMatch(/aside\.pt-callout-key \{[^}]*border-inline-end: [\d.]+px solid #b8c2d4/);
    const r = iconRule(css);
    expect(r).toContain('float: right');
    expect(r).toMatch(/right: -8px/);
  });

  it('moves a corner badge past the stripe on its side, not the stripe and the border', async () => {
    const { css } = await book({
      id: 'key',
      border: { enabled: true, width: pt(3), color: hex('#000000') },
      stripe: { enabled: true, side: 'right', width: pt(12), color: hex('#b8c2d4') },
      icon: { kind: 'glyph', glyph: '!', size: pt(12), position: 'corner', cornerSide: 'right' },
    });
    const r = iconRule(css);
    expect(r).toContain('float: right');
    // 12 pt of stripe in CSS px; the border it replaces is not added.
    expect(r).toMatch(/right: -16px/);
    // The top border, which the badge hangs from.
    expect(r).toMatch(/top: -4px/);
  });

  it('reads a right-to-left box\'s borders by the sides of its flow', async () => {
    const { css } = await book({
      id: 'key',
      border: { enabled: true, width: pt(3), color: hex('#000000'), sides: { left: { enabled: true, width: pt(6) }, right: { enabled: false } } },
      icon: { kind: 'glyph', glyph: '!', size: pt(12), position: 'corner', cornerSide: 'start' },
    }, { config: { locale: 'ar' }, language: 'ar', markdown: ':::callout{type="key" title="نقاط"}\nنص.\n:::' });
    const r = iconRule(css);
    // The start of a right-to-left box is on the page's right, and its
    // border there is the one written as `left`.
    expect(r).toContain('float: right');
    expect(r).toMatch(/right: -8px/);
  });

  it('places the icon along the lines of a vertical book, with logical properties', async () => {
    const { css } = await book({
      id: 'key',
      stripe: { enabled: true, side: 'left', width: pt(12), color: hex('#b8c2d4') },
      icon: { kind: 'glyph', glyph: '!', size: pt(12) },
    }, { config: { locale: 'ja', layout: { writingMode: 'vertical-rl' } }, language: 'ja', markdown: ':::callout{type="key" title="要点"}\n本文。\n:::' });
    expect(css).toContain('writing-mode: vertical-rl');
    const r = iconRule(css);
    expect(r).toContain('float: inline-start');
    expect(r).toMatch(/margin-inline-start: -[\d.]+em/);
    expect(r).toMatch(/inline-size: [\d.]+em/);
    expect(r).toMatch(/inset-inline-start: -8px/);
    expect(r).not.toMatch(/(?:^|[;{]\s*)(?:float: (?:left|right)|margin-(?:left|right)|left|right|width|height):/);
  });

  it('writes the icon in an exercise set in the style\'s box', async () => {
    const { xhtml, css } = await book({ id: 'key', icon: { kind: 'glyph', glyph: '!', size: pt(12) } }, {
      config: { exerciseStyles: [{ id: 'ex', box: 'key' }] },
      markdown: ':::exercise{style=ex}\nChoose.\n\n- [x] Yes\n- [ ] No\n:::',
    });
    const group = /<div class="pt-callout pt-callout-key pt-exercise[^"]*"[^>]*>[\s\S]*?<\/div>/.exec(xhtml)?.[0] ?? '';
    expect(group).toContain('<span class="pt-callout-icon" aria-hidden="true">!</span>');
    expect(css).toMatch(/div\.pt-exercise\.pt-callout-key > \.pt-callout-icon \{/);
  });
});
