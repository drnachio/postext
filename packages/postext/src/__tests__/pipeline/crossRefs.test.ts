import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { buildBundle } from '../../bundle';
import { anchoredResourceIds, renderToHtml } from '../../html-backend';
import type { PostextConfig, VDTDocument } from '../../index';

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
const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number) => Array.from({ length: n }, (_, i) => para(i)).join('\n\n');

const config: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { levels: [
    { level: 1, numberingTemplate: '{1}', breakBefore: { enabled: true, parity: 'any' } },
    { level: 2, numberingTemplate: '{1}.{2}' },
  ] },
};

/** The refs printed in a document: label text and segment flags. */
function refs(doc: VDTDocument): { text: string; id: string; anchor: boolean }[] {
  const out: { text: string; id: string; anchor: boolean }[] = [];
  for (const b of doc.blocks) {
    for (const l of b.lines) {
      for (const s of l.segments ?? []) {
        if (s.refResourceId === undefined) continue;
        if (s.refContinues) out[out.length - 1]!.text += s.text;
        else out.push({ text: s.text, id: s.refResourceId, anchor: s.refAnchor === true });
      }
    }
  }
  return out;
}

describe('cross-references to anchors (#262)', () => {
  const markdown = [
    '# Opening {#ch-open}',
    'See :ref{id="sec-method"}, :ref{id="sec-method" style=number}, :ref{id="sec-method" style=title}, :ref{id="ch-open"} and :ref{id="sec-method" case=capitalize}.',
    'The [main claim]{#claim} is restated in :ref{id="claim"}; :ref{id="claim" text="here"}.',
    filler(2),
    '## Method {#sec-method}',
    filler(2),
    '## Aside {#aside numbered=false}',
  ].join('\n\n');

  it('prints the number, label and title of a heading', () => {
    const doc = buildDocument({ markdown }, config);
    const printed = refs(doc).map((r) => r.text);
    expect(printed.slice(0, 5)).toEqual(['section 1.1', '1.1', 'Method', 'chapter 1', 'Section 1.1']);
    expect(printed.slice(5)).toEqual(['main claim', 'here']);
    expect(refs(doc).every((r) => r.anchor)).toBe(true);
    expect(refs(doc)[0]!.id).toBe('sec-method');
  });

  it('locates every anchor on its page', () => {
    const doc = buildDocument({ markdown }, config);
    const ids = (doc.anchors ?? []).map((a) => a.id).sort();
    expect(ids).toEqual(['aside', 'ch-open', 'claim', 'sec-method']);
    const claim = doc.anchors!.find((a) => a.id === 'claim')!;
    expect(claim.kind).toBe('anchor');
    expect(claim.pageIndex).toBe(0);
  });

  it('localises the words to the document language', () => {
    const doc = buildDocument({ markdown }, { ...config, locale: 'es' });
    expect(refs(doc)[0]!.text).toBe('sección 1.1');
    expect(refs(doc)[3]!.text).toBe('capítulo 1');
  });

  it('leaves references to resources unchanged', () => {
    const doc = buildDocument({ markdown: 'See :ref{id="nowhere"}.' }, config);
    expect(refs(doc)[0]!.anchor).toBe(false);
  });
});

describe('page references (#263)', () => {
  it('prints the page an anchor landed on, settled over rounds', () => {
    const markdown = [
      '# One',
      'Jump to :ref{id="far" style=page} or :ref{id="far" style=pageNumber}.',
      filler(60),
      'The [far point]{#far} is here.',
    ].join('\n\n');
    const doc = buildDocument({ markdown }, config);
    const far = doc.anchors!.find((a) => a.id === 'far')!;
    expect(far.pageIndex).toBeGreaterThan(0);
    const label = doc.pages[far.pageIndex]!.pageLabel;
    expect(refs(doc).map((r) => r.text)).toEqual([`p. ${label}`, label]);
  });

  it('reaches anchors of another chapter in a book', () => {
    const docs = buildBundle({
      chapters: [
        { markdown: `# One\n\nAs :ref{id="later"} shows on :ref{id="later" style=page}.\n\n${filler(3)}` },
        { markdown: `# Two\n\n${filler(4)}\n\n## Later {#later}\n\nText.` },
      ],
      config,
      resources: [],
    });
    const target = docs[1]!.anchors!.find((a) => a.id === 'later')!;
    const label = docs[1]!.pages[target.pageIndex]!.pageLabel;
    expect(refs(docs[0]!).map((r) => r.text)).toEqual(['section 2.1', `p. ${label}`]);
  });
});

describe('cross-references in HTML (#264)', () => {
  const markdown = [
    '# Opening {#ch-open}',
    'See :ref{id="sec-method"} and the [claim]{#claim}, with a note.[^n]',
    '[^n]: The note.',
    '## Method {#sec-method}',
    'Text.',
  ].join('\n\n');

  it('links each reference to an element with the anchor’s id', () => {
    const html = renderToHtml(buildDocument({ markdown }, config));
    expect(html).toContain('href="#pt-a-sec-method"');
    expect(html).toContain('id="pt-a-sec-method"');
    expect(html).toContain('id="pt-a-claim"');
    expect(html).toContain('id="pt-a-ch-open"');
  });

  it('links footnote markers to their notes and gives pages ids', () => {
    const html = renderToHtml(buildDocument({ markdown }, config));
    expect(html).toContain('href="#pt-fn-n"');
    expect(html).toContain('id="pt-fn-n"');
    expect(html).toContain('id="pt-p-0"');
  });

  it('lists anchors among the link targets a book passes between chapters', () => {
    const ids = anchoredResourceIds(buildDocument({ markdown }, config));
    expect([...ids].sort()).toEqual(['a:ch-open', 'a:claim', 'a:sec-method']);
  });
});
