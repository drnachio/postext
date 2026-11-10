// Hidden runs (#1444): `w:vanish` put into every run of a piece of
// paragraph XML, in its place among the run properties (CT_RPr order),
// so Word, LibreOffice and Google Docs show nothing while the text and its
// bookmarks stay for the importer.

/** Run properties that come after `w:vanish` in CT_RPr. */
const AFTER_VANISH = /^<w:(?:webHidden|color|spacing|w|kern|position|sz|szCs|highlight|u|effect|bdr|shd|fitText|vertAlign|rtl|cs|em|lang|eastAsianLayout|specVanish|oMath)[ />]/;

/** `xml` with each of its runs hidden. */
export function hideRuns(xml: string): string {
  return xml.replace(/<w:r>(?:<w:rPr>((?:(?!<\/w:rPr>).)*)<\/w:rPr>)?/g, (_m, inner: string | undefined) => {
    if (inner === undefined) return '<w:r><w:rPr><w:vanish/></w:rPr>';
    if (inner.includes('<w:vanish/>')) return `<w:r><w:rPr>${inner}</w:rPr>`;
    const parts = inner.split(/(?=<w:)/).filter(Boolean);
    const at = parts.findIndex((p) => AFTER_VANISH.test(p));
    parts.splice(at < 0 ? parts.length : at, 0, '<w:vanish/>');
    return `<w:r><w:rPr>${parts.join('')}</w:rPr>`;
  });
}
