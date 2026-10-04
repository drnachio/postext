// XML text helpers shared by every document the package writes.

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
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}
