import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { resolveAllConfig } from '../../pipeline/config';
import { renderToHtml } from '../../html-backend';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument } from '../../vdt';
import type { CalloutStyleConfig, PostextConfig } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env).
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

// EF-29: continuation marks on the fragments of a split callout — the
// title repeated with a suffix at the head of every continuation ("HAMLET
// (CONT'D)") and a marker at the foot of every fragment that goes on
// ("(MORE)"), like a split table's `continuedSuffix` / `continuesMarker`.

const mm = (value: number) => ({ value, unit: 'mm' as const });
const SENTENCE = 'The lantern must stay lit all night to guide the ships across the bay. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();

const config = (style: Partial<CalloutStyleConfig>, locale?: PostextConfig['locale']): PostextConfig => ({
  headings: { balancing: { enabled: false } },
  page: { width: mm(120), height: mm(70), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  ...(locale ? { locale } : {}),
  calloutStyles: [{ id: 'speech', title: 'Hamlet', keepTogether: false, ...style }],
});
const items = (n: number): string[] => Array.from({ length: n }, (_, i) => `- Line ${i + 1} of the speech, spoken slowly.`);
const MD = [filler(2), '', ':::callout{type="speech"}', ...items(10), ':::', '', 'After.'].join('\n');

const build = (md: string, cfg: PostextConfig): VDTDocument => buildDocument({ markdown: md }, cfg, createMeasurementCache());
const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const overlayText = (frame: VDTBlock, needle: string): VDTDesignTextBlock | undefined =>
  frame.designOverlay?.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text' && b.lines.some((l) => l.text.includes(needle)));

describe('continuation marks on split callouts', () => {
  it('prints nothing extra by default', () => {
    const doc = build(MD, config({}));
    const parts = frames(doc);
    expect(parts.length).toBeGreaterThan(1);
    const [head, rest] = parts;
    expect(overlayText(head!, 'Continued')).toBeUndefined();
    expect(overlayText(rest!, 'Hamlet')).toBeUndefined();
  });

  it('repeats the title with the suffix and sets the marker under every fragment that goes on', () => {
    const doc = build(MD, config({
      repeatTitle: true,
      continuedSuffix: "(CONT'D)",
      continuesMarkerEnabled: true,
      continuesMarker: '(MORE)',
      continuesMarkerAlign: 'center',
      continuesMarkerItalic: false,
      titleStyle: { textTransform: 'uppercase' },
    }));
    const parts = frames(doc);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((f, i) => {
      const last = i === parts.length - 1;
      const page = doc.pages[f.pageIndex]!;
      // Every fragment still fits its page.
      expect(f.bbox.y + f.bbox.height).toBeLessThanOrEqual(page.contentArea.y + page.contentArea.height + 0.01);
      const title = overlayText(f, 'HAMLET')!;
      expect(title).toBeDefined();
      if (i === 0) {
        expect(title.lines.map((l) => l.text).join(' ')).toBe('HAMLET');
        expect(title.artifact).toBeUndefined();
      } else {
        expect(title.lines.map((l) => l.text).join(' ')).toBe("HAMLET (CONT'D)");
        expect(title.artifact).toBe(true);
      }
      const marker = overlayText(f, '(MORE)');
      if (last) {
        expect(marker).toBeUndefined();
        return;
      }
      expect(marker).toBeDefined();
      expect(marker!.artifact).toBe(true);
      expect(marker!.fontString.startsWith('italic')).toBe(false);
      // Centred in the box's inner width, below the last line of the fragment.
      const inner = f.callout!.innerRect;
      const line = marker!.lines[0]!;
      expect(marker!.bbox.x + line.xOffset - (f.bbox.x + inner.x)).toBeCloseTo((inner.width - line.width) / 2, 3);
      const kids = doc.blocks.filter((b) => b.containerId === f.containerId && b.type !== 'callout' && b.pageIndex === f.pageIndex);
      const lastKid = kids[kids.length - 1]!;
      expect(marker!.bbox.y).toBeGreaterThanOrEqual(lastKid.bbox.y + lastKid.bbox.height - 0.01);
    });
  }, 30_000);

  it('defaults the strings to the document language and the marker to italic, right-aligned', () => {
    const es = resolveAllConfig(config({}, 'es')).calloutStyles[0]!;
    expect([es.continuedSuffix, es.continuesMarker]).toEqual(['(cont.)', 'Continúa']);
    const en = resolveAllConfig(config({})).calloutStyles[0]!;
    expect([en.repeatTitle, en.continuesMarkerEnabled, en.continuesMarker, en.continuesMarkerAlign, en.continuesMarkerItalic])
      .toEqual([false, false, 'Continued', 'right', true]);

    const doc = build(MD, config({ continuesMarkerEnabled: true }));
    const [head] = frames(doc);
    const marker = overlayText(head!, 'Continued')!;
    expect(marker.fontString.startsWith('italic ')).toBe(true);
    const inner = head!.callout!.innerRect;
    const line = marker.lines[0]!;
    expect(marker.bbox.x + line.xOffset + line.width).toBeCloseTo(head!.bbox.x + inner.x + inner.width, 3);
  }, 30_000);

  it('marks a nested box that splits with the outer one, by its own style', () => {
    const cfg: PostextConfig = {
      ...config({}),
      calloutStyles: [
        { id: 'outer', keepTogether: false },
        { id: 'inner', title: 'Answer', keepTogether: false, repeatTitle: true, continuesMarkerEnabled: true },
      ],
    };
    const md = [filler(2), '', ':::callout{type="outer"}', 'Statement.', '', ':::callout{type="inner"}', ...items(10), ':::', ':::'].join('\n');
    const doc = build(md, cfg);
    const nested = doc.blocks.filter((b) => b.type === 'callout' && b.calloutPath && b.calloutPath.length > 0);
    expect(nested.length).toBeGreaterThan(1);
    nested.forEach((f, i) => {
      const last = i === nested.length - 1;
      expect(overlayText(f, 'Continued') !== undefined).toBe(!last);
      const title = overlayText(f, 'Answer')!;
      expect(title.lines.map((l) => l.text).join(' ')).toBe(i === 0 ? 'Answer' : 'Answer (cont.)');
    });
    // The outer box, with no marks of its own, carries none.
    const outer = doc.blocks.filter((b) => b.type === 'callout' && !b.calloutPath);
    for (const f of outer) expect(overlayText(f, 'Continued')).toBeUndefined();
  }, 30_000);

  it('hides the marks from assistive technology in the HTML', () => {
    const doc = build(MD, config({ repeatTitle: true, continuesMarkerEnabled: true, continuesMarker: '(MORE)' }));
    const html = renderToHtml(doc);
    expect(html).toMatch(/aria-hidden="true"[^>]*>(?:<[^>]+>)*\(MORE\)/);
  }, 30_000);
});
