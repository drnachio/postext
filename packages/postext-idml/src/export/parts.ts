// The fixed parts of an IDML package: the container, the
// document map, preferences, the default styles, swatches and fonts that
// InDesign expects in every file. Written for DOMVersion 8.0 (CS6), which
// every later InDesign opens.

import { attr, escapeAttr, num, XML_HEAD } from '../xml/write.js';
import type { FontNames } from './sfnt.js';

export { attr, num, XML_HEAD };

export const IDML_MIMETYPE = 'application/vnd.adobe.indesign-idml-package';
export const DOM_VERSION = '8.0';
export const PKG_NS = 'http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging';

export const CONTAINER_XML = `${XML_HEAD}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="designmap.xml" media-type="text/xml"/></rootfiles></container>`;

export interface DesignMapInput {
  title: string;
  layerId: string;
  masterId: string;
  spreads: string[];
  stories: string[];
  /** Sections, hyperlinks and their destinations, written as they are. */
  sections?: string;
  links?: string;
}

export function designMapXml(d: DesignMapInput): string {
  return (
    `${XML_HEAD}<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="8.0(370)" ?>\n` +
    `<Document xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}" Self="d"${attr('StoryList', d.stories.join(' '))}${attr('Name', d.title)}` +
    ` ZeroPoint="0 0"${attr('ActiveLayer', d.layerId)} CMYKProfile="$ID/" RGBProfile="$ID/" SolidColorIntent="UseColorSettings" AfterBlendingIntent="UseColorSettings" DefaultImageIntent="UseColorSettings" RGBPolicy="PreserveEmbeddedProfiles" CMYKPolicy="CombinationOfPreserveAndSafeCmyk" AccurateLABSpots="false">` +
    '<idPkg:Graphic src="Resources/Graphic.xml"/>' +
    '<idPkg:Fonts src="Resources/Fonts.xml"/>' +
    '<idPkg:Styles src="Resources/Styles.xml"/>' +
    '<idPkg:Preferences src="Resources/Preferences.xml"/>' +
    `<Layer${attr('Self', d.layerId)} Name="Postext" Visible="true" Locked="false" IgnoreWrap="false" ShowGuides="true" LockGuides="false" UI="true" Expendable="true" Printable="true"><Properties><LayerColor type="enumeration">LightBlue</LayerColor></Properties></Layer>` +
    `<idPkg:MasterSpread src="MasterSpreads/MasterSpread_${d.masterId}.xml"/>` +
    d.spreads.map((id) => `<idPkg:Spread src="Spreads/Spread_${id}.xml"/>`).join('') +
    (d.sections ?? '') +
    '<idPkg:BackingStory src="XML/BackingStory.xml"/>' +
    d.stories.map((id) => `<idPkg:Story src="Stories/Story_${id}.xml"/>`).join('') +
    (d.links ?? '') +
    '</Document>'
  );
}

export interface DocumentGeometry {
  /** Trim size, pt. */
  width: number;
  height: number;
  /** Bleed on every side, pt. */
  bleed: number;
  pages: number;
  /** Pages two to a spread, and the edge the book is bound on. */
  facing?: boolean;
  rightBound?: boolean;
  /** Margins of the first page (pt), for the document setup. */
  margins?: { top: number; bottom: number; inside: number; outside: number };
}

export function preferencesXml(g: DocumentGeometry): string {
  const b = num(g.bleed);
  return (
    `${XML_HEAD}<idPkg:Preferences xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
    `<DocumentPreference${attr('PageHeight', g.height)}${attr('PageWidth', g.width)} PagesPerDocument="1" FacingPages="${g.facing ? 'true' : 'false'}"` +
    ` DocumentBleedTopOffset="${b}" DocumentBleedBottomOffset="${b}" DocumentBleedInsideOrLeftOffset="${b}" DocumentBleedOutsideOrRightOffset="${b}" DocumentBleedUniformSize="true"` +
    ` PageBinding="${g.rightBound ? 'RightToLeft' : 'LeftToRight'}" AllowPageShuffle="false" OverprintBlack="true" ColumnDirection="Horizontal" Intent="PrintIntent"/>` +
    (g.margins ? `<MarginPreference ColumnCount="1" ColumnGutter="12"${attr('Top', g.margins.top)}${attr('Bottom', g.margins.bottom)}${attr('Left', g.margins.inside)}${attr('Right', g.margins.outside)} ColumnDirection="Horizontal"/>` : '') +
    '<ViewPreference HorizontalMeasurementUnits="Millimeters" VerticalMeasurementUnits="Millimeters" TypographicMeasurementUnits="Points" TextSizeMeasurementUnits="Points" LineMeasurementUnits="Points"/>' +
    '</idPkg:Preferences>'
  );
}

export function masterSpreadXml(id: string, g: DocumentGeometry): string {
  return (
    `${XML_HEAD}<idPkg:MasterSpread xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
    `<MasterSpread${attr('Self', id)} ItemTransform="1 0 0 1 0 0" Name="A-Master" NamePrefix="A" BaseName="Master" ShowMasterItems="true" PageCount="1" OverriddenPageItemProps="" PrimaryTextFrame="n">` +
    `<Page${attr('Self', `${id}p`)} Name="A" AppliedMaster="n"${attr('GeometricBounds', `0 0 ${num(g.height)} ${num(g.width)}`)}${attr('ItemTransform', `1 0 0 1 0 ${num(-g.height / 2)}`)} MasterPageTransform="1 0 0 1 0 0">` +
    `<MarginPreference ColumnCount="1" ColumnGutter="12" Top="0" Bottom="0" Left="0" Right="0" ColumnDirection="Horizontal"${attr('ColumnsPositions', `0 ${num(g.width)}`)}/>` +
    '</Page></MasterSpread></idPkg:MasterSpread>'
  );
}

