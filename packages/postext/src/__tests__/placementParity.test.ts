import { describe, it, expect } from 'vitest';
import {
  enforcePageParity,
  createPageWithColumns,
  type PlacementCursor,
} from '../pipeline/placement';
import { resolveAllConfig } from '../pipeline/config';
import { createVDTDocument, type VDTDocument, type ResolvedConfig } from '../vdt';

function makeDoc(): { doc: VDTDocument; resolved: ResolvedConfig; contentArea: { x: number; y: number; width: number; height: number } } {
  const resolved = resolveAllConfig();
  const doc = createVDTDocument(resolved, 12);
  const pageWidthPx = 500;
  const pageHeightPx = 700;
  const contentArea = { x: 40, y: 40, width: pageWidthPx - 80, height: pageHeightPx - 80 };
  const first = createPageWithColumns(0, resolved, contentArea, pageWidthPx, pageHeightPx);
  doc.pages.push(first);
  return { doc, resolved, contentArea };
}

describe('enforcePageParity — document start exception', () => {
  it('skips parity enforcement when the first page is still empty', () => {
    const { doc, resolved, contentArea } = makeDoc();
    const cursor: PlacementCursor = { pageIndex: 0, columnIndex: 0 };
    // Even though page 1 is odd, the user asked for "always-odd" — which
    // normally would insert a mandatory blank separator. At document
    // start we skip the whole thing.
    enforcePageParity(doc, cursor, resolved, contentArea, 500, 700, 'always-odd');
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]!.blankForForce).toBeFalsy();
    expect(doc.pages[0]!.blankForParity).toBeFalsy();
    expect(cursor.pageIndex).toBe(0);
  });

  it('skips `even` parity padding when document is still empty on page 0', () => {
    const { doc, resolved, contentArea } = makeDoc();
    const cursor: PlacementCursor = { pageIndex: 0, columnIndex: 0 };
    // Page 0 is odd. Without the guard, `even` parity would insert a blank.
    enforcePageParity(doc, cursor, resolved, contentArea, 500, 700, 'even');
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0]!.blankForParity).toBeFalsy();
  });

  it('enforces parity normally once the first page has content', () => {
    const { doc, resolved, contentArea } = makeDoc();
    // Simulate a block already placed on page 0.
    doc.pages[0]!.columns[0]!.blocks.push({
      id: 'dummy',
      type: 'paragraph',
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      lines: [],
      pageIndex: 0,
      columnIndex: 0,
      dirty: false,
      snappedToGrid: false,
      fontString: '',
      color: '',
      textAlign: 'left',
    });
    const cursor: PlacementCursor = { pageIndex: 0, columnIndex: 0 };
    // Page 1 is odd, so `even` parity must pad with a blank → advance to page 2.
    enforcePageParity(doc, cursor, resolved, contentArea, 500, 700, 'even');
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[0]!.blankForParity).toBe(true);
    expect(cursor.pageIndex).toBe(1);
  });
});
