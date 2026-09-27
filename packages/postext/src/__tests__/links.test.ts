import { describe, it, expect } from 'vitest';
import { buildDocument, renderToHtml } from '../index';
import { parseInlineFormatting, stripInlineFormatting } from '../parse/inlineFormatting';
import { mapInlineSnippet } from '../parse/inlineSnippet';
import type { PostextConfig, Resource, VDTDocument, VDTLine, VDTLineSegment } from '../index';

// EF-36: a Markdown link `[text](url)` keeps its URL. The parser records it
// on the spans (without splitting them, so layout is exactly what it was),
// the measurer stamps it on the segments of the linked words, and the HTML
// and PDF backends make those words live links.

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

/** The spans a link-free spelling of the same text parses to. */
const shape = (text: string) => parseInlineFormatting(text).map(({ text: t, bold, italic, script }) => ({ text: t, bold, italic, ...(script ? { script } : {}) }));

describe('parseInlineFormatting — links (EF-36)', () => {
  it('keeps the URL as a range of the span, without splitting it', () => {
    const spans = parseInlineFormatting('see [the docs](https://postext.dev/docs) now');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ text: 'see the docs now', bold: false, italic: false });
    expect(spans[0]!.links).toEqual([{ start: 4, end: 12, href: 'https://postext.dev/docs' }]);
  });

  it('leaves the spans exactly as the link-free text parses', () => {
    const cases: Array<[string, string]> = [
      ['**[bold link](https://a.example)** and [*it*](https://b.example).', '**bold link** and *it*.'],
      ['x[a](https://a.example)y', 'xay'],
      ['[**a** b *c*](https://a.example) d', '**a** b *c* d'],
      ['H[~2~](https://a.example)O and E = mc[^2^](https://b.example)', 'H~2~O and E = mc^2^'],
    ];
    for (const [linked, bare] of cases) {
      const spans = parseInlineFormatting(linked);
      expect(spans.map(({ text, bold, italic, script }) => ({ text, bold, italic, ...(script ? { script } : {}) })), linked).toEqual(shape(bare));
    }
  });

  it('spreads a link over every span its text crosses', () => {
    const spans = parseInlineFormatting('[**a** b *c*](https://a.example) d');
    const linked = spans.map((s) => s.text.slice(s.links?.[0]?.start ?? 0, s.links?.[0]?.end ?? 0));
    expect(linked.join('')).toBe('a b c');
    expect(spans.every((s) => !s.links || s.links.every((l) => l.href === 'https://a.example'))).toBe(true);
  });

  it('reads titles and angle brackets, and drops unsafe schemes', () => {
    expect(parseInlineFormatting('[a](https://a.example "Title")')[0]!.links).toEqual([{ start: 0, end: 1, href: 'https://a.example' }]);
    expect(parseInlineFormatting('[a](<https://a.example/x y>)')[0]!.links).toEqual([{ start: 0, end: 1, href: 'https://a.example/x%20y' }]);
    expect(parseInlineFormatting('[mail](mailto:a@b.example) [rel](../guide#top)').flatMap((s) => s.links ?? []).map((l) => l.href))
      .toEqual(['mailto:a@b.example', '../guide#top']);
    // An unsafe target keeps only its label, as every link did before.
    const bad: Array<[string, string]> = [
      ['[x](javascript:alert(1))', 'x'],
      ['[x](data:text/html,hi)', 'x'],
      ['[x](vbscript:msgbox)', 'x'],
      ['[x](file:///etc/passwd)', 'x'],
    ];
    for (const [markdown, text] of bad) {
      expect(parseInlineFormatting(markdown).some((s) => s.links), markdown).toBe(false);
      expect(parseInlineFormatting(markdown).map((s) => s.text).join(''), markdown).toBe(text);
    }
    // Images are not links.
    expect(parseInlineFormatting('![alt](https://a.example/p.png) text').some((s) => s.links)).toBe(false);
  });

  it('reads a destination with balanced parentheses to its closing parenthesis', () => {
    // Wikipedia and Commons file names carry parentheses; CommonMark keeps
    // balanced pairs inside the destination.
    const url = 'https://commons.wikimedia.org/wiki/File:Copenhagen,_Denmark_(Unsplash_A3Hbc08ZdlU).jpg';
    const spans = parseInlineFormatting(`Photo: [commons.wikimedia.org](${url}), CC0.`);
    expect(spans.map((s) => s.text).join('')).toBe('Photo: commons.wikimedia.org, CC0.');
    expect(spans.flatMap((s) => s.links ?? [])).toEqual([{ start: 7, end: 28, href: url }]);
    // Nested pairs, a title holding a parenthesis, and two links in a row.
    expect(parseInlineFormatting('[a](https://a.example/x_(y_(z))) b')[0]).toMatchObject({
      text: 'a b',
      links: [{ start: 0, end: 1, href: 'https://a.example/x_(y_(z))' }],
    });
    expect(parseInlineFormatting('[a](https://a.example/p "A (title)") b')[0]).toMatchObject({
      text: 'a b',
      links: [{ start: 0, end: 1, href: 'https://a.example/p' }],
    });
    expect(parseInlineFormatting('[a](https://a.example/(1)) and [b](https://b.example/(2))').flatMap((s) => s.links ?? []).map((l) => l.href))
      .toEqual(['https://a.example/(1)', 'https://b.example/(2)']);
    // Backslash escapes in the destination stand for the character itself.
    expect(parseInlineFormatting('[a](https://a.example/x\\_y\\(z) b')[0]!.links).toEqual([{ start: 0, end: 1, href: 'https://a.example/x_y(z' }]);
  });

  it('sets the label without a link when the parentheses do not balance', () => {
    // No closing parenthesis for the one the URL opens: the destination
    // ends at the first `)` as before, and a truncated URL is never linked.
    const spans = parseInlineFormatting('[a](https://a.example/x_(y) b');
    expect(spans.map((s) => s.text).join('')).toBe('a b');
    expect(spans.some((s) => s.links)).toBe(false);
    // A space ends a bare destination: no link, the label as before.
    expect(parseInlineFormatting('[a](foo bar) b').some((s) => s.links)).toBe(false);
    expect(parseInlineFormatting('[a](foo bar) b').map((s) => s.text).join('')).toBe('a b');
  });

  it('reads balanced parentheses in images and in heading text too', () => {
    expect(parseInlineFormatting('![alt](https://a.example/p_(1).png) text').map((s) => s.text).join('')).toBe(' text');
    expect(stripInlineFormatting('See [x](https://a.example/(1)) now')).toBe('See x now');
  });

  it('carries links into table cells and captions (inline snippets)', () => {
    const m = mapInlineSnippet('Data from [the survey](https://a.example/s), 2024.');
    expect(m.text).toBe('Data from the survey, 2024.');
    const link = m.spans.flatMap((s) => (s.links ?? []).map((l) => s.text.slice(l.start, l.end)));
    expect(link).toEqual(['the survey']);
  });
});