export const BACKING_STORY_XML =
  `${XML_HEAD}<idPkg:BackingStory xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
  '<XmlStory Self="ubacking" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">' +
  '<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/>' +
  '<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false"/>' +
  '<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/$ID/NormalParagraphStyle"><CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"/></ParagraphStyleRange>' +
  '</XmlStory></idPkg:BackingStory>';

/** A swatch the document defines: InDesign's own (Black, Paper) or a
 *  process colour. */
export interface Swatch {
  self: string;
  name: string;
  space: 'CMYK' | 'RGB';
  value: number[];
}

export function graphicXml(swatches: Swatch[]): string {
  const own = swatches
    .map((s) => `<Color${attr('Self', s.self)} Model="Process"${attr('Space', s.space)}${attr('ColorValue', s.value.map(num).join(' '))} ColorOverride="Normal" AlternateSpace="NoAlternateColor" AlternateColorValue=""${attr('Name', s.name)} ColorEditable="true" ColorRemovable="true" Visible="true" SwatchCreatorID="7937"/>`)
    .join('');
  return (
    `${XML_HEAD}<idPkg:Graphic xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
    '<Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" ColorOverride="Specialblack" AlternateSpace="NoAlternateColor" AlternateColorValue="" Name="Black" ColorEditable="false" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>' +
    '<Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" ColorOverride="Specialpaper" AlternateSpace="NoAlternateColor" AlternateColorValue="" Name="Paper" ColorEditable="true" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>' +
    '<Color Self="Color/Registration" Model="Registration" Space="CMYK" ColorValue="100 100 100 100" ColorOverride="Specialregistration" AlternateSpace="NoAlternateColor" AlternateColorValue="" Name="Registration" ColorEditable="false" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>' +
    own +
    '<Ink Self="Ink/$ID/Process Cyan" Name="$ID/Process Cyan" Angle="75" ConvertToProcess="false" Frequency="70" NeutralDensity="0.61" PrintInk="true" TrapOrder="1" InkType="Normal"/>' +
    '<Ink Self="Ink/$ID/Process Magenta" Name="$ID/Process Magenta" Angle="15" ConvertToProcess="false" Frequency="70" NeutralDensity="0.76" PrintInk="true" TrapOrder="2" InkType="Normal"/>' +
    '<Ink Self="Ink/$ID/Process Yellow" Name="$ID/Process Yellow" Angle="0" ConvertToProcess="false" Frequency="70" NeutralDensity="0.16" PrintInk="true" TrapOrder="3" InkType="Normal"/>' +
    '<Ink Self="Ink/$ID/Process Black" Name="$ID/Process Black" Angle="45" ConvertToProcess="false" Frequency="70" NeutralDensity="1.7" PrintInk="true" TrapOrder="4" InkType="Normal"/>' +
    '<Swatch Self="Swatch/None" Name="None" ColorEditable="false" ColorRemovable="false" Visible="true" SwatchCreatorID="7937"/>' +
    '<StrokeStyle Self="StrokeStyle/$ID/Solid" Name="$ID/Solid"/>' +
    '<StrokeStyle Self="StrokeStyle/$ID/Dashed" Name="$ID/Dashed"/>' +
    '</idPkg:Graphic>'
  );
}

