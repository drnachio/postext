// Shared set-up of the plate and width-length tests (#1461): a stub text
// measure, a two-column page, a paragraph filler and helpers that find a
// plate in a laid-out document.
import type { PostextConfig, Resource, VDTBlock, VDTDocument, VDTPage } from '../../../index.js';

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

export const mm = (value: number) => ({ value, unit: 'mm' as const });
/** 72 dpi: 1 mm is 72 / 25.4 px. */
export const PX = 72 / 25.4;

/** 170 × 240 mm, two columns of 70 mm with a 6 mm gutter. */
export const config: PostextConfig = {
  page: { dpi: 72, width: mm(170), height: mm(240), margins: { top: mm(20), bottom: mm(20), left: mm(12), right: mm(12) } },
  layout: { layoutType: 'double', gutterWidth: mm(6) },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Test', firstLineIndent: mm(0), hyphenation: { enabled: false } },
};

const sentence = 'The heap needs a cubic metre of mixed waste before it holds its heat.';
export const para = (n: number): string => Array.from({ length: n }, () => sentence).join(' ');

export const bitmap = (id: string, width: number, height: number, placement: Resource['placement'] = { plate: true }): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', caption: `Plate ${id}.`, createdAt: 0, updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width, height },
  placement,
});

export const svg = (id: string, width: number, height: number, placement: Resource['placement'] = { plate: true }): Resource => ({
  id, typeId: 'figure', kind: 'svg', caption: `Figure ${id}.`, createdAt: 0, updatedAt: 0,
  svg: { fileId: `${id}.svg`, width, height },
  placement,
});

/** The float block of resource `id`, with its page. */
export function floatOf(doc: VDTDocument, id: string): { page: VDTPage; block: VDTBlock } | undefined {
  for (const page of doc.pages) {
    const block = (page.floats ?? []).find((b) => b.resourceBlock?.resource.id === id);
    if (block) return { page, block };
  }
  return undefined;
}

/** Paragraph blocks set in the columns of `page`. */
export const textOn = (page: VDTPage): number =>
  page.columns.reduce((n, c) => n + c.blocks.filter((b) => b.type === 'paragraph').length, 0);

/** Whether `page` holds nothing but the plate `id` (no text, no other float). */
export function plateAlone(page: VDTPage, id: string): boolean {
  const floats = page.floats ?? [];
  return textOn(page) === 0 && floats.length === 1 && floats[0]!.resourceBlock?.resource.id === id;
}

/** The picture's height over the content area's: how much of the page a
 *  plate fills. */
export function fillOf(found: { page: VDTPage; block: VDTBlock }): number {
  const rb = found.block.resourceBlock!;
  return (rb.bodyRect.height + rb.captionLines.length * 12) / found.page.contentArea.height;
}
