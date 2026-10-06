// XML text helpers shared by every document the package writes, and the
// converter that turns the HTML renderers' markup into well-formed XHTML.

/** Escape text for an XML text node. */
export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape text for a double-quoted XML attribute value. */
export function escapeAttr(text: string): string {
  return escapeXml(text).replace(/"/g, '&quot;');
}

/** Drop characters XML 1.0 forbids (C0 controls but tab, LF, CR; lone
 *  surrogates; U+FFFE/U+FFFF). */
export function stripInvalidXmlChars(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** The HTML named character references markup is likely to carry. XHTML
 *  knows only the five XML ones, so the converter decodes these to their
 *  characters; any other name is kept as text (its `&` escaped). */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', shy: '­', ensp: ' ', emsp: ' ', thinsp: ' ', hairsp: ' ',
  zwnj: '‌', zwj: '‍', lrm: '‎', rlm: '‏', NoBreak: '⁠',
  ndash: '–', mdash: '—', minus: '−', hellip: '…', middot: '·', bull: '•',
  lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›',
  copy: '©', reg: '®', trade: '™', sect: '§', para: '¶', deg: '°',
  times: '×', divide: '÷', plusmn: '±', frac12: '½', frac14: '¼', frac34: '¾',
  dagger: '†', Dagger: '‡', prime: '′', Prime: '″', permil: '‰',
  iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', euro: '€', pound: '£', yen: '¥', cent: '¢',
  larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔',
};

/** Decode HTML character references (named ones from the table above,
 *  decimal and hexadecimal). An unknown or malformed one stays as text. */
export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '';
    }
    return NAMED_ENTITIES[ref] ?? whole;
  });
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

const NAME_START = 'A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const NAME_CHAR = `${NAME_START}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040`;
const NCNAME = new RegExp(`^[${NAME_START}][${NAME_CHAR}]*$`);
const ATTR_NAME = new RegExp(`^[${NAME_START}][${NAME_CHAR}]*(?::[${NAME_START}][${NAME_CHAR}]*)?$`);

/** Whether `name` is an XML NCName (what an `id` must be). */
export function isNcName(name: string): boolean {
  return NCNAME.test(name);
}

/** `id` as an XML NCName: unchanged when it is one, else its invalid
 *  characters replaced by `_` (and `_` put before a leading digit, dot or
 *  dash). Deterministic, so a link's fragment maps the same way. */
export function xmlId(id: string): string {
  if (isNcName(id)) return id;
  const chars = new RegExp(`[^${NAME_CHAR}]`, 'g');
  const fixed = id.replace(chars, '_');
  return new RegExp(`^[${NAME_START}]`).test(fixed) ? fixed : `_${fixed}`;
}

// ---------------------------------------------------------------------------
// HTML → XHTML
// ---------------------------------------------------------------------------

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const SVG_NS = 'http://www.w3.org/2000/svg';
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

export interface XhtmlOptions {
  /** Map of a same-document or cross-document link: given the `href` of an
   *  `<a>` (after entity decoding), returns the href to write, or undefined
   *  to drop the attribute (a link to nowhere). Fragments are made NCNames
   *  ({@link xmlId}) before it is called. */
  rewriteHref?: (href: string) => string | undefined;
  /** Map of an `<img src>` (after entity decoding). */
  rewriteSrc?: (src: string) => string;
  /** Ids already used in the document the fragment goes into; the converter
   *  adds the ones it writes and drops a repeated one. */
  ids?: Set<string>;
  /** Called with the text of each `<style>` element, which is then left
   *  out of the fragment (XHTML allows `<style>` only in the head). Without
   *  it, style elements stay where they are. */
  hoistStyle?: (css: string) => void;
}

interface Tag {
  /** Name as written in the output. */
  name: string;
  /** Lower-case name for matching end tags. */
  key: string;
  foreign: boolean;
}

/** Attributes of a start tag, in order (`value` undefined for a bare
 *  boolean attribute). */
function parseAttributes(source: string): { name: string; value: string | undefined }[] {
  const out: { name: string; value: string | undefined }[] = [];
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    out.push({ name: m[1]!, value: m[2] ?? m[3] ?? m[4] });
  }
  return out;
}

/**
 * Turn HTML markup (what `renderToHtml` and friends emit, or any fragment of
 * ordinary HTML) into well-formed XHTML: void elements self-closed, end tags
 * balanced, named character references made characters, bare boolean
 * attributes given values, attribute and element names valid, `xmlns` on
 * inline `<svg>` and `<math>`, `id`s made NCNames and unique, characters XML
 * forbids dropped. Comments and doctypes are dropped. It does not repair
 * HTML's implied structure (`<p>` closed by a block): the input is expected
 * to close its elements.
 */