export function fontsXml(families: Map<string, Map<string, FontNames | undefined>>): string {
  let i = 0;
  const body = [...families]
    .map(([family, styles]) => {
      const id = `di${(++i).toString(16)}`;
      const faces = [...styles]
        .map(
          ([style, names]) =>
            `<Font${attr('Self', `${id}Fontn${family} ${style}`)}${attr('FontFamily', family)}${attr('Name', `${family} ${style}`)}${attr('PostScriptName', names?.postScriptName ?? '$ID/')} Status="${names ? 'Installed' : 'NotAvailable'}"` +
            `${attr('FontStyleName', style)}${attr('FontType', names?.type ?? 'OpenTypeTT')} WritingScript="0"${attr('FullName', names?.fullName ?? '')} FullNameNative="" FontStyleNameNative="" PlatformName="$ID/" Version=""/>`,
        )
        .join('');
      return `<FontFamily${attr('Self', id)}${attr('Name', family)}>${faces}</FontFamily>`;
    })
    .join('');
  return `${XML_HEAD}<idPkg:Fonts xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">${body}</idPkg:Fonts>`;
}

/** Text properties a paragraph style or a character range sets. */
export interface TextProps {
  font: string;
  fontStyle: string;
  /** pt */
  size: number;
  color: string;
  /** Thousandths of an em. */
  tracking: number;
  capitalization?: 'SmallCaps';
  position?: 'Superscript' | 'Subscript';
  /** pt, positive up. */
  baselineShift?: number;
  underline?: boolean;
  strike?: boolean;
  /** A stroke round the glyphs (a halo's copy of the text): swatch and pt. */
  stroke?: { color: string; weight: number };
}

/** A tab stop: pt from the text frame's text edge (InDesign measures tab
 *  stops from there, whatever the paragraph's left indent). */
export interface TabStopDef {
  position: number;
  alignment: 'LeftAlign' | 'RightAlign' | 'CenterAlign' | 'CharacterAlign';
  /** The character a `CharacterAlign` stop aligns on. Default `.`. */
  character?: string;
  leader?: string;
}

/** A paragraph's indents, space after and tab stops (pt). */
export interface ParagraphFormat {
  leftIndent: number;
  firstLineIndent: number;
  rightIndent: number;
  spaceAfter: number;
  tabs: TabStopDef[];
}

export const NO_FORMAT: ParagraphFormat = { leftIndent: 0, firstLineIndent: 0, rightIndent: 0, spaceAfter: 0, tabs: [] };

export interface ParagraphStyleDef {
  self: string;
  name: string;
  props: TextProps;
  /** pt */
  leading: number;
  justification: string;
  format: ParagraphFormat;
}

/** A character style: the look of the runs a named Postext style set
 *  (a chip, a `:span`), or of words in a face or size their paragraph's
 *  style has not (#1555). Written whole (face, size, colour, tracking), so
 *  a reader that takes a character style for what it sets, as the
 *  importer does, reads the run's look from the style alone. */
export interface CharacterStyleDef {
  self: string;
  name: string;
  props: TextProps;
}

/** `ParagraphStyle/<name>`: a colon in a name is written `%3a`, as InDesign does. */
export const styleSelf = (kind: 'ParagraphStyle' | 'CharacterStyle', name: string): string => `${kind}/${name.replace(/%/g, '%25').replace(/:/g, '%3a')}`;

export function textPropsAttrs(p: Partial<TextProps>): string {
  return (
    attr('FontStyle', p.fontStyle) +
    attr('PointSize', p.size) +
    attr('FillColor', p.color) +
    attr('Tracking', p.tracking) +
    attr('Capitalization', p.capitalization) +
    attr('Position', p.position) +
    attr('BaselineShift', p.baselineShift) +
    attr('Underline', p.underline) +
    attr('StrikeThru', p.strike) +
    (p.stroke ? `${attr('StrokeColor', p.stroke.color)}${attr('StrokeWeight', p.stroke.weight)} EndJoin="RoundEndJoin"` : '')
  );
}

/** A paragraph's tab stops as a `TabList` property (empty: none, which
 *  clears a style's stops on a paragraph). */
export function tabListXml(tabs: readonly TabStopDef[]): string {
  const items = tabs.map(
    (t) =>
      `<ListItem type="record"><Alignment type="enumeration">${t.alignment}</Alignment><AlignmentCharacter type="string">${escapeAttr(t.character ?? '.')}</AlignmentCharacter>` +
      `<Leader type="string">${escapeAttr(t.leader ?? '')}</Leader><Position type="unit">${num(t.position)}</Position></ListItem>`,
  );
  return `<TabList type="list">${items.join('')}</TabList>`;
}

/** The indents and space after a paragraph or style sets (`f`'s fields
 *  that are set; a style leaves zeros out). */
export function paragraphFormatAttrs(f: Partial<ParagraphFormat>): string {
  return attr('LeftIndent', f.leftIndent) + attr('FirstLineIndent', f.firstLineIndent) + attr('RightIndent', f.rightIndent) + attr('SpaceAfter', f.spaceAfter);
}

