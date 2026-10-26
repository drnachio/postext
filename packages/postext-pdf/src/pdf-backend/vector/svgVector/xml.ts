// The small XML parser the SVG subset is read with: elements, attributes
// and entities (#1276: split out of svgVector.ts).


// ------------------------------------------------------------ XML parsing

export interface XmlEl {
  name: string;
  attrs: Record<string, string>;
  children: XmlEl[];
  /** Child elements and character data in document order. */
  content: (XmlEl | string)[];
  /** True when the element holds non-whitespace character data. */
  hasText?: boolean;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body] ?? m;
  });
}

/** Local name of a qualified name (`svg:path` → `path`); `null` for names in
 *  foreign namespaces we can safely skip (`inkscape:*`, `sodipodi:*`, ...). */
export function localName(qualified: string): { local: string; foreign: boolean } {
  const i = qualified.indexOf(':');
  if (i < 0) return { local: qualified, foreign: false };
  const prefix = qualified.slice(0, i);
  return { local: qualified.slice(i + 1), foreign: prefix !== 'svg' };
}

/** Minimal non-validating XML parser: elements, attributes, comments, CDATA,
 *  processing instructions and doctype. Character data is discarded (no
 *  supported element renders text). Returns `null` on malformed input. */
export function parseXml(text: string): XmlEl | null {
  const root: XmlEl = { name: '#root', attrs: {}, children: [], content: [] };
  const stack: XmlEl[] = [root];
  let i = 0;
  const n = text.length;
  const markText = (from: number, to: number, raw = false): void => {
    if (to <= from) return;
    const top = stack[stack.length - 1]!;
    const chunk = text.slice(from, to);
    if (chunk.trim() !== '') top.hasText = true;
    top.content.push(raw ? chunk : decodeEntities(chunk));
  };
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      markText(i, n);
      break;
    }
    markText(i, lt);
    i = lt;
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) return null;
      i = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end < 0) return null;
      markText(i + 9, end, true);
      i = end + 3;
      continue;
    }
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end < 0) return null;
      i = end + 2;
      continue;
    }
    if (text.startsWith('<!', i)) {
      // <!DOCTYPE ...> possibly with an internal subset in [ ... ].
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const ch = text[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth === 0) break;
      }
      if (j >= n) return null;
      i = j + 1;
      continue;
    }
    if (text.startsWith('</', i)) {
      const end = text.indexOf('>', i + 2);
      if (end < 0) return null;
      const name = text.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name || stack.length === 0) return null;
      i = end + 1;
      continue;
    }
    // Start tag.
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(text[j]!)) j++;
    const name = text.slice(i + 1, j);
    if (!name) return null;
    const attrs: Record<string, string> = {};
    let selfClosing = false;
    for (;;) {
      while (j < n && /\s/.test(text[j]!)) j++;
      if (j >= n) return null;
      if (text[j] === '/') {
        selfClosing = true;
        j++;
        continue;
      }
      if (text[j] === '>') {
        j++;
        break;
      }
      let k = j;
      while (k < n && !/[\s=/>]/.test(text[k]!)) k++;
      const attrName = text.slice(j, k);
      if (!attrName) return null;
      j = k;
      while (j < n && /\s/.test(text[j]!)) j++;
      if (text[j] !== '=') {
        // Attribute without a value (not valid XML, but harmless).
        attrs[attrName] = '';
        continue;
      }
      j++;
      while (j < n && /\s/.test(text[j]!)) j++;
      const quote = text[j];
      if (quote !== '"' && quote !== "'") return null;
      const close = text.indexOf(quote, j + 1);
      if (close < 0) return null;
      attrs[attrName] = decodeEntities(text.slice(j + 1, close));
      j = close + 1;
    }
    const el: XmlEl = { name, attrs, children: [], content: [] };
    stack[stack.length - 1]!.children.push(el);
    stack[stack.length - 1]!.content.push(el);
    if (!selfClosing) stack.push(el);
    i = j;
  }
  if (stack.length !== 1) return null;
  return root;
}
