/**
 * A small XML reader for the parts of an IDML package. No DOMParser, so it
 * runs in Node and in the browser alike. It keeps the processing
 * instructions, which carry meaning in a story: `<?ACE 18?>` is the current
 * page number, `<?ACE 4?>` a footnote's number. Not a validating parser:
 * it reads what InDesign and Postext write.
 */

export interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

/** An element, a run of text, or a processing instruction. */
export type XmlNode = XmlEl | string | { pi: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decode(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body] ?? m;
  });
}

const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** The root element of `source`. */
export function parseXml(source: string): XmlEl {
  const root: XmlEl = { name: '#document', attrs: {}, children: [] };
  const stack: XmlEl[] = [root];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const lt = source.indexOf('<', i);
    const top = stack[stack.length - 1]!;
    if (lt < 0) {
      pushText(top, source.slice(i));
      break;
    }
    if (lt > i) pushText(top, source.slice(i, lt));
    if (source.startsWith('<?', lt)) {
      const end = source.indexOf('?>', lt + 2);
      const body = source.slice(lt + 2, end < 0 ? n : end).trim();
      if (stack.length > 1) top.children.push({ pi: body });
      i = end < 0 ? n : end + 2;
    } else if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
    } else if (source.startsWith('<![CDATA[', lt)) {
      const end = source.indexOf(']]>', lt + 9);
      top.children.push(source.slice(lt + 9, end < 0 ? n : end));
      i = end < 0 ? n : end + 3;
    } else if (source.startsWith('<!', lt)) {
      const end = source.indexOf('>', lt + 2);
      i = end < 0 ? n : end + 1;
    } else if (source[lt + 1] === '/') {
      const end = source.indexOf('>', lt + 2);
      const name = source.slice(lt + 2, end < 0 ? n : end).trim();
      // Close up to the matching element (a stray close tag is ignored).
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k]!.name === name) {
          stack.length = k;
          break;
        }
      }
      i = end < 0 ? n : end + 1;
    } else {
      // A tag: its end is the first `>` outside a quoted value.
      let j = lt + 1;
      let quote = '';
      while (j < n) {
        const c = source[j]!;
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        j++;
      }
      let body = source.slice(lt + 1, j);
      const selfClose = body.endsWith('/');
      if (selfClose) body = body.slice(0, -1);
      const space = body.search(/\s/);
      const name = space < 0 ? body : body.slice(0, space);
      const attrs: Record<string, string> = {};
      if (space >= 0) {
        ATTR.lastIndex = 0;
        let m: RegExpExecArray | null;
        const rest = body.slice(space);
        while ((m = ATTR.exec(rest))) attrs[m[1]!] = decode(m[2] ?? m[3] ?? '');
      }
      const el: XmlEl = { name, attrs, children: [] };
      top.children.push(el);
      if (!selfClose) stack.push(el);
      i = j + 1;
    }
  }
  const first = root.children.find(isEl);
  if (!first) throw new Error('IDML import: not an XML part');
  return first;
}

function pushText(el: XmlEl, raw: string): void {
  if (raw) el.children.push(decode(raw));
}

export const isEl = (n: XmlNode | undefined): n is XmlEl => typeof n === 'object' && n !== null && 'name' in n;

/** The local part of a name (`idPkg:Story` → `Story`). */
export const local = (name: string): string => name.slice(name.indexOf(':') + 1);

/** The child elements, those named `name` (local name) when given. */
export function kids(el: XmlEl | undefined, name?: string): XmlEl[] {
  if (!el) return [];
  return el.children.filter((c): c is XmlEl => isEl(c) && (name === undefined || local(c.name) === name));
}

export function kid(el: XmlEl | undefined, name: string): XmlEl | undefined {
  return el?.children.find((c): c is XmlEl => isEl(c) && local(c.name) === name);
}

/** Every descendant named `name`, in document order. */
export function descendants(el: XmlEl, name: string, out: XmlEl[] = []): XmlEl[] {
  for (const c of el.children) {
    if (!isEl(c)) continue;
    if (local(c.name) === name) out.push(c);
    descendants(c, name, out);
  }
  return out;
}

/** The text an element holds, its descendants' included. */
export function textOf(el: XmlEl): string {
  return el.children.map((c) => (typeof c === 'string' ? c : isEl(c) ? textOf(c) : '')).join('');
}
