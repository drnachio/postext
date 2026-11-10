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

async function book(style: CalloutStyleConfig) {
  const config: PostextConfig = { ...baseConfig, calloutStyles: [style] };
  const pub = await buildReflowablePublication([layOut(':::callout{type="key" title="Key points"}\nInside.\n:::', config, [ring])], {
    layout: 'reflowable',
    metadata: { title: 'Sample book', language: 'en-US', modified: new Date(Date.UTC(2026, 10, 4)) },
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
});
