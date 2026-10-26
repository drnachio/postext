// One spec per default table: its id, model builder, placement and
// caption in every edition (#1276: split out of index.ts).
import type { TableModel, ResourcePlacement } from 'postext';
import { type GuideLang, type ByLang, byLang } from './lang.js';
import { featureTableModel, toolsTableModel, placementTableModel } from './featureTables.js';
import { documentFormatTableModel, paperStocksTableModel } from './formatTables.js';
import { DEFAULT_RESOURCE_IDS } from './ids.js';
import { presetTableModel, phasesTableModel } from './projectTables.js';

interface TableSpec {
  id: string;
  model: (lang: GuideLang) => TableModel;
  placement: ResourcePlacement;
  caption: ByLang;
}

export const TABLE_SPECS: TableSpec[] = [
  {
    id: DEFAULT_RESOURCE_IDS.featureTable,
    model: featureTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('What editorial layout needs, in plain CSS and in Postext.', 'Lo que necesita la maquetación editorial, en CSS y en Postext.', '出版排版需要的能力：纯CSS与Postext对比。', 'El que necessita la maquetació editorial, en CSS i en Postext.', 'ما يحتاجه التنضيد التحريري، في CSS وحده وفي Postext.', '組版に必要な機能：CSSだけの場合とPostextの比較。', 'O que a diagramação editorial exige, em CSS puro e no Postext.', 'Ce dont la mise en page éditoriale a besoin, en CSS seul et dans Postext.', 'Was verlegerisches Layout braucht, in reinem CSS und in Postext.', 'Ciò di cui ha bisogno l’impaginazione editoriale, in CSS puro e in Postext.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.toolsTable,
    model: toolsTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('How Postext compares with established editorial tools.', 'Cómo se sitúa Postext frente a las herramientas editoriales establecidas.', 'Postext与现有出版工具的比较。', 'Com se situa Postext davant de les eines editorials establertes.', 'موقع Postext من أدوات النشر الراسخة.', '既存の組版ツールとPostextの比較。', 'Como o Postext se compara com as ferramentas editoriais consagradas.', 'Postext face aux outils éditoriaux établis.', 'Postext im Vergleich mit etablierten verlegerischen Werkzeugen.', 'Postext a confronto con gli strumenti editoriali affermati.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.placementTable,
    model: placementTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('The placement fields of a resource.', 'Los campos de colocación de un recurso.', '资源的位置字段。', 'Els camps de col·locació d\'un recurs.', 'حقول موضع المورد.', 'リソースの配置フィールド。', 'Os campos de posicionamento de um recurso.', 'Les champs de placement d’une ressource.', 'Die Platzierungsfelder einer Ressource.', 'I campi di posizionamento di una risorsa.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.documentFormatTable,
    model: documentFormatTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('The extensions of the document format.', 'Las extensiones del formato del documento.', '文档格式的扩展语法。', 'Les extensions del format del document.', 'امتدادات صيغة المستند.', '文書形式の拡張記法。', 'As extensões do formato de documento.', 'Les extensions du format de document.', 'Die Erweiterungen des Dokumentformats.', 'Le estensioni del formato del documento.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.presetTable,
    model: presetTableModel,
    placement: { position: 'auto', span: 'column' },
    caption: byLang('Preset page sizes and their typical use.', 'Tamaños de página predefinidos y su uso habitual.', '预设开本及其常见用途。', 'Mides de pàgina predefinides i el seu ús habitual.', 'مقاسات الصفحة الجاهزة واستعمالاتها المعتادة.', '定義済みの判型と主な用途。', 'Formatos de página predefinidos e o seu uso habitual.', 'Formats de page prédéfinis et leur usage courant.', 'Vordefinierte Seitenformate und ihre typische Verwendung.', 'Formati di pagina predefiniti e il loro uso tipico.'),
  },
  {
    id: DEFAULT_RESOURCE_IDS.paperStocksTable,
    model: paperStocksTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang(
      'The paper stocks of the Folio view and the values each one sets: weight, the caliper of one sheet and the finish.',
      'Los papeles del visor Folio y los valores que fija cada uno: gramaje, grosor de una hoja y acabado.',
      '书页视图的纸种及各自设定的数值：克重、单张厚度和表面。',
      'Els papers del visor Folio i els valors que fixa cadascun: gramatge, gruix d\'un full i acabat.',
      'أنواع الورق في عارض Folio والقيم التي يضبطها كل منها: الغراماج، وسُمك الورقة الواحدة، والتشطيب.',
      'Folioビューの用紙と、それぞれが決める値：坪量、一枚の厚さ、表面。',
      'Os papéis da visualização Folio e os valores que cada um define: gramatura, espessura de uma folha e acabamento.',
      'Les papiers de la vue Folio et les valeurs que chacun fixe : grammage, épaisseur d’une feuille et finition.',
      'Die Papiersorten der Ansicht Folio und die Werte, die jede festlegt: Grammatur, Dicke eines Blattes und Oberfläche.',
      'Le carte della vista Folio e i valori che ciascuna imposta: grammatura, spessore di un foglio e finitura.',
    ),
  },
  {
    id: DEFAULT_RESOURCE_IDS.phasesTable,
    model: phasesTableModel,
    placement: { position: 'auto', span: 'page' },
    caption: byLang('The four phases of the project: what has shipped and what is still open.', 'Las cuatro fases del proyecto: lo que ya está hecho y lo que sigue abierto.', '项目的四个阶段：已完成的和待完成的。', 'Les quatre fases del projecte: el que ja està fet i el que continua obert.', 'مراحل المشروع الأربع: ما أُنجز وما لا يزال مفتوحًا.', 'プロジェクトの四つの段階：完了したことと残っていること。', 'As quatro fases do projeto: o que já foi entregue e o que continua em aberto.', 'Les quatre phases du projet : ce qui est livré et ce qui reste ouvert.', 'Die vier Phasen des Projekts: was ausgeliefert ist und was noch offen ist.', 'Le quattro fasi del progetto: ciò che è stato rilasciato e ciò che resta aperto.'),
  },
];
