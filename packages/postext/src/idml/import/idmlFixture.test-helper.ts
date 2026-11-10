/**
 * A small IDML package written the way InDesign writes one: styles in groups, `%3a` in their `Self`, swatches
 * with InDesign's ids, a master spread with folios, a running head text
 * variable, a rule, a band and a polygon, the text threaded through three
 * frames on two spreads, a sidebar in a frame of its own, a footnote, a
 * table with a header row and a span, an anchored TIFF picture, and a
 * picture placed loose on a page.
 */

import { strToU8, zipSync } from 'fflate';

const head = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="18.5(58)" ?>\n`;
const pkg = 'xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="18.5"';

const W = 481.8897637795; // 170 mm
const H = 680.3149606299; // 240 mm

const rect = (x0: number, y0: number, x1: number, y1: number) =>
  `<Properties><PathGeometry><GeometryPathType PathOpen="false"><PathPointArray>${[[x0, y0], [x0, y1], [x1, y1], [x1, y0]].map(([x, y]) => `<PathPointType Anchor="${x} ${y}" LeftDirection="${x} ${y}" RightDirection="${x} ${y}"/>`).join('')}</PathPointArray></GeometryPathType></PathGeometry></Properties>`;

const styles = `${head}<idPkg:Styles ${pkg}>
<RootCharacterStyleGroup Self="u79">
  <CharacterStyle Self="CharacterStyle/$ID/[No character style]" Imported="false" Name="$ID/[No character style]"/>
  <CharacterStyle Self="CharacterStyle/Cursiva" Name="Cursiva" FontStyle="Italic"><Properties><BasedOn type="string">$ID/[No character style]</BasedOn></Properties></CharacterStyle>
  <CharacterStyle Self="CharacterStyle/Versalitas" Name="Versalitas" Capitalization="SmallCaps"/>
  <CharacterStyle Self="CharacterStyle/Destacado rojo" Name="Destacado rojo" FillColor="Color/u8a" FontStyle="Bold"/>
</RootCharacterStyleGroup>
<RootParagraphStyleGroup Self="u78">
  <ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]"/>
  <ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle" PointSize="12" FillColor="Color/Black"><Properties><BasedOn type="string">$ID/[No paragraph style]</BasedOn><AppliedFont type="string">Minion Pro</AppliedFont></Properties></ParagraphStyle>
  <ParagraphStyle Self="ParagraphStyle/Texto" Name="Texto" PointSize="10" FontStyle="Regular" Justification="LeftJustified" FirstLineIndent="12" Hyphenation="true"><Properties><BasedOn type="object">ParagraphStyle/$ID/NormalParagraphStyle</BasedOn><Leading type="unit">12.5</Leading><AppliedFont type="string">Minion Pro</AppliedFont></Properties></ParagraphStyle>
  <ParagraphStyle Self="ParagraphStyle/Texto sin sangría" Name="Texto sin sangría" FirstLineIndent="0"><Properties><BasedOn type="object">ParagraphStyle/Texto</BasedOn></Properties></ParagraphStyle>
  <ParagraphStyleGroup Self="ParagraphStyleGroup/Títulos" Name="Títulos">
    <ParagraphStyle Self="ParagraphStyle/Títulos%3aTítulo 1" Name="Título 1" PointSize="20" FontStyle="Bold" FillColor="Color/u8a" SpaceBefore="24" SpaceAfter="12" Justification="LeftAlign"><Properties><BasedOn type="object">ParagraphStyle/Texto</BasedOn><Leading type="enumeration">Auto</Leading><AppliedFont type="string">Myriad Pro</AppliedFont></Properties></ParagraphStyle>
    <ParagraphStyle Self="ParagraphStyle/Títulos%3aTítulo 2" Name="Título 2" PointSize="13" FontStyle="Semibold Italic" SpaceBefore="12"><Properties><BasedOn type="object">ParagraphStyle/Títulos%3aTítulo 1</BasedOn></Properties></ParagraphStyle>
  </ParagraphStyleGroup>
  <ParagraphStyle Self="ParagraphStyle/Pie de figura" Name="Pie de figura" PointSize="8.5" Justification="LeftAlign" FirstLineIndent="0"><Properties><BasedOn type="object">ParagraphStyle/Texto</BasedOn><AppliedFont type="string">Myriad Pro</AppliedFont></Properties></ParagraphStyle>
  <ParagraphStyle Self="ParagraphStyle/Viñeta" Name="Viñeta" LeftIndent="12" FirstLineIndent="-12"><Properties><BasedOn type="object">ParagraphStyle/Texto</BasedOn></Properties></ParagraphStyle>
  <ParagraphStyle Self="ParagraphStyle/Cita" Name="Cita" LeftIndent="18" FontStyle="Italic"><Properties><BasedOn type="object">ParagraphStyle/Texto</BasedOn></Properties></ParagraphStyle>
  <ParagraphStyle Self="ParagraphStyle/Recuadro" Name="Recuadro" PointSize="9" ParagraphShadingOn="true" ParagraphShadingColor="Tint/Azul web 20" FillColor="Color/Pantone 286 C"><Properties><BasedOn type="object">ParagraphStyle/Texto</BasedOn></Properties></ParagraphStyle>
  <ParagraphStyle Self="ParagraphStyle/Folio" Name="Folio" PointSize="8" Justification="CenterAlign" FontStyle="Bold"><Properties><BasedOn type="object">ParagraphStyle/Texto</BasedOn><AppliedFont type="string">Myriad Pro</AppliedFont></Properties></ParagraphStyle>
