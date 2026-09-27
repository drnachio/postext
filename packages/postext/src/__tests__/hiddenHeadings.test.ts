import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { resolveHeadingsConfig, stripHeadingsDefaults } from '../defaults/headings';
import { stripHeadingStylesDefaults } from '../defaults/headingStyles';
import { renderToHtml } from '../html-backend';
import { renderPageToCanvas } from '../index';
import type { DesignElement, PostextConfig } from '../types';
import type { VDTDesignTextBlock, VDTDocument } from '../vdt';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });

/** Every string the canvas backend paints on the document's pages. */
function canvasTexts(doc: VDTDocument): string[] {
  const texts: string[] = [];
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get(target: Record<string | symbol, unknown>, key) {
      if (key === 'fillText') return (text: string) => { texts.push(text); };
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  for (const page of doc.pages) renderPageToCanvas(page, doc, canvas);
  return texts;
}

const runningHead: DesignElement = {
  kind: 'text', id: 'head', content: '{chapterTitle}', fontSize: pt(8), overflow: 'ellipsis-end',
  placement: { anchor: { to: 'container', edge: 'bottom' }, size: { width: 'auto', height: 'auto' } },
};

const base: PostextConfig = {
  page: { width: pt(360), height: pt(240), margins: { top: pt(24), bottom: pt(18), left: pt(18), right: pt(18) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  header: { elements: [runningHead] },
  headingStyles: [{ id: 'silent', hidden: true, numbered: false }],
};

const headerText = (doc: VDTDocument, i: number): string =>
  (doc.pages[i]!.header?.blocks ?? []).filter((b): b is VDTDesignTextBlock => b.kind === 'text').map((b) => b.lines.map((l) => l.text).join(' ')).join(' | ');

const firstLineY = (doc: VDTDocument, page: number, type: string): number | undefined => {
  for (const col of doc.pages[page]!.columns) {
    for (const b of col.blocks) if (b.type === type && !b.hidden) return b.lines[0]?.bbox.y;
  }
  return undefined;
};

describe('hidden (structural) headings (EF-26)', () => {
  it('resolves and strips the level flag', () => {
    expect(resolveHeadingsConfig(undefined).levels.every((l) => l.hidden === false)).toBe(true);
    expect(resolveHeadingsConfig({ levels: [{ level: 3, hidden: true }] }).levels[2]!.hidden).toBe(true);
    expect(stripHeadingsDefaults({ levels: [{ level: 3, hidden: false }] })).toBeUndefined();
    expect(stripHeadingsDefaults({ levels: [{ level: 3, hidden: true }] })).toEqual({ levels: [{ level: 3, hidden: true }] });
    expect(stripHeadingStylesDefaults([{ id: 's', hidden: true }])).toEqual([{ id: 's', hidden: true }]);
  });

  it('prints nothing and takes no room, but keeps the break, the running head and the text for bookmarks', () => {
    const doc = buildDocument({ markdown: '# Plain\n\nBody.\n\n# Dedication {style="silent"}\n\nTo my mother.' }, base);
    const hidden = doc.blocks.find((b) => b.type === 'heading' && b.headingStyleId === 'silent')!;
    expect(hidden.hidden).toBe(true);
    expect(hidden.bbox.height).toBe(0);
    expect(hidden.lines.map((l) => l.text).join(' ')).toContain('Dedication');
    expect(hidden.lines.every((l) => l.bbox.height === 0)).toBe(true);
    // Its break still opens a page, where the dedication starts at the top.
    expect(hidden.pageIndex).toBe(1);
    const plainTop = firstLineY(doc, 0, 'heading');
    expect(firstLineY(doc, 1, 'paragraph')).toBe(plainTop);
    expect(headerText(doc, 1)).toBe('Dedication');
    // Printed once: in the running head, not as a heading.
    expect(renderToHtml(doc).split('Dedication').length - 1).toBe(1);
  });

  it('draws no opener band for a hidden page-span heading', () => {
    const config: PostextConfig = {
      ...base,
      headings: { levels: [{ level: 1, span: 'page', breakBefore: { enabled: true, parity: 'any' } }] },
    };
    const doc = buildDocument({ markdown: '# Plain\n\nBody.\n\n# Colophon {style="silent"}\n\nSet in Garamond.' }, config);
    expect(doc.pages[0]!.openerBand).toBeDefined();
    expect(doc.pages[1]!.openerBand).toBeUndefined();
  });

  it('is listed by :::toc with the page it opens', () => {
    const doc = buildDocument({ markdown: ':::toc\n\n# Plain\n\nBody.\n\n# Dedication {style="silent"}\n\nTo my mother.' }, base);
    const entries = doc.blocks.filter((b) => b.tocEntry).map((b) => b.lines.map((l) => l.text).join(' '));
    expect(entries.some((t) => t.includes('Dedication'))).toBe(true);
    const dedication = doc.blocks.find((b) => b.tocEntry && b.lines.some((l) => l.text.includes('Dedication')))!;
    const hidden = doc.blocks.find((b) => b.type === 'heading' && b.headingStyleId === 'silent')!;
    expect(dedication.tocEntry?.pageIndex).toBe(hidden.pageIndex);
  });

  it('prints nothing inside a callout either, and leaves its text where it would be without it', () => {
    const config: PostextConfig = { ...base, calloutStyles: [{ id: 'note', span: 'column' }] };
    const box = (body: string) => `Intro.\n\n:::callout{type="note"}\n${body}\n:::\n\nOutro.`;
    const topOf = (doc: VDTDocument, text: string): number =>
      doc.blocks.find((b) => !b.hidden && b.lines[0]?.text.startsWith(text))!.bbox.y;
    const frameHeight = (doc: VDTDocument): number => doc.blocks.find((b) => b.callout)!.bbox.height;
    const plain = buildDocument({ markdown: box('Before.\n\nAfter.') }, config);
    for (const body of [
      'Before.\n\n## Secret {hidden="true"}\n\nAfter.',
      '## Secret {style="silent"}\n\nBefore.\n\nAfter.',
      'Before.\n\nAfter.\n\n### Secret {hidden="true"}',
    ]) {
      const doc = buildDocument({ markdown: box(body) }, config);
      const secret = doc.blocks.find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes('Secret')))!;
      expect(secret.containerId).toBeDefined();
      expect(secret.hidden).toBe(true);
      expect(secret.bbox.height).toBe(0);
      expect(secret.lines.every((l) => l.bbox.height === 0)).toBe(true);
      for (const text of ['Before.', 'After.', 'Outro.']) expect(topOf(doc, text)).toBeCloseTo(topOf(plain, text), 6);
      expect(frameHeight(doc)).toBeCloseTo(frameHeight(plain), 6);
      expect(renderToHtml(doc)).not.toContain('Secret');
      const painted = canvasTexts(doc).join(' ');
      expect(painted).toContain('After.');
      expect(painted).not.toContain('Secret');
    }
    // A level set hidden applies inside the box too.
    const byLevel = buildDocument(
      { markdown: box('Before.\n\n## Secret\n\nAfter.') },
      { ...config, headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }, { level: 2, hidden: true }] } },
    );
    expect(renderToHtml(byLevel)).not.toContain('Secret');
    expect(topOf(byLevel, 'After.')).toBeCloseTo(topOf(plain, 'After.'), 6);
  });

  it('follows a {hidden} attribute over the level or the style', () => {
    const doc = buildDocument({ markdown: '# Shown\n\nBody.\n\n# Quiet {hidden="true"}\n\nMore.\n\n# Loud {style="silent" hidden="false"}\n\nEnd.' }, base);
    const byTitle = (t: string) => doc.blocks.find((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes(t)))!;
    expect(byTitle('Shown').hidden).toBeFalsy();
    expect(byTitle('Quiet').hidden).toBe(true);
    expect(byTitle('Loud').hidden).toBeFalsy();
  });
});
