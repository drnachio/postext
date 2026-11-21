import { describe, expect, it } from 'vitest';
import { caseSheet, resolveBindingMeasures, softcoverSheet } from 'postext';
import { barcodeRect, coverChecks } from './coverChecks.js';
import { elementAt, type CoverElementSetting, type CoverLogoSetting } from './coverLayers.js';

const trim = { width: 150, height: 230 };
const sheet = softcoverSheet(trim, 20, resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim), false);
const zone = (name: string) => sheet.zones.find((z) => z.name === name)!;
/** An element at `r` on the sheet (mm from its corner). */
const at = (id: string, r: { x: number; y: number; width: number; height: number }, over: Partial<CoverElementSetting> = {}): CoverElementSetting =>
  elementAt(sheet, { id, kind: 'box', color: '#ff0000', zone: 'front', x: 0, y: 0, width: 1, height: 1, ...over }, r);
const kinds = (checks: ReturnType<typeof coverChecks>) => checks.map((c) => `${c.kind}:${c.id ?? c.zone}`);
const none = new Set<string>();

describe('cover checks', () => {
  it('passes a clean cover', () => {
    const f = zone('front').safe;
    expect(coverChecks(sheet, { elements: [at('ok', { x: f.x + 10, y: f.y + 10, width: 20, height: 20 })] }, { pictures: none })).toEqual([]);
  });

  it('flags an item that crosses a fold by a little, and lets a background across', () => {
    const fold = sheet.lines[0]!.x;
    const small = at('small', { x: fold - 2, y: 50, width: 30, height: 20 });
    const wide = at('wide', { x: fold - 60, y: 0, width: 120, height: sheet.height });
    expect(kinds(coverChecks(sheet, { elements: [small, wide] }, { pictures: none }))).toEqual(['crossesFold:small']);
  });

  it('flags an item that runs into the bleed but not to the edge', () => {
    const t = sheet.trim;
    const short = at('short', { x: t.x + t.width - 20, y: 40, width: 21, height: 20 });
    const full = at('full', { x: t.x + t.width - 20, y: 80, width: 20 + sheet.width - (t.x + t.width), height: 20 });
    expect(kinds(coverChecks(sheet, { elements: [short, full] }, { pictures: none }))).toEqual(['shortOfBleed:short']);
  });

  it('lets the mirror fill a case’s turn-in, but not for an item that keeps its own bleed', () => {
    const m = resolveBindingMeasures({ id: 'c', name: 'C', style: 'caseFlat' }, trim);
    const cs = caseSheet(trim, 26, m);
    const t = cs.trim;
    const place = (id: string, over: Partial<CoverElementSetting> = {}) =>
      elementAt(cs, { id, kind: 'box', color: '#ff0000', zone: 'front', x: 0, y: 0, width: 1, height: 1, ...over }, { x: t.x + t.width - 20, y: 40, width: 22, height: 20 });
    const checks = coverChecks(cs, { elements: [place('mirrored'), place('own', { bleed: 'own' })] }, { pictures: none, mirror: true });
    expect(kinds(checks)).toEqual(['shortOfBleed:own']);
  });

  it('keeps a logo’s clear space in its safe area and off the other logos, and anything off the barcode', () => {
    const s = zone('front').safe;
    const logo = (id: string, x: number, clearance: number): CoverLogoSetting => ({ ...at(id, { x, y: s.y + 20, width: 20, height: 10 }), kind: 'image', resourceId: 'p', clearance });
    const isbn = '978-0-306-40615-7';
    const bc = barcodeRect(sheet, isbn)!;
    const onCode = at('sticker', { x: bc.x + 2, y: bc.y + 2, width: 8, height: 8 });
    const checks = coverChecks(sheet, {
      elements: [onCode],
      logos: [logo('edge', s.x + 1, 3), logo('a', s.x + 40, 2), logo('b', s.x + 61, 2)],
    }, { pictures: new Set(['p']), isbn });
    expect(kinds(checks)).toEqual(['overBarcode:sticker', 'clearance:edge', 'clearance:a', 'clearance:b']);
    expect(checks[0]!.severity).toBe('error');
  });

  it('flags transparencies under PDF/X-1a only', () => {
    const f = zone('front').safe;
    const veil = at('veil', { x: f.x, y: f.y, width: 20, height: 20 }, { opacity: 0.5 });
    expect(coverChecks(sheet, { effects: [veil] }, { pictures: none })).toEqual([]);
    expect(kinds(coverChecks(sheet, { effects: [veil] }, { pictures: none, standard: 'pdfx1a' }))).toEqual(['transparency:veil']);
  });

  it('flags a finish with no shape, off the sheet or with no plate name, a missing picture and a text that overflows', () => {
    const checks = coverChecks(sheet, {
      elements: [{ id: 'pic', kind: 'image', resourceId: 'gone', zone: 'front', x: 10, y: 10, width: 20, height: 20 }],
      finishes: [
        { id: 'orphan', kind: 'varnish', ink: 'Barniz', shape: { element: 'nothing' } },
        { id: 'away', kind: 'varnish', ink: ' ', shape: { box: { zone: 'front', x: 900, y: 10, width: 10, height: 10 } } },
      ],
    }, { pictures: none, overflow: ['back'] });
    expect(kinds(checks).sort()).toEqual(['finishNoInk:away', 'finishNoShape:orphan', 'finishOffSheet:away', 'missingPicture:pic', 'textOverflow:back']);
  });
});
