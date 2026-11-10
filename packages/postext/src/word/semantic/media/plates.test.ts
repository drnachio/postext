// A width given as a length and a full-page plate in the semantic .docx
// (#1461): the picture set that wide, the plate alone on a page of its
// own, and an unedited export reading back into the same Markdown.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, Resource } from '../../../types.js';
import { applyDocxEdits } from '../../roundtrip/index.js';
import { exportDocx, exportProblems } from '../fixtures/harness.js';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const at = { createdAt: 0, updatedAt: 0 };
const pic = (id: string, placement: Resource['placement']): Resource => ({
  id, typeId: 'figure', kind: 'bitmap', caption: `Figure ${id}`, ...at, placement,
  bitmap: { fileId: 'f1', format: 'png', width: 4000, height: 3000 },
});
const bytes = (id: string): Uint8Array | undefined => (id === 'f1' ? PNG : undefined);
const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = {
  page: { width: mm(170), height: mm(240), margins: { top: mm(20), bottom: mm(20), left: mm(12), right: mm(12) } },
  layout: { layoutType: 'double', gutterWidth: mm(6) },
} as PostextConfig;

/** The width of the picture drawn for `id`, mm (from its extent, EMU). */
function extentMm(doc: string, id: string): number {
  const at = doc.indexOf(`ptx:figure:${id}`);
  const m = /<wp:extent cx="(\d+)"/.exec(doc.slice(at));
  return Number(m![1]) / 36000;
}

/** Whether the paragraph next to the figure `id` (before or after it)
 *  breaks to a new page. */
function breakBeside(doc: string, id: string, side: 'before' | 'after'): boolean {
  const start = doc.lastIndexOf('<w:sdt>', doc.indexOf(`ptx:figure:${id}`));
  const end = doc.indexOf('</w:sdt>', start) + '</w:sdt>'.length;
  const para = side === 'before' ? doc.slice(doc.lastIndexOf('<w:p>', start), start) : doc.slice(end, doc.indexOf('</w:p>', end));
  return para.includes('<w:pageBreakBefore/>');
}

describe('semantic docx: widths as lengths and full-page plates', () => {
  it('sets a picture as wide as its length, never wider than its column', async () => {
    const md = 'See :ref{id="a"} and :ref{id="b"}.\n';
    const e = await exportDocx(md, { config, resources: [pic('a', { width: mm(40) }), pic('b', { width: mm(300) })], resourceBytes: bytes });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(extentMm(e.doc, 'a')).toBeCloseTo(40, 0);
    // The column is 70 mm wide.
    expect(extentMm(e.doc, 'b')).toBeCloseTo(70, 0);
  });

  it('sets a plate as wide as the text area, on a page of its own', async () => {
    const md = 'See :ref{id="p"}.\n\nThe text runs on.\n';
    const e = await exportDocx(md, { config, resources: [pic('p', { plate: true })], resourceBytes: bytes });
    expect(exportProblems(e, [md])).toEqual([]);
    expect(extentMm(e.doc, 'p')).toBeCloseTo(146, 0);
    expect(breakBeside(e.doc, 'p', 'before')).toBe(true);
    expect(breakBeside(e.doc, 'p', 'after')).toBe(true);
    const same = applyDocxEdits(e.bytes, { chapters: [{ id: 'ch1', markdown: md }], resources: [pic('p', { plate: true })] });
    expect(same.edits).toEqual([]);
    expect(same.chapters[0]!.markdown).toBe(md);
  });
});
