// The reference document InDesign wrote, imported in both layouts.

import { describe, expect, it } from 'vitest';
import { createBundle, openBundle } from 'postext/bundle';
import { frameXml, mini, reference, referenceBytes, storyXml } from '../../read/fixture.test-helper.js';
import { idmlToPostext, importBundleInput } from '../index.js';
import type { IdmlImportResult } from '../types.js';
import { finding, markdownOf, parse, plain } from './kit.test-helper.js';

// A 2 x 2 PNG.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8DAAMQMDAAS/AL+dP1nMQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

let pages: IdmlImportResult | undefined;
let flow: IdmlImportResult | undefined;
const asPages = (): IdmlImportResult => (pages ??= idmlToPostext(reference(), { layout: 'pages', linkBytes: () => PNG }));
const asFlow = (): IdmlImportResult => (flow ??= idmlToPostext(reference(), { layout: 'flow' }));

describe('the reference document as composed pages', () => {
  it('makes one fence per page and a template per kind of page', () => {
    const r = asPages();
    const md = markdownOf(r);
    expect(r.layout).toBe('pages');
    expect(md.match(/^::::page\{/gm)).toHaveLength(4);
    expect(r.config.pageTemplates).toHaveLength(4);
    expect(r.report.counts).toMatchObject({ pages: 4, templates: 4, tables: 1, footnotes: 1 });
    for (const t of r.config.pageTemplates!) expect(t).toMatchObject({ area: 'trim', header: false, footer: false });
  });

  it('places frames at their boxes and threads them', () => {
    const r = asPages();
    const [p1, p2] = r.config.pageTemplates!;
    const t1 = p1!.frames!.find((f) => f.name === 't1')!;
    // The first frame of the thread: 48 pt from the left, two columns. The document has it 54 pt
    // from the top with its 22 pt title on the font's ascent (15.84 pt under the top); Postext
    // sets a baseline 0.8 of the leading (26 pt) under the top, so the frame stands 5 pt higher.
    expect(t1.placement).toMatchObject({ anchor: { to: 'container', edge: 'top-left' }, offset: { x: { value: 48, unit: 'pt' }, y: { value: 49, unit: 'pt' } } });
    expect(t1).toMatchObject({ columns: 2, columnGap: { value: 14, unit: 'pt' } });
    expect(t1.overflow?.continueIn).toBe('page:{attr.to_t1}#t1');
    expect(markdownOf(r)).toMatch(/::::page\{template="page-1" id="p1" to_t1="p2"\}/);
    // On the second page the thread goes on in a frame of the same page.
    expect(p2!.frames!.some((f) => f.next !== undefined)).toBe(true);
    // The story is written once, where its thread starts.
    expect(markdownOf(r).match(/Chapter One/g)!.length).toBeLessThanOrEqual(3);
  });

  it('turns frames, keeps insets, shapes and master text', () => {
    const r = asPages();
    const all = r.config.pageTemplates!.flatMap((t) => t.frames ?? []);
    expect(all.some((f) => Math.abs((f.rotate ?? 0) + 12) < 0.01 || Math.abs((f.rotate ?? 0) - 12) < 0.01)).toBe(true);
    const decoration = r.config.pageTemplates!.flatMap((t) => t.decoration?.elements ?? []);
    const kinds = new Set(decoration.map((e) => ('kind' in e ? e.kind : 'removal')));
    for (const k of ['text', 'path', 'rule', 'image'] as const) expect(kinds.has(k), k).toBe(true);
    // Folios are placeholders; master words travel as attributes of the fence.
    expect(decoration.some((e) => 'content' in e && e.content === '{pageNumber}')).toBe(true);
    expect(decoration.some((e) => 'content' in e && /^\{attr\.m\d+\}$/.test(e.content))).toBe(true);
    expect(markdownOf(r)).toMatch(/m\d+="Running head"/);
    expect(JSON.stringify(r.config)).not.toContain('Running head');
  });

  it('carries vertical and right-to-left stories on their frames', () => {
    const frames = asPages().config.pageTemplates!.flatMap((t) => t.frames ?? []);
    expect(frames.some((f) => f.direction === 'rtl')).toBe(true);
    // The reference's Japanese story is horizontal; a vertical one:
    const vertical = storyXml('s1', plain('Vertical text.')).replace('StoryOrientation="Horizontal"', 'StoryOrientation="Vertical"');
    const v = idmlToPostext(mini({ stories: { s1: vertical }, items: frameXml('f1', 's1', [36, 36, 300, 700]) }), { layout: 'pages' });
    expect(v.config.pageTemplates![0]!.frames![0]).toMatchObject({ writingMode: 'vertical-rl' });
    const f = idmlToPostext(mini({ stories: { s1: vertical }, items: frameXml('f1', 's1', [36, 36, 300, 700]) }), { layout: 'flow' });
    expect(f.config.layout).toMatchObject({ writingMode: 'vertical-rl' });
    const md = markdownOf(asPages());
    expect(md).toMatch(/:ruby\[[^\]]+\]\{rt="[^"]+"\}/);
    expect(md).toMatch(/:tcy\[/);
    expect(md).toMatch(/:dots\[[^\]]+\]\{style="sesame"\}/);
  });

  it('reads the pictures, the crop and the table', () => {
    const r = asPages();
    const bitmaps = r.resources.filter((x) => x.kind === 'bitmap');
    expect(bitmaps.length).toBeGreaterThanOrEqual(3);
    expect(bitmaps[0]!.bitmap).toMatchObject({ format: 'png', width: 2, height: 2 });
    expect(r.files.get(bitmaps[0]!.bitmap!.fileId)).toBeInstanceOf(Uint8Array);
    expect(r.missingLinks).toEqual([]);
    expect(bitmaps.some((b) => b.safeArea !== undefined)).toBe(true);
    const table = r.resources.find((x) => x.kind === 'table')!;
    expect(table.table!.model.headerRowCount).toBe(1);
    expect(table.table!.model.rows.flat().some((c) => c.image !== undefined)).toBe(true);
    expect(finding(r, 'rotatedCell')).toBeDefined();
    expect(finding(r, 'diagonalCellLines')).toBeDefined();
    expect(finding(r, 'tableFooterRows')).toBeDefined();
  });

  it('reports what it reads differently, by name', () => {
    const r = asPages();
    for (const id of ['gradient', 'effects', 'opacity', 'textOnPath', 'grepStyles', 'nestedStyleApplied', 'hiddenLayers', 'hiddenObjects', 'nonPrinting', 'pasteboard', 'hiddenConditionalText', 'editorialNotes', 'crossReferenceLive', 'anchoredObjectFrameEstimated', 'firstBaselineEstimated', 'spotColour', 'bookmarks', 'bleed']) expect(finding(r, id), id).toBeDefined();
    expect(r.report.verdict).toBe('lossy');
    expect(r.report.styles.find((s) => s.style === 'Heads/H1')).toMatchObject({ target: 'heading 1', reason: 'style name' });
    expect(r.report.styles.find((s) => s.style === 'Body')?.target).toBe('body text');
  });

  it('packs into a bundle the engine opens', async () => {
    const r = asPages();
    const made = await createBundle(importBundleInput(r));
    const bundle = await openBundle(made.bytes);
    expect(bundle.chapters.length).toBe(r.chapters.length);
    expect(bundle.resources.length).toBe(r.resources.length);
  });
});

describe('the reference document as a flowing book', () => {
  it('sets the page, the styles and the running heads', () => {
    const r = asFlow();
    expect(r.layout).toBe('flow');
    expect(r.config.page).toMatchObject({ width: { value: 170, unit: 'mm' }, height: { value: 240, unit: 'mm' }, binding: 'left', pageNumbering: { format: 'lower-roman', startAt: 1 } });
    expect(r.config.page!.margins).toMatchObject({ mirror: true, top: { unit: 'mm' } });
    expect(r.config.layout).toMatchObject({ layoutType: 'double' });
    expect(r.config.bodyText).toMatchObject({ fontFamily: 'Georgia', fontSize: { value: 10.5, unit: 'pt' }, lineHeight: { value: 14, unit: 'pt' }, textAlign: 'justify', firstLineIndent: { value: 12, unit: 'pt' } });
    expect(r.config.headings!.levels![0]).toMatchObject({ level: 1, fontSize: { value: 22, unit: 'pt' }, fontWeight: 700, breakBefore: { enabled: false } });
    expect(r.config.customFonts).toBeUndefined();
    expect(r.config.header).toBeDefined();
    expect(JSON.stringify(r.config.footer)).toContain('{pageNumber}');
    expect(r.locale).toBe('es-ES');
  });

  it('keeps colours as authored and the spot colour on its ink', () => {
    const palette = asFlow().config.colorPalette!;
    const cyan = palette.find((c) => c.name === 'Brand Cyan')!;
    expect(cyan.value).toMatchObject({ model: 'cmyk', cmyk: { c: 80, m: 10, y: 0, k: 5 } });
    expect(palette.find((c) => c.name === 'PANTONE 185 C')?.value).toMatchObject({ model: 'spot', spot: { name: 'PANTONE 185 C' } });
    expect(palette.some((c) => c.name === 'Black')).toBe(true);
  });

  it('writes the story with its notes, links, anchors, marks and lists', () => {
    const md = markdownOf(asFlow());
    expect(md).toMatch(/^# .*Chapter One.* \{id="chapter-one".*\}$/m);
    expect(md).toMatch(/\]\(https:\/\/postext\.dev\/\)/);
    expect(md).toMatch(/\]\(#chapter-one\)/);
    expect(md).toMatch(/:index\{term="Typography"\}/);
    expect(md).toMatch(/:index\{term="Typography!Leading"\}/);
    expect(md).toMatch(/\[\^n1\]/);
    expect(md).toMatch(/^\[\^n1\]: /m);
    expect(md).toMatch(/^- .*First bullet/m);
    expect(md).toMatch(/^3\. .*Step three/m);
    expect(md).toMatch(/:swatch\{color="[^"]+" size=10pt border=none\}/);
    expect(md).toMatch(/:::callout\{type="[^"]+" wrap="left" width=0.48\}\n[\s\S]*Anchored sidebar/);
    expect(parse(md).some((b) => b.type === 'heading')).toBe(true);
  });

  it('lists the faces the book needs and the links it was not given', () => {
    const r = asFlow();
    const georgia = r.fonts.find((f) => f.family === 'Georgia')!;
    expect(georgia.styles.map((s) => [s.name, s.weight, s.italic])).toEqual(expect.arrayContaining([['Regular', 400, false], ['Bold', 700, false], ['Italic', 400, true]]));
    expect(r.missingLinks).toHaveLength(1);
    expect(r.missingLinks[0]).toMatchObject({ name: 'pic.png' });
    expect(r.missingLinks[0]!.uses).toBeGreaterThanOrEqual(3);
    expect(finding(r, 'missingPicture')).toMatchObject({ severity: 'loss' });
    // A placeholder keeps the frame's size.
    const placeholder = r.resources.find((x) => x.kind === 'svg')!;
    expect(placeholder.svg).toMatchObject({ width: 200, height: 150 });
  });
});

describe('options', () => {
  it('keeps what it is asked to keep', () => {
    const skip = markdownOf(asPages());
    for (const t of ['On a hidden layer', 'Hidden object', 'Non printing', 'On the pasteboard']) expect(skip).not.toContain(t);
    const keep = markdownOf(idmlToPostext(reference(), { layout: 'pages', hiddenLayers: 'include', hiddenObjects: 'include', nonPrinting: 'include', pasteboard: 'include' }));
    for (const t of ['On a hidden layer', 'Hidden object', 'Non printing', 'On the pasteboard']) expect(keep).toContain(t);
  });

  it('leaves master items out when asked', () => {
    const r = idmlToPostext(reference(), { layout: 'pages', masterItems: false });
    expect(JSON.stringify(r.config.pageTemplates)).not.toContain('{pageNumber}');
    expect(finding(r, 'masterItemsOff')).toBeDefined();
  });

  it('takes bytes, a name and a locale, and calls back with the findings', () => {
    const seen: string[] = [];
    const r = idmlToPostext(referenceBytes(), { name: 'Mine', locale: 'en', onWarning: (f) => seen.push(f.id) });
    expect(r.name).toBe('Mine');
    expect(r.locale).toBe('en');
    expect(r.config.locale).toBe('en');
    expect(seen).toEqual(r.report.findings.map((f) => f.id));
    expect(r.reason).toMatch(/^Composed pages: its longest story holds \d+% of the text/);
  });
});

describe('auto', () => {
  const text = 'A long paragraph of running text that fills its frame and ends in a full stop. '.repeat(12);
  it('chooses a flowing book for one story threaded through frames on the margins', () => {
    const frames = frameXml('f1', 's1', [36, 36, 576, 756], 'NextTextFrame="f2"') + frameXml('f2', 's1', [36, 36, 576, 756], 'PreviousTextFrame="f1"');
    const r = idmlToPostext(mini({ stories: { s1: storyXml('s1', plain(text) + plain(text)) }, items: frames }));
    expect(r.layout).toBe('flow');
    expect(r.reason).toMatch(/^A flowing book/);
  });
  it('keeps the pages of a document of separate frames', () => {
    const r = idmlToPostext(mini({ stories: { s1: storyXml('s1', plain('A title')), s2: storyXml('s2', plain(text)) }, items: frameXml('f1', 's1', [100, 60, 400, 120]) + frameXml('f2', 's2', [300, 300, 500, 700]) }));
    expect(r.layout).toBe('pages');
    expect(r.config.pageTemplates![0]!.frames!.map((f) => f.name)).toEqual(['t1', 't2']);
  });
});