</RootParagraphStyleGroup>
</idPkg:Styles>
`;

const graphic = `${head}<idPkg:Graphic ${pkg}>
<Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" Name="Black"/>
<Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="Paper"/>
<Color Self="Color/Registration" Model="Registration" Space="CMYK" ColorValue="100 100 100 100" Name="Registration"/>
<Color Self="Color/u8a" Model="Process" Space="CMYK" ColorValue="0 100 80 5" Name="Rojo editorial"/>
<Color Self="Color/Pantone 286 C" Model="Spot" Space="CMYK" ColorValue="100 66 0 2" Name="PANTONE 286 C"/>
<Color Self="Color/u8c" Model="Process" Space="RGB" ColorValue="30 120 200" Name="Azul web"/>
<Color Self="Color/u8d" Model="Process" Space="CMYK" ColorValue="10 0 0 40" Name="$ID/"/>
<Tint Self="Tint/Azul web 20" BaseColor="Color/u8c" TintValue="20" Name="$ID/"/>
<Swatch Self="Swatch/None" Name="None"/>
</idPkg:Graphic>
`;

const preferences = `${head}<idPkg:Preferences ${pkg}>
<DocumentPreference PageHeight="${H}" PageWidth="${W}" PagesPerDocument="3" FacingPages="true" PageBinding="LeftToRight"/>
<MarginPreference ColumnCount="1" ColumnGutter="12" Top="36" Bottom="36" Left="36" Right="36"/>
</idPkg:Preferences>
`;

const margins = (recto: boolean) => `<MarginPreference ColumnCount="2" ColumnGutter="14.1732" Top="56.6929" Bottom="70.8661" Left="${recto ? 56.6929 : 42.5197}" Right="${recto ? 42.5197 : 56.6929}" ColumnDirection="Horizontal" ColumnsPositions="0 177.6378"/>`;
const pageXml = (self: string, name: string, x: number, master: string, recto: boolean) =>
  `<Page Self="${self}" Name="${name}" AppliedMaster="${master}" GeometricBounds="0 0 ${H} ${W}" ItemTransform="1 0 0 1 ${x} ${-H / 2}" OverrideList="">${margins(recto)}</Page>`;

// Master: verso (left, x from −W to 0) and recto (0 to W); y from −H/2.
const y0 = -H / 2;
const master = `${head}<idPkg:MasterSpread ${pkg}>
<MasterSpread Self="ub5" Name="A-Maestra" NamePrefix="A" BaseName="Maestra" ShowMasterItems="true" PageCount="2" ItemTransform="1 0 0 1 0 0">
${pageXml('ub6', 'A', -W, 'n', false)}
${pageXml('ub7', 'A', 0, 'n', true)}
<TextFrame Self="ub8" ParentStory="ufolv" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ItemTransform="1 0 0 1 0 0">${rect(-W + 42.5197, y0 + H - 50, -W + 100, y0 + H - 36)}<TextFramePreference VerticalJustification="CenterAlign"/></TextFrame>
<TextFrame Self="ub9" ParentStory="ufolr" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ItemTransform="1 0 0 1 0 0">${rect(W - 100, y0 + H - 50, W - 42.5197, y0 + H - 36)}</TextFrame>
<TextFrame Self="uba" ParentStory="urun" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ItemTransform="1 0 0 1 0 0">${rect(56.6929, y0 + 30, W - 42.5197, y0 + 44)}</TextFrame>
<GraphicLine Self="ubb" StrokeWeight="0.5" StrokeColor="Color/u8a" ItemTransform="1 0 0 1 0 0"><Properties><PathGeometry><GeometryPathType PathOpen="true"><PathPointArray><PathPointType Anchor="56.6929 ${y0 + 48}" LeftDirection="56.6929 ${y0 + 48}" RightDirection="56.6929 ${y0 + 48}"/><PathPointType Anchor="${W - 42.5197} ${y0 + 48}" LeftDirection="${W - 42.5197} ${y0 + 48}" RightDirection="${W - 42.5197} ${y0 + 48}"/></PathPointArray></GeometryPathType></PathGeometry></Properties></GraphicLine>
<Rectangle Self="ubc" FillColor="Color/Pantone 286 C" StrokeWeight="0" ItemTransform="1 0 0 1 0 0">${rect(W - 12, y0 + 200, W, y0 + 260)}</Rectangle>
<Polygon Self="ubd" FillColor="Color/u8a" ItemTransform="1 0 0 1 0 0">${rect(-W + 10, y0 + 10, -W + 20, y0 + 20)}</Polygon>
<TextFrame Self="ube" ParentStory="uprim" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ItemTransform="1 0 0 1 0 0">${rect(56.6929, y0 + 56.6929, W - 42.5197, y0 + H - 70.8661)}</TextFrame>
</MasterSpread>
</idPkg:MasterSpread>
`;

const frame = (self: string, story: string, prev: string, next: string, x0: number, x1: number) =>
  `<TextFrame Self="${self}" ParentStory="${story}" PreviousTextFrame="${prev}" NextTextFrame="${next}" ContentType="TextType" ItemTransform="1 0 0 1 0 0">${rect(x0, y0 + 56.6929, x1, y0 + H - 70.8661)}<TextFramePreference TextColumnCount="2" TextColumnGutter="14.1732"/></TextFrame>`;

const spread1 = `${head}<idPkg:Spread ${pkg}>
<Spread Self="uc1" PageCount="1" BindingLocation="0" ItemTransform="1 0 0 1 0 0">
${pageXml('uc2', '1', 0, 'ub5', true)}
${frame('uc3', 'umain', 'n', 'ud3', 56.6929, W - 42.5197)}
</Spread>
</idPkg:Spread>
`;

const spread2 = `${head}<idPkg:Spread ${pkg}>
<Spread Self="ud1" PageCount="2" BindingLocation="1" ItemTransform="1 0 0 1 0 0">
${pageXml('ud2', '2', -W, 'ub5', false)}
${pageXml('ud5', '3', 0, 'ub5', true)}
${frame('ud3', 'umain', 'uc3', 'ud6', -W + 42.5197, -56.6929)}
<TextFrame Self="ud4" ParentStory="uside" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ItemTransform="1 0 0 1 0 0">${rect(-W + 60, y0 + 400, -W + 300, y0 + 500)}</TextFrame>
${frame('ud6', 'umain', 'ud3', 'n', 56.6929, W - 42.5197)}
<Rectangle Self="ud7" ContentType="GraphicType" ItemTransform="1 0 0 1 0 0">${rect(100, y0 + 300, 300, y0 + 450)}<Image Self="ud8" ItemTransform="1 0 0 1 100 ${y0 + 300}"><Link Self="ud9" LinkResourceURI="file:/Volumes/Trabajo/Libro/Links/foto%20suelta.jpg" StoredState="Normal"/></Image></Rectangle>
</Spread>
</idPkg:Spread>
`;

const csr = (content: string, attrs = '') => `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"${attrs}>${content}</CharacterStyleRange>`;
const c = (t: string) => `<Content>${t}</Content>`;
const psr = (style: string, body: string, attrs = '') => `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${style}"${attrs}>${body}</ParagraphStyleRange>`;
const br = '<Br/>';

