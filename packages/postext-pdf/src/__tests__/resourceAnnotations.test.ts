import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';

// Ruby, emphasis marks, side lines and warichu notes in table cells and
// captions (#429): a reading in the RT of its base's Ruby inside the cell
// or the caption, the marks as layout artifacts, the line read as its base
// text. On a vertical page the table stands upright: its marks are drawn
// as on a horizontal page.

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
  captionStyle: { fontFamily: 'Lora', fontSize: pt(20), note: { fontSize: pt(20) } },
  tableStyle: { bodyFontFamily: 'Lora', headerFontFamily: 'Lora', bodyFontSize: pt(20), headerFontSize: pt(20) },
  ...extra,
});
const vertical = () => config({ layout: { layoutType: 'single', writingMode: 'vertical-rl' } });

/** Furigana and kenten in the cells, both in the caption, a side line in
 *  the note and a warichu note in a cell. */
const TABLE: Resource = {
  id: 'tab', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
  caption: '{振|ふ}り仮名と:dots[傍点]',
  note: ':sideline[注意]して読む',
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [{ content: '語' }, { content: '例' }],
        [{ content: '{漢字|かん|じ}' }, { content: ':dots[大切]なこと' }],
        [{ content: '本:warichu[割注]文' }, { content: '例' }],
      ],
    },
  },
};

const build = (cfg: PostextConfig): VDTDocument => buildDocument({ markdown: '表を見よ :ref{id="tab"}。', resources: [TABLE] }, cfg);

async function render(doc: VDTDocument): Promise<{ content: string; pdf: string }> {
  const bytes = await renderToPdf(doc, { fontProvider, accessible: true });
  const pdf = await PDFDocument.load(bytes);
  // The page that holds the table.
  const index = doc.pages.findIndex((p) => (p.floats ?? []).some((b) => b.resourceBlock));
  const contents = pdf.getPage(index).node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const content = refs
    .map((ref) => {
      const s = pdf.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
  const objects = pdf.context.enumerateIndirectObjects().map(([, obj]) => obj.toString()).join('\n');
  return { content, pdf: objects };
}

function actualTexts(content: string): string[] {
  return [...content.matchAll(/\/ActualText\s*<FEFF([0-9A-Fa-f]*)>/g)].map((m) => {
    const units = m[1]!.match(/.{4}/g) ?? [];
    return String.fromCharCode(...units.map((h) => parseInt(h, 16)));
  });
}

/** The layout artifacts of a page's content. */
const markArtifacts = (c: string): string => c.split('/Artifact').slice(1).filter((a) => /\/Type \/Layout/.test(a.slice(0, 40))).join('\n');

/** Each sesame's tip-to-tip vector, pt: its path opens at one tip, its
 *  first curve ends at the other, and it closes and fills. */
function sesames(c: string): { x: number; y: number }[] {
  return [...markArtifacts(c).matchAll(/(-?[\d.]+) (-?[\d.]+) m\n(?:-?[\d.]+ ){4}(-?[\d.]+) (-?[\d.]+) c\n[^\n]+ c\nh\nf\n/g)]
    .map((m) => ({ x: Number(m[3]) - Number(m[1]), y: Number(m[4]) - Number(m[2]) }));
}

describe('annotations of table cells and captions in the PDF', () => {
  it('tags readings as Ruby, notes as Warichu, and reads each line as its base', async () => {
    const { content, pdf } = await render(build(config()));
    for (const type of ['Ruby', 'RB', 'RT', 'Warichu', 'WT']) expect(pdf).toContain(`/S /${type}`);
    const texts = actualTexts(content);
    expect(texts).toContain('漢字');
    expect(texts).toContain('本（割注）文');
    expect(texts.some((t) => t.includes('かん'))).toBe(false);
  }, 60_000);

  it('draws the sesames and the side line as artifacts, the lens upright on both pages', async () => {
    const h = await render(build(config()));
    const v = await render(build(vertical()));
    const hs = sesames(h.content);
    const vs = sesames(v.content);
    // Two over 大切, two over 傍点.
    expect(hs).toHaveLength(4);
    expect(vs).toHaveLength(4);
    for (const tip of hs) {
      // From upper left to lower right, as ﹅ leans.
      expect(tip.x).toBeGreaterThan(0);
      expect(tip.y).toBeLessThan(0);
    }
    // The upright table's marks are drawn in its own frame, as on the
    // horizontal page.
    for (let i = 0; i < 4; i++) {
      expect(vs[i]!.x).toBeCloseTo(hs[i]!.x, 3);
      expect(vs[i]!.y).toBeCloseTo(hs[i]!.y, 3);
    }
    // The note's side line, stroked.
    expect(markArtifacts(h.content)).toMatch(/ m\n[^\n]+ l\nS\n/);
  }, 60_000);
});