export function htmlToXhtml(html: string, options: XhtmlOptions = {}): string {
  const out: string[] = [];
  const stack: Tag[] = [];
  const ids = options.ids ?? new Set<string>();
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[([\s\S]*?)(?:\]\]>|$)|<![^>]*>|<\?[\s\S]*?(?:\?>|$)|<\/([A-Za-z][^\s/>]*)\s*>|<([A-Za-z][^\s/>]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const text = (s: string): void => {
    if (s) out.push(escapeXml(stripInvalidXmlChars(decodeEntities(s))));
  };
  while ((m = re.exec(html))) {
    text(html.slice(last, m.index));
    last = re.lastIndex;
    const [, cdata, endName, startName, attrSource, selfClose] = m;
    if (cdata !== undefined) {
      text(cdata.replace(/&/g, '&amp;'));
      continue;
    }
    if (endName !== undefined) {
      const key = endName.toLowerCase();
      if (VOID_ELEMENTS.has(key) && !stack.some((t) => t.foreign)) continue;
      const at = stack.map((t) => t.key).lastIndexOf(key);
      if (at < 0) continue; // a stray end tag
      while (stack.length > at) out.push(`</${stack.pop()!.name}>`);
      continue;
    }
    if (startName === undefined) continue; // comment, doctype, processing instruction
    const parent = stack[stack.length - 1];
    const lower = startName.toLowerCase();
    const foreign = parent?.foreign === true || lower === 'svg' || lower === 'math';
    // SVG and MathML names are case-sensitive (`foreignObject`, `viewBox`).
    const name = foreign ? startName : lower;
    if (lower === 'style' && !foreign && options.hoistStyle) {
      const close = html.toLowerCase().indexOf('</style', last);
      const end = close < 0 ? html.length : close;
      options.hoistStyle(html.slice(last, end));
      re.lastIndex = last = close < 0 ? html.length : html.indexOf('>', close) + 1 || html.length;
      continue;
    }
    if (lower === 'script') {
      // The page's own scripts are dropped: the only script an EPUB links
      // is the video playback one (#507), which the package declares.
      const close = html.toLowerCase().indexOf('</script', last);
      re.lastIndex = last = close < 0 ? html.length : html.indexOf('>', close) + 1 || html.length;
      continue;
    }
    const attrs: string[] = [];
    const seen = new Set<string>();
    let hasXmlns = false;
    let usesXlink = false;
    for (const a of parseAttributes(attrSource ?? '')) {
      const attrName = foreign ? a.name : a.name.toLowerCase();
      if (!ATTR_NAME.test(attrName) || seen.has(attrName)) continue;
      seen.add(attrName);
      let value = a.value === undefined ? attrName : stripInvalidXmlChars(decodeEntities(a.value));
      if (attrName === 'xmlns') hasXmlns = true;
      if (attrName.startsWith('xlink:')) usesXlink = true;
      if (attrName === 'xmlns:xlink') usesXlink = false;
      if (attrName === 'id') {
        value = xmlId(value);
        if (ids.has(value)) continue;
        ids.add(value);
      } else if (attrName === 'href' && !foreign && name === 'a') {
        const hash = value.indexOf('#');
        if (hash >= 0) value = value.slice(0, hash + 1) + xmlId(value.slice(hash + 1));
        if (options.rewriteHref) {
          const mapped = options.rewriteHref(value);
          if (mapped === undefined) continue;
          value = mapped;
        }
      } else if (attrName === 'src' && name === 'img' && options.rewriteSrc) {
        value = options.rewriteSrc(value);
      }
      attrs.push(` ${attrName}="${escapeAttr(value)}"`);
    }
    if (!hasXmlns && (lower === 'svg' || lower === 'math') && parent?.foreign !== true) {
      attrs.unshift(` xmlns="${lower === 'svg' ? SVG_NS : MATHML_NS}"`);
    }
    if (usesXlink) attrs.push(` xmlns:xlink="${XLINK_NS}"`);
    const isVoid = !foreign && VOID_ELEMENTS.has(lower);
    if (isVoid || (selfClose && foreign)) {
      out.push(`<${name}${attrs.join('')}/>`);
    } else {
      out.push(`<${name}${attrs.join('')}>`);
      // `<div/>` in HTML opens the element; it is closed by its end tag.
      stack.push({ name, key: lower, foreign });
    }
  }
  text(html.slice(last));
  while (stack.length > 0) out.push(`</${stack.pop()!.name}>`);
  return out.join('');
}

/** An XHTML content document. `head` and `body` are XHTML already. */
export function xhtmlDocument(parts: {
  lang: string;
  dir?: 'ltr' | 'rtl';
  title: string;
  head?: string;
  body: string;
  /** Attributes of `<body>`, each with its leading space. */
  bodyAttrs?: string;
}): string {
  const dir = parts.dir ? ` dir="${parts.dir}"` : '';
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!DOCTYPE html>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeAttr(parts.lang)}" xml:lang="${escapeAttr(parts.lang)}"${dir}>\n` +
    `<head>\n<meta charset="UTF-8"/>\n<title>${escapeXml(parts.title)}</title>\n${parts.head ?? ''}</head>\n` +
    `<body${parts.bodyAttrs ?? ''}>\n${parts.body}\n</body>\n</html>\n`
  );
}
