import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { renderToHtml } from '../../../html-backend/html-backend.js';
import { linkStyleFor, resolveLinksConfig, stripLinksDefaults } from '../../../defaults/structure/links.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import type { PostextConfig, VDTDocument, VDTLine } from '../../../index.js';

// Deterministic text measurement stub (no DOM in the node test env).
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

const BLUE = { hex: '#1a5fb4', model: 'hex' as const };
const MARKDOWN = 'Read [the official page](https://example.org/page) and the rest of this sentence, see [@doe].';

const build = (config: PostextConfig): VDTDocument => buildDocument({ markdown: MARKDOWN }, config, createMeasurementCache());
const linkLines = (doc: VDTDocument): VDTLine[] => doc.blocks.flatMap((b) => b.lines).filter((l) => l.segments?.some((s) => s.href));

describe('links.style resolution (#1402)', () => {
  it('defaults to no underline in the interactive outputs', () => {
    const style = resolveLinksConfig({ style: { color: BLUE } }).style!;
    expect(style.underline).toBe('none');
    expect(style.outputs).toEqual(['html', 'epub', 'scorm']);
  });

  it('keeps the outputs it knows, in their own order', () => {
    const style = resolveLinksConfig({ style: { underline: 'dotted', outputs: ['scorm', 'pdf', 'web' as never] } }).style!;
    expect(style.outputs).toEqual(['pdf', 'scorm']);
  });

  it('strips the defaults and keeps what differs', () => {
    expect(stripLinksDefaults({ style: { underline: 'none', outputs: ['epub', 'html', 'scorm'] } })).toBeUndefined();
    expect(stripLinksDefaults({ style: { underline: 'solid', outputs: ['pdf'] } })).toEqual({ style: { underline: 'solid', outputs: ['pdf'] } });
  });

  it('applies only in the outputs it lists, and only when it changes something', () => {
    const links = resolveLinksConfig({ style: { color: BLUE } });
    expect(linkStyleFor(links, 'html')).toBeDefined();
    expect(linkStyleFor(links, 'pdf')).toBeUndefined();
    expect(linkStyleFor(resolveLinksConfig({ style: { outputs: ['pdf'] } }), 'pdf')).toBeUndefined();
  });

  it('leaves a config without a style resolving as before', () => {
    expect(resolveAllConfig({}).links).toBeUndefined();
    expect(resolveAllConfig({ links: { print: 'none' } }).links).toBeUndefined();
    expect(resolveAllConfig({ links: { style: { color: BLUE } } }).links?.print).toBe('none');
  });
});

describe('link underlines (#1402)', () => {
  it('underlines the run of a link, not the text after it', () => {
    const doc = build({ links: { style: { underline: 'solid' } } });
    const lines = linkLines(doc);
    expect(lines.length).toBeGreaterThan(0);
    const runs = lines.flatMap((l) => l.linkUnderlines ?? []);
    expect(runs.length).toBe(lines.length);
    const first = lines[0]!;
    const linked = first.segments!.filter((s) => s.href && s.kind === 'text');
    const width = linked.reduce((sum, s) => sum + s.width, 0);
    // The run covers the link's words and the spaces between them, no more.
    expect(first.linkUnderlines![0]!.length).toBeGreaterThanOrEqual(width);
    expect(first.linkUnderlines![0]!.length).toBeLessThan(width + 3 * 7 * 2);
    expect(first.linkUnderlines![0]!.y).toBeGreaterThan(0);
  });

  it('sets no underline without the style, and the same lines with it', () => {
    const plain = build({});
    const styled = build({ links: { style: { color: BLUE, underline: 'dashed' } } });
    expect(linkLines(plain).some((l) => l.linkUnderlines)).toBe(false);
    expect(styled.blocks.flatMap((b) => b.lines.map((l) => l.text))).toEqual(plain.blocks.flatMap((b) => b.lines.map((l) => l.text)));
  });
});

describe('links in the HTML backend (#1402)', () => {
  const doc = build({ links: { style: { color: BLUE, underline: 'dotted' } } });

  it('colours and underlines links in the HTML output', () => {
    const html = renderToHtml(doc);
    expect(html).toContain('color:#1a5fb4');
    expect(html).toMatch(/border-top:[\d.]+px dotted #1a5fb4/);
  });

  it('leaves them as plain text in an output the style does not list', () => {
    const html = renderToHtml(build({ links: { style: { color: BLUE, underline: 'dotted', outputs: ['pdf'] } } }));
    expect(html).not.toContain('#1a5fb4');
    expect(html).not.toContain('dotted');
  });

  it('writes an EPUB or SCORM page with the style when it lists them', () => {
    const only = build({ links: { style: { color: BLUE, underline: 'solid', outputs: ['scorm'] } } });
    expect(renderToHtml(only, { output: 'epub' })).not.toContain('#1a5fb4');
    expect(renderToHtml(only, { output: 'scorm' })).toContain('#1a5fb4');
  });
});
