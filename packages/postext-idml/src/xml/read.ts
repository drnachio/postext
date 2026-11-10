// The XML reader of the IDML parts. No DOMParser, so it runs in Node, in
// workers and in the browser alike. It reads what InDesign writes and
// keeps what an IDML story needs that a plain reader drops: processing
// instructions inside text (`<?ACE 4?>`, the special characters of a
// story) and the document's own instruction (`<?aid … ?>`).
//
// Linear in the size of the source whatever it holds: a tag that fails
// reads no further than the next `<`, a closing mark that is not there is
// looked for once. Entities are the five of XML and character references;
// a DOCTYPE is skipped, never expanded.

export interface XmlElement {
  /** Qualified name as written (`idPkg:Story`, `ParagraphStyleRange`). */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

/** A processing instruction (`<?ACE 4?>`: target `ACE`, data `4`). */
export interface XmlInstruction {
  pi: string;
  data: string;
}

export type XmlNode = XmlElement | XmlInstruction | string;

export class XmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlError';
  }
}

export const isElement = (n: XmlNode | undefined): n is XmlElement => typeof n === 'object' && n !== null && 'name' in n;
export const isInstruction = (n: XmlNode | undefined): n is XmlInstruction => typeof n === 'object' && n !== null && 'pi' in n;

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,8});/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[body] ?? m;
  });
}

/** The local part of a qualified name (`idPkg:Story` → `Story`). */
export const localName = (name: string): string => name.slice(name.indexOf(':') + 1);

