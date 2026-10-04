import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import type { EpubPublication } from '../types';
import { buildNav, buildNcx, buildOpf, packEpub, w3cDate } from './pack';
import { readEpub, resolveHref } from './read';
import { xhtmlDocument } from '../shared/xml';
import { parseXml, descendants } from '../shared/xmlRead';

const page = (n: number, body: string): string => xhtmlDocument({
  lang: 'es',
  title: `Página ${n}`,
  head: `<meta name="viewport" content="width=600, height=800"/>\n`,
  body,
});

function sample(overrides: Partial<EpubPublication> = {}): EpubPublication {
  return {
    layout: 'fixed',
    metadata: {
      title: 'Cartas & mapas',
      subtitle: 'Una prueba',
      creators: ['Ana Pérez', 'Luis Gómez'],
      language: 'es',
      date: '2026-10-04',
      publisher: 'Postext',
      modified: new Date(Date.UTC(2026, 9, 4, 12, 0, 0, 500)),
    },
    items: [
      { id: 'css', href: 'styles/fixed.css', mediaType: 'text/css', data: 'body{margin:0}' },
      { id: 'cover-img', href: 'images/cover.png', mediaType: 'image/png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), properties: ['cover-image'] },
      { id: 'p1', href: 'pages/page-0001.xhtml', mediaType: 'application/xhtml+xml', data: page(1, '<div id="pt-a-uno">Uno</div>') },
      { id: 'p2', href: 'pages/page-0002.xhtml', mediaType: 'application/xhtml+xml', data: page(2, '<div><svg xmlns="http://www.w3.org/2000/svg"></svg></div>'), properties: ['mathml'] },
    ],
    spine: [
      { idref: 'p1', properties: ['page-spread-right'] },
      { idref: 'p2', properties: ['page-spread-left'] },
    ],
    toc: [{ label: 'Capítulo 1', href: 'pages/page-0001.xhtml#pt-a-uno', children: [{ label: 'Sección', href: 'pages/page-0002.xhtml' }] }],
    pageList: [{ label: 'i', href: 'pages/page-0001.xhtml' }, { label: '2', href: 'pages/page-0002.xhtml' }],
    landmarks: [{ type: 'bodymatter', label: 'Inicio', href: 'pages/page-0001.xhtml' }],
    pageProgression: 'ltr',
    fixed: { spread: 'landscape', viewport: { width: 600, height: 800 } },
    accessibility: {
      accessModes: ['textual'],
      accessModesSufficient: ['textual'],
      features: ['tableOfContents'],
      hazards: ['none'],
      summary: 'Prueba.',
    },
    ...overrides,
  };
}

describe('buildOpf', () => {
  const opf = buildOpf(sample());

  it('writes the EPUB 3 metadata', () => {
    expect(opf).toContain('<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="es">');
    expect(opf).toMatch(/<dc:identifier id="book-id">urn:uuid:[0-9a-f-]{36}<\/dc:identifier>/);
    expect(opf).toContain('<dc:title id="title">Cartas &amp; mapas</dc:title>');
    expect(opf).toContain('<meta refines="#subtitle" property="title-type">subtitle</meta>');
    expect(opf).toContain('<dc:creator id="creator-2">Luis Gómez</dc:creator>');
    expect(opf).toContain('<meta refines="#creator-1" property="role" scheme="marc:relators">aut</meta>');
    expect(opf).toContain('<dc:date>2026-10-04</dc:date>');
    expect(opf).toContain('<meta property="dcterms:modified">2026-10-04T12:00:00Z</meta>');
    expect(opf).toContain('<meta property="schema:accessibilityHazard">none</meta>');
    expect(opf).toContain('<meta property="schema:accessibilitySummary">Prueba.</meta>');
  });

  it('declares the fixed layout and the cover', () => {
    expect(opf).toContain('<meta property="rendition:layout">pre-paginated</meta>');
    expect(opf).toContain('<meta property="rendition:spread">landscape</meta>');
    expect(opf).toContain('<meta name="cover" content="cover-img"/>');
    expect(opf).toContain('<item id="cover-img" href="images/cover.png" media-type="image/png" properties="cover-image"/>');
  });

  it('sets svg/mathml properties from the markup', () => {
    expect(opf).toContain('<item id="p1" href="pages/page-0001.xhtml" media-type="application/xhtml+xml"/>');
    expect(opf).toContain('<item id="p2" href="pages/page-0002.xhtml" media-type="application/xhtml+xml" properties="svg"/>');
  });

  it('writes the spine with progression and spreads', () => {
    expect(opf).toContain('<spine toc="ncx" page-progression-direction="ltr">');
    expect(opf).toContain('<itemref idref="p2" properties="page-spread-left"/>');
    expect(buildOpf(sample({ pageProgression: 'rtl' }))).toContain('page-progression-direction="rtl"');
  });

  it('leaves the rendition properties out of a reflowable book', () => {
    expect(buildOpf(sample({ layout: 'reflowable' }))).not.toContain('rendition:');
  });

  it('is well-formed XML', () => {
    expect(() => parseXml(opf)).not.toThrow();
  });
});

describe('w3cDate', () => {
  it('keeps W3C dates and normalises others', () => {
    expect(w3cDate('2026')).toBe('2026');
    expect(w3cDate('2026-10-04T10:00:00Z')).toBe('2026-10-04T10:00:00Z');
    expect(w3cDate('October 4, 2026')).toMatch(/^2026-10-0[34]$/);
    expect(w3cDate('no date')).toBeUndefined();
  });
});

describe('buildNav / buildNcx', () => {
  it('writes toc, landmarks and a hidden page list', () => {
    const nav = buildNav(sample());
    const doc = parseXml(nav);
    const navs = descendants(doc, 'nav');
    expect(navs.map((n) => n.attrs['epub:type'])).toEqual(['toc', 'landmarks', 'page-list']);
    expect(navs[2]!.attrs.hidden).toBe('hidden');
    expect(nav).toContain('<h1 id="toc-title">Índice</h1>');
    expect(nav).toContain('<a href="pages/page-0001.xhtml#pt-a-uno">Capítulo 1</a>');
    expect(nav).toContain('<a epub:type="bodymatter" href="pages/page-0001.xhtml">Inicio</a>');
  });

  it('lists the title when the book has no headings', () => {
    expect(buildNav(sample({ toc: [] }))).toContain('<a href="pages/page-0001.xhtml">Cartas &amp; mapas</a>');
  });

  it('writes a nested NCX nav map and page list', () => {
    const ncx = buildNcx(sample());
    expect(ncx).toContain('<meta name="dtb:depth" content="2"/>');
    expect(ncx).toContain('<navPoint id="np-2" playOrder="2">');
    expect(ncx).toContain('<pageTarget id="pt-1" type="front" value="1" playOrder="3">');
    expect(() => parseXml(ncx)).not.toThrow();
  });
});

describe('packEpub', () => {
  const bytes = packEpub(sample());

  it('puts mimetype first, stored, with no extra field', () => {
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0); // method: stored
    const nameLen = view.getUint16(26, true);
    expect(view.getUint16(28, true)).toBe(0); // extra field length
    expect(new TextDecoder().decode(bytes.subarray(30, 30 + nameLen))).toBe('mimetype');
    expect(new TextDecoder().decode(bytes.subarray(30 + nameLen, 30 + nameLen + 20))).toBe('application/epub+zip');
  });

  it('writes the container, package files and items', () => {
    const files = Object.keys(unzipSync(bytes));
    expect(files.slice(0, 5)).toEqual(['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/toc.ncx']);
    expect(files).toContain('OEBPS/pages/page-0002.xhtml');
  });

  it('is deterministic', () => {
    expect(packEpub(sample())).toEqual(bytes);
  });

  it('rejects a spine entry missing from the manifest', () => {
    expect(() => packEpub(sample({ spine: [{ idref: 'nope' }] }))).toThrow(/not in the manifest/);
  });
});

