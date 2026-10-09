import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile } from 'node:fs';
import { buildDocument } from '../pipeline';
import { placedImageResolutions, preflightDocument, type PreflightIssue } from '../preflight';
import { resolvePrintConfig } from '../defaults/print';
import { outputTransform, parseIccProfile } from '../color';
import type { PostextConfig, Resource } from '../types';

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
const fogra39 = outputTransform(parseIccProfile(readFileSync(new URL('../../icc/fogra39.icc', import.meta.url))));

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

  it('does nothing when disabled', () => {
    const doc = buildDocument({ markdown: '::resource{id="pic"}', resources: [picture] }, config());
    expect(preflightDocument(doc, { print: resolvePrintConfig({ preflight: { enabled: false } }) })).toEqual([]);
  });
});