function segmentsOf(doc: VDTDocument): VDTLineSegment[] {
  return doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])])
    .flatMap((b) => [...b.lines, ...(b.resourceBlock?.captionLines ?? []), ...(b.resourceBlock?.noteLines ?? []),
      ...(b.resourceBlock?.table?.cells.flatMap((c) => c.lines) ?? [])])
    .flatMap((l: VDTLine) => l.segments ?? []);
}

/** Every line's text and geometry, to compare two layouts. */
function geometry(doc: VDTDocument): string {
  return JSON.stringify(doc.pages.map((p) => p.columns.map((c) => c.blocks.map((b) => b.lines.map((l) => [
    l.text, Math.round(l.bbox.x * 100), Math.round(l.bbox.width * 100), Math.round(l.baseline * 100),
    (l.segments ?? []).map((s) => [s.kind, s.text, Math.round(s.width * 100)]),
  ])))));
}

const narrow: PostextConfig = {
  page: { width: { value: 200, unit: 'pt' }, height: { value: 400, unit: 'pt' }, margins: { top: { value: 20, unit: 'pt' }, bottom: { value: 20, unit: 'pt' }, left: { value: 20, unit: 'pt' }, right: { value: 20, unit: 'pt' } } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

describe('links in the VDT (EF-36)', () => {
  const linked = [
    'Visit [postext.dev](https://postext.dev). The **engine** is [free software released under the MIT licence](https://opensource.org/license/mit) for everyone.',
    '',
    '- A list item with [a link](https://a.example/list) inside.',
    '',
    '> A quotation citing [its source](https://a.example/quote).',
  ].join('\n');
  const bare = linked.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  it('stamps the URL on the linked words and nowhere else', () => {
    const doc = buildDocument({ markdown: linked }, narrow);
    const segs = segmentsOf(doc);
    // The linked text of each target, segment pieces (syllables, the words
    // of each line) joined; a glued full stop or parenthesis shares the link.
    const byHref = new Map<string, string>();
    for (const s of segs) if (s.href) byHref.set(s.href, (byHref.get(s.href) ?? '') + s.text);
    expect(byHref.get('https://postext.dev')).toBe('postext.dev.');
    expect(byHref.get('https://opensource.org/license/mit')!.replace(/-/g, '')).toBe('freesoftwarereleasedundertheMITlicence');
    expect(byHref.get('https://a.example/list')).toBe('alink');
    expect(byHref.get('https://a.example/quote')).toBe('itssource.');
    const unlinked = segs.filter((s) => !s.href && s.kind === 'text').map((s) => s.text).join('');
    expect(unlinked).toContain('Visit');
    expect(unlinked).toContain('engine');
  });

  it('lays the text out exactly as without the links', () => {
    const a = buildDocument({ markdown: linked }, narrow);
    const b = buildDocument({ markdown: bare }, narrow);
    expect(geometry(a)).toBe(geometry(b));
    const justified = { ...narrow, bodyText: { textAlign: 'justify' as const, optimalLineBreaking: true } };
    expect(geometry(buildDocument({ markdown: linked }, justified))).toBe(geometry(buildDocument({ markdown: bare }, justified)));
  });

  it('links words split across lines by a hyphen', () => {
    const doc = buildDocument({ markdown: 'Read [extraordinarily comprehensive documentation](https://a.example/docs) today.' }, {
      ...narrow,
      locale: 'en-us',
      bodyText: { textAlign: 'justify', hyphenation: { enabled: true, locale: 'en-us' } },
    });
    const segs = segmentsOf(doc).filter((s) => s.kind === 'text');
    const linkedText = segs.filter((s) => s.href).map((s) => s.text).join('').replace(/-/g, '');
    expect(linkedText).toBe('extraordinarilycomprehensivedocumentation');
  });

  it('links a URL used as its own label, through the break points set inside it', () => {
    // A URL-like word gets zero-width break opportunities from the measurer
    // (credits pages cite sources this way).
    const url = 'https://en.wikipedia.org/wiki/El_Greco';
    const doc = buildDocument({ markdown: `*El Greco* — [${url}](${url}) (revision 1376001405, 2026-09-21)` }, narrow);
    const linked = segmentsOf(doc).filter((s) => s.href === url);
    expect(linked.map((s) => s.text).join('').replace(/[​-]/g, '')).toBe(url.replace(/-/g, ''));
    expect(segmentsOf(doc).some((s) => s.href && s.text.includes('revision'))).toBe(false);
  });

  it('links in callouts, captions, notes and table cells', () => {
    const resources: Resource[] = [{
      id: 't',
      typeId: 'table',
      kind: 'table',
      caption: 'Figures from [the census](https://a.example/census).',
      note: 'Source: [INE](https://a.example/ine).',
      createdAt: 0,
      updatedAt: 0,
      table: { model: { rows: [[{ content: 'See [row](https://a.example/row)' }]] } },
      placement: { position: 'here' },
    }];
    const markdown = ':::callout\nBoxed [link](https://a.example/box) here.\n:::\n\n::resource{id="t"}';
    const doc = buildDocument({ markdown, resources }, narrow);
    const hrefs = new Set(segmentsOf(doc).map((s) => s.href).filter(Boolean));
    expect([...hrefs].sort()).toEqual([
      'https://a.example/box',
      'https://a.example/census',
      'https://a.example/ine',
      'https://a.example/row',
    ]);
  });
});

describe('links in HTML (EF-36)', () => {
  it('wraps each run of linked words in one anchor that keeps the text colour', () => {
    const doc = buildDocument({ markdown: 'Go to [the postext docs](https://postext.dev/docs?a=1&b=2) now.' }, narrow);
    const html = renderToHtml(doc);
    const anchors = html.match(/<a [^>]*href="https:\/\/postext\.dev\/docs\?a=1&amp;b=2"[^>]*>/g) ?? [];
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toContain('color:inherit');
    const inner = /<a [^>]*href="https:\/\/postext\.dev[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(html)![1]!;
    expect(inner.replace(/<[^>]+>/g, '')).toBe('thepostextdocs');
  });

  it('adds no anchors to text without links', () => {
    const html = renderToHtml(buildDocument({ markdown: 'Plain text.' }, narrow));
    expect(html).not.toContain('<a ');
  });
});

// Small capitals and links both bracket text with private-use marks while
// the emphasis scanners run; the two pairs must not share code points.
describe('small capitals next to a link', () => {
  it('keeps each mark to its own text', () => {
    const spans = parseInlineFormatting('A :smallcaps[note] and [a link](https://example.org) here, [:smallcaps[in caps]](https://x.org).');
    expect(spans.map((s) => s.text).join('')).toBe('A note and a link here, in caps.');
    const caps = spans.filter((s) => s.smallCaps).map((s) => s.text).join('|');
    expect(caps).toBe('note|in caps');
    const linked = spans.flatMap((s) => (s.links ?? []).map((l) => `${s.text.slice(l.start, l.end)}>${l.href}`));
    expect(linked).toEqual(['a link>https://example.org', 'in caps>https://x.org']);
  });
});
