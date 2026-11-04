// The XML of the package's fixed parts: settings, properties, notes and the
// custom XML item properties.

import { escapeAttr, escapeXml, localName } from '../xml.js';
import { EXPORT_MAP_NS } from '../anchors/types.js';
import { W_NAMESPACES, WORDML_NAMESPACES, XML_DECL } from './constants.js';
import type { DocxCoreProps, DocxSettings } from './types.js';

const WORD_URI = 'http://schemas.microsoft.com/office/word';

/** `CT_Settings` child order (ECMA-376 §17.15.1.78), for merging `extra`. */
const SETTINGS_ORDER = [
  'writeProtection', 'view', 'zoom', 'removePersonalInformation', 'removeDateAndTime', 'doNotDisplayPageBoundaries',
  'displayBackgroundShape', 'printPostScriptOverText', 'printFractionalCharacterWidth', 'printFormsData',
  'embedTrueTypeFonts', 'embedSystemFonts', 'saveSubsetFonts', 'saveFormsData', 'mirrorMargins', 'alignBordersAndEdges',
  'bordersDoNotSurroundHeader', 'bordersDoNotSurroundFooter', 'gutterAtTop', 'hideSpellingErrors', 'hideGrammaticalErrors',
  'activeWritingStyle', 'proofState', 'formsDesign', 'attachedTemplate', 'linkStyles', 'stylePaneFormatFilter',
  'stylePaneSortMethod', 'documentType', 'mailMerge', 'revisionView', 'trackRevisions', 'doNotTrackMoves',
  'doNotTrackFormatting', 'documentProtection', 'autoFormatOverride', 'styleLockTheme', 'styleLockQFSet', 'defaultTabStop',
  'autoHyphenation', 'consecutiveHyphenLimit', 'hyphenationZone', 'doNotHyphenateCaps', 'showEnvelope', 'summaryLength',
  'clickAndTypeStyle', 'defaultTableStyle', 'evenAndOddHeaders', 'bookFoldRevPrinting', 'bookFoldPrinting',
  'bookFoldPrintingSheets', 'drawingGridHorizontalSpacing', 'drawingGridVerticalSpacing', 'displayHorizontalDrawingGridEvery',
  'displayVerticalDrawingGridEvery', 'doNotUseMarginsForDrawingGridOrigin', 'drawingGridHorizontalOrigin',
  'drawingGridVerticalOrigin', 'doNotShadeFormData', 'noPunctuationKerning', 'characterSpacingControl', 'printTwoOnOne',
  'strictFirstAndLastChars', 'noLineBreaksAfter', 'noLineBreaksBefore', 'savePreviewPicture', 'doNotValidateAgainstSchema',
  'saveInvalidXml', 'ignoreMixedContent', 'alwaysShowPlaceholderText', 'doNotDemarcateInvalidXml', 'saveXmlDataOnly',
  'useXSLTWhenSaving', 'saveThroughXslt', 'showXMLTags', 'alwaysMergeEmptyNamespace', 'updateFields', 'hdrShapeDefaults',
  'footnotePr', 'endnotePr', 'compat', 'docVars', 'rsids', 'mathPr', 'attachedSchema', 'themeFontLang', 'clrSchemeMapping',
  'doNotIncludeSubdocsInStats', 'doNotAutoCompressPictures', 'forceUpgrade', 'captions', 'readModeInkLockDown',
  'smartTagType', 'schemaLibrary', 'shapeDefaults', 'doNotEmbedSmartTags', 'decimalSymbol', 'listSeparator',
];
const ORDER_INDEX = new Map(SETTINGS_ORDER.map((n, i) => [n, i]));

/** Split raw XML into its top-level elements (with their local names). */
export function topLevelElements(xml: string): { name: string; xml: string }[] {
  const out: { name: string; xml: string }[] = [];
  const re = /<!--[\s\S]*?-->|<\/([^\s>]+)\s*>|<([^\s/>!?]+)(?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*(\/?)>/g;
  let depth = 0;
  let start = 0;
  let name = '';
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, end, open, self] = m;
    if (open !== undefined) {
      if (depth === 0) {
        start = m.index;
        name = localName(open);
      }
      if (self) {
        if (depth === 0) out.push({ name, xml: xml.slice(start, re.lastIndex) });
      } else depth++;
    } else if (end !== undefined) {
      depth--;
      if (depth === 0) out.push({ name, xml: xml.slice(start, re.lastIndex) });
    }
  }
  return out;
}