const nonZero = (n: number) => (Math.abs(n) >= 0.005 ? n : undefined);

/** What a paragraph style says when its lines are kept as Postext broke
 *  them: nothing left to InDesign's composer. No hyphenation (a hyphen a
 *  break added is in the text), the single-line composer, word spaces free
 *  to take the width Postext gave them, letters and glyphs at their own
 *  width, no keeps, no grid. */
export const KEPT_LINES =
  ' Composer="$ID/HL Single" MinimumWordSpacing="0" DesiredWordSpacing="100" MaximumWordSpacing="1000" MinimumLetterSpacing="0" DesiredLetterSpacing="0" MaximumLetterSpacing="0"' +
  ' MinimumGlyphScaling="100" DesiredGlyphScaling="100" MaximumGlyphScaling="100" SingleWordJustification="LeftAlign" KeepLinesTogether="false" KeepAllLinesTogether="false" KeepWithNext="0"' +
  ' KerningMethod="$ID/Metrics" Ligatures="true" AlignToBaseline="false" BalanceRaggedLines="NoBalancing" LastLineIndent="0"';

export function stylesXml(paragraphStyles: ParagraphStyleDef[], keptLines = false, characterStyles: CharacterStyleDef[] = []): string {
  const own = paragraphStyles
    .map(
      (s) =>
        `<ParagraphStyle${attr('Self', s.self)}${attr('Name', s.name)} Imported="false" NextStyle="${escapeAttr(s.self)}" Hyphenation="false"${keptLines ? KEPT_LINES : ''}${textPropsAttrs(s.props)}${attr('Justification', s.justification)}` +
        `${paragraphFormatAttrs({ leftIndent: nonZero(s.format.leftIndent), firstLineIndent: nonZero(s.format.firstLineIndent), rightIndent: nonZero(s.format.rightIndent), spaceAfter: nonZero(s.format.spaceAfter) })}>` +
        `<Properties><BasedOn type="object">ParagraphStyle/$ID/NormalParagraphStyle</BasedOn><AppliedFont type="string">${escapeAttr(s.props.font)}</AppliedFont><Leading type="unit">${num(s.leading)}</Leading>` +
        `${s.format.tabs.length ? tabListXml(s.format.tabs) : ''}</Properties></ParagraphStyle>`,
    )
    .join('');
  return (
    `${XML_HEAD}<idPkg:Styles xmlns:idPkg="${PKG_NS}" DOMVersion="${DOM_VERSION}">` +
    '<RootCharacterStyleGroup Self="ucharstyles"><CharacterStyle Self="CharacterStyle/$ID/[No character style]" Imported="false" Name="$ID/[No character style]"/>' +
    characterStyles
      .map((s) => `<CharacterStyle${attr('Self', s.self)}${attr('Name', s.name)} Imported="false"${textPropsAttrs(s.props)}><Properties><BasedOn type="string">$ID/[No character style]</BasedOn><AppliedFont type="string">${escapeAttr(s.props.font)}</AppliedFont></Properties></CharacterStyle>`)
      .join('') +
    '</RootCharacterStyleGroup>' +
    '<RootParagraphStyleGroup Self="uparastyles">' +
    '<ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" Imported="false"/>' +
    '<ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle" Imported="false" NextStyle="ParagraphStyle/$ID/NormalParagraphStyle"><Properties><BasedOn type="string">$ID/[No paragraph style]</BasedOn></Properties></ParagraphStyle>' +
    own +
    '</RootParagraphStyleGroup>' +
    '<RootCellStyleGroup Self="ucellstyles"><CellStyle Self="CellStyle/$ID/[None]" AppliedParagraphStyle="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[None]"/></RootCellStyleGroup>' +
    '<RootTableStyleGroup Self="utablestyles"><TableStyle Self="TableStyle/$ID/[No table style]" Name="$ID/[No table style]"/><TableStyle Self="TableStyle/$ID/[Basic Table]" Name="$ID/[Basic Table]"/></RootTableStyleGroup>' +
    '<RootObjectStyleGroup Self="uobjectstyles">' +
    '<ObjectStyle Self="ObjectStyle/$ID/[None]" Name="$ID/[None]"/>' +
    '<ObjectStyle Self="ObjectStyle/$ID/[Normal Graphics Frame]" Name="$ID/[Normal Graphics Frame]"/>' +
    '<ObjectStyle Self="ObjectStyle/$ID/[Normal Text Frame]" Name="$ID/[Normal Text Frame]"/>' +
    '<ObjectStyle Self="ObjectStyle/$ID/[Normal Grid]" Name="$ID/[Normal Grid]"/>' +
    '</RootObjectStyleGroup>' +
    '</idPkg:Styles>'
  );
}
