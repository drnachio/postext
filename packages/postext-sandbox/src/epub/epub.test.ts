import { describe, expect, it, vi } from 'vitest';
import type { DocumentMetadata, PostextConfig, VDTDocument } from 'postext';
import { documentCodePoints, facesForText, fontFormatOf, parseUnicodeRange } from './fontSubsets';
import { bookLanguageOf, epubFileName, epubMetadataOf, isoDateOf, sandboxBookIdentifier } from './metadata';
import { dockedToolbarReserve, firstIndexOf, fixedScreens, flattenToc, keepReaderFocus, linkTarget, prefersSpreads, rewriteCssUrls, rewriteMarkupRefs, screenOf } from './viewer';

describe('font subsets', () => {
  it('reads unicode-range values, wildcards included', () => {
    expect(parseUnicodeRange('U+0000-00FF, U+0131, u+4e??, nonsense')).toEqual([[0, 0xff], [0x131, 0x131], [0x4e00, 0x4eff]]);
  });

  it('keeps the slices the text meets, and one slice of a face it meets nowhere', () => {
    const faces = [
      { family: 'Noto', weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF', id: 'latin' },
      { family: 'Noto', weight: '400', style: 'normal', unicodeRange: 'U+0400-04FF', id: 'cyrillic' },
      { family: 'Noto', weight: '400', style: 'normal', unicodeRange: 'U+4E00-4EFF', id: 'cjk' },
      { family: 'Noto', weight: '700', style: 'normal', unicodeRange: 'U+0400-04FF', id: 'bold-cyrillic' },
      { family: 'Noto', weight: '700', style: 'normal', unicodeRange: 'U+0370-03FF', id: 'bold-greek' },
      { family: 'Own', weight: '400', style: 'italic', id: 'custom' },
    ];
    const kept = facesForText(faces, new Set([...'Abc一'].map((c) => c.codePointAt(0)!)));
    expect(kept.map((f) => f.id)).toEqual(['latin', 'cjk', 'custom', 'bold-cyrillic']);
  });

  it('collects the characters the pages print', () => {
    const doc = { pages: [{ columns: [{ blocks: [{ lines: [{ segments: [{ text: 'é一', mathRender: { svg: 'Ж' } }] }] }] }] }] } as unknown as VDTDocument;
    const cps = documentCodePoints([doc]);
    expect(cps.has('é'.codePointAt(0)!)).toBe(true);
    expect(cps.has('一'.codePointAt(0)!)).toBe(true);
    expect(cps.has('Ж'.codePointAt(0)!)).toBe(false);
  });

  it('tells font formats from their bytes', () => {
    const tag = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
    expect(fontFormatOf(tag('wOF2'))).toBe('woff2');
    expect(fontFormatOf(tag('wOFF'))).toBe('woff');
    expect(fontFormatOf(tag('OTTO'))).toBe('otf');
    expect(fontFormatOf(new Uint8Array([0, 1, 0, 0]))).toBe('ttf');
  });
});

describe('EPUB metadata', () => {
  const config = { locale: 'es-es' } as PostextConfig;

  it('maps the front matter, the language and a stable identifier', () => {
    const meta = epubMetadataOf(
      { title: 'Libro', subtitle: 'Una prueba', author: ['Ana', 'Luis'], publishDate: new Date(Date.UTC(2026, 9, 4)), publisher: 'Casa' } as unknown as DocumentMetadata,
      config,
      { kind: 'project', id: 'p1', name: 'Proyecto' },
      'en',
    );
    expect(meta).toEqual({
      title: 'Libro',
      subtitle: 'Una prueba',
      creators: ['Ana', 'Luis'],
      language: 'es-ES',
      identifier: sandboxBookIdentifier({ kind: 'project', id: 'p1' }),
      date: '2026-10-04',
      publisher: 'Casa',
    });
    expect(meta.identifier).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
  });

  it('takes an ISBN over the book identity and the book name for a missing title', () => {
    const meta = epubMetadataOf({ isbn: '978-84-0000-000-0', date: 'March 2020' }, {} as PostextConfig, { kind: 'preset', id: 'guide', locale: 'zh', name: 'Guide' }, 'zh-Hans');
    expect(meta.title).toBe('Guide');
    expect(meta.identifier).toBe('978-84-0000-000-0');
    expect(meta.language).toBe('zh-Hans');
    expect(meta.date).toBeUndefined();
  });

  it('keeps one identifier per book and language', () => {
    expect(sandboxBookIdentifier({ kind: 'preset', id: 'guide', locale: 'en' })).toBe(sandboxBookIdentifier({ kind: 'preset', id: 'guide', locale: 'en' }));
    expect(sandboxBookIdentifier({ kind: 'preset', id: 'guide', locale: 'en' })).not.toBe(sandboxBookIdentifier({ kind: 'preset', id: 'guide', locale: 'es' }));
  });

  it('reads ISO dates and the hyphenation language', () => {
    expect(isoDateOf('2024-05-01T10:00:00Z')).toBe('2024-05-01');
    expect(isoDateOf(1998)).toBe('1998');
    expect(bookLanguageOf({ bodyText: { hyphenation: { locale: 'en-us' } } } as PostextConfig, 'es')).toBe('en-US');
  });

  it('names the file after the title', () => {
    expect(epubFileName('El Quijote: I')).toBe('El-Quijote-I.epub');
    expect(epubFileName('红楼梦')).toBe('book.epub');
  });
});

describe('reader references', () => {
  const urlOf = (path: string) => (path.endsWith('.xhtml') ? undefined : `blob:${path}`);

  it('points stylesheet urls at their object URLs', () => {
    const css = '@font-face { src: url("../fonts/a.woff2") format("woff2"); } .x { background: url(../images/b.png); } .y { background: url(data:image/png;base64,AA) }';
    expect(rewriteCssUrls(css, 'OEBPS/styles/', urlOf)).toBe(
      '@font-face { src: url("blob:OEBPS/fonts/a.woff2") format("woff2"); } .x { background: url("blob:OEBPS/images/b.png"); } .y { background: url(data:image/png;base64,AA) }',
    );
  });

  it('points a document\'s pictures and styles at their URLs, links left for the reader', () => {
    const doc = '<link rel="stylesheet" href="../styles/book.css"/><img src="../images/f%201.png" alt=""/><image xlink:href=\'../images/s.svg\'/>'
      + '<a href="chapter-002.xhtml#n1">2</a><a href="https://example.org">x</a><div style="background:url(\'../images/b.png\')"></div>';
    expect(rewriteMarkupRefs(doc, 'OEBPS/text/', urlOf)).toBe(
      '<link rel="stylesheet" href="blob:OEBPS/styles/book.css"/><img src="blob:OEBPS/images/f 1.png" alt=""/><image xlink:href="blob:OEBPS/images/s.svg"/>'
      + '<a href="chapter-002.xhtml#n1">2</a><a href="https://example.org">x</a><div style="background:url(&quot;blob:OEBPS/images/b.png&quot;)"></div>',
    );
  });

  it('tells internal links from external ones', () => {
    expect(linkTarget('OEBPS/text/chapter-001.xhtml', 'chapter-002.xhtml#fn%201')).toEqual({ kind: 'internal', path: 'OEBPS/text/chapter-002.xhtml', fragment: 'fn 1' });
    expect(linkTarget('OEBPS/text/chapter-001.xhtml', '#top')).toEqual({ kind: 'internal', path: 'OEBPS/text/chapter-001.xhtml', fragment: 'top' });
    expect(linkTarget('OEBPS/text/chapter-001.xhtml', 'https://postext.dev')).toEqual({ kind: 'external', url: 'https://postext.dev' });
    expect(linkTarget('OEBPS/text/chapter-001.xhtml', 'javascript:alert(1)')).toBeNull();
  });
});

describe('fixed-layout screens', () => {
  const spine = (...sides: string[]) => sides.map((s) => ({ properties: s ? [`page-spread-${s}`] : [] }));

  it('pairs facing pages left to right, a recto alone at the right', () => {
    const screens = fixedScreens(spine('right', 'left', 'right', 'left'), 'ltr', true);
    expect(screens).toEqual([{ left: null, right: 0 }, { left: 1, right: 2 }, { left: 3, right: null }]);
    expect(screenOf(screens, 2)).toBe(1);
    expect(firstIndexOf(screens[1])).toBe(1);
  });

  it('pairs a right-to-left book right page first', () => {
    const screens = fixedScreens(spine('', 'right', 'left', 'left'), 'rtl', true);
    expect(screens).toEqual([{ left: null, right: 0 }, { left: 2, right: 1 }, { left: 3, right: null }]);
  });

  it('shows one page per screen without spreads', () => {
    expect(fixedScreens(spine('left', 'right'), 'ltr', false)).toEqual([{ left: 0, right: null }, { left: 1, right: null }]);
  });

  it('prefers spreads when the area is wide enough', () => {
    expect(prefersSpreads({ width: 1600, height: 900 }, { width: 600, height: 800 })).toBe(true);
    expect(prefersSpreads({ width: 700, height: 900 }, { width: 600, height: 800 })).toBe(false);
  });
});

describe('reader helpers', () => {
  it('flattens the table of contents with depths', () => {
    expect(flattenToc([{ label: 'I', href: 'a', children: [{ label: '1', href: 'b' }] }, { label: 'II', href: 'c' }]))
      .toEqual([{ label: 'I', href: 'a', depth: 0 }, { label: '1', href: 'b', depth: 1 }, { label: 'II', href: 'c', depth: 0 }]);
  });
});

describe('reader focus', () => {
  it('takes the focus back from a page frame after a page key, and only then', () => {
    const page = {} as Document;
    const host = {} as Document;
    const area = { ownerDocument: host, focus: vi.fn() };
    keepReaderFocus({ ownerDocument: page } as Node, area);
    expect(area.focus).toHaveBeenCalledWith({ preventScroll: true });
    area.focus.mockClear();
    keepReaderFocus({ ownerDocument: host } as Node, area);
    expect(area.focus).not.toHaveBeenCalled();
  });
});

describe('docked toolbar reserve', () => {
  it('keeps the measured toolbar, its offset and a gap clear', () => {
    expect(dockedToolbarReserve(42, false)).toBe(62);
    expect(dockedToolbarReserve(53.2, true)).toBe(74);
    expect(dockedToolbarReserve(101, true)).toBe(121);
  });

  it('falls back to one row, or two with large targets, before measuring', () => {
    expect(dockedToolbarReserve(null, false)).toBe(64);
    expect(dockedToolbarReserve(0, true)).toBe(120);
  });
});
