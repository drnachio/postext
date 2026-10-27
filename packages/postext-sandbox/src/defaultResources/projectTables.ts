// The tables of the preset page sizes and of the project's phases
// (#1276: split out of index.ts).
import type { TableModel } from 'postext';
import type { GuideLang } from './lang.js';
import { table } from './featureTables.js';

export function presetTableModel(lang: GuideLang): TableModel {
  if (lang === 'ar') {
    return table(
      ['المقاس', 'الاستعمال المعتاد'],
      [
        ['11 × 17 cm', 'أدلة الجيب'],
        ['12 × 19 cm', 'الروايات بغلاف ورقي'],
        ['17 × 24 cm', 'الكتب المدرسية والأدلة التقنية'],
        ['21 × 28 cm', 'المجلات والقطع الكبير وهذا الدليل'],
        ['مخصّص', 'أي مقاس، بالسنتيمتر أو المليمتر أو البوصة أو النقطة'],
      ],
    );
  }
  if (lang === 'ja') {
    return table(
      ['判型', '主な用途'],
      [
        ['11 × 17 cm', '新書に近い。ポケットガイド'],
        ['12 × 19 cm', '四六判に近い。小説の単行本'],
        ['17 × 24 cm', '教科書とマニュアル'],
        ['21 × 28 cm', '雑誌、大判の本、このガイド'],
        ['カスタム', '任意の寸法。cm、mm、インチ、ポイントで指定'],
      ],
    );
  }
  if (lang === 'zh-Hans') {
    return table(
      ['开本', '常见用途'],
      [
        ['11 × 17 cm', '口袋书'],
        ['12 × 19 cm', '平装小说'],
        ['17 × 24 cm', '教材和手册'],
        ['21 × 28 cm', '杂志、大开本和本指南'],
        ['自定义', '任意尺寸，单位可以是厘米、毫米、英寸或点'],
      ],
    );
  }
  if (lang === 'de') {
    return table(
      ['Format', 'Typische Verwendung'],
      [
        ['11 × 17 cm', 'Ratgeber im Taschenformat'],
        ['12 × 19 cm', 'Romane als Taschenbuch'],
        ['17 × 24 cm', 'Lehrbücher und Handbücher'],
        ['21 × 28 cm', 'Magazine, Großformate und dieser Leitfaden'],
        ['Eigenes Format', 'Jedes Format, in cm, mm, Zoll oder Punkt'],
      ],
    );
  }
  if (lang === 'fr') {
    return table(
      ['Format', 'Usage courant'],
      [
        ['11 × 17 cm', 'Guides de poche'],
        ['12 × 19 cm', 'Romans au format poche'],
        ['17 × 24 cm', 'Manuels scolaires et techniques'],
        ['21 × 28 cm', 'Magazines, grands formats et ce guide'],
        ['Personnalisé', 'Tout format, en cm, mm, pouces ou points'],
      ],
    );
  }
  if (lang === 'it') {
    return table(
      ['Formato', 'Uso tipico'],
      [
        ['11 × 17 cm', 'Guide tascabili'],
        ['12 × 19 cm', 'Narrativa tascabile'],
        ['17 × 24 cm', 'Testi scolastici e manuali'],
        ['21 × 28 cm', 'Riviste, grandi formati e questa guida'],
        ['Personalizzato', 'Qualsiasi formato, in cm, mm, pollici o punti'],
      ],
    );
  }
  if (lang === 'pt-BR') {
    return table(
      ['Formato', 'Uso habitual'],
      [
        ['11 × 17 cm', 'Guias de bolso'],
        ['12 × 19 cm', 'Romances de bolso'],
        ['17 × 24 cm', 'Livros didáticos e manuais'],
        ['21 × 28 cm', 'Revistas, formatos grandes e este guia'],
        ['Personalizado', 'Qualquer formato, em cm, mm, polegadas ou pontos'],
      ],
    );
  }
  if (lang === 'ca') {
    return table(
      ['Mida', 'Ús habitual'],
      [
        ['11 × 17 cm', 'Guies de butxaca'],
        ['12 × 19 cm', 'Novel·les de butxaca'],
        ['17 × 24 cm', 'Llibres de text i manuals'],
        ['21 × 28 cm', 'Revistes, gran format i aquesta guia'],
        ['Personalitzat', 'Qualsevol format, en cm, mm, polzades o punts'],
      ],
    );
  }
  const es = lang === 'es';
  const custom = es ? 'Personalizado' : 'Custom';
  const any = es ? 'Cualquier formato, en cm, mm, pulgadas o puntos' : 'Any format, in cm, mm, inches or points';
  return es
    ? table(
        ['Tamaño', 'Uso habitual'],
        [
          ['11 × 17 cm', 'Guías de bolsillo'],
          ['12 × 19 cm', 'Novelas de bolsillo'],
          ['17 × 24 cm', 'Libros de texto y manuales'],
          ['21 × 28 cm', 'Revistas, gran formato y esta guía'],
          [custom, any],
        ],
      )
    : table(
        ['Size', 'Typical use'],
        [
          ['11 × 17 cm', 'Pocket guides'],
          ['12 × 19 cm', 'Fiction paperbacks'],
          ['17 × 24 cm', 'Textbooks and manuals'],
          ['21 × 28 cm', 'Magazines, large formats and this guide'],
          [custom, any],
        ],
      );
}

