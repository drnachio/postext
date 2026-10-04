// Real laid-out documents for the reflowable tests, built in node: the
// engine measures text through an OffscreenCanvas, stubbed here with a
// fixed advance per character (half an em), so line breaks are stable
// without a font file.

import { buildDocument, continuationAfter } from 'postext';
import type { LayoutContinuation, PostextConfig, Resource, VDTDocument } from 'postext';

class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number; fontBoundingBoxAscent: number; fontBoundingBoxDescent: number } {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 16);
    return {
      width: [...s].length * size * 0.5,
      actualBoundingBoxAscent: size * 0.7,
      actualBoundingBoxDescent: size * 0.2,
      fontBoundingBoxAscent: size * 0.8,
      fontBoundingBoxDescent: size * 0.2,
    };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

export const pt = (value: number) => ({ value, unit: 'pt' as const });

export const baseConfig: PostextConfig = {
  page: { width: pt(360), height: pt(480), margins: { top: pt(24), bottom: pt(24), left: pt(24), right: pt(24) } },
  locale: 'en-us',
};

/** Lay out `markdown` as one document. */
export function layOut(markdown: string, config: PostextConfig = baseConfig, resources: Resource[] = [], title = 'Sample book'): VDTDocument {
  return buildDocument({ markdown, metadata: { title, author: 'Ada' }, resources }, config);
}

/** Lay out chapters as a book chain: each after the pages and counters of
 *  the ones before it, as the PDF tab does. */
export function layOutBook(chapters: string[], config: PostextConfig = baseConfig, resources: Resource[] = []): VDTDocument[] {
  const docs: VDTDocument[] = [];
  let offset = 0;
  let inherited: LayoutContinuation | undefined;
  for (const markdown of chapters) {
    const continuation: LayoutContinuation | undefined = inherited ? { ...inherited, pageIndexOffset: offset } : undefined;
    const doc = buildDocument({ markdown, metadata: { title: 'Sample book', author: 'Ada' }, resources, ...(continuation ? { continuation } : {}) }, config);
    docs.push(doc);
    offset += doc.pages.length;
    const last = doc.pages[doc.pages.length - 1];
    inherited = {
      ...continuationAfter({ markdown, resources }, config, inherited),
      ...(last ? { pageNumbering: { format: last.pageNumberFormat, startAt: last.pageNumberValue + 1 } } : {}),
    };
  }
  return docs;
}

// 1×1 PNG.
export const PNG = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
));
