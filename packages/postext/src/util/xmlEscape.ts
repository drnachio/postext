/** Escaping for text written into XML and SVG markup. */

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
