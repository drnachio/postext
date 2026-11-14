// Special inks and die-cuts through InDesign and back (#1576): a book
// with a foil, a varnish, holes through several leaves and rounded
// corners is exported as IDML and imported again, and comes back with the
// same finishes in `print.inks` and the same `dieCuts`. The same package
// with its labels taken out (as another tool would write it) still gives
// the inks and the die-cuts, read from the names and the paths.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { DieCutsConfig, DieShape, PostextConfig } from 'postext';
import { build, config, LOREM, mm } from '../../testing/kit.test-helper.js';
import { idmlDocument, idmlToPostext } from '../../index.js';
import { descendants, parseXml, type XmlElement } from '../../xml/read.js';

const GOLD = { hex: '#c9a64b', model: 'spot', spot: { name: 'Gold foil', cmyk: { c: 0, m: 20, y: 60, k: 20 } } };
const VARNISH = { hex: '#f4f4f4', model: 'spot', spot: { name: 'Spot varnish', cmyk: { c: 0, m: 0, y: 0, k: 5 } } };

const DIE_CUTS: DieCutsConfig = {
  shapes: [
    { id: 'window', name: 'Window', shape: 'circle', x: mm(40), y: mm(60), width: mm(30), height: mm(30), leaves: 3 },
    { id: 'slot', shape: 'roundRect', x: mm(20), y: mm(150), width: mm(50), height: mm(12), radius: mm(4) },
    // A right triangle placed on a verso: its recto side is mirrored.
    { id: 'notch', shape: 'path', d: 'M0 0 L1 0 L0 1 Z', x: mm(80), y: mm(20), width: mm(20), height: mm(20), wrap: false },
  ],
  pages: [
    { pages: '3', die: 'window' },
    { pages: '1,5', die: 'slot' },
    { pages: '4', die: 'notch' },
  ],
  corners: { radius: mm(5) },
};

const INKS = [
  { name: 'Gold foil', finish: { kind: 'foil', sheen: 'matte' } },
  { name: 'Spot varnish', finish: { kind: 'varnish' } },
];

const CFG = config({
  page: { dpi: 72, width: mm(140), height: mm(200), margins: { top: mm(15), bottom: mm(20), left: mm(18), right: mm(12), mirror: true } },
  colorPalette: [
    { id: 'gold', name: 'Gold', value: GOLD },
    { id: 'gloss', name: 'Gloss', value: VARNISH },
  ],
  bodyText: { textAlign: 'justify', firstLineIndent: mm(0), hyphenation: { enabled: true }, color: { ...GOLD, paletteId: 'gold' } },
  footer: {
    elements: [{ kind: 'box', id: 'gloss', style: { backgroundColor: { ...VARNISH, paletteId: 'gloss' } }, placement: { anchor: { to: 'page', edge: 'bottom-left' }, size: { width: 'fill', height: mm(8) } } }],
  },
  print: { inks: INKS },
  dieCuts: DIE_CUTS,
} as unknown as Partial<PostextConfig>);

const MD = `${Array(40).fill(LOREM).join('\n\n')}\n`;

const byId = (shapes: readonly DieShape[] | undefined) => [...(shapes ?? [])].sort((a, b) => a.id.localeCompare(b.id));
const placements = (c: DieCutsConfig | undefined) => [...(c?.pages ?? [])].sort((a, b) => a.die.localeCompare(b.die));
const attr = (el: XmlElement, name: string) => el.attrs[name];

/** The package with every part passed through `edit`. */
function rewrite(bytes: Uint8Array, edit: (path: string, xml: string) => string): Uint8Array {
  const parts = unzipSync(bytes);
  const z: Zippable = {};
  for (const [path, data] of Object.entries(parts)) z[path] = path.endsWith('.xml') ? strToU8(edit(path, strFromU8(data))) : data;
  return zipSync(z);
}

