// A small XML reader and writer for the WordprocessingML parts of a `.docx`
// (document, styles, numbering, footnotes, relationships). No DOMParser, so
// it runs in Node tests and in the browser alike. Not a validating parser:
// it reads what Word, LibreOffice and Google Docs write.

export interface XmlElement {
  /** Qualified name as written (`w:p`, `w:rPr`, `Relationship`). */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlElement | string;

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body] ?? m;
  });
}

/** Text escaped for an element body. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Characters XML 1.0 does not allow (C0 controls bar tab, LF, CR).
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
}

/** Text escaped for a double-quoted attribute value. */
export function escapeAttr(s: string): string {
  return escapeXml(s).replace(/"/g, '&quot;');
}

/** The local part of a qualified name (`w:p` → `p`). */
export const localName = (name: string): string => name.slice(name.indexOf(':') + 1);

/** Parse an XML document; returns its root element. */
export function parseXml(source: string): XmlElement {
  const root: XmlElement = { name: '#document', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\?[\s\S]*?\?>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const top = (): XmlElement => stack[stack.length - 1]!;
  const text = (s: string): void => {
    if (s) top().children.push(decodeEntities(s));
  };
  while ((m = re.exec(source))) {
    text(source.slice(last, m.index));
    last = re.lastIndex;
    const [, cdata, endName, startName, attrSource, selfClose] = m;
    if (cdata !== undefined) {
      top().children.push(cdata);
    } else if (endName !== undefined) {
      const at = stack.map((e) => e.name).lastIndexOf(endName);
      if (at > 0) stack.length = at;
    } else if (startName !== undefined) {
      const attrs: Record<string, string> = {};
      const ar = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let a: RegExpExecArray | null;
      while ((a = ar.exec(attrSource ?? ''))) attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? '');
      const el: XmlElement = { name: startName, attrs, children: [] };
      top().children.push(el);
      if (!selfClose) stack.push(el);
    }
  }
  text(source.slice(last));
  const first = root.children.find((c): c is XmlElement => typeof c !== 'string');
  if (!first) throw new Error('parseXml: no root element');
  return first;
}

/** Child elements of `el` (by local name when given). */
export function children(el: XmlElement | undefined, local?: string): XmlElement[] {
  if (!el) return [];
  return el.children.filter((c): c is XmlElement => typeof c !== 'string' && (local === undefined || localName(c.name) === local));
}

/** The first child element of `el` with this local name. */
export function child(el: XmlElement | undefined, local: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) if (typeof c !== 'string' && localName(c.name) === local) return c;
  return undefined;
}

/** Every descendant element with this local name, in document order. */
export function descendants(el: XmlElement, local: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of el.children) {
    if (typeof c === 'string') continue;
    if (localName(c.name) === local) out.push(c);
    descendants(c, local, out);
  }
  return out;
}

/** An attribute by local name (`w:val` and `val` both answer `val`). */
export function attr(el: XmlElement | undefined, local: string): string | undefined {
  if (!el) return undefined;
  const direct = el.attrs[`w:${local}`] ?? el.attrs[local];
  if (direct !== undefined) return direct;
  for (const [k, v] of Object.entries(el.attrs)) if (localName(k) === local) return v;
  return undefined;
}

/** The concatenated text of an element. */
export function textOf(el: XmlElement): string {
  let out = '';
  for (const c of el.children) out += typeof c === 'string' ? c : textOf(c);
  return out;
}

/** A WordprocessingML on/off property (`<w:b/>`, `<w:b w:val="0"/>`):
 *  undefined when the element is absent. */
export function onOff(el: XmlElement | undefined): boolean | undefined {
  if (!el) return undefined;
  const v = attr(el, 'val');
  return v === undefined || !(v === '0' || v === 'false' || v === 'off' || v === 'none');
}
