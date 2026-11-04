// Styles of the formatted Word export (#1392): a Normal style with no
// spacing of its own and one paragraph style per display role, so a
// paragraph a reader adds in Word knows what it is. The exact values ride
// on every paragraph and run as direct formatting.

import type { DisplayItem } from '../../paint/displayList/types.js';
import { escapeAttr } from '../xml.js';

type TextItem = Extract<DisplayItem, { kind: 'text' }>;

const ROLE_STYLES: Record<TextItem['role'], [id: string, name: string]> = {
  body: ['PostextBody', 'Postext Body'],
  heading: ['PostextHeading1', 'Postext Heading 1'],
  list: ['PostextList', 'Postext List'],
  quote: ['PostextQuote', 'Postext Quote'],
  code: ['PostextCode', 'Postext Code'],
  caption: ['PostextCaption', 'Postext Caption'],
  note: ['PostextNote', 'Postext Note'],
  continues: ['PostextNote', 'Postext Note'],
  footnote: ['PostextFootnote', 'Postext Footnote'],
  callout: ['PostextCallout', 'Postext Callout'],
  header: ['PostextRunningHead', 'Postext Running Head'],
  footer: ['PostextFolio', 'Postext Folio'],
  opener: ['PostextOpener', 'Postext Opener'],
  design: ['PostextDesign', 'Postext Design'],
  label: ['PostextLabel', 'Postext Label'],
  cell: ['PostextCell', 'Postext Cell'],
  dropCap: ['PostextDropCap', 'Postext Drop Cap'],
  marker: ['PostextMarker', 'Postext Marker'],
  balloon: ['PostextLettering', 'Postext Lettering'],
};

/** Character styles carrying a face's own weight and slant, and marking
 *  a run raised or lowered by hand (exact `w:position` and size, no
 *  `w:vertAlign`) as a superscript or subscript. Ids never say "bold",
 *  "strong", "italic" or "emphasis": the importer would read those as
 *  emphasis; it reads "Superscript"/"Subscript" as the script. */
const FACE_STYLES: [id: string, name: string, rPr: string][] = [];
for (const w of ['', 'W']) {
  for (const sl of ['', 'S']) {
    for (const sc of ['', 'Superscript', 'Subscript']) {
      if (!w && !sl && !sc) continue;
      const name = ['Postext Face', w && 'Weight', sl && 'Slant', sc].filter(Boolean).join(' ');
      FACE_STYLES.push([`PostextFace${w}${sl}${sc}`, name, (w ? '<w:b/><w:bCs/>' : '') + (sl ? '<w:i/><w:iCs/>' : '')]);
    }
  }
}

/** The character style of a run whose face is bold and/or italic by
 *  design, or that is a script set by hand. */
export function faceStyleId(bold: boolean, italic: boolean, script?: 'sup' | 'sub'): string | undefined {
  if (!bold && !italic && !script) return undefined;
  return `PostextFace${bold ? 'W' : ''}${italic ? 'S' : ''}${script === 'sup' ? 'Superscript' : script === 'sub' ? 'Subscript' : ''}`;
}

/** The paragraph style id of a text item. */
export function styleIdOf(item: Pick<TextItem, 'role' | 'level'>): string {
  if (item.role === 'heading') return `PostextHeading${Math.min(6, Math.max(1, item.level ?? 1))}`;
  return ROLE_STYLES[item.role][0];
}

/** The map role of a text item (`heading2`, `body`, …). */
export function mapRoleOf(item: Pick<TextItem, 'role' | 'level'>): string {
  return item.role === 'heading' ? `heading${Math.min(6, Math.max(1, item.level ?? 1))}` : item.role;
}

const PPR_ZERO = '<w:pPr><w:widowControl w:val="0"/><w:suppressAutoHyphens/><w:autoSpaceDE w:val="0"/><w:autoSpaceDN w:val="0"/><w:adjustRightInd w:val="0"/><w:snapToGrid w:val="0"/><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="0" w:right="0" w:firstLine="0"/></w:pPr>';

/** `w:docDefaults` (no inherited spacing, widow control or grid). */
export function docDefaultsXml(lang: string | undefined): string {
  const l = lang ? `<w:lang w:val="${escapeAttr(lang)}"/>` : '';
  return (
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>' +
    `<w:kern w:val="1"/><w:sz w:val="20"/><w:szCs w:val="20"/>${l}</w:rPr></w:rPrDefault>` +
    `<w:pPrDefault>${PPR_ZERO}</w:pPrDefault></w:docDefaults>`
  );
}

/** The styles after `w:docDefaults`. */
export function stylesXml(): string {
  const out: string[] = [
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>${PPR_ZERO}</w:style>`,
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>',
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>',
    '<w:style w:type="paragraph" w:customStyle="1" w:styleId="PostextAnchor"><w:name w:val="Postext Page Anchor"/><w:basedOn w:val="Normal"/><w:semiHidden/><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:style>',
  ];
  const seen = new Set<string>();
  const add = (id: string, name: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(`<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>`);
  };
  for (const [id, name] of Object.values(ROLE_STYLES)) add(id, name);
  for (let level = 2; level <= 6; level++) add(`PostextHeading${level}`, `Postext Heading ${level}`);
  for (const [id, name, rPr] of FACE_STYLES) out.push(`<w:style w:type="character" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="DefaultParagraphFont"/>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}</w:style>`);
  return out.join('');
}
