import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource, VDTDocument } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { cjkLineText, readText } from '../pdf-backend/primitives';

// Kanbun marks (#430) in the PDF: painted with their character, the line's
// /ActualText reading the 送り仮名 after it (學ビテ) and leaving the 返り点
// out; the 竪点 a stroked rule.

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

function actualTexts(c: string): string[] {
  return [...c.matchAll(/\/ActualText\s*<FEFF([0-9A-Fa-f]*)>/g)].map((m) => {
    const units = m[1]!.match(/.{4}/g) ?? [];
    return String.fromCharCode(...units.map((h) => parseInt(h, 16)));
  });
}

const MD = '子曰、:kunten[學]{okuri="ビテ"}而:kunten[時]{okuri="ニ"}:kunten[習]{kaeri="レ" okuri="フ"}:kunten[之]{okuri="ヲ"}、:kunten[敬]{tate kaeri="二"}祭';

describe('kanbun marks in the PDF', () => {
  it('a line reads its 送り仮名 after their characters, not its 返り点', () => {
    expect(readText({ text: '學', kunten: { okuri: 'ビテ' } })).toBe('學ビテ');
    expect(readText({ text: '不' })).toBe('不');
    // A line whose only composer field is a mark still reads as a whole.
    expect(cjkLineText([{ text: '不' }, { text: '學', kunten: {} }])).toBe('不學');
  });

  for (const [mode, extra] of [['horizontal', {}], ['vertical', { layout: { layoutType: 'single' as const, writingMode: 'vertical-rl' as const } }]] as const) {
    it(`${mode}: /ActualText and the 竪点`, async () => {
      const c = await content(buildDocument({ markdown: MD }, config(extra)));
      expect(actualTexts(c)).toContain('子曰、學ビテ而時ニ習フ之ヲ、敬祭');
      // The 竪点: a stroked rule 1.2 px thick.
      expect(c).toMatch(/1\.2 w\b[\s\S]*?\bS\b/);
    });
  }

  it('a table cell reads its 送り仮名 too', async () => {
    const table: Resource = {
      id: 'tab', typeId: 'table', kind: 'table', createdAt: 0, updatedAt: 0,
      table: { model: { rows: [[{ content: ':kunten[習]{kaeri="レ" okuri="フ"}:kunten[之]{okuri="ヲ"}' }]] } },
    };
    const c = await content(buildDocument({ markdown: '表 :ref{id="tab"}。', resources: [table] }, config({ tableStyle: { bodyFontFamily: 'Lora', bodyFontSize: pt(20) } })));
    expect(actualTexts(c)).toContain('習フ之ヲ');
  });
});
