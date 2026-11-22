import { describe, it, expect } from 'vitest';
import {
  caseSheet,
  caseSpineWidth,
  checkProfileAccepts,
  ean13CheckDigit,
  ean13Symbol,
  endpaperSheet,
  exportProductionProfiles,
  importProductionProfiles,
  isbnBarcodeSvg,
  isbnCaption,
  jacketSheet,
  PROMO_FORMATS,
  pageRunsOf,
  promoSheet,
  parseIsbn,
  resolveBindingMeasures,
  resolveLength,
  signaturePages,
  softcoverSheet,
  spineFromRuns,
  versionSheets,
  type ProductionSheet,
} from '../../production/index.js';
import type { BindingProfile, TrimMm } from '../../production/index.js';
import { FOLIO_BINDING_OF_STYLE } from '../../production/index.js';
import { resolvePagePaper } from '../../defaults/output/folio.js';

const trim: TrimMm = { width: 150, height: 230 };
const zone = (sheet: ProductionSheet, name: string) => sheet.zones.find((z) => z.name === name)!;

describe('ISBN', () => {
  it('reads an ISBN-13 with hyphens and gives its ISBN-10', () => {
    expect(parseIsbn('ISBN 978-0-306-40615-7')).toEqual({ ok: true, isbn13: '9780306406157', isbn10: '0306406152' });
  });

  it('converts an ISBN-10, X check digit included', () => {
    expect(parseIsbn('0-8044-2957-X')).toEqual({ ok: true, isbn13: '9780804429573', isbn10: '080442957X' });
  });

  it('gives a 979 ISBN no ISBN-10', () => {
    const isbn = '979100000000' + ean13CheckDigit('979100000000');
    expect(parseIsbn(isbn)).toEqual({ ok: true, isbn13: isbn });
  });

  it('says why an ISBN cannot be read', () => {
    expect(parseIsbn('978-0-306-40615-8')).toEqual({ ok: false, error: 'checksum' });
    expect(parseIsbn('0306406153')).toEqual({ ok: false, error: 'checksum' });
    expect(parseIsbn('978030640615')).toEqual({ ok: false, error: 'length' });
    expect(parseIsbn('9770306406157')).toEqual({ ok: false, error: 'prefix' });
    expect(parseIsbn('978-0-306-4O615-7')).toEqual({ ok: false, error: 'chars' });
  });

  it('prints the ISBN with the hyphens it was written with', () => {
    expect(isbnCaption('978-84-9835-123-4', '9788498351234')).toBe('ISBN 978-84-9835-123-4');
    expect(isbnCaption('9788498351234', '9788498351234')).toBe('ISBN 9788498351234');
  });
});

describe('EAN-13', () => {
  const modules = (bars: { x: number; width: number }[], width: number) => {
    const out = Array<string>(width).fill('0');
    for (const b of bars) for (let i = 0; i < b.width; i++) out[b.x + i] = '1';
    return out.join('');
  };

  it('encodes 9780306406157 with the parity of its first digit', () => {
    const s = ean13Symbol('9780306406157');
    expect(s.width).toBe(95);
    // 9 sets the left half ABBABA: 7A 8B 0B 3A 0B 6A; the right half
    // 406157 in set C.
    expect(modules(s.bars, 95)).toBe(
      '101' + '0111011' + '0001001' + '0100111' + '0111101' + '0100111' + '0101111'
        + '01010' + '1011100' + '1110010' + '1010000' + '1100110' + '1001110' + '1000100' + '101',
    );
  });

  it('runs the guard bars down', () => {
    const s = ean13Symbol('9780306406157');
    const guards = s.bars.filter((b) => b.guard).map((b) => b.x);
    expect(guards).toEqual([0, 2, 46, 48, 92, 94]);
  });

  it('adds the five-digit add-on with its own parity', () => {
    const s = ean13Symbol('9780306406157', '52495');
    // Checksum of 52495: 3 × (5 + 4 + 5) + 9 × (2 + 9) = 141 → 1 → GLGLL.
    expect(s.addOn!.width).toBe(47);
    expect(modules(s.addOn!.bars.map((b) => ({ ...b, x: b.x - s.addOn!.x })), 47)).toBe(
      '1011' + '0111001' + '01' + '0010011' + '01' + '0011101' + '01' + '0001011' + '01' + '0110001',
    );
  });

  it('refuses digits that are not an EAN-13', () => {
    expect(() => ean13Symbol('9780306406158')).toThrow();
    expect(() => ean13Symbol('9780306406157', '123')).toThrow();
  });
});

