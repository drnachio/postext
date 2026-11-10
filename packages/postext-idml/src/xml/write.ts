// Writing XML: escaping, numbers and attributes as InDesign writes them.

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
  return escapeXml(s).replace(/"/g, '&quot;').replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
}

/** A number as IDML writes it: up to four decimals, no trailing zeros. */
export function num(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 10000) / 10000;
  return Object.is(r, -0) ? '0' : String(r);
}

export const attr = (name: string, value: string | number | boolean | undefined): string =>
  value === undefined ? '' : ` ${name}="${escapeAttr(typeof value === 'number' ? num(value) : String(value))}"`;

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