export function phasesTableModel(lang: GuideLang): TableModel {
  if (lang === 'ar') {
    const open = 'مفتوح';
    return table(
      ['المرحلة', 'ما أُنجز', 'ما بقي'],
      [
        ['1 · الأسس', 'نموذج البيانات، والمحلّل، والقياس بلا DOM، وصيغة المستند', open + ': تثبيت صيغة الإعدادات'],
        ['2 · التنضيد التحريري', 'الأعمدة، والموازنة، والعناصر العائمة، والجداول التي تنقسم أو تدور، والكتب والأجزاء', open + ': نص يلتف حول العوائق'],
        ['3 · الطباعة الاحترافية', 'Knuth-Plass، وتقطيع الكلمات في 8 لغات، والأرامل واليتامى والأسطر القصيرة، والرياضيات، والحواشي وتعليقات نهاية الفصل، والصينية أفقيًا وعموديًا، والعربية من اليمين إلى اليسار بالكشيدة', open + ': حواشي الهامش'],
        ['4 · المخرجات', 'Canvas، وHTML، وPDF موسوم، وworker، وSandbox بكتب جاهزة', '**أُنجز**'],
      ],
    );
  }
  if (lang === 'ja') {
    return table(
      ['段階', '完了', '残り'],
      [
        ['1 · 基盤', 'データモデル、パーサー、DOMを使わない計測、文書形式', '設定形式の確定'],
        ['2 · 書籍の組版', '段組、段末そろえ、フロート、分割・回転できる表、本と部', '障害物を避けて流れる文字'],
        ['3 · 本格的な組版', 'Knuth–Plass、8言語のハイフネーション、オーファン・ウィドウ・孤立した最終行、数式、脚注と章末注、中国語と日本語の横組み・縦組み', '欄外の注'],
        ['4 · 出力', 'Canvas、HTML、タグ付きPDF、EPUB 3、ワーカー、プリセット付きのSandbox', '**完了**'],
      ],
    );
  }
  if (lang === 'zh-Hans') {
    return table(
      ['阶段', '已完成', '待完成'],
      [
        ['1 · 基础', '数据模型、解析器、不借助DOM的测量、文档格式', '确定配置格式'],
        ['2 · 出版排版', '分栏、平衡分栏、浮动体、可拆分或旋转的表、书与篇', '文字绕排'],
        ['3 · 专业排版', 'Knuth–Plass断行、8种语言的断词、段首孤行、段末孤行与孤字、数学公式、脚注和章末注、中文横排与竖排', '边注'],
        ['4 · 输出', 'Canvas、HTML、带标签的PDF、EPUB 3、worker、带预设的Sandbox', '**已完成**'],
      ],
    );
  }
  if (lang === 'de') {
    const open = 'Offen';
    return table(
      ['Phase', 'Ausgeliefert', 'Noch offen'],
      [
        ['1 · Grundlagen', 'Datenmodell, Parser, Messung ohne DOM, Dokumentformat', open + ': das Konfigurationsformat festschreiben'],
        ['2 · Verlegerisches Layout', 'Spalten, Spaltenausgleich, Gleitobjekte, Tabellen, die sich teilen oder drehen, Bücher und Teile', open + ': Text, der Hindernisse umfließt'],
        ['3 · Professionelle Typografie', 'Knuth-Plass, Silbentrennung in 8 Sprachen, Waisen, Witwen und zu kurze Ausgangszeilen, Mathematik, Fußnoten und Kapitelendnoten, Chinesisch horizontal und vertikal gesetzt', open + ': Marginalien'],
        ['4 · Ausgabe', 'Canvas, HTML, getaggtes PDF, EPUB 3, Worker, Sandbox mit Vorlagen', '**Ausgeliefert**'],
      ],
    );
  }
  if (lang === 'fr') {
    const open = 'Ouvert';
    return table(
      ['Phase', 'Livré', 'Encore ouvert'],
      [
        ['1 · Fondations', 'Modèle de données, parseur, mesure sans DOM, format du document', open + ' : finaliser le format de configuration'],
        ['2 · Mise en page éditoriale', 'Colonnes, équilibrage, flottants, tableaux qui se divisent ou pivotent, livres et parties', open + ' : texte qui contourne les obstacles'],
        ['3 · Typographie professionnelle', 'Knuth-Plass, césure en 8 langues, orphelines, veuves et lignes trop courtes, mathématiques, notes de bas de page et notes de fin de chapitre, chinois composé horizontalement et verticalement', open + ' : notes marginales'],
        ['4 · Sortie', 'Canvas, HTML, PDF balisé, EPUB 3, worker, Sandbox avec préréglages', '**Livré**'],
      ],
    );
  }
  if (lang === 'it') {
    const open = 'Aperto';
    return table(
      ['Fase', 'Rilasciato', 'Ancora aperto'],
      [
        ['1 · Fondamenta', 'Modello dei dati, parser, misura senza DOM, formato del documento', open + ': definire il formato di configurazione'],
        ['2 · Impaginazione editoriale', 'Colonne, bilanciamento, elementi flottanti, tabelle che si dividono o ruotano, libri e parti', open + ': testo che scorre intorno agli ostacoli'],
        ['3 · Tipografia professionale', 'Knuth-Plass, sillabazione in 8 lingue, orfane, vedove e righe finali troppo corte, matematica, note a piè di pagina e note di fine capitolo, cinese composto in orizzontale e in verticale', open + ': note a margine'],
        ['4 · Output', 'Canvas, HTML, PDF con tag, EPUB 3, worker, Sandbox con preset', '**Rilasciato**'],
      ],
    );
  }
  if (lang === 'pt-BR') {
    const open = 'Em aberto';
    return table(
      ['Fase', 'Entregue', 'Pendente'],
      [
        ['1 · Fundamentos', 'Modelo de dados, parser, medição sem DOM, formato do documento', open + ': fechar o formato de configuração'],
        ['2 · Diagramação editorial', 'Colunas, balanceamento, flutuantes, tabelas que se dividem ou giram, livros e partes', open + ': texto que contorna obstáculos'],
        ['3 · Tipografia profissional', 'Knuth-Plass, hifenização em 8 idiomas, órfãs, viúvas e linhas curtas, matemática, notas de rodapé e notas de fim de capítulo, chinês na horizontal e na vertical', open + ': notas de margem'],
        ['4 · Saída', 'Canvas, HTML, PDF com tags, EPUB 3, worker, Sandbox com predefinições', '**Entregue**'],
      ],
    );
  }
  if (lang === 'ca') {
    const open = 'Obert';
    return table(
      ['Fase', 'Fet', 'Pendent'],
      [
        ['1 · Fonaments', 'Model de dades, parser, mesura sense DOM, format del document', open + ': tancar el format de configuració'],
        ['2 · Maquetació editorial', 'Columnes, equilibri, flotants, taules que es parteixen o giren, llibres i parts', open + ': text que envolta obstacles'],
        ['3 · Tipografia professional', 'Knuth-Plass, partició de mots en 8 llengües, òrfenes, vídues i línies curtes, matemàtiques, notes a peu de pàgina i notes de final de capítol, xinès en horitzontal i en vertical', open + ': notes al marge'],
        ['4 · Sortida', 'Canvas, HTML, PDF etiquetat, EPUB 3, worker, Sandbox amb presets', '**Fet**'],
      ],
    );
  }
  const es = lang === 'es';
  const done = es ? '**Hecho**' : '**Shipped**';
  const open = es ? 'Abierto' : 'Open';
  return es
    ? table(
        ['Fase', 'Hecho', 'Pendiente'],
        [
          ['1 · Fundamentos', 'Modelo de datos, parser, medición sin DOM, formato del documento', open + ': cerrar el formato de configuración'],
          ['2 · Maquetación editorial', 'Columnas, equilibrado, flotantes, tablas que se parten o giran, libros y partes', open + ': texto que rodea obstáculos'],
          ['3 · Tipografía profesional', 'Knuth-Plass, separación silábica en 8 idiomas, huérfanas, viudas y líneas cortas, matemáticas, notas al pie y notas de final de capítulo, chino en horizontal y en vertical', open + ': notas al margen'],
          ['4 · Salida', 'Canvas, HTML, PDF etiquetado, EPUB 3, worker, Sandbox con presets', done],
        ],
      )
    : table(
        ['Phase', 'Shipped', 'Still open'],
        [
          ['1 · Foundation', 'Data model, parser, DOM-free measurement, document format', open + ': finalise the configuration format'],
          ['2 · Editorial layout', 'Columns, balancing, floats, tables that split or rotate, books and parts', open + ': text flowing around obstacles'],
          ['3 · Professional typography', 'Knuth-Plass, hyphenation in 8 languages, orphans, widows and runts, mathematics, footnotes and chapter-end notes, Chinese set horizontally and vertically', open + ': margin notes'],
          ['4 · Output', 'Canvas, HTML, tagged PDF, EPUB 3, worker, Sandbox with presets', done],
        ],
      );
}
