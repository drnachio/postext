import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { resolveFootnotesConfig, stripFootnotesDefaults } from '../../defaults/footnotes';
import { formatFootnoteNumber, noteNumberPositionOf } from '../../pipeline/footnotes';
import { flowRectToPage, type VDTDocument, type VDTLineSegment } from '../../vdt';
import type { PostextConfig } from '../../types';

// Issue #376: Arabic footnotes — «(١)» markers in the document digits, raised
// in the text and on the line in the note, numbered per page, the rule and
// the number on the start side.

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

const ARABIC = {
  numbering: 'page' as const,
  markerTemplate: '({n})',
  markerPosition: 'superscript' as const,
  noteNumberPosition: 'inline' as const,
};

function config(locale: string, footnotes: PostextConfig['footnotes'] = ARABIC): PostextConfig {
  return {
    locale,
    page: { width: pt(300), height: pt(260), margins: { top: pt(30), bottom: pt(30), left: pt(40), right: pt(20) } },
    layout: { layoutType: 'single' },
    bodyText: { fontFamily: 'Amiri' },
    footnotes,
  };
}

const filler = (n: number) => Array.from({ length: n }, (_, i) => `WORD${i} كلمة نص عربي`).join(' ');
/** Three notes; the third far enough on to land on a later page. */
const MD = [
  `ALPHA[^a] ${filler(6)} BETA[^b]`,
  '',
  filler(400),
  '',
  `GAMMA[^c] ${filler(4)}`,
  '',
  '[^a]: NOTE-A ملاحظة',
  '[^b]: NOTE-B ملاحظة',
  '[^c]: NOTE-C ملاحظة',
].join('\n');

const markers = (doc: VDTDocument): VDTLineSegment[] =>
  doc.blocks.filter((b) => !b.footnoteNote).flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).filter((s) => s.footnoteId !== undefined);
const notes = (doc: VDTDocument) => doc.blocks.filter((b) => b.footnoteNote !== undefined);

describe('footnote marker template', () => {
  it('resolves, keeping the default absent', () => {
    expect('markerTemplate' in resolveFootnotesConfig({})).toBe(false);
    expect('markerTemplate' in resolveFootnotesConfig({ markerTemplate: '{n}' })).toBe(false);
    // A template without {n} is read as the default.
    expect('markerTemplate' in resolveFootnotesConfig({ markerTemplate: '()' })).toBe(false);
    expect(resolveFootnotesConfig({ markerTemplate: '({n})' }).markerTemplate).toBe('({n})');
    expect(stripFootnotesDefaults({ markerTemplate: '{n}', noteNumberPosition: 'auto' })).toBeUndefined();
    expect(stripFootnotesDefaults({ markerTemplate: '({n})', noteNumberPosition: 'inline' })).toEqual({ markerTemplate: '({n})', noteNumberPosition: 'inline' });
  });

  it('writes the number inside the template', () => {
    expect(formatFootnoteNumber(3, 'arabic-indic', '({n})')).toBe('(٣)');
    expect(formatFootnoteNumber(12, 'decimal', '[{n}]')).toBe('[12]');
    expect(formatFootnoteNumber(4, 'decimal')).toBe('4');
  });

  it('places the note number as the marker unless told otherwise', () => {
    expect(noteNumberPositionOf(resolveFootnotesConfig({}))).toBe('superscript');
    expect(noteNumberPositionOf(resolveFootnotesConfig({ markerPosition: 'inline' }))).toBe('inline');
    expect(noteNumberPositionOf(resolveFootnotesConfig({ noteNumberPosition: 'inline' }))).toBe('inline');
    expect(noteNumberPositionOf(resolveFootnotesConfig({ markerPosition: 'inline', noteNumberPosition: 'superscript' }))).toBe('superscript');
  });
});

describe('Arabic footnotes', () => {
  const doc = buildDocument({ markdown: MD }, config('ar'));

  it('prints «(١)» in the document digits, raised in the text', () => {
    const ms = markers(doc);
    expect(ms.map((m) => m.text).slice(0, 2)).toEqual(['(١)', '(٢)']);
    for (const m of ms) expect(m.script).toBe('sup');
  });

  it('opens each note with the same marker, on the line', () => {
    const first = notes(doc)[0]!;
    const seg = first.lines[0]!.segments![0]!;
    expect(seg.text).toBe('(١)');
    expect(seg.script).toBeUndefined();
  });

  it('numbers the notes again on every page', () => {
    const byId = new Map(markers(doc).map((m) => [m.footnoteId!, m]));
    const pageOf = (id: string) => notes(doc).find((b) => b.footnoteNote === id)!.pageIndex;
    expect(pageOf('c')).toBeGreaterThan(pageOf('a'));
    expect(byId.get('c')!.text).toBe('(١)');
  });

  it('sets the rule and the note number on the start side, the right', () => {
    const page = doc.pages.find((p) => p.footnoteAreas?.some((a) => a.rule))!;
    const area = page.footnoteAreas!.find((a) => a.rule)!;
    const col = page.columns[area.columnIndex]!;
    const rule = flowRectToPage(page, { x: area.rule!.x, y: area.rule!.y, width: area.rule!.width, height: 0 });
    const column = flowRectToPage(page, col.bbox);
    expect(rule.x + rule.width).toBeCloseTo(column.x + column.width, 3);
    const note = notes(doc).find((b) => b.pageIndex === doc.pages.indexOf(page))!;
    const line = note.lines[0]!;
    // The number is the line's first segment: its flow x is the column's
    // start, which the mirrored frame puts on the right.
    const lineBox = flowRectToPage(page, line.bbox);
    expect(lineBox.x + lineBox.width).toBeCloseTo(column.x + column.width, 3);
  });

  it('leaves a Latin document numbered as before', () => {
    const latin = buildDocument({ markdown: 'Alpha[^a] beta.\n\n[^a]: Note.' }, config('en', {}));
    expect(markers(latin).map((m) => m.text)).toEqual(['1']);
    expect(notes(latin)[0]!.lines[0]!.segments![0]!).toMatchObject({ text: '1', script: 'sup' });
  });
});