describe('readEpub', () => {
  it('reads back what packEpub wrote', () => {
    const book = readEpub(packEpub(sample()));
    expect(book.layout).toBe('fixed');
    expect(book.root).toBe('OEBPS/');
    expect(book.metadata).toMatchObject({ title: 'Cartas & mapas', language: 'es', creators: ['Ana Pérez', 'Luis Gómez'] });
    expect(book.metadata.identifier).toMatch(/^urn:uuid:/);
    expect(book.spine.map((s) => [s.path, s.properties])).toEqual([
      ['OEBPS/pages/page-0001.xhtml', ['page-spread-right']],
      ['OEBPS/pages/page-0002.xhtml', ['page-spread-left']],
    ]);
    expect(book.toc).toEqual([{ label: 'Capítulo 1', href: 'OEBPS/pages/page-0001.xhtml#pt-a-uno', children: [{ label: 'Sección', href: 'OEBPS/pages/page-0002.xhtml' }] }]);
    expect(book.pageList.map((p) => p.label)).toEqual(['i', '2']);
    expect(book.viewport).toEqual({ width: 600, height: 800 });
    expect(book.coverPath).toBe('OEBPS/images/cover.png');
    expect(book.manifest.get('nav')?.properties).toEqual(['nav']);
    expect(book.files.get('OEBPS/styles/fixed.css')).toBeDefined();
  });

  it('resolves relative hrefs', () => {
    expect(resolveHref('OEBPS/pages/', '../images/a%20b.png#x')).toBe('OEBPS/images/a b.png#x');
    expect(resolveHref('OEBPS/', 'https://example.org/a')).toBe('https://example.org/a');
  });
});
