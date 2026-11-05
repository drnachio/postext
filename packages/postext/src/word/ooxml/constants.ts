// Namespaces, relationship types and content types of the OOXML package.

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  wp14: 'http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  wps: 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape',
  wpg: 'http://schemas.microsoft.com/office/word/2010/wordprocessingGroup',
  mc: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  w14: 'http://schemas.microsoft.com/office/word/2010/wordml',
  w15: 'http://schemas.microsoft.com/office/word/2012/wordml',
  m: 'http://schemas.openxmlformats.org/officeDocument/2006/math',
  asvg: 'http://schemas.microsoft.com/office/drawing/2016/SVG/main',
  v: 'urn:schemas-microsoft-com:vml',
  o: 'urn:schemas-microsoft-com:office:office',
} as const;

/** Every namespace either variant writes, plus `mc:Ignorable` for the
 *  Word 2010+ ones; used on the document, headers, footers and notes. */
export const WORDML_NAMESPACES =
  Object.entries(NS).map(([p, uri]) => `xmlns:${p}="${uri}"`).join(' ') + ' mc:Ignorable="w14 w15 wp14"';

/** Only `w` and `r`, for settings, styles, numbering and the font table. */
export const W_NAMESPACES = `xmlns:w="${NS.w}" xmlns:r="${NS.r}"`;

const OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
export const REL = {
  officeDocument: `${OFFICE_REL}officeDocument`,
  coreProps: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  appProps: `${OFFICE_REL}extended-properties`,
  customProps: `${OFFICE_REL}custom-properties`,
  styles: `${OFFICE_REL}styles`,
  numbering: `${OFFICE_REL}numbering`,
  footnotes: `${OFFICE_REL}footnotes`,
  endnotes: `${OFFICE_REL}endnotes`,
  settings: `${OFFICE_REL}settings`,
  fontTable: `${OFFICE_REL}fontTable`,
  webSettings: `${OFFICE_REL}webSettings`,
  header: `${OFFICE_REL}header`,
  footer: `${OFFICE_REL}footer`,
  comments: `${OFFICE_REL}comments`,
  customXml: `${OFFICE_REL}customXml`,
  customXmlProps: `${OFFICE_REL}customXmlProps`,
  image: `${OFFICE_REL}image`,
  hyperlink: `${OFFICE_REL}hyperlink`,
  font: `${OFFICE_REL}font`,
} as const;

const WML = 'application/vnd.openxmlformats-officedocument.wordprocessingml.';
export const CONTENT_TYPE = {
  document: `${WML}document.main+xml`,
  styles: `${WML}styles+xml`,
  numbering: `${WML}numbering+xml`,
  footnotes: `${WML}footnotes+xml`,
  endnotes: `${WML}endnotes+xml`,
  settings: `${WML}settings+xml`,
  fontTable: `${WML}fontTable+xml`,
  webSettings: `${WML}webSettings+xml`,
  header: `${WML}header+xml`,
  footer: `${WML}footer+xml`,
  comments: `${WML}comments+xml`,
  customXmlProps: 'application/vnd.openxmlformats-officedocument.customXmlProperties+xml',
  coreProps: 'application/vnd.openxmlformats-package.core-properties+xml',
  appProps: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
  customProps: 'application/vnd.openxmlformats-officedocument.custom-properties+xml',
} as const;

/** `Default` content types by extension. */
export const DEFAULT_TYPES: Record<string, string> = {
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
  xml: 'application/xml',
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  emf: 'image/x-emf',
  odttf: 'application/vnd.openxmlformats-officedocument.obfuscatedFont',
};

export interface Rel {
  id: string;
  type: string;
  target: string;
  external?: boolean;
}

export function relsXml(rels: readonly Rel[]): string {
  const items = rels
    .map((r) => {
      const target = r.target.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      return `<Relationship Id="${r.id}" Type="${r.type}" Target="${target}"${r.external ? ' TargetMode="External"' : ''}/>`;
    })
    .join('');
  return `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
}
