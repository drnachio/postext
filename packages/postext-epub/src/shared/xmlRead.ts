// A small XML reader for the package files a viewer needs (container.xml,
// the OPF, the navigation document): elements, attributes and text, with
// namespace prefixes kept in the names. No DOMParser, so it runs in Node
// tests and in workers alike. Not a validating parser: it reads what this
// package and ordinary EPUB writers produce.

import { decodeEntities } from './xml';

export interface XmlElement {
  /** Qualified name as written (`dc:title`, `opf:meta`, `nav`). */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlElement | string;

/** The local part of a qualified name. */
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
export function childElements(el: XmlElement, local?: string): XmlElement[] {
  return el.children.filter((c): c is XmlElement => typeof c !== 'string' && (local === undefined || localName(c.name) === local));
}

/** Every descendant element with the local name, in document order. */
export function descendants(el: XmlElement, local: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (e: XmlElement): void => {
    for (const c of e.children) {
      if (typeof c === 'string') continue;
      if (localName(c.name) === local) out.push(c);
      walk(c);
    }
  };
  walk(el);
  return out;
}

/** The text content of `el`, XML whitespace collapsed (a no-break space
 *  is kept). */
export function textOf(el: XmlElement): string {
  const parts: string[] = [];
  const walk = (e: XmlElement): void => {
    for (const c of e.children) {
      if (typeof c === 'string') parts.push(c);
      else walk(c);
    }
  };
  walk(el);
  return parts.join('').replace(/[ \t\r\n]+/g, ' ').replace(/^ | $/g, '');
}