describe('spine', () => {
  it('rounds to whole signatures', () => {
    expect(signaturePages(250, 16)).toEqual({ pages: 256, blanks: 6 });
    expect(signaturePages(256, 16)).toEqual({ pages: 256, blanks: 0 });
    expect(signaturePages(251)).toEqual({ pages: 252, blanks: 1 });
  });

  it('sums each run of paper, the blanks on the last one', () => {
    // 240 pages at 90 g × 1.25 (112.5 µm) and 16 plates at 115 g × 1.0,
    // already a multiple of 16: 120 × 0.1125 + 8 × 0.115.
    const r = spineFromRuns([{ pages: 240, grammage: 90, bulk: 1.25 }, { pages: 16, grammage: 115, bulk: 1 }], 16, 1);
    expect(r.pages).toBe(256);
    expect(r.blanks).toBe(0);
    expect(r.block).toBeCloseTo(13.5 + 0.92, 6);
    expect(r.spine).toBeCloseTo(15.42, 6);
  });

  it('counts a leaf that straddles two papers once', () => {
    // 3 + 3 pages: three leaves, the second (pages 3 and 4) on the first
    // run's paper, where its first page is printed.
    const r = spineFromRuns([{ pages: 3, grammage: 80, bulk: 1.25 }, { pages: 3, grammage: 80, bulk: 1.25 }], undefined, 0);
    expect(r.block).toBeCloseTo(0.3, 6);
    const mixed = spineFromRuns([{ pages: 3, grammage: 80, bulk: 1.25 }, { pages: 3, grammage: 120, bulk: 1 }], undefined, 0);
    expect(mixed.block).toBeCloseTo(2 * 0.1 + 0.12, 6);
  });

  it("reads a page's paper as Folio does", () => {
    const named = { type: 'coatedMatte' as const };
    for (const own of [undefined, named, { grammage: 100 }]) {
      const runs = pageRunsOf([{ paper: own }], { grammage: 80 });
      const p = resolvePagePaper({ grammage: 80 }, own);
      expect(runs).toEqual([{ pages: 1, grammage: p.grammage, bulk: p.bulk }]);
    }
  });

  it("maps each binding style to Folio's binding", () => {
    expect(FOLIO_BINDING_OF_STYLE).toEqual({ perfect: 'paperback', sewnSoftcover: 'sewn', caseFlat: 'hardcover', caseRound: 'hardcover' });
  });

  it('groups laid-out pages by their stock', () => {
    const pages = [{}, {}, { paper: { type: 'coatedMatte' as const } }, { paper: { type: 'coatedMatte' as const } }, {}];
    // A page that names a stock takes that stock's weight, not the book's.
    const matte = resolvePagePaper({ grammage: 80 }, { type: 'coatedMatte' });
    expect(pageRunsOf(pages, { grammage: 80 })).toEqual([
      { pages: 2, grammage: 80, bulk: 1.25 },
      { pages: 2, grammage: matte.grammage, bulk: matte.bulk },
      { pages: 1, grammage: 80, bulk: 1.25 },
    ]);
  });
});