describe('special inks and die-cuts: export', () => {
  const doc = build(MD, CFG);
  const { bytes } = idmlDocument({ docs: [doc], title: 'Inks' });
  const parts = unzipSync(bytes);
  const xml = (path: string) => parseXml(strFromU8(parts[path]!));
  const spreads = Object.keys(parts).filter((k) => k.startsWith('Spreads/') || k.startsWith('MasterSpreads/')).map(xml);

  it('lays out a book the dies cut', () => {
    expect(doc.pages.length).toBeGreaterThanOrEqual(8);
    expect(doc.pages.filter((p) => p.dieCut?.holes.length).length).toBeGreaterThan(4);
  });

  it('writes each ink as a spot swatch with its finish and an ink of the right type', () => {
    const graphic = xml('Resources/Graphic.xml');
    const colour = (name: string) => descendants(graphic, 'Color').find((c) => attr(c, 'Name') === name)!;
    const label = (el: XmlElement) => Object.fromEntries(descendants(el, 'KeyValuePair').map((p) => [attr(p, 'Key'), attr(p, 'Value')]));
    expect(attr(colour('Gold foil'), 'Model')).toBe('Spot');
    expect(attr(colour('Gold foil'), 'ColorValue')).toBe('0 20 60 20');
    expect(label(colour('Gold foil'))).toEqual({ 'postext:finish': 'foil matte' });
    expect(label(colour('Spot varnish'))).toEqual({ 'postext:finish': 'varnish' });
    expect(label(colour('Die'))).toEqual({ 'postext:dieLine': 'true' });
    const ink = (name: string) => descendants(graphic, 'Ink').find((i) => attr(i, 'Name') === name)!;
    expect(attr(ink('Gold foil'), 'InkType')).toBe('Opaque');
    expect(attr(ink('Spot varnish'), 'InkType')).toBe('Transparent');
    expect(attr(ink('Die'), 'InkType')).toBe('Transparent');
    // Transparent inks trap last.
    expect(Number(attr(ink('Die'), 'TrapOrder'))).toBeGreaterThan(Number(attr(ink('Gold foil'), 'TrapOrder')));
  });

  it('sets what the varnish paints to overprint, and what the foil paints not', () => {
    const items = spreads.flatMap((s) => descendants(s, 'Rectangle'));
    const gloss = items.filter((r) => attr(r, 'FillColor') === 'Color/Spot varnish');
    expect(gloss.length).toBeGreaterThan(0);
    for (const r of gloss) expect(attr(r, 'OverprintFill')).toBe('true');
    const stories = Object.keys(parts).filter((k) => k.startsWith('Stories/')).map(xml);
    const gold = stories.flatMap((s) => descendants(s, 'CharacterStyleRange')).filter((r) => attr(r, 'FillColor') === 'Color/Gold foil');
    const styles = descendants(xml('Resources/Styles.xml'), 'ParagraphStyle').filter((s) => attr(s, 'FillColor') === 'Color/Gold foil');
    expect(gold.length + styles.length).toBeGreaterThan(0);
    for (const r of [...gold, ...styles]) expect(attr(r, 'OverprintFill')).toBeUndefined();
  });

  it('puts the die line on a locked layer of its own, stroked with the die swatch, overprinting', () => {
    const layer = descendants(xml('designmap.xml'), 'Layer').find((l) => attr(l, 'Name') === 'Die line')!;
    expect(attr(layer, 'Locked')).toBe('true');
    expect(attr(layer, 'Printable')).toBe('true');
    const die = spreads.flatMap((s) => [...descendants(s, 'Rectangle'), ...descendants(s, 'Oval'), ...descendants(s, 'Polygon')]).filter((i) => attr(i, 'ItemLayer') === attr(layer, 'Self'));
    for (const item of die) {
      expect(attr(item, 'StrokeColor')).toBe('Color/Die');
      expect(attr(item, 'FillColor')).toBe('Swatch/None');
      expect(attr(item, 'OverprintStroke')).toBe('true');
    }
    const kinds = (name: string) => die.filter((i) => attr(i, 'Name') === name).map((i) => i.name);
    // The window through three leaves, two sides each.
    expect(kinds('Die: Window')).toEqual(Array(6).fill('Oval'));
    expect(kinds('Die: slot')).toEqual(Array(4).fill('Rectangle'));
    expect(kinds('Die: notch')).toEqual(['Polygon', 'Polygon']);
    expect(kinds('Die: corners')).toHaveLength(doc.pages.length);
  });
});