const cell = (name: string, text: string, extra = '') => `<Cell Self="ut1i${name.replace(':', 'i')}" Name="${name}"${extra}>${psr('Texto sin sangría', csr(c(text)))}</Cell>`;

const mainStory = `${head}<idPkg:Story ${pkg}>
<Story Self="umain" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/">
<StoryPreference OpticalMarginAlignment="false" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection"/>
${psr('Títulos%3aTítulo 1', csr(c('Capítulo uno') + br))}
${psr('Texto', csr(c('Un texto con ')) + `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/Cursiva">${c('cursiva')}</CharacterStyleRange>` + csr(c(', una negrita'), ' FontStyle="Bold"') + csr(c(' y el CO')) + csr(c('2'), ' Position="Subscript"') + csr(c(' con una nota.') + `<Footnote Self="ufn1">${psr('Texto', csr(`<Content><?ACE 4?></Content>${c('\tLa nota al pie.')}`))}</Footnote>` + c(' Sigue el *texto*.') + br))}
${psr('Texto sin sangría', csr(c('Párrafo sin sangría con ') + '<HyperlinkTextSource Self="uh1" Name="enlace">' + csr(c('un enlace')) + '</HyperlinkTextSource>' + c('.') + br))}
${psr('Texto sin sangría', csr(`<Rectangle Self="ur1" ContentType="GraphicType" ItemTransform="1 0 0 1 0 0">${rect(0, 0, 200, 120)}<AnchoredObjectSetting AnchoredPosition="InlinePosition"/><Image Self="ui1"><Link Self="ul1" LinkResourceURI="file:/Volumes/Trabajo/Libro/Links/fig1.tif" StoredState="Normal"/></Image></Rectangle>` + br))}
${psr('Pie de figura', csr(c('Figura 1.1. Un esquema del sistema.') + br))}
${psr('Viñeta', csr(c('•\tPrimer punto') + br + c('•\tSegundo punto') + br))}
${psr('Texto', csr(`<Table Self="ut1" HeaderRowCount="1" FooterRowCount="0" BodyRowCount="2" ColumnCount="2"><Row Self="ut1Row0" Name="0"/><Row Self="ut1Row1" Name="1"/><Row Self="ut1Row2" Name="2"/><Column Self="ut1Column0" Name="0" SingleColumnWidth="100"/><Column Self="ut1Column1" Name="1" SingleColumnWidth="300"/>${cell('0:0', 'Fármaco')}${cell('1:0', 'Dosis')}${cell('0:1', 'Uno')}${cell('1:1', '10 mg', ' FillColor="Color/u8c"')}${cell('0:2', 'Las dos columnas', ' ColumnSpan="2"')}${cell('1:2', '')}</Table>` + br))}
${psr('Títulos%3aTítulo 2', csr(c('Un apartado') + br))}
${psr('Cita', csr(c('Una cita en cursiva.') + br))}
${psr('Recuadro', csr(c('Texto del recuadro.') + br))}
${psr('Títulos%3aTítulo 1', csr(c('Capítulo dos') + br))}
${psr('Texto', csr(c('Con un ')) + `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/Destacado rojo">${c('destacado')}</CharacterStyleRange>` + csr(c(' y unas ')) + `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/Versalitas">${c('versalitas')}</CharacterStyleRange>` + csr(c('.')))}
</Story>
</idPkg:Story>
`;

const story = (self: string, body: string) => `${head}<idPkg:Story ${pkg}>\n<Story Self="${self}">\n${body}\n</Story>\n</idPkg:Story>\n`;

const files: Record<string, string> = {
  'designmap.xml': `${head}<Document ${pkg} Self="d" StoryList="umain uside ufolv ufolr urun uprim">