describe('profiles', () => {
  it('reads a length fixed, by trim steps or as a ratio', () => {
    expect(resolveLength(3, trim)).toBe(3);
    const steps = [{ upTo: { width: 170, height: 240 }, mm: 2 }, { mm: 2.5 }];
    expect(resolveLength(steps, trim)).toBe(2);
    expect(resolveLength(steps, { width: 210, height: 280 })).toBe(2.5);
    expect(resolveLength({ ratio: 0.6, min: 100 }, trim)).toBe(100);
    expect(resolveLength({ ratio: 0.6, min: 80 }, trim)).toBe(90);
  });

  it('lays the version over the profile over the style', () => {
    const profile: BindingProfile = { id: 'x', name: 'X', style: 'caseFlat', measures: { joint: 9 } };
    expect(resolveBindingMeasures(profile, trim).joint).toBe(9);
    expect(resolveBindingMeasures(profile, trim, { joint: 10 }).joint).toBe(10);
  });

  it('warns of a book the profile cannot make', () => {
    const profile: BindingProfile = {
      id: 'x', name: 'X', style: 'perfect',
      accepts: { trim: { min: { width: 120, height: 170 } }, spine: { max: 50 } },
    };
    expect(checkProfileAccepts(profile, trim, 20)).toEqual([]);
    expect(checkProfileAccepts(profile, { width: 110, height: 180 }, 55)).toEqual([
      { kind: 'profileOutOfRange', profile: 'x', measure: 'trimWidth', value: 110, limit: 120, side: 'min' },
      { kind: 'profileOutOfRange', profile: 'x', measure: 'spine', value: 55, limit: 50, side: 'max' },
    ]);
  });

  it('round-trips through the exchange file and drops what it cannot read', () => {
    const binding: BindingProfile = { id: 'b', name: 'B', style: 'caseRound', measures: { board: [{ mm: 2 }] } };
    const file = JSON.parse(JSON.stringify(exportProductionProfiles([{ id: 'p', name: 'P', grammage: 90 }], [binding])));
    expect(importProductionProfiles(file)).toEqual({ papers: [{ id: 'p', name: 'P', grammage: 90 }], bindings: [binding], issues: [] });

    file.bindings.push({ id: 'c', style: 'spiral' }, { id: 'd', style: 'perfect', measures: { joint: -1, colour: 3 } });
    const read = importProductionProfiles(file);
    expect(read.bindings.map((b) => b.id)).toEqual(['b', 'd']);
    expect(read.bindings[1]!.measures).toEqual({});
    expect(read.issues.map((i) => i.reason)).toEqual(['unknownStyle', 'badNumber', 'badMeasure']);
    expect(importProductionProfiles({ format: 'other' }).issues).toEqual([{ where: 'file', reason: 'notAProductionFile' }]);
  });

  it('drops fields of the wrong kind from an imported file', () => {
    const read = importProductionProfiles({
      format: 'postext-production',
      version: 1,
      papers: [{ id: 'p', name: 7, supplier: { x: 1 }, grammage: 90 }],
      bindings: [
        { id: 'b', name: 'B', style: 'perfect', printer: ['x'], accepts: { spine: { min: '3' } } },
        { id: 'c', name: 'C', style: 'perfect', accepts: { trim: { max: { width: 200, height: 280 } }, spine: { max: 60 } } },
      ],
    });
    expect(read.papers).toEqual([{ id: 'p', name: 'p', grammage: 90 }]);
    expect(read.bindings[0]).toEqual({ id: 'b', name: 'B', style: 'perfect' });
    expect(read.bindings[1]!.accepts).toEqual({ trim: { max: { width: 200, height: 280 } }, spine: { max: 60 } });
    expect(read.issues.map((i) => `${i.where}:${i.reason}`)).toEqual([
      'papers[0].supplier:badText',
      'papers[0].name:badText',
      'bindings[0].printer:badText',
      'bindings[0].accepts:badNumber',
    ]);
  });
});

describe('sheets', () => {
  const m = resolveBindingMeasures({ id: 'x', name: 'X', style: 'perfect' }, trim);
  const c = resolveBindingMeasures({ id: 'y', name: 'Y', style: 'caseFlat' }, trim);

  it('lays out a softcover: back, spine, front, bleed round', () => {
    const s = softcoverSheet(trim, 20, m, false);
    expect(s.zones.map((z) => z.name)).toEqual(['back', 'spine', 'front']);
    expect(s.width).toBeCloseTo(2 * 150 + 20 + 2 * m.bleed, 6);
    expect(s.height).toBeCloseTo(230 + 2 * m.bleed, 6);
    expect(zone(s, 'spine').rect.x).toBeCloseTo(m.bleed + 150, 6);
    // The front keeps clear of its hinge score.
    expect(zone(s, 'front').safe.x).toBeCloseTo(zone(s, 'front').rect.x + m.hingeScore + m.safeMargin, 6);
  });

  it('adds the flaps without moving the spine relative to the panels', () => {
    const plain = softcoverSheet(trim, 20, m, false);
    const flaps = softcoverSheet(trim, 20, m, true);
    expect(flaps.zones.map((z) => z.name)).toEqual(['flapBack', 'back', 'spine', 'front', 'flapFront']);
    expect(flaps.width - plain.width).toBeCloseTo(2 * m.flapWidth - 2 * m.flapFoldInset, 6);
    expect(zone(flaps, 'spine').rect.width).toBe(20);
  });

  it('lays out a case: boards with their squares, joints, turn-in round', () => {
    const s = caseSheet(trim, 26, c);
    expect(s.zones.map((z) => z.name)).toEqual(['back', 'jointBack', 'spine', 'jointFront', 'front']);
    const boardW = 150 - c.boardSetback + c.square;
    expect(zone(s, 'front').rect.width).toBeCloseTo(boardW, 6);
    expect(s.width).toBeCloseTo(2 * c.turnIn + 2 * boardW + 2 * c.joint + 26, 6);
    expect(s.height).toBeCloseTo(2 * c.turnIn + 230 + 2 * c.square, 6);
    expect(s.bleed).toBe(c.turnIn);
    // Text keeps clear of the board edge by the board's thickness.
    expect(zone(s, 'front').safe.y).toBeCloseTo(c.turnIn + c.board + c.safeMargin, 6);
  });

  it('gives a round case a wider spine than a flat one', () => {
    const r = resolveBindingMeasures({ id: 'z', name: 'Z', style: 'caseRound' }, trim);
    expect(caseSpineWidth(20, 'caseFlat', c)).toBeCloseTo(20 + 2 * c.board, 6);
    expect(caseSpineWidth(20, 'caseRound', r)).toBeCloseTo(20 + 2 * r.board + r.roundSpineAllowance, 6);
  });

  it('wraps the jacket over the case, a little wider at each flap fold', () => {
    const cs = caseSheet(trim, 26, c);
    const j = jacketSheet(trim, 26, c);
    expect(zone(j, 'spine').rect.width).toBe(26);
    expect(zone(j, 'front').rect.width).toBeCloseTo(zone(cs, 'front').rect.width + c.joint + c.jacketFoldAllowance, 6);
    expect(j.trim.height).toBeCloseTo(cs.trim.height, 6);
    expect(j.zones[0]!.name).toBe('flapBack');
  });

  it('puts the pastedown on the board side of each endpaper', () => {
    expect(endpaperSheet(trim, c, 'front').zones.map((z) => z.name)).toEqual(['pastedown', 'flyleaf', 'hinge']);
    expect(endpaperSheet(trim, c, 'back').zones.map((z) => z.name)).toEqual(['flyleaf', 'pastedown', 'hinge']);
    expect(endpaperSheet(trim, c, 'front', true).zones.map((z) => z.name)).toEqual(['flyleaf', 'pastedown', 'hinge']);
    const e = endpaperSheet(trim, c, 'front');
    expect(e.width).toBeCloseTo(300 + 2 * c.endpaperBleed, 6);
  });
});