// `<` stands in no name and no attribute value, so a tag that fails has
// read no further than the next `<`.
const TAG = /<\/([^\s<>]+)\s*>|<([^\s/<>!?]+)((?:\s+[^\s=/<>]+\s*=\s*(?:"[^"<]*"|'[^'<]*'))*)\s*(\/?)>/y;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export interface ParseXmlOptions {
  /** Deepest nesting read (default 256); deeper is an {@link XmlError}. */
  maxDepth?: number;
  /** The document's own instructions before the root (`<?aid … ?>`) are
   *  handed here. */
  onProlog?: (pi: XmlInstruction) => void;
}

/** Parse an XML part; returns its root element. Whitespace-only text
 *  between elements is dropped (IDML has no mixed content outside
 *  `Content`, whose text is kept as written). */
export function parseXml(source: string, options: ParseXmlOptions = {}): XmlElement {
  const maxDepth = options.maxDepth ?? 256;
  const root: XmlElement = { name: '#document', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  const absent = new Set<string>();
  const past = (mark: string, from: number): number => {
    if (absent.has(mark)) return -1;
    const at = source.indexOf(mark, from);
    if (at < 0) absent.add(mark);
    return at < 0 ? -1 : at + mark.length;
  };
  const top = (): XmlElement => stack[stack.length - 1]!;
  const text = (from: number, to: number): void => {
    if (to <= from) return;
    const raw = source.slice(from, to);
    const t = top();
    // Text is content only where IDML holds text.
    if (KEEPS_TEXT.has(localName(t.name)) || /\S/.test(raw)) t.children.push(decodeEntities(raw));
  };
  let last = 0;
  for (let i = source.indexOf('<'); i >= 0; ) {
    let end = -1;
    const next = source[i + 1];
    if (next === '!') {
      if (source.startsWith('<![CDATA[', i)) {
        end = past(']]>', i + 9);
        if (end >= 0) {
          text(last, i);
          top().children.push(source.slice(i + 9, end - 3));
          last = end;
        }
      } else {
        end = source.startsWith('<!--', i) ? past('-->', i + 4) : past('>', i + 2);
        if (end >= 0) {
          text(last, i);
          last = end;
        }
      }
    } else if (next === '?') {
      end = past('?>', i + 2);
      if (end >= 0) {
        text(last, i);
        last = end;
        const body = source.slice(i + 2, end - 2);
        const sp = body.search(/\s/);
        const pi: XmlInstruction = { pi: sp < 0 ? body : body.slice(0, sp), data: sp < 0 ? '' : body.slice(sp + 1).trim() };
        if (stack.length === 1) {
          if (pi.pi.toLowerCase() !== 'xml') options.onProlog?.(pi);
        } else top().children.push(pi);
      }
    } else {
      TAG.lastIndex = i;
      const m = TAG.exec(source);
      if (m) {
        end = TAG.lastIndex;
        text(last, i);
        last = end;
        const [, close, open, attrs, self] = m;
        if (close !== undefined) {
          let at = stack.length - 1;
          while (at > 0 && stack[at]!.name !== close) at--;
          if (at > 0) stack.length = at;
        } else {
          const el: XmlElement = { name: open!, attrs: {}, children: [] };
          if (attrs) {
            ATTR.lastIndex = 0;
            let a: RegExpExecArray | null;
            while ((a = ATTR.exec(attrs))) el.attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? '');
          }
          top().children.push(el);
          if (!self) {
            if (stack.length > maxDepth) throw new XmlError(`XML nested deeper than ${maxDepth} elements`);
            stack.push(el);
          }
        }
      }
    }
    i = source.indexOf('<', end >= 0 ? end : i + 1);
  }
  text(last, source.length);
  const first = root.children.find(isElement);
  if (!first) throw new XmlError('no root element');
  return first;
}

/** Elements whose text is content, kept with its spaces. */
const KEEPS_TEXT = new Set(['Content', 'Contents', 'Data', 'GrPr', 'MojikumiTable']);

/** Child elements of `el` (with this local name when given). */
export function children(el: XmlElement | undefined, local?: string): XmlElement[] {
  if (!el) return [];
  const out: XmlElement[] = [];
  for (const c of el.children) if (isElement(c) && (local === undefined || localName(c.name) === local)) out.push(c);
  return out;
}

/** The first child element of `el` with this local name. */
export function child(el: XmlElement | undefined, local: string): XmlElement | undefined {
  if (!el) return undefined;
  for (const c of el.children) if (isElement(c) && localName(c.name) === local) return c;
  return undefined;
}

/** Every descendant element with this local name, in document order. */
export function descendants(el: XmlElement, local: string, out: XmlElement[] = []): XmlElement[] {
  const stack: XmlElement[] = [el];
  const order: XmlElement[] = [];
  while (stack.length) {
    const e = stack.pop()!;
    if (e !== el && localName(e.name) === local) order.push(e);
    for (let i = e.children.length - 1; i >= 0; i--) {
      const c = e.children[i]!;
      if (isElement(c)) stack.push(c);
    }
  }
  out.push(...order);
  return out;
}

/** The concatenated text of an element (instructions left out). */
export function textOf(el: XmlElement | undefined): string {
  if (!el) return '';
  let out = '';
  for (const c of el.children) out += typeof c === 'string' ? c : isElement(c) ? textOf(c) : '';
  return out;
}

/** A property of an element's `<Properties>` child, by name. */
export function property(el: XmlElement | undefined, name: string): XmlElement | undefined {
  return child(child(el, 'Properties'), name);
}

/** Attribute readers: absent or unreadable is `undefined`. */
export const str = (el: XmlElement | undefined, name: string): string | undefined => el?.attrs[name];
export function num(el: XmlElement | undefined, name: string): number | undefined {
  const v = el?.attrs[name];
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
export function bool(el: XmlElement | undefined, name: string): boolean | undefined {
  const v = el?.attrs[name];
  return v === 'true' ? true : v === 'false' ? false : undefined;
}
/** A list of numbers in one attribute (`"0 0 792 612"`). */
export function nums(el: XmlElement | undefined, name: string): number[] | undefined {
  const v = el?.attrs[name];
  if (v === undefined) return undefined;
  const out = v.trim().split(/\s+/).filter(Boolean).map(Number);
  return out.every(Number.isFinite) ? out : undefined;
}
