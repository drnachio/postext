import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile } from 'node:fs';
import { buildDocument } from '../../pipeline/index.js';
import { placedImageResolutions, preflightDocument, type PreflightIssue } from '../../checks/preflight.js';
import { resolvePrintConfig } from '../../defaults/output/print.js';
import { outputTransform, parseIccProfile } from '../../color/index.js';
import type { PostextConfig, Resource } from '../../types.js';

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
const mm = (value: number) => ({ value, unit: 'mm' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const readFileSync = readFile as (path: URL) => Uint8Array;
const fogra39 = outputTransform(parseIccProfile(readFileSync(new URL('../../../icc/fogra39.icc', import.meta.url))));

function config(extra: PostextConfig = {}): PostextConfig {
  return {
    page: { width: mm(150), height: mm(200), dpi: 300, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
    layout: { layoutType: 'single' },
    header: { elements: [] },
    footer: { elements: [] },
    ...extra,
  };
}

/** A 600 × 400 px picture. Set at its own pixels, a bitmap prints at the
 *  layout's px per inch (`page.dpi`): 150 ppi on a 150 dpi page. */
const picture: Resource = {
  id: 'pic',
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'pic.jpg', format: 'jpeg', width: 600, height: 400 },
  placement: { position: 'here' },
};

const kinds = (issues: PreflightIssue[]) => issues.map((i) => i.kind);

describe('preflightDocument', () => {
  it('reports a picture under the resolution thresholds, critical below the critical one', () => {
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="pic"}', resources: [picture] }, config({
      page: { width: mm(150), height: mm(200), dpi: 150, margins: { top: mm(15), bottom: mm(15), left: mm(15), right: mm(15) } },
    }));
    const low = preflightDocument(doc).find((i) => i.kind === 'lowImageResolution');
    expect(low).toBeDefined();
    expect(low!.severity).toBe('warning');
    if (low!.kind === 'lowImageResolution') expect(low!.ppi).toBe(150);
    const critical = preflightDocument(doc, { print: resolvePrintConfig({ preflight: { criticalImageResolution: 200 } }) });
    expect(critical.find((i) => i.kind === 'lowImageResolution')!.severity).toBe('critical');
    expect(preflightDocument(doc, { print: resolvePrintConfig({ preflight: { minImageResolution: 120 } }) }).some((i) => i.kind === 'lowImageResolution')).toBe(false);
    // At 300 dpi the same picture prints at 300 ppi.
    const sharp = buildDocument({ markdown: '::resource{id="pic"}', resources: [picture] }, config());
    expect(kinds(preflightDocument(sharp))).not.toContain('lowImageResolution');
  });

  it("works the resolution out from the file's real pixels when the host knows them (#631)", () => {
    const doc = buildDocument({ markdown: '::resource{id="pic"}', resources: [picture] }, config());
    // Declared 600 × 400, printed at 300 ppi; the file has half the pixels.
    const imageSize = (id: string) => (id === 'pic.jpg' ? { width: 300, height: 200 } : undefined);
    const issues = preflightDocument(doc, { imageSize });
    const low = issues.find((i) => i.kind === 'lowImageResolution');
    expect(low?.kind === 'lowImageResolution' && low.ppi).toBe(150);
    const mismatch = issues.filter((i) => i.kind === 'declaredPixelsMismatch');
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]!.severity).toBe('warning');
    if (mismatch[0]!.kind === 'declaredPixelsMismatch') {
      expect(mismatch[0]!.declared).toEqual({ width: 600, height: 400 });
      expect(mismatch[0]!.actual).toEqual({ width: 300, height: 200 });
      expect(mismatch[0]!.resourceId).toBe('pic');
    }
    // A pixel off is rounding, not a mismatch.
    expect(kinds(preflightDocument(doc, { imageSize: () => ({ width: 601, height: 400 }) }))).not.toContain('declaredPixelsMismatch');
    // A file with more pixels than declared is a note.
    expect(preflightDocument(doc, { imageSize: () => ({ width: 1200, height: 800 }) }).find((i) => i.kind === 'declaredPixelsMismatch')?.severity).toBe('info');
  });

  it('placedImageResolutions lists every placed bitmap with its ppi, preflight on or off (#631)', () => {
    const doc = buildDocument({ markdown: '::resource{id="pic"}', resources: [{ ...picture, bitmap: { ...picture.bitmap!, resolution: 600 } }] }, config());
    const placed = placedImageResolutions(doc);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.resourceId).toBe('pic');
    expect(placed[0]!.ppi).toBeCloseTo(600, 6);
    const off = buildDocument({ markdown: '::resource{id="pic"}', resources: [picture] }, config({ print: { preflight: { enabled: false } } }));
    expect(placedImageResolutions(off)[0]!.ppi).toBeCloseTo(300, 6);
  });

  it('flags RGB pictures in a CMYK job only', () => {
    const doc = buildDocument({ markdown: '::resource{id="pic"}', resources: [picture] }, config());
    const imageColor = () => 'rgb' as const;
    expect(kinds(preflightDocument(doc, { imageColor }))).not.toContain('rgbImage');
    const x4 = preflightDocument(doc, { imageColor, print: resolvePrintConfig({ standard: 'pdfx4', convertImages: false }) });
    expect(x4.find((i) => i.kind === 'rgbImage')?.severity).toBe('warning');
  });

  it('flags small text set in more than one ink, not small black text', () => {
    const colored = buildDocument({ markdown: 'Small blue text.' }, config({ bodyText: { fontSize: pt(7), color: hex('#2060c0') } }));
    const issue = preflightDocument(colored, { transform: fogra39 }).find((i) => i.kind === 'smallProcessText');
    expect(issue).toBeDefined();
    if (issue?.kind === 'smallProcessText') expect(issue.inks).toBeGreaterThan(1);
    const black = buildDocument({ markdown: 'Small black text.' }, config({ bodyText: { fontSize: pt(7), color: hex('#000000') } }));
    expect(kinds(preflightDocument(black, { transform: fogra39 }))).not.toContain('smallProcessText');
  });

  it('flags hairline rules', () => {
    const doc = buildDocument({ markdown: 'Text.' }, config({
      header: { elements: [{ kind: 'rule', id: 'r', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(50) } }, thickness: pt(0.1), color: hex('#000000') } as never] },
    }));
    const rule = preflightDocument(doc).find((i) => i.kind === 'thinRule');
    expect(rule).toBeDefined();
    if (rule?.kind === 'thinRule') expect(rule.widthPt).toBeCloseTo(0.1, 1);
  });

  it('flags text in the safe zone and boxes stopping just short of the trim', () => {
    const doc = buildDocument({ markdown: 'Text close to the edge.' }, config({
      page: { width: mm(150), height: mm(200), dpi: 300, margins: { top: mm(2), bottom: mm(15), left: mm(15), right: mm(15) } },
      header: {
        elements: [{ kind: 'box', id: 'b', placement: { anchor: { to: 'page', edge: 'top-left' }, offset: { x: mm(1), y: mm(30) }, size: { width: mm(40), height: mm(20) } }, style: { backgroundColor: hex('#336699') } } as never],
      },
    }));
    const issues = preflightDocument(doc);
    expect(kinds(issues)).toContain('safeZone');
    const near = issues.find((i) => i.kind === 'nearTrim');
    expect(near).toBeDefined();
    if (near?.kind === 'nearTrim') expect(near.edge).toBe('left');
  });

  it('checks authored CMYK colours against the ink limit', () => {
    const doc = buildDocument({ markdown: 'Heavy ink.' }, config({
      bodyText: { color: { hex: '#101010', model: 'cmyk', cmyk: { c: 90, m: 90, y: 90, k: 100 } } },
    }));
    const issue = preflightDocument(doc, { cmyk: true }).find((i) => i.kind === 'inkLimit');
    expect(issue).toBeDefined();
    if (issue?.kind === 'inkLimit') expect(issue.coverage).toBe(370);
  });

  it('counts a spot colour as one ink, keeps it off the ink limit and lists the spot inks of the job', () => {
    const pantone = { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } };
    const doc = buildDocument({ markdown: 'Small spot text.' }, config({
      bodyText: { fontSize: pt(7), color: { hex: '#1f3f99', model: 'spot', spot: pantone } },
      // Defined, never painted: not one of the job's inks.
      colorPalette: [{ id: 'gold', name: 'Gold', value: { hex: '#b08d3c', model: 'spot', spot: { name: 'PANTONE 871 C', cmyk: { c: 20, m: 30, y: 70, k: 15 } } } }],
    }));
    const issues = preflightDocument(doc, { transform: fogra39, cmyk: true });
    expect(kinds(issues)).not.toContain('smallProcessText');
    expect(kinds(issues)).not.toContain('inkLimit');
    const inks = issues.find((i) => i.kind === 'spotInks');
    expect(inks?.severity).toBe('info');
    if (inks?.kind === 'spotInks') expect(inks.inks).toEqual(['PANTONE 286 C']);
    // An RGB render has no plates to list.
    expect(kinds(preflightDocument(doc, { transform: fogra39, cmyk: false }))).not.toContain('spotInks');
  });

  it('warns about one ink defined twice with different values', () => {
    const doc = buildDocument({ markdown: 'Text.' }, config({
      bodyText: { color: { hex: '#1f3f99', model: 'spot', spot: { name: 'Brand', cmyk: { c: 100, m: 66, y: 0, k: 2 } } } },
      header: {
        elements: [{ kind: 'box', id: 'b', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(40), height: mm(20) } }, style: { backgroundColor: { hex: '#2040a0', model: 'spot', spot: { name: 'Brand', cmyk: { c: 100, m: 60, y: 0, k: 0 } } } } } as never],
      },
    }));
    const issue = preflightDocument(doc, { cmyk: true }).find((i) => i.kind === 'spotInkConflict');
    expect(issue).toBeDefined();
    if (issue?.kind === 'spotInkConflict') expect(issue.ink).toBe('Brand');
  });

  it('lists the inks under the names the ink table gives them, and warns about plate names a PDF cannot carry', () => {
    const box = (id: string, edge: string, color: unknown) => ({ kind: 'box', id, placement: { anchor: { to: 'container', edge }, size: { width: mm(40), height: mm(10) } }, style: { backgroundColor: color } }) as never;
    const doc = buildDocument({ markdown: 'Text.' }, config({
      bodyText: { color: { hex: '#1f3f99', model: 'spot', spot: { name: 'Azul corporativo', cmyk: { c: 100, m: 66, y: 0, k: 2 } } } },
      header: {
        elements: [
          box('a', 'top-left', { hex: '#e4002b', model: 'spot', spot: { name: 'PANTONE 185 C', cmyk: { c: 0, m: 100, y: 80, k: 0 } } }),
          box('b', 'top-right', { hex: '#e4002c', model: 'spot', spot: { name: 'pantone  185 c', cmyk: { c: 0, m: 100, y: 80, k: 0 } } }),
          box('c', 'bottom-left', { hex: '#f4f4ee', model: 'spot', spot: { name: 'None', cmyk: { c: 0, m: 0, y: 10, k: 0 } } }),
        ],
      },
      print: { inks: [{ name: 'Azul corporativo', pdfName: 'PANTONE 286 C' }] },
    }));
    const issues = preflightDocument(doc, { cmyk: true });
    const inks = issues.find((i) => i.kind === 'spotInks');
    if (inks?.kind === 'spotInks') expect([...inks.inks].sort()).toEqual(['None', 'PANTONE 185 C', 'PANTONE 286 C', 'pantone  185 c']);
    const name = issues.find((i) => i.kind === 'spotInkName');
    expect(name).toMatchObject({ ink: 'None', problem: 'reserved', severity: 'warning' });
    const similar = issues.find((i) => i.kind === 'spotInkSimilar');
    expect(similar).toMatchObject({ inks: ['PANTONE 185 C', 'pantone  185 c'] });
  });

  it('drops the similar-names warning once an alias merges them, and an ink sent to process is no plate', () => {
    const doc = buildDocument({ markdown: 'Text.' }, config({
      bodyText: { color: { hex: '#e4002b', model: 'spot', spot: { name: 'PANTONE 185 C', cmyk: { c: 0, m: 100, y: 80, k: 0 } } } },
      header: {
        elements: [
          { kind: 'box', id: 'b', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: mm(40), height: mm(10) } }, style: { backgroundColor: { hex: '#e4002c', model: 'spot', spot: { name: 'Pantone 185C', cmyk: { c: 0, m: 100, y: 80, k: 0 } } } } } as never,
          { kind: 'box', id: 'v', placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: mm(40), height: mm(10) } }, style: { backgroundColor: { hex: '#f4f4ee', model: 'spot', spot: { name: 'Varnish', cmyk: { c: 0, m: 0, y: 10, k: 0 } } } } } as never,
        ],
      },
      print: { inks: [{ name: 'PANTONE 185 C', aliases: ['Pantone 185C'] }, { name: 'varnish', output: 'process' }] },
    }));
    const issues = preflightDocument(doc, { cmyk: true });
    expect(kinds(issues)).not.toContain('spotInkSimilar');
    const inks = issues.find((i) => i.kind === 'spotInks');
    if (inks?.kind === 'spotInks') expect(inks.inks).toEqual(['PANTONE 185 C']);
  });

  it('lists an ink an SVG names with the job\'s inks, and warns when no colour defines it', () => {
    const svgFig = { id: 'dia', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0, svg: { fileId: 'dia.svg', width: 100, height: 60 }, placement: { position: 'here' } } as Resource;
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="dia"}', resources: [svgFig] }, config({
      bodyText: { color: { hex: '#1f3f99', model: 'spot', spot: { name: 'PANTONE 286 C', cmyk: { c: 100, m: 66, y: 0, k: 2 } } } },
      print: { inks: [{ name: 'Gold', cmyk: { c: 20, m: 30, y: 70, k: 15 } }] },
    }));
    const svgInks = (id: string) => (id === 'dia.svg' ? ['pantone 286 c', 'PANTONE 185 C', 'Gold', 'None'] : undefined);
    const issues = preflightDocument(doc, { cmyk: true, svgInks });
    const inks = issues.find((i) => i.kind === 'spotInks');
    // The palette's ink by its own name; the others as the SVG names them.
    if (inks?.kind === 'spotInks') expect(inks.inks).toEqual(['PANTONE 286 C', 'PANTONE 185 C', 'Gold', 'None']);
    const undefinedInks = issues.filter((i) => i.kind === 'spotInkUndefined').map((i) => (i.kind === 'spotInkUndefined' ? i.ink : ''));
    // Gold has its CMYK in the ink table: defined.
    expect(undefinedInks).toEqual(['PANTONE 185 C', 'None']);
    expect(issues.find((i) => i.kind === 'spotInkUndefined')).toMatchObject({ fileId: 'dia.svg', resourceId: 'dia', severity: 'warning' });
    expect(issues.find((i) => i.kind === 'spotInkName')).toMatchObject({ ink: 'None', problem: 'reserved', written: 'None ink' });
    // Without the SVG's inks read, nothing about them.
    expect(kinds(preflightDocument(doc, { cmyk: true }))).not.toContain('spotInkUndefined');
  });

  it('does nothing when disabled', () => {
    const doc = buildDocument({ markdown: '::resource{id="pic"}', resources: [picture] }, config());
    expect(preflightDocument(doc, { print: resolvePrintConfig({ preflight: { enabled: false } }) })).toEqual([]);
  });
});
