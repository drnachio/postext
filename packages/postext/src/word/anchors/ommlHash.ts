// A stable fingerprint of an equation's OMML (#1395). Word rewrites the
// equations it opens: it adds rsid attributes, Cambria Math run properties
// (`w:rPr` inside `m:r`, `m:ctrlPr`), namespace declarations and
// whitespace. The canonical form keeps only the Office Math structure
// (elements and attributes in the `m:` namespace, the text of `m:t`), so
// an equation the user did not touch hashes the same as when it was
// written, and the importer keeps its TeX byte-identical.

import { hashText } from './hash.js';
import { parseXml, type XmlElement, type XmlNode } from '../xml.js';

const prefixOf = (name: string): string => (name.includes(':') ? name.slice(0, name.indexOf(':')) : '');
const localOf = (name: string): string => name.slice(name.indexOf(':') + 1);

function canonicalNode(el: XmlElement): string {
  // Word's control properties only carry run formatting for the editor.
  if (localOf(el.name) === 'ctrlPr') return '';
  let inner = '';
  for (const c of el.children) inner += typeof c === 'string' ? (localOf(el.name) === 't' ? c : c.trim()) : canonicalChild(c);
  const attrs = Object.keys(el.attrs)
    .filter((k) => prefixOf(k) === 'm')
    .sort()
    .map((k) => ` ${localOf(k)}="${el.attrs[k]}"`)
    .join('');
  const local = localOf(el.name);
  // A property element left empty (Word adds `m:sSupPr` around a
  // `m:ctrlPr`) says nothing.
  if (!inner && !attrs && local.endsWith('Pr')) return '';
  return `<${local}${attrs}>${inner}</${local}>`;
}

function canonicalChild(node: XmlNode): string {
  if (typeof node === 'string') return node.trim();
  return prefixOf(node.name) === 'm' ? canonicalNode(node) : '';
}

/** The first `m:oMath` at or below `el`. */
function firstOMath(el: XmlElement): XmlElement | undefined {
  if (localOf(el.name) === 'oMath') return el;
  for (const c of el.children) {
    if (typeof c === 'string') continue;
    const got = firstOMath(c);
    if (got) return got;
  }
  return undefined;
}

/** The canonical spelling of an `m:oMath` element. */
export function canonicalOmml(el: XmlElement): string {
  return canonicalNode(el);
}

/** Hash of the canonical OMML of the first equation in `omml` (an element,
 *  or the XML the writer emits, which may hold `m:oMathPara` and runs
 *  without namespace declarations). Undefined when there is none. */
export function ommlHash(omml: XmlElement | string): string | undefined {
  let root: XmlElement;
  if (typeof omml === 'string') {
    try {
      root = parseXml(`<root>${omml}</root>`);
    } catch {
      return undefined;
    }
  } else root = omml;
  const eq = firstOMath(root);
  return eq ? hashText(canonicalOmml(eq)) : undefined;
}