describe('special inks and die-cuts: export → import', () => {
  const doc = build(MD, CFG);
  const { bytes } = idmlDocument({ docs: [doc], title: 'Inks' });
  const result = idmlToPostext(bytes, { layout: 'pages' });

  it('gives the ink table back with its finishes', () => {
    expect(result.config.print?.inks).toEqual(INKS);
    expect(result.config.print?.dieLine).toBeUndefined();
    expect(result.report.findings.map((f) => f.id)).not.toContain('inkFinishGuessed');
  });

  it('keeps the spot colours as spot colours of their inks', () => {
    const gold = result.config.colorPalette?.find((e) => e.name === 'Gold foil');
    expect(gold?.value.model).toBe('spot');
    expect(gold?.value.spot).toEqual({ name: 'Gold foil', cmyk: { c: 0, m: 20, y: 60, k: 20 } });
    // The die line's swatch is no colour of the book.
    expect(result.config.colorPalette?.some((e) => e.name === 'Die')).toBe(false);
  });

  it('gives the die-cuts back: shapes, placements and corners', () => {
    const cuts = result.config.dieCuts;
    expect(byId(cuts?.shapes)).toEqual(byId(DIE_CUTS.shapes));
    expect(placements(cuts)).toEqual(placements(DIE_CUTS));
    expect(cuts?.corners).toEqual(DIE_CUTS.corners);
    expect(cuts?.outline).toBeUndefined();
  });

  it('draws none of the die line as artwork', () => {
    expect(JSON.stringify(result.config.pageTemplates ?? [])).not.toMatch(/#ff00ff/i);
    expect(result.report.findings.find((f) => f.id === 'dieCuts')).toBeDefined();
  });

  it('lays the imported book out with the same holes on the same pages', () => {
    const again = build(MD, { ...CFG, dieCuts: result.config.dieCuts, print: result.config.print } as PostextConfig);
    const holes = (d: typeof doc) => d.pages.map((p) => (p.dieCut?.holes.length ?? 0) + (p.dieCut?.outline?.length ?? 0));
    expect(holes(again)).toEqual(holes(doc));
  });
});

describe('special inks and die-cuts: a package without labels', () => {
  const doc = build(MD, CFG);
  const { bytes } = idmlDocument({ docs: [doc], title: 'Inks' });
  // As another tool writes it: no script labels, the die line's swatch
  // called CutContour and its paths on the pages' own layer.
  const plain = rewrite(bytes, (_, xml) =>
    xml
      .replace(/<Properties><Label>[\s\S]*?<\/Label><\/Properties>/g, '')
      .replace(/<Label>[\s\S]*?<\/Label>/g, '')
      .replace(/Color\/Die"/g, 'Color/CutContour"')
      .replace(/Name="Die"/g, 'Name="CutContour"')
      .replace(/ItemLayer="udie"/g, 'ItemLayer="ulayer"')
      .replace(/<Layer Self="udie"[\s\S]*?<\/Layer>/, ''),
  );
  const result = idmlToPostext(plain, { layout: 'pages' });

  it('guesses each finish from the ink\'s name and says so', () => {
    expect(result.config.print?.inks).toEqual([
      { name: 'Gold foil', finish: { kind: 'foil' } },
      { name: 'Spot varnish', finish: { kind: 'varnish' } },
    ]);
    expect(result.report.findings.find((f) => f.id === 'inkFinishGuessed')?.count).toBe(2);
    expect(result.config.print?.dieLine).toEqual({ ink: 'CutContour' });
  });

  it('reads the dies from the paths the die swatch strokes', () => {
    const cuts = result.config.dieCuts!;
    const shapes = cuts.shapes!;
    expect(shapes.map((s) => s.shape).sort()).toEqual(['circle', 'path', 'roundRect']);
    const circle = shapes.find((s) => s.shape === 'circle')!;
    expect(circle).toMatchObject({ x: mm(40), y: mm(60), width: mm(30), height: mm(30), leaves: 3 });
    expect(shapes.find((s) => s.shape === 'roundRect')).toMatchObject({ x: mm(20), y: mm(150), width: mm(50), height: mm(12), radius: mm(4) });
    // The notch, placed on page 4, is read on the recto of its leaf:
    // mirrored there.
    const notch = shapes.find((s) => s.shape === 'path')!;
    expect(notch).toMatchObject({ x: mm(140 - 80 - 20), y: mm(20), width: mm(20), height: mm(20) });
    const where = Object.fromEntries(placements(cuts).map((p) => [shapes.find((s) => s.id === p.die)!.shape, p.pages]));
    expect(where).toEqual({ circle: '3', roundRect: '1,5', path: '3' });
    expect(cuts.corners).toEqual({ radius: mm(5) });
  });

  it('cuts the same holes when laid out again', () => {
    const again = build(MD, { ...CFG, dieCuts: result.config.dieCuts } as PostextConfig);
    const holes = (d: typeof doc) => d.pages.map((p) => p.dieCut?.holes.length ?? 0);
    expect(holes(again)).toEqual(holes(doc));
  });
});