describe('versionSheets', () => {
  const runs = [{ pages: 250, grammage: 90, bulk: 1.25 }];

  it('makes a paperback and a hardcover of the same block', () => {
    const paper = versionSheets({ id: 'r', name: 'Rústica', binding: 'perfect', isbn: '978-0-306-40615-7', flaps: true }, trim, runs);
    const hard = versionSheets({ id: 'c', name: 'Cartoné', binding: 'case-flat', flaps: true }, trim, runs);
    if (!('cover' in paper) || !('cover' in hard)) throw new Error('profile not found');
    expect(paper.cover.kind).toBe('softcover');
    expect(paper.isbn13).toBe('9780306406157');
    expect(paper.endpapers).toBeUndefined();
    expect(hard.cover.kind).toBe('case');
    expect(hard.jacket?.kind).toBe('jacket');
    expect(hard.endpapers?.front.kind).toBe('endpaper');
    expect(hard.spine.caseSpine).toBeGreaterThan(hard.spine.used);
    expect(paper.warnings).toContainEqual({ kind: 'signatureBlanks', blanks: 6 });
  });

  it('uses the spine the printer gives, and says so', () => {
    const v = versionSheets({ id: 'r', name: 'R', binding: 'perfect', spineOverride: 17 }, trim, runs);
    if (!('cover' in v)) throw new Error('profile not found');
    expect(zone(v.cover, 'spine').rect.width).toBe(17);
    expect(v.warnings.find((w) => w.kind === 'spineOverridden')).toMatchObject({ used: 17 });
  });

  it('warns of a bad ISBN and of a missing profile', () => {
    const v = versionSheets({ id: 'r', name: 'R', binding: 'perfect', isbn: '978-0-306-40615-8' }, trim, runs);
    expect(v.warnings).toContainEqual({ kind: 'isbnInvalid', isbn: '978-0-306-40615-8', error: 'checksum' });
    expect(versionSheets({ id: 'r', name: 'R', binding: 'nope' }, trim, runs)).toEqual({
      warnings: [{ kind: 'bindingProfileMissing', profile: 'nope' }],
    });
  });
});

describe('isbnBarcodeSvg', () => {
  it('escapes the font name', () => {
    const svg = isbnBarcodeSvg('978-0-306-40615-7', { fontFamily: 'Bodoni & Co "Pro"><x>' })!.svg;
    expect(svg).toContain('font-family="Bodoni &amp; Co &quot;Pro&quot;&gt;&lt;x&gt;"');
    expect(svg).not.toContain('<x>');
  });

  it('measures 37.29 mm across the symbol and its quiet zones at 100 %', () => {
    expect(isbnBarcodeSvg('9780306406157')!.width).toBeCloseTo(113 * 0.33, 3);
    expect(isbnBarcodeSvg('9780306406157', { magnification: 0.5 })!.width).toBeCloseTo(113 * 0.33 * 0.8, 3);
    expect(isbnBarcodeSvg('978')).toBeUndefined();
  });
});

describe('promoSheet', () => {
  it('lays the front cover out in a screen format, a zone of its own, without bleed', () => {
    const sheet = promoSheet(trim, 'epub', 5);
    expect(sheet.width).toBe(150);
    expect(sheet.height).toBeCloseTo(240, 6);
    expect(sheet.zones.map((z) => z.name)).toEqual(['front']);
    expect(promoSheet(trim, 'square', 5).height).toBe(150);
    expect(PROMO_FORMATS.story).toEqual({ width: 1080, height: 1920 });
  });
});