/** The content between an element's start and end tags ('' when self-closing). */
function innerXml(xml: string): string {
  const start = /^<[^\s/>]+(?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*(\/?)>/.exec(xml);
  if (!start || start[1]) return '';
  return xml.slice(start[0].length, xml.lastIndexOf('</'));
}

export interface SettingsContext {
  hasFootnotes: boolean;
  hasEndnotes: boolean;
  /** Embedded faces present: `embedTrueTypeFonts` unless `embedFonts` is false. */
  hasFonts?: boolean;
}

/** `word/settings.xml`. Never writes `w:doNotExpandShiftReturn`: justified
 *  lines ending in a manual break must stretch (formatted variant). */
export function settingsXml(s: DocxSettings, ctx: SettingsContext): string {
  const items: { name: string; xml: string }[] = [];
  const add = (name: string, xml: string): void => void items.push({ name, xml });
  if (s.embedFonts ?? ctx.hasFonts) add('embedTrueTypeFonts', '<w:embedTrueTypeFonts/>');
  if (s.rtlGutter) add('mirrorMargins', '<w:mirrorMargins/>');
  add('defaultTabStop', `<w:defaultTabStop w:val="${Math.round(s.defaultTabStop ?? 720)}"/>`);
  add('autoHyphenation', `<w:autoHyphenation w:val="${s.autoHyphenation ? 'true' : 'false'}"/>`);
  if (s.evenAndOddHeaders) add('evenAndOddHeaders', '<w:evenAndOddHeaders/>');
  add('characterSpacingControl', '<w:characterSpacingControl w:val="doNotCompress"/>');
  if (ctx.hasFootnotes) add('footnotePr', '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>');
  if (ctx.hasEndnotes) add('endnotePr', '<w:endnotePr><w:endnote w:id="-1"/><w:endnote w:id="0"/></w:endnotePr>');
  const compat = (name: string, val: string): string => `<w:compatSetting w:name="${name}" w:uri="${WORD_URI}" w:val="${val}"/>`;
  const compatSettings: [string, string][] = [
    ['compatibilityMode', '15'],
    ['overrideTableStyleFontSizeAndJustification', '1'],
    ...(s.openTypeFeatures ? ([['enableOpenTypeFeatures', '1']] as [string, string][]) : []),
    ['doNotFlipMirrorIndents', '1'],
    ['differentiateMultirowTableHeaders', '1'],
  ];
  // `w:compat` holds the legacy options (CT_Compat elements, in the
  // caller's order) before every `w:compatSetting`.
  const legacy: string[] = [];
  const extra = s.extra ? topLevelElements(s.extra) : [];
  for (const el of extra) {
    if (el.name !== 'compat') continue;
    for (const c of topLevelElements(innerXml(el.xml))) {
      if (c.name === 'doNotExpandShiftReturn') continue;
      if (c.name !== 'compatSetting') {
        legacy.push(c.xml);
        continue;
      }
      const name = /\bw:name="([^"]*)"/.exec(c.xml)?.[1] ?? '';
      const val = /\bw:val="([^"]*)"/.exec(c.xml)?.[1] ?? '';
      const at = compatSettings.findIndex(([n]) => n === name);
      if (at >= 0) compatSettings[at] = [name, val];
      else compatSettings.push([name, val]);
    }
  }
  add('compat', `<w:compat>${legacy.join('')}${compatSettings.map(([n, v]) => compat(n, v)).join('')}</w:compat>`);
  add('doNotAutoCompressPictures', '<w:doNotAutoCompressPictures/>');
  for (const el of extra) {
    // `doNotExpandShiftReturn` belongs to `w:compat`; dropped wherever it is.
    if (el.name === 'doNotExpandShiftReturn' || el.name === 'compat') continue;
    const at = items.findIndex((i) => i.name === el.name);
    if (at >= 0) items[at] = el;
    else items.push(el);
  }
  const rank = (name: string): number => ORDER_INDEX.get(name) ?? SETTINGS_ORDER.length;
  const sorted = items.map((it, i) => ({ it, i })).sort((a, b) => rank(a.it.name) - rank(b.it.name) || a.i - b.i);
  // Every namespace: `extra` may hold w14/w15/m/o children (w15:docId,
  // m:mathPr, o:shapedefaults).
  return `${XML_DECL}<w:settings ${WORDML_NAMESPACES}>${sorted.map((x) => x.it.xml).join('')}</w:settings>`;
}

export function webSettingsXml(): string {
  return `${XML_DECL}<w:webSettings ${W_NAMESPACES}><w:optimizeForBrowser/><w:allowPNG/></w:webSettings>`;
}

/** ISO timestamp without milliseconds (W3CDTF as Word writes it). */
export function w3cdtf(date: string | undefined): string {
  const d = date ? new Date(date) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error(`docProps: bad date ${date}`);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function corePropsXml(core: DocxCoreProps): string {
  const when = w3cdtf(core.date);
  return (
    `${XML_DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    (core.title ? `<dc:title>${escapeXml(core.title)}</dc:title>` : '') +
    (core.author ? `<dc:creator>${escapeXml(core.author)}</dc:creator>` : '') +
    (core.language ? `<dc:language>${escapeXml(core.language)}</dc:language>` : '') +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

export function appPropsXml(): string {
  return `${XML_DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Postext</Application><DocSecurity>0</DocSecurity></Properties>`;
}

/** docProps/custom.xml with string properties (Word truncates past 255 chars). */
export function customPropsXml(props: readonly [string, string][]): string {
  const items = props
    .map(([name, value], i) => `<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="${i + 2}" name="${escapeAttr(name)}"><vt:lpwstr>${escapeXml(value)}</vt:lpwstr></property>`)
    .join('');
  return `${XML_DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">${items}</Properties>`;
}

/** Footnotes or endnotes part: separators (ids -1 and 0) then the notes. */
export function notesXml(kind: 'footnote' | 'endnote', notes: readonly string[]): string {
  const sep = (type: string, id: number, mark: string): string =>
    `<w:${kind} w:type="${type}" w:id="${id}"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:${mark}/></w:r></w:p></w:${kind}>`;
  return `${XML_DECL}<w:${kind}s ${WORDML_NAMESPACES}>${sep('separator', -1, 'separator')}${sep('continuationSeparator', 0, 'continuationSeparator')}${notes.join('')}</w:${kind}s>`;
}

/** A WordprocessingML part whose root holds caller XML (`w:hdr`, `w:ftr`, `w:comments`, …). */
export function wordPart(root: string, inner: string): string {
  return `${XML_DECL}<w:${root} ${WORDML_NAMESPACES}>${inner}</w:${root}>`;
}

export function itemPropsXml(itemId: string): string {
  return `${XML_DECL}<ds:datastoreItem ds:itemID="${itemId}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${EXPORT_MAP_NS}"/></ds:schemaRefs></ds:datastoreItem>`;
}
