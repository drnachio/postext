// A strict XML well-formedness check for the tests: tags balanced and
// properly nested, attributes quoted and not repeated, only the five XML
// entities and character references, no `<` or bare `&` in text. Returns
// the problems found (empty when the document is well formed) and the ids
// it declares, so links can be checked against them.

export interface XmlCheck {
  errors: string[];
  ids: string[];
  /** `href`/`src` attribute values, in order. */
  refs: string[];
}

const NAME = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/;
const REF = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

export function checkXml(xml: string): XmlCheck {
  const errors: string[] = [];
  const ids: string[] = [];
  const refs: string[] = [];
  const stack: string[] = [];
  let i = 0;
  let roots = 0;
  const text = (s: string) => {
    if (REF.test(s)) errors.push(`bare & in text near "${s.slice(0, 40)}"`);
    if (s.includes('>') && /\]\]>/.test(s)) errors.push('"]]>" in text');
  };
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      text(xml.slice(i));
      break;
    }
    text(xml.slice(i, lt));
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt);
      if (end < 0) return { errors: [...errors, 'unclosed processing instruction'], ids, refs };
      i = end + 2;
      continue;
    }
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt);
      if (end < 0) return { errors: [...errors, 'unclosed comment'], ids, refs };
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<!DOCTYPE', lt)) {
      const end = xml.indexOf('>', lt);
      i = end + 1;
      continue;
    }
    const gt = xml.indexOf('>', lt);
    if (gt < 0) return { errors: [...errors, 'unclosed tag'], ids, refs };
    const tag = xml.slice(lt + 1, gt);
    i = gt + 1;
    if (tag.startsWith('/')) {
      const name = tag.slice(1).trim();
      const open = stack.pop();
      if (open !== name) errors.push(`</${name}> closes <${open ?? 'nothing'}>`);
      continue;
    }
    const selfClosing = tag.endsWith('/');
    const body = selfClosing ? tag.slice(0, -1) : tag;
    const m = /^([^\s/>]+)([\s\S]*)$/.exec(body);
    if (!m || !NAME.test(m[1]!)) {
      errors.push(`bad tag <${tag.slice(0, 30)}>`);
      continue;
    }
    const name = m[1]!;
    let rest = m[2]!;
    const seen = new Set<string>();
    const attr = /^\s+([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/;
    for (;;) {
      const a = attr.exec(rest);
      if (!a) break;
      const key = a[1]!;
      const value = a[3] ?? a[4] ?? '';
      if (!NAME.test(key)) errors.push(`bad attribute name ${key} on <${name}>`);
      if (seen.has(key)) errors.push(`repeated attribute ${key} on <${name}>`);
      seen.add(key);
      if (value.includes('<')) errors.push(`< in attribute ${key}`);
      if (REF.test(value)) errors.push(`bare & in attribute ${key}`);
      if (key === 'id') ids.push(value);
      if (key === 'href' || key === 'src' || key === 'xlink:href') refs.push(value);
      rest = rest.slice(a[0].length);
    }
    if (rest.trim()) errors.push(`junk in <${name}>: "${rest.trim().slice(0, 30)}"`);
    if (stack.length === 0) roots++;
    if (!selfClosing) stack.push(name);
  }
  if (stack.length > 0) errors.push(`unclosed <${stack.join('> <')}>`);
  if (roots !== 1) errors.push(`${roots} root elements`);
  const dup = ids.filter((id, k) => ids.indexOf(id) !== k);
  if (dup.length > 0) errors.push(`duplicate ids: ${[...new Set(dup)].join(', ')}`);
  return { errors, ids, refs };
}
