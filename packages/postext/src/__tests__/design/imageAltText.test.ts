import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { renderToHtml } from '../../html-backend';
import type { DesignElement, PostextConfig, Resource } from '../../types';
import type { VDTDesignImageBlock, VDTDocument } from '../../vdt';

// A picture a design draws (a chapter plate, a cover picture) carries its
// resource's alternative text into the VDT and the HTML (#213); a
// decorative one, or one whose resource has no text, stays decoration.

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

const picture = (id: string, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: 200 },
  ...extra,
});
const resources = [
  picture('log', { altText: '  A log on a riverbank ', caption: 'Not this caption.' }),
  picture('wig', { caption: 'A **powdered** wig,\\\\ worn at court' }),
  picture('bare'),
];

const plate = (extra: Partial<DesignElement> = {}): DesignElement => ({
  kind: 'image',
  id: 'plate',
  resourceId: '{attr.art}',
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(100) } },
  ...extra,
} as DesignElement);
const title: DesignElement = {
  kind: 'text', id: 'title', content: '{titleText}', fontSize: pt(20), overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'fill' } },
} as DesignElement;

const config = (elements: DesignElement[], header: DesignElement[] = []): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(500), margins: { top: pt(40), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: header },
  footer: { elements: [] },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  headingStyles: [{ id: 'opener', advancedDesign: { enabled: true, slot: { elements } } }],
});

const md = '# Chapter I {style="opener" art="log"}\n\nOne.\n\n# Chapter II {style="opener" art="wig"}\n\nTwo.\n\n# Chapter III {style="opener" art="bare"}\n\nThree.';

/** The design image blocks of each chapter's heading, in order. */
function plates(doc: VDTDocument): VDTDesignImageBlock[] {
  return doc.blocks.filter((b) => b.type === 'heading').flatMap((b) => (b.designOverlay?.blocks ?? []).filter((d): d is VDTDesignImageBlock => d.kind === 'image'));
}

const urls = { resourceImageUrl: (fileId: string) => `https://example.org/${fileId}` };

describe('design images carry alternative text (#213)', () => {
  it('takes the resource’s alt text, else its caption as plain text', () => {
    const doc = buildDocument({ markdown: md, resources }, config([plate(), title]));
    expect(plates(doc).map((p) => p.altText)).toEqual(['A log on a riverbank', 'A powdered wig, worn at court', undefined]);
    // No text: no field at all.
    expect('altText' in plates(doc)[2]!).toBe(false);
  });

  it('gives a decorative picture none', () => {
    const doc = buildDocument({ markdown: md, resources }, config([plate({ decorative: true } as Partial<DesignElement>), title]));
    expect(plates(doc).map((p) => p.altText)).toEqual([undefined, undefined, undefined]);
  });

  it('writes the text as the img alt in HTML, alt="" and role="presentation" otherwise', () => {
    const doc = buildDocument({ markdown: md, resources }, config([plate(), title]));
    const html = renderToHtml(doc, urls);
    expect(html).toContain('<img src="https://example.org/log.png" alt="A log on a riverbank" style=');
    expect(html).toContain('<img src="https://example.org/wig.png" alt="A powdered wig, worn at court" style=');
    expect(html).toContain('<img src="https://example.org/bare.png" alt="" role="presentation" style=');
    const decorative = renderToHtml(buildDocument({ markdown: md, resources }, config([plate({ decorative: true } as Partial<DesignElement>), title])), urls);
    expect(decorative).toContain('<img src="https://example.org/log.png" alt="" role="presentation" style=');
    expect(decorative).not.toContain('riverbank');
  });

  it('escapes the text in HTML', () => {
    const doc = buildDocument({ markdown: md, resources: [picture('log', { altText: 'A "log" & <river>' }), ...resources.slice(1)] }, config([plate(), title]));
    expect(renderToHtml(doc, urls)).toContain('alt="A &quot;log&quot; &amp; &lt;river&gt;"');
  });

  it('reaches a running head’s picture too', () => {
    const header = [{ ...plate(), placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(40) } } } as DesignElement];
    const doc = buildDocument({ markdown: md, resources }, config([title], header));
    const alts = doc.pages.map((p) => p.header?.blocks.find((b): b is VDTDesignImageBlock => b.kind === 'image')?.altText);
    expect(alts).toEqual(['A log on a riverbank', 'A powdered wig, worn at court', undefined]);
  });

  it('lays out and paints a document whose design pictures have no text as before', () => {
    const plain = buildDocument({ markdown: md, resources: resources.map((r) => ({ ...r, altText: undefined, caption: undefined })) }, config([plate(), title]));
    for (const p of plates(plain)) expect(Object.keys(p).sort()).toEqual(['bbox', 'fileId', 'imageKind', 'kind']);
    // Without image URLs (placeholders) the HTML is what it was.
    expect(renderToHtml(plain)).not.toContain('role="presentation"');
  });
});