<idPkg:Graphic src="Resources/Graphic.xml"/>
<idPkg:Styles src="Resources/Styles.xml"/>
<idPkg:Preferences src="Resources/Preferences.xml"/>
<TextVariable Self="dTextVariablenRunning Head" Name="Running Head" VariableType="MatchParagraphStyleType"/>
<idPkg:MasterSpread src="MasterSpreads/MasterSpread_ub5.xml"/>
<idPkg:Spread src="Spreads/Spread_uc1.xml"/>
<idPkg:Spread src="Spreads/Spread_ud1.xml"/>
<idPkg:Story src="Stories/Story_umain.xml"/>
<idPkg:Story src="Stories/Story_uside.xml"/>
<idPkg:Story src="Stories/Story_ufolv.xml"/>
<idPkg:Story src="Stories/Story_ufolr.xml"/>
<idPkg:Story src="Stories/Story_urun.xml"/>
<idPkg:Story src="Stories/Story_uprim.xml"/>
</Document>
`,
  'Resources/Styles.xml': styles,
  'Resources/Graphic.xml': graphic,
  'Resources/Preferences.xml': preferences,
  'MasterSpreads/MasterSpread_ub5.xml': master,
  'Spreads/Spread_uc1.xml': spread1,
  'Spreads/Spread_ud1.xml': spread2,
  'Stories/Story_umain.xml': mainStory,
  'Stories/Story_uside.xml': story('uside', psr('Texto sin sangría', csr(c('Un texto al margen, en un marco propio.')))),
  'Stories/Story_ufolv.xml': story('ufolv', psr('Folio', csr('<Content><?ACE 18?></Content>'))),
  'Stories/Story_ufolr.xml': story('ufolr', psr('Folio', csr(`${c('Página ')}<Content><?ACE 18?></Content>${c(' {de}')}`))),
  'Stories/Story_urun.xml': story('urun', psr('Folio', csr('<TextVariableInstance Self="utv1" Name="Running Head" ResultText="Capítulo uno" AssociatedTextVariable="dTextVariablenRunning Head"/>', ' FontStyle="Italic"'), ' Justification="RightAlign"')),
  'Stories/Story_uprim.xml': story('uprim', psr('Texto', csr(''))),
};

/** The package, `mimetype` first and stored, as InDesign writes it. */
export function indesignIdml(): Uint8Array {
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = { mimetype: [strToU8('application/vnd.adobe.indesign-idml-package'), { level: 0 }] };
  for (const [name, xml] of Object.entries(files)) entries[name] = strToU8(xml);
  return zipSync(entries);
}

/** A PNG header of the given size (enough for `bitmapInfo`). */
export function pngOf(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  b.set([8, 6, 0, 0, 0], 24);
  return b;
}
