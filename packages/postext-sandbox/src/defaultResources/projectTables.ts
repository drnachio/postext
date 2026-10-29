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

/** The project's phases, as each edition words them (#1296). */
const PHASES: Record<GuideLang, { head: string[]; rows: string[][] }> = {
  en: { head: ['Phase', 'Shipped', 'Still open'], rows: [
    ['1 · Foundation', 'Data model, parser, DOM-free measurement, document format', 'Open: finalise the configuration format'],
    ['2 · Editorial layout', 'Columns, balancing, floats, tables that split or rotate, text wrapped round pictures, books and parts, composed pages', 'Open: text on both sides of a picture'],
    ['3 · Professional typography', 'Knuth-Plass, hyphenation in 8 languages, orphans, widows and runts, mathematics, footnotes, citations, a back-of-book index, Chinese and Japanese set horizontally and vertically, Arabic with kashida, comics, music, exercises', 'Open: margin notes'],
    ['4 · Output', 'Canvas, HTML, tagged PDF and PDF/X, EPUB 3, SCORM, worker, Sandbox with presets, command line', '**Shipped**'],
  ] },
  es: { head: ['Fase', 'Hecho', 'Pendiente'], rows: [
    ['1 · Fundamentos', 'Modelo de datos, parser, medición sin DOM, formato del documento', 'Abierto: cerrar el formato de configuración'],
    ['2 · Maquetación editorial', 'Columnas, equilibrado, flotantes, tablas que se parten o giran, texto que rodea las imágenes, libros y partes, páginas compuestas', 'Abierto: texto a ambos lados de una imagen'],
    ['3 · Tipografía profesional', 'Knuth-Plass, separación silábica en 8 idiomas, huérfanas, viudas y líneas cortas, matemáticas, notas al pie, citas, índice analítico, chino y japonés en horizontal y en vertical, árabe con cachida, cómics, música, ejercicios', 'Abierto: notas al margen'],
    ['4 · Salida', 'Canvas, HTML, PDF etiquetado y PDF/X, EPUB 3, SCORM, worker, Sandbox con presets, línea de comandos', '**Hecho**'],
  ] },
  ca: { head: ['Fase', 'Fet', 'Pendent'], rows: [
    ['1 · Fonaments', 'Model de dades, parser, mesura sense DOM, format del document', 'Obert: tancar el format de configuració'],
    ['2 · Maquetació editorial', 'Columnes, equilibri, flotants, taules que es parteixen o giren, text que envolta imatges, llibres i parts, pàgines compostes', 'Obert: text a banda i banda d\'una imatge'],
    ['3 · Tipografia professional', 'Knuth-Plass, partició de mots en 8 llengües, òrfenes, vídues i línies curtes, matemàtiques, notes a peu de pàgina, cites, índex analític, xinès i japonès en horitzontal i en vertical, àrab amb kashida, còmics, música, exercicis', 'Obert: notes al marge'],
    ['4 · Sortida', 'Canvas, HTML, PDF etiquetat i PDF/X, EPUB 3, SCORM, worker, Sandbox amb presets, línia d\'ordres', '**Fet**'],
  ] },
  'pt-BR': { head: ['Fase', 'Entregue', 'Pendente'], rows: [
    ['1 · Fundamentos', 'Modelo de dados, parser, medição sem DOM, formato do documento', 'Em aberto: fechar o formato de configuração'],
    ['2 · Diagramação editorial', 'Colunas, balanceamento, flutuantes, tabelas que se dividem ou giram, texto que contorna imagens, livros e partes, páginas compostas', 'Em aberto: texto dos dois lados de uma imagem'],
    ['3 · Tipografia profissional', 'Knuth-Plass, hifenização em 8 idiomas, órfãs, viúvas e linhas curtas, matemática, notas de rodapé, citações, índice remissivo, chinês e japonês na horizontal e na vertical, árabe com kashida, quadrinhos, música, exercícios', 'Em aberto: notas de margem'],
    ['4 · Saída', 'Canvas, HTML, PDF com tags e PDF/X, EPUB 3, SCORM, worker, Sandbox com predefinições, linha de comando', '**Entregue**'],
  ] },
  fr: { head: ['Phase', 'Livré', 'Encore ouvert'], rows: [
    ['1 · Fondations', 'Modèle de données, parseur, mesure sans DOM, format du document', 'Ouvert : finaliser le format de configuration'],
    ['2 · Mise en page éditoriale', 'Colonnes, équilibrage, flottants, tableaux qui se divisent ou pivotent, texte qui contourne les images, livres et parties, pages composées', 'Ouvert : texte des deux côtés d’une image'],
    ['3 · Typographie professionnelle', 'Knuth-Plass, césure en 8 langues, orphelines, veuves et lignes trop courtes, mathématiques, notes de bas de page, citations, index, chinois et japonais composés horizontalement et verticalement, arabe avec kashida, bande dessinée, musique, exercices', 'Ouvert : notes marginales'],
    ['4 · Sortie', 'Canvas, HTML, PDF balisé et PDF/X, EPUB 3, SCORM, worker, Sandbox avec préréglages, ligne de commande', '**Livré**'],
  ] },
  de: { head: ['Phase', 'Ausgeliefert', 'Noch offen'], rows: [
    ['1 · Grundlagen', 'Datenmodell, Parser, Messung ohne DOM, Dokumentformat', 'Offen: das Konfigurationsformat festschreiben'],
    ['2 · Verlegerisches Layout', 'Spalten, Spaltenausgleich, Gleitobjekte, Tabellen, die sich teilen oder drehen, Text, der Bilder umfließt, Bücher und Teile, zusammengesetzte Seiten', 'Offen: Text auf beiden Seiten eines Bildes'],
    ['3 · Professionelle Typografie', 'Knuth-Plass, Silbentrennung in 8 Sprachen, Waisen, Witwen und zu kurze Ausgangszeilen, Mathematik, Fußnoten, Zitate, ein Register, Chinesisch und Japanisch horizontal und vertikal gesetzt, Arabisch mit Kaschida, Comics, Musik, Übungen', 'Offen: Marginalien'],
    ['4 · Ausgabe', 'Canvas, HTML, getaggtes PDF und PDF/X, EPUB 3, SCORM, Worker, Sandbox mit Vorlagen, Kommandozeile', '**Ausgeliefert**'],
  ] },
  it: { head: ['Fase', 'Rilasciato', 'Ancora aperto'], rows: [
    ['1 · Fondamenta', 'Modello dei dati, parser, misura senza DOM, formato del documento', 'Aperto: definire il formato di configurazione'],
    ['2 · Impaginazione editoriale', 'Colonne, bilanciamento, elementi flottanti, tabelle che si dividono o ruotano, testo che scorre intorno alle immagini, libri e parti, pagine composte', 'Aperto: testo su entrambi i lati di un’immagine'],
    ['3 · Tipografia professionale', 'Knuth-Plass, sillabazione in 8 lingue, orfane, vedove e righe finali troppo corte, matematica, note a piè di pagina, citazioni, indice analitico, cinese e giapponese composti in orizzontale e in verticale, arabo con kashida, fumetti, musica, esercizi', 'Aperto: note a margine'],
    ['4 · Output', 'Canvas, HTML, PDF con tag e PDF/X, EPUB 3, SCORM, worker, Sandbox con preset, riga di comando', '**Rilasciato**'],
  ] },
  ar: { head: ['المرحلة', 'ما أُنجز', 'ما بقي'], rows: [
    ['1 · الأسس', 'نموذج البيانات، والمحلّل، والقياس بلا DOM، وصيغة المستند', 'مفتوح: تثبيت صيغة الإعدادات'],
    ['2 · التنضيد التحريري', 'الأعمدة، والموازنة، والعناصر العائمة، والجداول التي تنقسم أو تدور، والنص الملتفّ حول الصور، والكتب والأجزاء، والصفحات المركّبة', 'مفتوح: نص على جانبي الصورة معًا'],
    ['3 · الطباعة الاحترافية', 'Knuth-Plass، وتقطيع الكلمات في 8 لغات، والأرامل واليتامى والأسطر القصيرة، والرياضيات، والحواشي السفلية، والاستشهادات، والفهرس الأبجدي، والصينية واليابانية أفقيًا وعموديًا، والعربية بالكشيدة، والقصص المصوّرة، والموسيقى، والتمارين', 'مفتوح: حواشي الهامش'],
    ['4 · المخرجات', 'Canvas، وHTML، وPDF موسوم وPDF/X، وEPUB 3، وSCORM، وworker، وSandbox بكتب جاهزة، وسطر الأوامر', '**أُنجز**'],
  ] },
  'zh-Hans': { head: ['阶段', '已完成', '待完成'], rows: [
    ['1 · 基础', '数据模型、解析器、不借助DOM的测量、文档格式', '确定配置格式'],
    ['2 · 出版排版', '分栏、平衡分栏、浮动体、可拆分或旋转的表、图旁绕排的文字、书与篇、模板页', '图两侧都排文字'],
    ['3 · 专业排版', 'Knuth–Plass断行、8种语言的断词、段首孤行、段末孤行与孤字、数学公式、脚注、文献引用、书后索引、中文和日文的横排与竖排、用卡希达两端对齐的阿拉伯文、漫画、乐谱、练习', '边注'],
    ['4 · 输出', 'Canvas、HTML、带标签的PDF和PDF/X、EPUB 3、SCORM、worker、带预设的Sandbox、命令行', '**已完成**'],
  ] },
  ja: { head: ['段階', '完了', '残り'], rows: [
    ['1 · 基盤', 'データモデル、パーサー、DOMを使わない計測、文書形式', '設定形式の確定'],
    ['2 · 書籍の組版', '段組、段末そろえ、フロート、分割・回転できる表、図版への回り込み、本と部、テンプレートページ', '図版の両側に流れる文字'],
    ['3 · 本格的な組版', 'Knuth–Plass、8言語のハイフネーション、オーファン・ウィドウ・孤立した最終行、数式、脚注、文献の引用、巻末の索引、中国語と日本語の横組み・縦組み、カシーダを使うアラビア語、漫画、楽譜、練習問題', '欄外の注'],
    ['4 · 出力', 'Canvas、HTML、タグ付きPDFとPDF/X、EPUB 3、SCORM、ワーカー、プリセット付きのSandbox、コマンドライン', '**完了**'],
  ] },
};

export function phasesTableModel(lang: GuideLang): TableModel {
  const { head, rows } = PHASES[lang];
  return table(head, rows);
}
