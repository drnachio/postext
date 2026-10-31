import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { parseMarkdown } from '../../../parse/index.js';
import { applyLinkNotes, printedAddress } from '../../../pipeline/references/linkNotes.js';
import { resolveLinksConfig, stripLinksDefaults } from '../../../defaults/structure/links.js';
import { resolveAllConfig } from '../../../pipeline/config.js';
import { renderToHtml } from '../../../html-backend/html-backend.js';
import type { LinksConfig, PostextConfig, VDTLine } from '../../../index.js';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    let width = 0;
    for (const ch of s) width += ch === ' ' ? 3 : 7;
    return { width };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const mm = (value: number) => ({ value, unit: 'mm' as const });

const BASE: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: mm(160), height: mm(220), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
};

const MD = 'You can reach [the official page](https://example.com/docs/start) for more, or write to [us](mailto:a@b.c).';

const build = (links?: LinksConfig, md = MD, extra: PostextConfig = {}) =>
  buildDocument({ markdown: md }, { ...BASE, ...extra, ...(links ? { links } : {}) }, createMeasurementCache());

const textOf = (lines: readonly VDTLine[]): string => lines.map((l) => l.text).join(' ');

describe('links in print (#1302)', () => {
  it('prints nothing by default, and resolves no `links` config', () => {
    const doc = build();
    expect(doc.blocks.some((b) => b.footnoteNote !== undefined)).toBe(false);
    expect(textOf(doc.blocks[0]!.lines)).not.toContain('example.com');
    expect(resolveAllConfig(BASE).links).toBeUndefined();
  });

  it('sets the address in parentheses after the link text, itself a link', () => {
    const doc = build({ print: 'inline' });
    const text = textOf(doc.blocks[0]!.lines);
    expect(text).toContain('the official page (https://example.com/docs/start)');
    // A mailto: link prints nothing.
    expect(text).not.toContain('a@b.c');
    const hrefs = doc.blocks[0]!.lines.flatMap((l) => l.segments ?? []).filter((s) => /example/.test(s.text)).map((s) => s.href);
    expect(hrefs.every((h) => h === 'https://example.com/docs/start')).toBe(true);
  });

  it('sets a note numbered with the footnotes that prints the address', () => {
    const md = `${MD}[^n]\n\n[^n]: An author's note.`;
    const doc = build({ print: 'notes', urlDisplay: 'short' }, md);
    const notes = doc.blocks.filter((b) => b.footnoteNote !== undefined);
    expect(notes).toHaveLength(2);
    expect(textOf(notes[0]!.lines)).toMatch(/^1\s+example\.com\/docs\/start$/);
    expect(textOf(notes[1]!.lines)).toMatch(/^2\s+An author's note\./);
    // The marker follows the link text.
    const markers = doc.blocks[0]!.lines.flatMap((l) => l.segments ?? []).filter((s) => s.footnoteId !== undefined);
    expect(markers.map((s) => s.text)).toEqual(['1', '2']);
  });

  it('gives a QR note its code on the first line, beside the text, as tall as the code', () => {
    const doc = build({ print: 'notes', show: 'both', qr: { size: mm(15) } });
    const note = doc.blocks.find((b) => b.footnoteNote !== undefined)!;
    const qr = note.lines[0]!.qr!;
    expect(qr).toBeDefined();
    expect(qr.text).toBe('https://example.com/docs/start');
    expect(qr.side).toBeCloseTo((15 / 25.4) * doc.config.page.dpi, 3);
    // At the end of the measure: the code's right edge is the note's.
    expect(note.lines[0]!.bbox.x + qr.dx + qr.side).toBeCloseTo(note.bbox.x + note.bbox.width, 3);
    // The lines leave the code room.
    for (const line of note.lines) expect(line.bbox.x + line.bbox.width).toBeLessThanOrEqual(note.lines[0]!.bbox.x + qr.dx + 1e-6);
    expect(note.bbox.height + 1e-6).toBeGreaterThanOrEqual(qr.side);
    // The HTML output draws it as a link.
    const html = renderToHtml(doc);
    expect(html).toContain('class="pt-qr" href="https://example.com/docs/start"');
  });

  it('notes a visible address only for its code', () => {
    const md = 'See [https://example.com/x](https://example.com/x).';
    expect(build({ print: 'notes' }, md).blocks.some((b) => b.footnoteNote !== undefined)).toBe(false);
    const qrOnly = build({ print: 'notes', show: 'both' }, md).blocks.find((b) => b.footnoteNote !== undefined)!;
    expect(qrOnly.lines[0]!.qr).toBeDefined();
    expect(textOf(qrOnly.lines).trim()).toBe('1');
  });

  it('reuses the note of an address cited again in the chapter with repeat: first', () => {
    const md = '[One](https://a.org) and [two](https://a.org) and [three](https://b.org).';
    const every = build({ print: 'notes' }, md).blocks.filter((b) => b.footnoteNote !== undefined);
    expect(every).toHaveLength(3);
    const first = build({ print: 'notes', repeat: 'first' }, md);
    expect(first.blocks.filter((b) => b.footnoteNote !== undefined)).toHaveLength(2);
    const markers = first.blocks[0]!.lines.flatMap((l) => l.segments ?? []).filter((s) => s.footnoteId !== undefined).map((s) => s.text);
    expect(markers).toEqual(['1', '1', '2']);
  });

  it('puts the address of a link inside a note in parentheses', () => {
    const md = 'Text.[^n]\n\n[^n]: See [the page](https://example.com/p).';
    const note = build({ print: 'notes' }, md).blocks.find((b) => b.footnoteNote === 'n')!;
    expect(textOf(note.lines)).toContain('the page (https://example.com/p)');
  });

  it('sets an address in right-to-left text as a left-to-right isolate', () => {
    const blocks = parseMarkdown('نص [الموقع](https://data.un.org/) هنا.');
    const out = applyLinkNotes(blocks, resolveLinksConfig({ print: 'inline' }), false, true);
    const address = out[0]!.spans.find((s) => s.url)!;
    expect(address.text).toBe('https://data.un.org/');
    expect(address.direction?.dir).toBe('ltr');
    // Left-to-right text keeps its spans plain.
    const ltr = applyLinkNotes(parseMarkdown('See [x](https://a.org).'), resolveLinksConfig({ print: 'inline' }));
    expect(ltr[0]!.spans.find((s) => s.url)!.direction).toBeUndefined();
  });

  it('leaves headings and bibliography entries alone', () => {
    const blocks = parseMarkdown('# A [heading](https://example.com/h)\n\nText.');
    const out = applyLinkNotes(blocks, resolveLinksConfig({ print: 'notes' }));
    expect(out).toHaveLength(blocks.length);
    expect(out[0]!.text).toBe(blocks[0]!.text);
  });

  it('writes short addresses and strips its defaults', () => {
    expect(printedAddress('https://www.example.com/', 'short')).toBe('example.com');
    expect(printedAddress('http://example.com/a/b', 'short')).toBe('example.com/a/b');
    expect(stripLinksDefaults({ print: 'none', show: 'url', qr: { size: mm(15), side: 'end' } })).toBeUndefined();
    expect(stripLinksDefaults({ print: 'notes', qr: { side: 'start' } })).toEqual({ print: 'notes', qr: { side: 'start' } });
  });
});

describe('links config warnings (#1302)', () => {
  it('reads a word it does not know as the default', async () => {
    const { collectConfigWarnings } = await import('../../../checks/configWarnings/collect.js');
    const warnings = collectConfigWarnings({ links: { print: 'footnotes' as never, qr: { side: 'left' as never } } });
    expect(warnings).toEqual(expect.arrayContaining([
      { kind: 'unknownConfigValue', path: 'links.print', value: 'footnotes', used: 'none' },
      { kind: 'unknownConfigValue', path: 'links.qr.side', value: 'left', used: 'end' },
    ]));
  });
});
