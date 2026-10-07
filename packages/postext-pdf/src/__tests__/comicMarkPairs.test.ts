import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import type { PdfFontRequest } from '../fontCache';
import { renderToPdf } from '../pdf-backend';
import { collectFontText } from '../pdf-backend/fontHelpers';

// A full-width pair of marks (！！) set in one cell of a vertical balloon is
// painted with the half-width marks (`!!`, `VerticalGlyph.paintAs`): the
// font provider must be asked for those, or a face served as several files
// (the Fontsource slices of a CJK face) never hands over the file holding
// `!` and the PDF draws .notdef (#581, Nº 150 `hana{shout}: メン！！`).

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));

class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    return { width: [...s].length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const resources: Resource[] = [{
  id: 'dojo', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
  bitmap: { fileId: 'file-dojo', format: 'png', width: 1200, height: 800 },
  anchors: [{ id: 'hana', x: 0.3, y: 0.6 }],
}];

const markdown = `:::page{split="*"}
::panel{art=dojo}
hana{shout}: メン！！
:::
`;

const config: PostextConfig = { page: { sizePreset: '17x24' }, locale: 'ja' };

const shoutFace = (fontText: Map<string, Set<number>>): Set<number> => {
  const entry = [...fontText.entries()].find(([fs, cps]) => /\b700\b|bold/.test(fs) && cps.has(0xff01));
  expect(entry, 'the shout is set in a bold face').toBeDefined();
  return entry![1];
};

describe('mark pairs in vertical balloons', () => {
  it('records the half-width marks a full-width pair is painted with', () => {
    const doc = buildDocument({ markdown, resources }, config);
    const balloon = doc.pages.find((p) => p.comic)!.comic!.balloons[0]!;
    expect(balloon.text[0]!.vertical?.region).toBe('japan');
    const cps = shoutFace(collectFontText(doc));
    expect(cps.has(0x21)).toBe(true);
  });

  it('asks the provider of the bold face for `!`', async () => {
    const doc = buildDocument({ markdown, resources }, config);
    const asked: { weight: number; codePoints: number[] }[] = [];
    const fontProvider = async (_family: string, weight: number, _style: string, request?: PdfFontRequest) => {
      asked.push({ weight, codePoints: [...(request?.codePoints ?? [])] });
      return new Uint8Array(fontBytes);
    };
    await renderToPdf(doc, { fontProvider, resourceBytes: () => undefined });
    expect(asked.some((a) => a.weight === 700 && a.codePoints.includes(0x21))).toBe(true);
  });
});
