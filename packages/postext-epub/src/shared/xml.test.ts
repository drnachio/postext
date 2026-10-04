import { describe, it, expect } from 'vitest';
import { decodeEntities, escapeAttr, htmlToXhtml, isNcName, stripInvalidXmlChars, xhtmlDocument, xmlId } from './xml';
import { childElements, descendants, parseXml, textOf } from './xmlRead';

describe('escaping', () => {
  it('escapes text and attributes', () => {
    expect(escapeAttr(`a<b>&"c"`)).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });

  it('drops characters XML forbids', () => {
    expect(stripInvalidXmlChars('a\u0001b\u000Bc￾d\tE\uD800')).toBe('abcd\tE');
    expect(stripInvalidXmlChars('😀')).toBe('😀');
  });

  it('decodes named and numeric references, keeps unknown ones', () => {
    expect(decodeEntities('a&nbsp;b&#233;&#x4E2D;&mdash;&bogus;&amp;')).toBe('a bé中—&bogus;&');
  });
});

describe('xmlId', () => {
  it('keeps NCNames and repairs the rest deterministically', () => {
    expect(isNcName('pt-a-résumé')).toBe(true);
    expect(xmlId('pt-a-résumé')).toBe('pt-a-résumé');
    expect(xmlId('1st')).toBe('_1st');
    expect(xmlId('a b:c')).toBe('a_b_c');
  });
});

describe('htmlToXhtml', () => {
  it('self-closes void elements and gives boolean attributes values', () => {
    expect(htmlToXhtml('<img src="a.png" alt=""><br><input disabled>')).toBe('<img src="a.png" alt=""/><br/><input disabled="disabled"/>');
  });

  it('turns named entities into characters and escapes bare ampersands', () => {
    expect(htmlToXhtml('<p title="x&nbsp;y">A &amp; B&nbsp;&copy; R&D</p>')).toBe('<p title="x y">A &amp; B © R&amp;D</p>');
  });

  it('balances end tags and drops stray ones', () => {
    expect(htmlToXhtml('<div><span>a</div></b><p>b')).toBe('<div><span>a</span></div><p>b</p>');
  });

  it('declares the SVG namespace and keeps SVG name case', () => {
    expect(htmlToXhtml('<svg viewBox="0 0 1 1"><clipPath id="c"><rect/></clipPath><use xlink:href="#c"/></svg>'))
      .toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><clipPath id="c"><rect/></clipPath>' +
        '<use xlink:href="#c" xmlns:xlink="http://www.w3.org/1999/xlink"/></svg>');
    expect(htmlToXhtml('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  });

  it('repairs ids, drops duplicates and maps link fragments the same way', () => {
    const ids = new Set<string>();
    const out = htmlToXhtml('<span id="1a"></span><span id="1a"></span><a href="#1a">x</a><a href="p.xhtml#a b">y</a>', {
      ids,
      rewriteHref: (h) => h.startsWith('#') ? `page-0001.xhtml${h}` : h,
    });
    expect(out).toBe('<span id="_1a"></span><span></span><a href="page-0001.xhtml#_1a">x</a><a href="p.xhtml#a_b">y</a>');
    expect([...ids]).toEqual(['_1a']);
  });

  it('drops a link the rewrite has no target for', () => {
    expect(htmlToXhtml('<a href="#gone" class="x">t</a>', { rewriteHref: () => undefined })).toBe('<a class="x">t</a>');
  });

  it('hoists style elements and drops scripts and comments', () => {
    const styles: string[] = [];
    const out = htmlToXhtml('<div><style>.a>b{x:1}</style><!-- c --><script>alert(1)</script>t</div>', { hoistStyle: (c) => styles.push(c) });
    expect(out).toBe('<div>t</div>');
    expect(styles).toEqual(['.a>b{x:1}']);
  });

  it('rewrites image sources', () => {
    expect(htmlToXhtml('<img src="blob:x" alt="">', { rewriteSrc: () => 'images/x.png' })).toBe('<img src="images/x.png" alt=""/>');
  });

  it('round-trips through the XML reader', () => {
    const doc = xhtmlDocument({ lang: 'es', title: 'T & U', body: htmlToXhtml('<p class="x">Hola&nbsp;<b>mundo</b><br></p>') });
    const html = parseXml(doc);
    expect(html.attrs['xml:lang']).toBe('es');
    const p = descendants(html, 'p')[0]!;
    expect(textOf(p)).toBe('Hola mundo');
    expect(childElements(p).map((e) => e.name)).toEqual(['b', 'br']);
    expect(textOf(descendants(html, 'title')[0]!)).toBe('T & U');
  });
});
