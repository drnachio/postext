import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';

// The Japanese sesame (傍点) and side lines (傍線, #421) in the PDF: vector
// artifacts like the Chinese marks; the sesame stands on the sheet the same
// way on a vertical page as on a horizontal one.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);

// CJK characters 1 em, Latin ½ em, a space ¼ em, at the size the font names.
class StubCtx {
  font = '10px Test';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const em = Number(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? 10);
    let w = 0;
    for (const ch of s) w += ch === ' ' ? em / 4 : ch.codePointAt(0)! >= 0x2e80 ? em : em / 2;
    return { width: w };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (extra: Partial<PostextConfig> = {}): PostextConfig => ({
  locale: 'ja',
  page: { width: pt(440), height: pt(400), dpi: 72, margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora', fontSize: pt(20), lineHeight: pt(40), textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: false } },
  ...extra,
});

async function content(doc: VDTDocument): Promise<string> {
  const bytes = await renderToPdf(doc, { fontProvider, accessible: true });
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(0).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
}

/** The layout artifacts of a page's content (the marks). */
const markArtifacts = (c: string): string => c.split('/Artifact').slice(1).filter((a) => /\/Type \/Layout/.test(a.slice(0, 40))).join('\n');

/** The vector from one tip of the first sesame to the other, pt (the frame
 *  the marks are drawn in): its path opens at one tip and its first curve
 *  ends at the other. */
function sesameTips(c: string): { x: number; y: number } {
  const m = /(-?[\d.]+) (-?[\d.]+) m\n(?:-?[\d.]+ ){4}(-?[\d.]+) (-?[\d.]+) c\n/.exec(markArtifacts(c))!;
  return { x: Number(m[3]) - Number(m[1]), y: Number(m[4]) - Number(m[2]) };
}

describe('Japanese marks in the PDF', () => {
  it('turns the sesame back against a vertical page’s flow', async () => {
    const md = 'これは:dots[大切]なこと';
    const h = sesameTips(await content(buildDocument({ markdown: md }, config())));
    const v = sesameTips(await content(buildDocument({ markdown: md }, config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' } }))));
    // In horizontal text the lens runs from upper left to lower right.
    expect(h.x).toBeGreaterThan(0);
    expect(h.y).toBeLessThan(0);
    // Drawn in the vertical flow frame (a quarter turn clockwise onto the
    // sheet), the same lens is turned a quarter turn the other way.
    expect(v.x).toBeCloseTo(-h.y, 2);
    expect(v.y).toBeCloseTo(h.x, 2);
  }, 60_000);

  it('draws a double side line as two stroked rules and a dotted one as filled dots', async () => {
    const doc = buildDocument({ markdown: ':sideline[大切な]{style="double"}と:sideline[もの]{style="dotted"}' }, config());
    const line = doc.blocks.find((b) => b.type === 'paragraph')!.lines[0]!;
    const dotted = line.marks!.find((m) => m.kind === 'dotted')!;
    const body = markArtifacts(await content(doc));
    // The double line: two subpaths stroked once.
    expect(body).toMatch(/ m\n[^\n]+ l\n[^\n]+ m\n[^\n]+ l\nS\n/);
    // The dots: four curves each, filled once.
    const dots = Math.round((dotted.length! - dotted.size!) / dotted.gap!) + 1;
    const filled = body.split('\nf\n').find((part) => part.includes(' c\n'))!;
    expect(filled.match(/ c\n/g)!.length).toBe(dots * 4);
  }, 60_000);
});
